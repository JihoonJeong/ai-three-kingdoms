import { GameStateManager } from '../../core/engine/game-state.js';
import { TurnManager } from '../../core/engine/turn-manager.js';
import { ActionExecutor } from '../../core/engine/action-executor.js';
import { BattleEngine } from '../../core/engine/battle-engine.js';
import { EventSystem } from '../../core/engine/event-system.js';
import { VictoryJudge } from '../../core/engine/victory-judge.js';
import { createRedCliffsScenario, getScenarioEvents } from '../../core/data/scenarios/red-cliffs.js';
import type {
  GameState, GameAction, ActionResult, BattleState,
  EventResult, GameResult, TurnStartResult, TurnEndResult,
} from '../../core/data/types.js';

export interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  onActionResult: (result: ActionResult) => void;
  onBattleStart: (battle: BattleState) => void;
  onBattleTurnResult: (battle: BattleState) => void;
  onBattleEnd: (battle: BattleState) => void;
  onEventsTriggered: (events: EventResult[]) => void;
  onGameOver: (result: GameResult) => void;
  onTurnStart: (info: TurnStartResult) => void;
}

export class GameController {
  private stateManager!: GameStateManager;
  private turnManager!: TurnManager;
  private actionExecutor!: ActionExecutor;
  private battleEngine!: BattleEngine;
  private eventSystem!: EventSystem;
  private victoryJudge!: VictoryJudge;
  private callbacks: Partial<GameCallbacks> = {};

  private rng(): number {
    return Math.random();
  }

  on<K extends keyof GameCallbacks>(event: K, cb: GameCallbacks[K]): void {
    this.callbacks[event] = cb;
  }

  startGame(): TurnStartResult {
    const scenario = createRedCliffsScenario('play-' + Date.now());
    this.stateManager = new GameStateManager(scenario);
    this.battleEngine = new BattleEngine(() => this.rng());
    this.actionExecutor = new ActionExecutor(this.stateManager, this.battleEngine, () => this.rng());
    this.eventSystem = new EventSystem(getScenarioEvents(), () => this.rng());
    this.victoryJudge = new VictoryJudge();
    this.turnManager = new TurnManager(
      this.stateManager, this.eventSystem, this.victoryJudge,
      this.battleEngine, () => this.rng(),
      this.actionExecutor,
    );

    const turnInfo = this.turnManager.startTurn();
    this.callbacks.onTurnStart?.(turnInfo);
    this.callbacks.onStateChange?.(this.stateManager.getState());
    return turnInfo;
  }

  getState(): GameState {
    return this.stateManager.getState();
  }

  executeAction(action: GameAction): ActionResult {
    const result = this.actionExecutor.execute(action);
    this.callbacks.onActionResult?.(result);

    if (result.battleTriggered) {
      this.callbacks.onBattleStart?.(result.battleTriggered);
    }

    this.callbacks.onStateChange?.(this.stateManager.getState());
    return result;
  }

