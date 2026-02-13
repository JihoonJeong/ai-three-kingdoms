import { describe, it, expect, beforeEach } from 'vitest';
import { TurnManager } from './turn-manager.js';
import { GameStateManager } from './game-state.js';
import { EventSystem } from './event-system.js';
import { VictoryJudge } from './victory-judge.js';
import { createRedCliffsScenario, getScenarioEvents } from '../data/scenarios/red-cliffs.js';

describe('TurnManager', () => {
  let stateManager: GameStateManager;
  let turnManager: TurnManager;

  beforeEach(() => {
    stateManager = new GameStateManager(createRedCliffsScenario('test'));
    const eventSystem = new EventSystem(getScenarioEvents(), () => 0.5);
    const victoryJudge = new VictoryJudge();
    turnManager = new TurnManager(stateManager, eventSystem, victoryJudge);
  });

  describe('startTurn', () => {
    it('턴 1은 preparation/가을이다', () => {
      const result = turnManager.startTurn();
      expect(result.turn).toBe(1);
      expect(result.phase).toBe('preparation');
      expect(result.season).toBe('건안 13년 가을');
      expect(result.actionsAvailable).toBe(3);
    });

    it('행동 횟수를 리셋한다', () => {
      stateManager.useAction();
      stateManager.useAction();
      turnManager.startTurn();
      expect(stateManager.getState().actionsRemaining).toBe(3);
    });
  });

  describe('Phase 판정', () => {
    it('턴 1-8은 preparation이다', () => {
      for (let t = 1; t <= 8; t++) {
        // startTurn 내부에서 phase 설정
        const sm = new GameStateManager(createRedCliffsScenario('test'));
        // 수동으로 턴 진행
        for (let i = 1; i < t; i++) sm.advanceTurn();
        const es = new EventSystem([], () => 0.5);
        const vj = new VictoryJudge();
        const tm = new TurnManager(sm, es, vj);
        const result = tm.startTurn();
        expect(result.phase, `턴 ${t}는 preparation이어야 함`).toBe('preparation');
      }
    });

    it('턴 9-13은 battle이다', () => {
      for (let t = 9; t <= 13; t++) {
        const sm = new GameStateManager(createRedCliffsScenario('test'));
        for (let i = 1; i < t; i++) sm.advanceTurn();
        const es = new EventSystem([], () => 0.5);
        const vj = new VictoryJudge();
        const tm = new TurnManager(sm, es, vj);
        const result = tm.startTurn();
        expect(result.phase, `턴 ${t}는 battle이어야 함`).toBe('battle');
      }
    });

    it('턴 14-20은 aftermath이다', () => {
      for (let t = 14; t <= 20; t++) {
        const sm = new GameStateManager(createRedCliffsScenario('test'));
        for (let i = 1; i < t; i++) sm.advanceTurn();
        const es = new EventSystem([], () => 0.5);
        const vj = new VictoryJudge();
        const tm = new TurnManager(sm, es, vj);
        const result = tm.startTurn();
        expect(result.phase, `턴 ${t}는 aftermath이어야 함`).toBe('aftermath');
      }
    });
  });

  describe('계절 계산', () => {
    it('각 턴의 계절이 올바르다', () => {
      const expected: Record<number, string> = {
        1: '건안 13년 가을',
        4: '건안 13년 가을',
        5: '건안 13년 초겨울',
        8: '건안 13년 초겨울',
        9: '건안 13년 겨울',
        13: '건안 13년 겨울',
        14: '건안 14년 초봄',
        18: '건안 14년 봄',
        20: '건안 14년 봄',
      };

      for (const [turn, season] of Object.entries(expected)) {
        const sm = new GameStateManager(createRedCliffsScenario('test'));
        for (let i = 1; i < Number(turn); i++) sm.advanceTurn();
        const es = new EventSystem([], () => 0.5);
        const vj = new VictoryJudge();
        const tm = new TurnManager(sm, es, vj);
        const result = tm.startTurn();
        expect(result.season, `턴 ${turn}의 계절`).toBe(season);
      }
    });
  });

  describe('endTurn', () => {
    it('턴을 진행시킨다', () => {
      turnManager.startTurn();
      const result = turnManager.endTurn();
      expect(stateManager.getState().turn).toBe(2);
      expect(result.gameOver).toBe(false);
    });

    it('식량을 소비한다', () => {
      const foodBefore = stateManager.getCity('gangha')!.food;
      turnManager.startTurn();
      turnManager.endTurn();
      const foodAfter = stateManager.getCity('gangha')!.food;
      expect(foodAfter).toBeLessThan(foodBefore);
    });

    it('다음 턴 프리뷰를 반환한다', () => {
      turnManager.startTurn();
      const result = turnManager.endTurn();
      expect(result.nextTurnPreview).toContain('턴 2');
    });
  });
});
