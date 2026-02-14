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
    this.turnManager = new TurnManager(this.stateManager, this.eventSystem, this.victoryJudge);

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

    const generals = state.generals;
    const result = this.battleEngine.executeTactic(state.activeBattle, tacticId, generals);
    this.callbacks.onBattleTurnResult?.(state.activeBattle);

    const endCheck = this.battleEngine.checkBattleEnd(state.activeBattle);
    if (endCheck.isOver) {
      state.activeBattle.isOver = true;
      state.activeBattle.result = endCheck.result ?? null;

      // 전투 결과에 따른 영토 변경 처리
      if (endCheck.result?.winner === this.stateManager.getPlayerFaction().id) {
        const battleLocation = state.activeBattle.location;
        const bf = state.battlefields.find(b => b.id === battleLocation);
        if (bf) {
          for (const cityId of bf.adjacentCities) {
            const city = this.stateManager.getCity(cityId);
            if (city && city.owner !== this.stateManager.getPlayerFaction().id) {
              // 적 도시 점령은 후속전에서 처리
            }
          }
        }
        this.stateManager.setFlag('chibiVictory', true);
      }

      this.stateManager.setBattle(null);
      this.callbacks.onBattleEnd?.(state.activeBattle);
    }

    this.callbacks.onStateChange?.(this.stateManager.getState());
    return state.activeBattle;
  }

  endTurn(): TurnEndResult {
    const result = this.turnManager.endTurn();

    if (result.events.length > 0) {
      this.callbacks.onEventsTriggered?.(result.events);
    }

    if (result.gameOver && result.result) {
      this.callbacks.onGameOver?.(result.result);
    } else {
      const turnInfo = this.turnManager.startTurn();
      this.callbacks.onTurnStart?.(turnInfo);
    }

    this.callbacks.onStateChange?.(this.stateManager.getState());
    return result;
  }

  getActiveBattle(): BattleState | null {
    return this.stateManager.getState().activeBattle;
  }

  isGameOver(): boolean {
    return this.stateManager.getState().gameOver;
  }
}
