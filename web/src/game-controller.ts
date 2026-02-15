import { GameStateManager } from '../../core/engine/game-state.js';
import { TurnManager } from '../../core/engine/turn-manager.js';
import { ActionExecutor } from '../../core/engine/action-executor.js';
import { BattleEngine } from '../../core/engine/battle-engine.js';
import { EventSystem } from '../../core/engine/event-system.js';
import { VictoryJudge } from '../../core/engine/victory-judge.js';
import { createRedCliffsScenario, getScenarioEvents } from '../../core/data/scenarios/red-cliffs.js';
import type { FactionLLMClient } from '../../core/advisor/faction-llm-client.js';
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
  private pendingLLMClient?: FactionLLMClient;

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

    // setLLMClient가 startGame 전에 호출된 경우 적용
    if (this.pendingLLMClient) {
      this.turnManager.setLLMClient(this.pendingLLMClient);
    }

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
      const winner = endCheck.result?.winner;
      const loser = endCheck.result?.loser;
      const battleLocation = battle.location;
      const bf = state.battlefields.find(b => b.id === battleLocation);
      const battleCity = this.stateManager.getCity(battleLocation);

      if (bf) {
        // 전장 전투 (적벽 등)
        if (bf.id === 'chibi' && winner === playerFaction) {
          this.stateManager.setFlag('chibiVictory', true);
        }

        // 전장 전투 종료 후 양측 장수를 인접 아군 도시로 자동 귀환
        const returnFactions = winner
          ? [battle.attackers.faction, battle.defenders.faction]
          : [battle.attackers.faction, battle.defenders.faction]; // 무승부도 양측 귀환
        for (const faction of returnFactions) {
          const returnCity = bf.adjacentCities
            .map(id => this.stateManager.getCity(id))
            .find(c => c && c.owner === faction);
          if (!returnCity) continue;
          const factionGenerals = faction === battle.attackers.faction
            ? battle.attackers.generals : battle.defenders.generals;
          for (const gId of factionGenerals) {
            const g = this.stateManager.getGeneral(gId);
            if (g && g.condition !== '포로' && g.location === bf.id) {
              this.stateManager.updateGeneral(gId, { location: returnCity.id });
            }
          }
          // 잔여 병력을 귀환 도시에 추가
          const factionTroops = faction === battle.attackers.faction
            ? battle.attackers.troops : battle.defenders.troops;
          if (factionTroops > 0) {
            this.stateManager.addCityTroops(returnCity.id, 'infantry', factionTroops);
          }
        }
      } else if (battleCity) {
        // 도시 전투 — 공격측 승리 시 도시 점령
        if (winner && winner !== battleCity.owner) {
          battle.result!.territoryChange = battleCity.name;
          this.stateManager.updateCity(battleCity.id, { owner: winner });
        }
      }

      // 공격 패배 또는 무승부 시 공격측 장수 귀환 (플레이어/AI 모두)
      if (loser === battle.attackers.faction || winner === null) {
        const lastMarchLog = [...state.actionLog].reverse().find(
          log => log.action.action === 'march' && log.result.battleTriggered
        );
        const returnTo = lastMarchLog?.action.action === 'march'
          ? lastMarchLog.action.params.from
          : null;
        if (returnTo) {
          for (const gId of battle.attackers.generals) {
            const g = this.stateManager.getGeneral(gId);
            if (g && g.condition !== '포로') {
              this.stateManager.updateGeneral(gId, { location: returnTo });
            }
          }
        }
      }

      // 포로 처리
      if (battle.result?.capturedGenerals) {
        for (const gId of battle.result.capturedGenerals) {
          this.stateManager.updateGeneral(gId, { condition: '포로' });
        }
      }

      // 도시 전투 후: 방어 도시 병력을 전투 잔여 병력으로 갱신
      if (battleCity) {
        const defenderIsOwner = battle.defenders.faction === battleCity.owner;
        if (defenderIsOwner) {
          const remainingTroops = battle.defenders.troops;
          const currentTotal = battleCity.troops.infantry + battleCity.troops.cavalry + battleCity.troops.navy;
          if (currentTotal > 0) {
            const ratio = remainingTroops / currentTotal;
            this.stateManager.updateCity(battleCity.id, {
              troops: {
                infantry: Math.floor(battleCity.troops.infantry * ratio),
                cavalry: Math.floor(battleCity.troops.cavalry * ratio),
                navy: Math.floor(battleCity.troops.navy * ratio),
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

  setLLMClient(client: FactionLLMClient | undefined): void {
    this.pendingLLMClient = client;
    // turnManager가 초기화된 후에만 직접 전달
    if (this.turnManager) {
      this.turnManager.setLLMClient(client);
    }
  }

  async endTurn(): Promise<TurnEndResult> {
    const result = await this.turnManager.endTurn();

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
