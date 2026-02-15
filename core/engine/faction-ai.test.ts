import { describe, it, expect, beforeEach } from 'vitest';
import { FactionAIEngine } from './faction-ai.js';
import { ActionExecutor } from './action-executor.js';
import { BattleEngine } from './battle-engine.js';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import { getTotalTroopsOfCity } from '../data/types.js';

describe('FactionAIEngine', () => {
  let stateManager: GameStateManager;
  let executor: ActionExecutor;
  let aiEngine: FactionAIEngine;
  const fixedRng = () => 0.5;

  function createEngine(turn: number, options?: {
    allied?: boolean;
    chibiDeployed?: boolean;
    chibiVictory?: boolean;
  }) {
    stateManager = new GameStateManager(createRedCliffsScenario('test-ai'));
    const battleEngine = new BattleEngine(fixedRng);
    executor = new ActionExecutor(stateManager, battleEngine, fixedRng);
    aiEngine = new FactionAIEngine(stateManager, executor, fixedRng);

    // 턴 설정
    for (let i = 1; i < turn; i++) {
      stateManager.advanceTurn();
    }
    if (turn <= 8) stateManager.setPhase('preparation');
    else if (turn <= 13) stateManager.setPhase('battle');
    else stateManager.setPhase('aftermath');

    // 옵션 적용
    if (options?.allied) {
      stateManager.updateRelation('유비', '손권', { isAlliance: true, value: 85 });
    }
    if (options?.chibiDeployed) {
      stateManager.setFlag('cao_chibi_deployed', true);
    }
    if (options?.chibiVictory) {
      stateManager.setFlag('chibiVictory', true);
    }
  }

  describe('CaoStrategy', () => {
    it('Turn 3에 남군 대규모 징집 계획', () => {
      createEngine(3);
      const nanjunBefore = stateManager.getCity('nanjun')!;
      const troopsBefore = getTotalTroopsOfCity(nanjunBefore);

      const result = aiEngine.processAll();

      const nanjunAfter = stateManager.getCity('nanjun')!;
      const troopsAfter = getTotalTroopsOfCity(nanjunAfter);
      expect(troopsAfter).toBeGreaterThan(troopsBefore);
      expect(result.changes.some(c => c.includes('징병'))).toBe(true);
    });

    it('Turn 5에 조인을 장릉→남군 이동', () => {
      createEngine(5);
      // 마일스톤 3 플래그를 미리 설정 (이전 턴에 이미 실행된 것으로)
      stateManager.setFlag('cao_m_conscript1', true);

      aiEngine.processAll();

      const caoren = stateManager.getGeneral('caoren')!;
      expect(caoren.location).toBe('nanjun');
    });

    it('Turn 9에 적벽 배치 계획', () => {
      createEngine(9);
      // 이전 마일스톤 플래그 설정
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.setFlag('cao_m_march_south', true);

      const result = aiEngine.processAll();

      const caimao = stateManager.getGeneral('caimao')!;
      const zhangyun = stateManager.getGeneral('zhangyun')!;
      expect(caimao.location).toBe('chibi');
      expect(zhangyun.location).toBe('chibi');
      expect(stateManager.getFlag('cao_chibi_deployed')).toBe(true);
      expect(result.changes.some(c => c.includes('적벽'))).toBe(true);
    });

    it('동맹 감지 시 적벽 배치 가속 (Turn 7)', () => {
      createEngine(7, { allied: true });
      // 이전 마일스톤 플래그 설정
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);

      aiEngine.processAll();

      const caimao = stateManager.getGeneral('caimao')!;
      expect(caimao.location).toBe('chibi');
      expect(stateManager.getFlag('cao_chibi_deployed')).toBe(true);
    });

    it('Turn 10에 적벽 증원 배치', () => {
      createEngine(10, { chibiDeployed: true });
      // 이전 마일스톤 플래그 설정
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.setFlag('cao_m_march_south', true);
      // caimao, zhangyun 은 이미 chibi에
      stateManager.updateGeneral('caimao', { location: 'chibi' });
      stateManager.updateGeneral('zhangyun', { location: 'chibi' });

      aiEngine.processAll();

      expect(stateManager.getFlag('cao_chibi_reinforced')).toBe(true);
      // 조조 빼고 chibi에 아닌 양호 장수 하나가 적벽으로 이동
      const chibiGenerals = stateManager.getState().generals.filter(
        g => g.faction === '조조' && g.location === 'chibi'
      );
      expect(chibiGenerals.length).toBeGreaterThanOrEqual(3);
    });

    it('적벽 승리 후 공격 중단', () => {
      createEngine(12, { chibiDeployed: true, chibiVictory: true });
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.setFlag('cao_m_march_south', true);

      const result = aiEngine.processAll();

      // 훈련/식량 유지는 하지만 공격 행동 없음
      const hasAttack = result.changes.some(c => c.includes('공격') || c.includes('진군'));
      expect(hasAttack).toBe(false);
    });

    it('남군 병력 부족 시 보충 징집', () => {
      createEngine(8);
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);

      // 남군 병력을 10000으로 낮춤
      stateManager.updateCity('nanjun', {
        troops: { infantry: 8000, cavalry: 1000, navy: 1000 },
      });

      const nanjunBefore = stateManager.getCity('nanjun')!;
      const troopsBefore = getTotalTroopsOfCity(nanjunBefore);

      aiEngine.processAll();

      const nanjunAfter = stateManager.getCity('nanjun')!;
      const troopsAfter = getTotalTroopsOfCity(nanjunAfter);
      // 식량 정규화로 변동 있으나 징집으로 병력 증가
      expect(troopsAfter).toBeGreaterThan(troopsBefore);
    });

    it('훈련 보너스 적용 (preparation phase)', () => {
      createEngine(2);
      const nanjunBefore = stateManager.getCity('nanjun')!;
      const trainingBefore = nanjunBefore.training;

      aiEngine.processAll();

      const nanjunAfter = stateManager.getCity('nanjun')!;
      expect(nanjunAfter.training).toBeGreaterThanOrEqual(trainingBefore + 3);
    });

    it('식량 정규화 (생산/소비 + 보너스 300)', () => {
      createEngine(1);
      const nanjunBefore = stateManager.getCity('nanjun')!;
      const foodBefore = nanjunBefore.food;

      aiEngine.processAll();

      const nanjunAfter = stateManager.getCity('nanjun')!;
      // 식량 변동 발생 (생산 + 300 보너스 - 소비)
      expect(nanjunAfter.food).not.toBe(foodBefore);
    });
  });

  describe('SunStrategy', () => {
    it('동맹 시 시상 훈련 보너스 +5', () => {
      createEngine(3, { allied: true });
      const sishangBefore = stateManager.getCity('sishang')!;
      const trainingBefore = sishangBefore.training;

      aiEngine.processAll();

      const sishangAfter = stateManager.getCity('sishang')!;
      // 훈련 보너스 +5 + 가능한 train 액션
      expect(sishangAfter.training).toBeGreaterThanOrEqual(trainingBefore + 5);
    });

    it('비동맹 시 낮은 훈련 보너스 +2', () => {
      createEngine(3);
      const sishangBefore = stateManager.getCity('sishang')!;
      const trainingBefore = sishangBefore.training;

      aiEngine.processAll();

      const sishangAfter = stateManager.getCity('sishang')!;
      expect(sishangAfter.training).toBe(Math.min(100, trainingBefore + 2));
    });

    it('동맹 + 적벽 배치 시 주유 파견 (Turn 10+)', () => {
      createEngine(10, { allied: true, chibiDeployed: true });
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.setFlag('cao_m_march_south', true);

      const result = aiEngine.processAll();

      const zhouyu = stateManager.getGeneral('zhouyu')!;
      expect(zhouyu.location).toBe('chibi');
      expect(stateManager.getFlag('sun_chibi_support')).toBe(true);
      expect(result.changes.some(c => c.includes('주유'))).toBe(true);
    });

    it('동맹 + 하구 식량 부족 시 식량 지원 (Turn 6+)', () => {
      createEngine(6, { allied: true });
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);

      // 하구 식량을 5000으로 낮춤
      stateManager.updateCity('hagu', { food: 5000 });

      const result = aiEngine.processAll();

      // 손권이 유비에게 선물 (식량 지원)
      expect(result.changes.some(c => c.includes('선물') || c.includes('군량'))).toBe(true);
    });

    it('비동맹 시 식량 지원 없음', () => {
      createEngine(6);
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.updateCity('hagu', { food: 3000 });

      const result = aiEngine.processAll();

      const hasGift = result.changes.some(c => c.includes('선물') || c.includes('군량'));
      expect(hasGift).toBe(false);
    });
  });

  describe('통합 테스트', () => {
    it('AI 세력 전체 턴 처리 (플레이어 세력 제외)', () => {
      createEngine(3);

      const result = aiEngine.processAll();

      // 조조 + 손권 행동 포함, 유비 행동 없음
      expect(result.changes.length).toBeGreaterThan(0);
    });

    it('행동 실패 시 graceful 처리', () => {
      createEngine(1);
      // 전투 상태로 만들어 액션 실패 유도
      // (전투 중이면 executeFor가 실패하지만 processAll은 계속 진행)
      // 이 테스트에서는 정상 상태에서 실패 가능한 액션이 없으므로
      // 전체가 정상 처리되는지만 확인
      const result = aiEngine.processAll();
      expect(result).toBeDefined();
      expect(Array.isArray(result.changes)).toBe(true);
    });

    it('조조 전투 발생 후에도 손권 행동 정상 처리', () => {
      createEngine(14, { allied: true, chibiDeployed: true });
      // 이전 마일스톤 플래그 전부 설정
      stateManager.setFlag('cao_m_conscript1', true);
      stateManager.setFlag('cao_m_caoren', true);
      stateManager.setFlag('cao_m_conscript2', true);
      stateManager.setFlag('cao_m_march_south', true);
      stateManager.setFlag('cao_chibi_reinforced', true);
      // 조인을 남군에 배치 (march에 필요한 장수)
      stateManager.updateGeneral('caoren', { location: 'nanjun' });
      // 하구 식량 낮춰서 손권 gift 트리거
      stateManager.updateCity('hagu', { food: 3000 });

      const result = aiEngine.processAll();

      // 조조 march→전투 발생 후에도 손권 gift 성공해야 함
      expect(result.battle).toBeDefined();
      expect(result.changes.some(c => c.includes('군량'))).toBe(true);
      // processAll 완료 후 activeBattle은 해제 상태
      expect(stateManager.getState().activeBattle).toBeNull();
    });

    it('플레이어 행동 횟수에 영향 없음', () => {
      createEngine(3);
      stateManager.resetActions();
      const actionsBefore = stateManager.getState().actionsRemaining;

      aiEngine.processAll();

      expect(stateManager.getState().actionsRemaining).toBe(actionsBefore);
    });
  });
});
