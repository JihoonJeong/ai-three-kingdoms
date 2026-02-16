import { GameStateManager } from '../../core/engine/game-state.js';
import { TurnManager } from '../../core/engine/turn-manager.js';
import { ActionExecutor } from '../../core/engine/action-executor.js';
import { BattleEngine } from '../../core/engine/battle-engine.js';
import { EventSystem } from '../../core/engine/event-system.js';
import { VictoryJudge } from '../../core/engine/victory-judge.js';
import { executeBattleTurn, processBattleResult } from '../../core/engine/battle-resolver.js';
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
    const isOver = executeBattleTurn(battle, tacticId, this.stateManager, this.battleEngine);

    this.callbacks.onBattleTurnResult?.(battle);

    if (isOver) {
      processBattleResult(battle, this.stateManager);
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
