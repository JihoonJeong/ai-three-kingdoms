import { describe, it, expect, beforeEach } from 'vitest';
import { VictoryJudge } from './victory-judge.js';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';

describe('VictoryJudge', () => {
  let stateManager: GameStateManager;
  let judge: VictoryJudge;

  beforeEach(() => {
    stateManager = new GameStateManager(createRedCliffsScenario('test'));
    judge = new VictoryJudge();
  });

  describe('checkGameOver', () => {
    it('정상 상태에서는 게임오버가 아니다', () => {
      const check = judge.checkGameOver(stateManager.getState());
      expect(check.isOver).toBe(false);
    });

    it('유비 사망 시 게임오버', () => {
      stateManager.updateGeneral('liubei', { condition: '사망' });
      const check = judge.checkGameOver(stateManager.getState());
      expect(check.isOver).toBe(true);
      expect(check.reason).toContain('전사');
    });

    it('유비 포로 시 게임오버', () => {
      stateManager.updateGeneral('liubei', { condition: '포로' });
      const check = judge.checkGameOver(stateManager.getState());
      expect(check.isOver).toBe(true);
      expect(check.reason).toContain('포로');
    });

    it('모든 도시 상실 시 게임오버', () => {
      stateManager.updateCity('gangha', { owner: '조조' });
      stateManager.updateCity('hagu', { owner: '조조' });
      const check = judge.checkGameOver(stateManager.getState());
      expect(check.isOver).toBe(true);
      expect(check.reason).toContain('거점');
    });

    it('턴 초과 시 게임 종료', () => {
      for (let i = 0; i < 20; i++) stateManager.advanceTurn(); // turn 21
      const check = judge.checkGameOver(stateManager.getState());
      expect(check.isOver).toBe(true);
    });
  });

  describe('judge — 등급 판정', () => {
    it('S등급: 적벽 승리 + 남군/장릉 점령 + 동맹 유지 + 장수 무손실', () => {
      stateManager.setFlag('chibiVictory', true);
      stateManager.updateCity('nanjun', { owner: '유비' });
      stateManager.updateCity('jiangling', { owner: '유비' });
      stateManager.updateRelation('유비', '손권', { isAlliance: true });

      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('S');
    });

    it('A등급: 적벽 승리 + 남군 점령 + 동맹 유지', () => {
      stateManager.setFlag('chibiVictory', true);
      stateManager.updateCity('nanjun', { owner: '유비' });
      stateManager.updateRelation('유비', '손권', { isAlliance: true });

      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('A');
    });

    it('B등급: 적벽 승리 + 일부 도시 점령', () => {
      stateManager.setFlag('chibiVictory', true);
      stateManager.updateCity('nanjun', { owner: '유비' });
      // 동맹 없음

      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('B');
    });

    it('C등급: 적벽 승리만', () => {
      stateManager.setFlag('chibiVictory', true);

      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('C');
    });

    it('D등급: 적벽 패배, 유비 생존', () => {
      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('D');
    });

    it('F등급: 유비 사망', () => {
      stateManager.updateGeneral('liubei', { condition: '사망' });
      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('F');
    });

    it('F등급: 모든 도시 상실', () => {
      stateManager.updateCity('gangha', { owner: '조조' });
      stateManager.updateCity('hagu', { owner: '조조' });
      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('F');
    });

    it('장수 손실이 있으면 S등급이 되지 않는다', () => {
      stateManager.setFlag('chibiVictory', true);
      stateManager.updateCity('nanjun', { owner: '유비' });
      stateManager.updateCity('jiangling', { owner: '유비' });
      stateManager.updateRelation('유비', '손권', { isAlliance: true });
      stateManager.updateGeneral('weiyuan', { condition: '사망' }); // 장수 1명 사망

      const result = judge.judge(stateManager.getState());
      expect(result.grade).toBe('A'); // S가 아닌 A
    });
  });
});