  executeBattleTactic(tacticId: string): BattleState | null {
    const state = this.stateManager.getState();
    if (!state.activeBattle) return null;

    const battle = state.activeBattle;
    const generals = state.generals;
    const playerFaction = this.stateManager.getPlayerFaction().id;
    const playerIsAttacker = battle.attackers.faction === playerFaction;

    if (playerIsAttacker) {
      // 플레이어 공격, AI 방어 (기존 동작)
      this.battleEngine.executeTactic(battle, tacticId, generals);
    } else {
      // 플레이어 방어, AI 공격 — 플레이어 전술을 defenderTacticId로 전달
      const aiTactic = this.battleEngine.selectAttackerTactic(battle);
      this.battleEngine.executeTactic(battle, aiTactic, generals, tacticId);
    }

    this.callbacks.onBattleTurnResult?.(battle);

    const endCheck = this.battleEngine.checkBattleEnd(battle);
    if (endCheck.isOver) {
      battle.isOver = true;
      battle.result = endCheck.result ?? null;

      // 전투 결과에 따른 영토 변경 처리
      if (endCheck.result?.winner === playerFaction) {
        const battleLocation = battle.location;
        const bf = state.battlefields.find(b => b.id === battleLocation);
        if (bf) {
          for (const cityId of bf.adjacentCities) {
            const city = this.stateManager.getCity(cityId);
            if (city && city.owner !== playerFaction) {
              // 적 도시 점령은 후속전에서 처리
            }
          }
          if (bf.id === 'chibi') {
            this.stateManager.setFlag('chibiVictory', true);
          }
        }
      }

      // 공격 패배 시 장수 귀환
      if (playerIsAttacker && battle.result?.loser === playerFaction) {
        const lastMarchLog = [...state.actionLog].reverse().find(
          log => log.action.action === 'march' && log.result.battleTriggered
        );
        if (lastMarchLog && lastMarchLog.action.action === 'march') {
          for (const gId of battle.attackers.generals) {
            this.stateManager.updateGeneral(gId, { location: lastMarchLog.action.params.from });
          }
        }
      }

      // 포로 처리
      if (battle.result?.capturedGenerals) {
        for (const gId of battle.result.capturedGenerals) {
          this.stateManager.updateGeneral(gId, { condition: '포로' });
        }
      }

      // AI 방어전 후: 방어 도시 병력을 전투 잔여 병력으로 갱신
      if (!playerIsAttacker) {
        const defCity = this.stateManager.getCity(battle.location);
        if (defCity && defCity.owner === playerFaction) {
          const remainingTroops = battle.defenders.troops;
          const currentTotal = defCity.troops.infantry + defCity.troops.cavalry + defCity.troops.navy;
          if (currentTotal > 0) {
            const ratio = remainingTroops / currentTotal;
            this.stateManager.updateCity(defCity.id, {
              troops: {
                infantry: Math.floor(defCity.troops.infantry * ratio),
                cavalry: Math.floor(defCity.troops.cavalry * ratio),
                navy: Math.floor(defCity.troops.navy * ratio),
              },
            });
          }
        }
      }

      // 전투 종료 시 결과를 actionLog에 기록 (AI 전투 포함)
      if (battle.result) {
        const locCity = this.stateManager.getCity(battle.location);
        const bfName = state.battlefields.find(b => b.id === battle.location)?.name;
        const locName = locCity?.name ?? bfName ?? battle.location;
        this.stateManager.addActionLog({
          turn: state.turn,
          action: { type: 'military', action: 'battle_result', params: { location: battle.location } } as any,
          result: {
            success: battle.result.winner === playerFaction,
            description: battle.result.winner === playerFaction
              ? `${locName} 전투에서 승리했습니다!`
              : battle.result.winner === null
                ? `${locName} 전투가 무승부로 끝났습니다.`
                : `${locName} 전투에서 패배했습니다.`,
            sideEffects: [],
            remainingActions: state.actionsRemaining,
            battleTriggered: battle,
          },
        });
      }

      this.stateManager.setBattle(null);
      this.callbacks.onBattleEnd?.(battle);
    }

    this.callbacks.onStateChange?.(this.stateManager.getState());
    return battle;
  }

  endTurn(): TurnEndResult {
    const result = this.turnManager.endTurn();

    if (result.events.length > 0) {
      this.callbacks.onEventsTriggered?.(result.events);
    }

    if (result.gameOver && result.result) {
      this.callbacks.onGameOver?.(result.result);
    } else if (result.aiInitiatedBattle) {
      // AI 전투 발생 — activeBattle 설정, 다음 턴 시작은 전투 해결 후
      this.stateManager.setBattle(result.aiInitiatedBattle);
    } else {
      const turnInfo = this.turnManager.startTurn();
      this.callbacks.onTurnStart?.(turnInfo);
    }

    this.callbacks.onStateChange?.(this.stateManager.getState());
    return result;
  }

  /** 전투 해결 후 다음 턴을 시작한다 */
  startNextTurn(): TurnStartResult {
    const turnInfo = this.turnManager.startTurn();
    this.callbacks.onTurnStart?.(turnInfo);
    this.callbacks.onStateChange?.(this.stateManager.getState());
    return turnInfo;
  }

  getActiveBattle(): BattleState | null {
    return this.stateManager.getState().activeBattle;
  }

  isGameOver(): boolean {
    return this.stateManager.getState().gameOver;
  }
}
