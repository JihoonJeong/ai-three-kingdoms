// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 턴 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  GamePhase, TurnStartResult, TurnEndResult, BattleState,
} from '../data/types.js';
import {
  FOOD_CONSUMPTION_PER_TROOP, FOOD_PRODUCTION_BASE, AGRICULTURE_MULTIPLIER,
  getTotalTroopsOfCity,
} from '../data/types.js';
import { GameStateManager } from './game-state.js';
import { EventSystem } from './event-system.js';
import { VictoryJudge } from './victory-judge.js';
import { FactionAIEngine } from './faction-ai.js';
import type { BattleEngine } from './battle-engine.js';
import type { ActionExecutor } from './action-executor.js';

export class TurnManager {
  constructor(
    private stateManager: GameStateManager,
    private eventSystem: EventSystem,
    private victoryJudge: VictoryJudge,
    private battleEngine: BattleEngine | null = null,
    private rng: () => number = Math.random,
    private actionExecutor: ActionExecutor | null = null,
  ) {}

  startTurn(): TurnStartResult {
    const state = this.stateManager.getState();

    // 행동 횟수 리셋
    this.stateManager.resetActions();

    // Phase 판정
    const phase = this.determinePhase(state.turn);
    this.stateManager.setPhase(phase);

    // 계절 계산
    const season = this.calculateSeason(state.turn);
    this.stateManager.setSeason(season);

    return {
      turn: state.turn,
      phase,
      season,
      actionsAvailable: state.actionsRemaining,
    };
  }

  endTurn(): TurnEndResult {
    const state = this.stateManager.getState();
    const stateChanges: string[] = [];

    // 1. 식량 소비
    const foodChanges = this.consumeFood();
    stateChanges.push(...foodChanges);

    // 2. 이벤트 체크 및 적용
    const eventResults = this.eventSystem.processTurn(this.stateManager);

    // 3. AI 세력 행동
    const aiResult = this.processAIFactions();
    stateChanges.push(...aiResult.changes);

    // 4. 게임오버 체크
    const gameOverCheck = this.victoryJudge.checkGameOver(state);

    // 5. 턴 진행
    this.stateManager.advanceTurn();

    const nextState = this.stateManager.getState();
    const nextSeason = this.calculateSeason(nextState.turn);

    // 게임오버 처리
    if (gameOverCheck.isOver) {
      const result = this.victoryJudge.judge(state);
      this.stateManager.setGameOver(result);
      return {
        events: eventResults,
        stateChanges,
        nextTurnPreview: `게임 종료: ${gameOverCheck.reason}`,
        gameOver: true,
        result,
      };
    }

    return {
      events: eventResults,
      stateChanges,
      nextTurnPreview: `다음 턴은 ${nextSeason}입니다 (턴 ${nextState.turn}/${nextState.maxTurns})`,
      gameOver: false,
      aiInitiatedBattle: aiResult.battle,
    };
  }

  private determinePhase(turn: number): GamePhase {
    if (turn <= 8) return 'preparation';
    if (turn <= 13) return 'battle';
    return 'aftermath';
  }

  private calculateSeason(turn: number): string {
    // 건안 13년 기준
    // 턴 1-4: 가을, 5-8: 초겨울, 9-13: 겨울, 14-17: 초봄, 18-20: 봄
    if (turn <= 4) return '건안 13년 가을';
    if (turn <= 8) return '건안 13년 초겨울';
    if (turn <= 13) return '건안 13년 겨울';
    if (turn <= 17) return '건안 14년 초봄';
    return '건안 14년 봄';
  }

  private consumeFood(): string[] {
    const changes: string[] = [];
    const playerFaction = this.stateManager.getPlayerFaction();
    const cities = this.stateManager.getCitiesByFaction(playerFaction.id);

    for (const city of cities) {
      // 식량 생산
      const production = Math.floor(
        FOOD_PRODUCTION_BASE[city.population] *
        AGRICULTURE_MULTIPLIER[city.development.agriculture]
      );

      // 식량 소비
      const totalTroops = getTotalTroopsOfCity(city);
      const consumption = Math.floor(totalTroops * FOOD_CONSUMPTION_PER_TROOP);

      const net = production - consumption;
      const newFood = Math.max(0, city.food + net);

      this.stateManager.updateCity(city.id, { food: newFood });

      if (newFood === 0) {
        // 군량 고갈 → 사기 하락 + 탈영
        const desertionRate = 0.05; // 5% 탈영
        const desertedInfantry = Math.floor(city.troops.infantry * desertionRate);
        this.stateManager.addCityTroops(city.id, 'infantry', -desertedInfantry);
        this.stateManager.updateCity(city.id, {
          morale: Math.max(0, city.morale - 15),
        });
        changes.push(`${city.name}: 군량 고갈! 병사 ${desertedInfantry}명 탈영, 민심 급락`);
      } else if (net < 0 && newFood < consumption * 3) {
        changes.push(`${city.name}: 군량이 부족합니다 (생산 ${production}, 소비 ${consumption}, 잔여 ${newFood})`);
      } else if (net > 0) {
        changes.push(`${city.name}: 식량 증산 (생산 ${production}, 소비 ${consumption}, +${net})`);
      }
    }

    return changes;
  }

  // ─── AI 세력 행동 ──────────────────────────────────────

  private processAIFactions(): { changes: string[]; battle?: BattleState } {
    if (!this.actionExecutor) {
      return { changes: [] };
    }

    const aiEngine = new FactionAIEngine(
      this.stateManager, this.actionExecutor, this.rng,
    );
    return aiEngine.processAll();
  }
}
