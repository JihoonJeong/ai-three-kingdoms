// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헤드리스 시뮬레이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// UI 없이 게임을 자동 실행한다.
// core/ 엔진 모듈을 직접 조합하여 game-controller.ts 의존성 없이 동작.

import { GameStateManager } from '../core/engine/game-state.js';
import { TurnManager } from '../core/engine/turn-manager.js';
import { ActionExecutor } from '../core/engine/action-executor.js';
import { BattleEngine } from '../core/engine/battle-engine.js';
import { EventSystem } from '../core/engine/event-system.js';
import { VictoryJudge } from '../core/engine/victory-judge.js';
import { executeBattleTurn, processBattleResult } from '../core/engine/battle-resolver.js';
import { createRedCliffsScenario, getScenarioEvents } from '../core/data/scenarios/red-cliffs.js';
import { createSeededRng } from './seeded-rng.js';
import { selectTacticByRule } from './sim-battle-ai.js';
import type { SimConfig, SimResult, TurnLog, BattleLog } from './sim-config.js';
import type { GameAction, BattleState } from '../core/data/types.js';

/** 플레이어 행동을 결정하는 인터페이스 (Step 4에서 SimAdvisor 주입) */
export interface SimPlayerAI {
  planTurn(state: import('../core/data/types.js').GameState, config: SimConfig): Promise<{
    actions: GameAction[];
  }>;
}

export class HeadlessSimulator {
  private stateManager!: GameStateManager;
  private turnManager!: TurnManager;
  private actionExecutor!: ActionExecutor;
  private battleEngine!: BattleEngine;
  private eventSystem!: EventSystem;
  private victoryJudge!: VictoryJudge;

  private playerAI: SimPlayerAI | null;
  private turnLogs: TurnLog[] = [];

  constructor(
    private config: SimConfig,
    playerAI?: SimPlayerAI,
  ) {
    this.playerAI = playerAI ?? null;
  }

  async runGame(): Promise<SimResult> {
    const startTime = Date.now();

    // 1. 초기화 (RNG는 seed 기반 결정적)
    const rng = createSeededRng(this.config.seed);
    const scenario = createRedCliffsScenario(`sim-${this.config.gameId}`);
    this.stateManager = new GameStateManager(scenario);
    this.battleEngine = new BattleEngine(rng);
    this.actionExecutor = new ActionExecutor(this.stateManager, this.battleEngine, rng);
    this.eventSystem = new EventSystem(getScenarioEvents(), rng);
    this.victoryJudge = new VictoryJudge();
    this.turnManager = new TurnManager(
      this.stateManager, this.eventSystem, this.victoryJudge,
      this.battleEngine, rng, this.actionExecutor,
    );

    // 2. 게임 루프
    this.turnManager.startTurn();

    while (!this.stateManager.getState().gameOver) {
      const state = this.stateManager.getState();
      const turnLog: TurnLog = {
        turn: state.turn,
        phase: state.phase,
        actions: [],
        events: [],
        battles: [],
        aiActions: [],
      };

      // 2a. Player 턴 — 행동 실행
      if (this.playerAI) {
        const { actions } = await this.playerAI.planTurn(state, this.config);
        for (const action of actions) {
          if (this.stateManager.getState().actionsRemaining <= 0) break;

          const result = this.actionExecutor.execute(action);
          turnLog.actions.push({
            action,
            result: { success: result.success, description: result.description },
          });

          // 전투 발생 시 처리
          if (result.battleTriggered) {
            const battleLog = this.resolveBattle(result.battleTriggered);
            turnLog.battles.push(battleLog);
          }
        }
      }
      // playerAI 없으면 행동 없이 턴 종료 (pass)

      // 2b. 턴 종료 (AI 세력 행동 + 이벤트)
      const endResult = await this.turnManager.endTurn();
      turnLog.events = endResult.events.map(e => e.description ?? e.eventId);
      turnLog.aiActions = endResult.stateChanges;

      // AI가 전투를 발생시킨 경우
      if (endResult.aiInitiatedBattle) {
        this.stateManager.setBattle(endResult.aiInitiatedBattle);
        const battleLog = this.resolveBattle(endResult.aiInitiatedBattle);
        turnLog.battles.push(battleLog);
      }

      this.turnLogs.push(turnLog);

      if (this.config.verbose) {
        const grade = endResult.result?.grade ?? '—';
        console.log(`  턴 ${state.turn}: 행동 ${turnLog.actions.length}개, 전투 ${turnLog.battles.length}개, 이벤트 ${turnLog.events.length}개 ${endResult.gameOver ? `[게임 종료: ${grade}]` : ''}`);
      }

      // 게임 종료 체크
      if (endResult.gameOver) break;

      // 다음 턴 시작
      this.turnManager.startTurn();
    }

    // 3. 결과 수집
    const finalState = this.stateManager.getState();
    return {
      gameId: this.config.gameId,
      mode: this.config.mode,
      thinking: this.config.thinking,
      seed: this.config.seed,
      grade: finalState.result?.grade ?? 'F',
      title: finalState.result?.title ?? '알 수 없음',
      totalTurns: finalState.turn,
      duration: Date.now() - startTime,
      flags: { ...finalState.flags },
      turnLogs: this.turnLogs,
      finalState: {
        cities: finalState.cities.map(c => ({
          id: c.id, owner: c.owner,
          troops: c.troops.infantry + c.troops.cavalry + c.troops.navy,
        })),
        generals: finalState.generals.map(g => ({
          id: g.id, faction: g.faction, condition: g.condition, location: g.location,
        })),
      },
    };
  }

  /** 전투를 자동으로 해결한다 (규칙 기반 전술 선택) */
  private resolveBattle(battle: BattleState): BattleLog {
    const log: BattleLog = {
      location: battle.location,
      attacker: battle.attackers.faction,
      defender: battle.defenders.faction,
      turns: [],
      result: null,
    };

    while (!battle.isOver) {
      const tactic = selectTacticByRule(battle);
      const isOver = executeBattleTurn(battle, tactic, this.stateManager, this.battleEngine);

      log.turns.push({
        tacticUsed: tactic,
        attackerTroops: battle.attackers.troops,
        defenderTroops: battle.defenders.troops,
      });

      if (isOver) break;
    }

    log.result = battle.result;

    // 전투 후처리 (영토 변경, 장수 귀환 등)
    processBattleResult(battle, this.stateManager);

    return log;
  }
}
