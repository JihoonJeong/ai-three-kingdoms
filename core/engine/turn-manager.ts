// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 턴 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  GamePhase, TurnStartResult, TurnEndResult,
} from '../data/types.js';
import { FOOD_CONSUMPTION_PER_TROOP, getTotalTroopsOfCity } from '../data/types.js';
import { GameStateManager } from './game-state.js';
import { EventSystem } from './event-system.js';
import { VictoryJudge } from './victory-judge.js';

export class TurnManager {
  constructor(
    private stateManager: GameStateManager,
    private eventSystem: EventSystem,
    private victoryJudge: VictoryJudge,
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

    // 3. AI 세력 행동 (간단한 자동 진행)
    const aiChanges = this.processAIFactions();
    stateChanges.push(...aiChanges);

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
      const totalTroops = getTotalTroopsOfCity(city);
      const consumption = Math.floor(totalTroops * FOOD_CONSUMPTION_PER_TROOP);
      const newFood = Math.max(0, city.food - consumption);

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
      } else if (newFood < consumption * 3) {
        changes.push(`${city.name}: 군량이 3턴 분 이하입니다 (${newFood})`);
      }
    }

    return changes;
  }

  private processAIFactions(): string[] {
    // MVP: AI 세력은 간단한 자동 행동만 수행
    // 조조군: 매 턴 소규모 병력 증강
    // 손권군: 동맹 상태에 따라 협조 또는 관망
    const changes: string[] = [];
    const state = this.stateManager.getState();

    // 조조군 자동 강화
    for (const city of state.cities) {
      if (city.owner === '조조') {
        // 소규모 식량 생산 + 훈련
        this.stateManager.updateCity(city.id, {
          food: city.food + 500,
          training: Math.min(100, city.training + 3),
        });
      }
    }

    // 손권군: 동맹 시 시상 병력 유지
    const allianceWithSunQuan = this.stateManager.isAlly('손권');
    if (allianceWithSunQuan) {
      const sishang = this.stateManager.getCity('sishang');
      if (sishang) {
        this.stateManager.updateCity('sishang', {
          training: Math.min(100, sishang.training + 5),
        });
      }
    }

    return changes;
  }
}
