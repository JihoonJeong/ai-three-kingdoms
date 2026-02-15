import { describe, it, expect } from 'vitest';
import { MilestoneRegistry } from './milestones.js';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';

describe('MilestoneRegistry', () => {
  function createState(turn: number, options?: {
    allied?: boolean;
    chibiDeployed?: boolean;
    chibiVictory?: boolean;
    flags?: Record<string, unknown>;
  }) {
    const sm = new GameStateManager(createRedCliffsScenario('test-ms'));
    for (let i = 1; i < turn; i++) sm.advanceTurn();
    if (turn <= 8) sm.setPhase('preparation');
    else if (turn <= 13) sm.setPhase('battle');
    else sm.setPhase('aftermath');

    if (options?.allied) {
      sm.updateRelation('유비', '손권', { isAlliance: true, value: 85 });
    }
    if (options?.chibiDeployed) sm.setFlag('cao_chibi_deployed', true);
    if (options?.chibiVictory) sm.setFlag('chibiVictory', true);
    if (options?.flags) {
      for (const [k, v] of Object.entries(options.flags)) sm.setFlag(k, v);
    }
    return sm;
  }

  const registry = new MilestoneRegistry();

  describe('getPendingMilestones — 조조', () => {
    it('Turn 3: cao_m_conscript1 반환', () => {
      const sm = createState(3);
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_m_conscript1')).toBe(true);
    });

    it('Turn 2: 아직 마일스톤 없음', () => {
      const sm = createState(2);
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.length).toBe(0);
    });

    it('플래그 설정 후 재반환 안 함', () => {
      const sm = createState(3, { flags: { cao_m_conscript1: true } });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_m_conscript1')).toBe(false);
    });

    it('Turn 5: cao_m_caoren 반환 (이전 마일스톤 완료 시)', () => {
      const sm = createState(5, {
        flags: { cao_m_conscript1: true },
      });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_m_caoren')).toBe(true);
    });

    it('Turn 9: cao_chibi_deployed 반환', () => {
      const sm = createState(9, {
        flags: {
          cao_m_conscript1: true, cao_m_caoren: true,
          cao_m_conscript2: true, cao_m_march_south: true,
        },
      });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_chibi_deployed')).toBe(true);
    });

    it('Turn 10: cao_chibi_reinforced 조건 — cao_chibi_deployed 필요', () => {
      const sm = createState(10, {
        flags: {
          cao_m_conscript1: true, cao_m_caoren: true,
          cao_m_conscript2: true, cao_m_march_south: true,
          // cao_chibi_deployed 미설정
        },
      });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_chibi_reinforced')).toBe(false);
    });

    it('Turn 10: cao_chibi_reinforced 반환 — cao_chibi_deployed 설정 시', () => {
      const sm = createState(10, {
        chibiDeployed: true,
        flags: {
          cao_m_conscript1: true, cao_m_caoren: true,
          cao_m_conscript2: true, cao_m_march_south: true,
        },
      });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'cao_chibi_reinforced')).toBe(true);
    });

    it('누적: Turn 6에 이전 미완료 마일스톤 모두 반환', () => {
      const sm = createState(6);
      const pending = registry.getPendingMilestones('조조', sm.getState());
      // cao_m_conscript1 (3), cao_m_caoren (5), cao_m_conscript2 (6) 모두 대기
      expect(pending.length).toBeGreaterThanOrEqual(3);
      expect(pending.some(m => m.id === 'cao_m_conscript1')).toBe(true);
      expect(pending.some(m => m.id === 'cao_m_caoren')).toBe(true);
      expect(pending.some(m => m.id === 'cao_m_conscript2')).toBe(true);
    });

    it('손권 마일스톤은 조조 조회에 포함되지 않음', () => {
      const sm = createState(10, { allied: true, chibiDeployed: true });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      expect(pending.some(m => m.id === 'sun_chibi_support')).toBe(false);
    });
  });

  describe('getPendingMilestones — 손권', () => {
    it('동맹 + cao_chibi_deployed + Turn 10: sun_chibi_support 반환', () => {
      const sm = createState(10, { allied: true, chibiDeployed: true });
      const pending = registry.getPendingMilestones('손권', sm.getState());
      expect(pending.some(m => m.id === 'sun_chibi_support')).toBe(true);
    });

    it('비동맹 시 sun_chibi_support 미반환', () => {
      const sm = createState(10, { chibiDeployed: true });
      const pending = registry.getPendingMilestones('손권', sm.getState());
      expect(pending.some(m => m.id === 'sun_chibi_support')).toBe(false);
    });

    it('동맹이지만 cao_chibi_deployed 미설정 시 미반환', () => {
      const sm = createState(10, { allied: true });
      const pending = registry.getPendingMilestones('손권', sm.getState());
      expect(pending.some(m => m.id === 'sun_chibi_support')).toBe(false);
    });
  });

  describe('getActiveAdaptiveRules — 조조', () => {
    it('동맹 가속: Turn 7 + 동맹 → cao_alliance_accel', () => {
      const sm = createState(7, { allied: true });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_alliance_accel')).toBe(true);
    });

    it('동맹 가속: 이미 배치 완료 시 비활성', () => {
      const sm = createState(7, { allied: true, chibiDeployed: true });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_alliance_accel')).toBe(false);
    });

    it('연환진 경고: Turn 11-12 + cao_chibi_deployed', () => {
      const sm = createState(11, { chibiDeployed: true });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_chain_warning')).toBe(true);
    });

    it('연환진 경고: Turn 13은 범위 밖', () => {
      const sm = createState(13, { chibiDeployed: true });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_chain_warning')).toBe(false);
    });

    it('후방 견제: Turn 14 + cao_chibi_deployed + 쿨다운 없음', () => {
      const sm = createState(14, { chibiDeployed: true });
      sm.updateGeneral('caoren', { location: 'nanjun' });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_rear_attack')).toBe(true);
    });

    it('후방 견제: 4턴 쿨다운 내 비활성', () => {
      const sm = createState(14, {
        chibiDeployed: true,
        flags: { cao_last_attack_turn: 12 },
      });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.some(r => r.id === 'cao_rear_attack')).toBe(false);
    });

    it('priority 내림차순 정렬', () => {
      const sm = createState(7, { allied: true });
      // 남군 병력 줄여서 replenish 트리거
      sm.updateCity('nanjun', {
        troops: { infantry: 8000, cavalry: 1000, navy: 1000 },
      });
      const rules = registry.getActiveAdaptiveRules('조조', sm.getState());
      expect(rules.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
      }
    });
  });

  describe('getActiveAdaptiveRules — 손권', () => {
    it('식량 지원: 동맹 + Turn 6 + 하구 식량 부족', () => {
      const sm = createState(6, { allied: true });
      sm.updateCity('hagu', { food: 5000 });
      const rules = registry.getActiveAdaptiveRules('손권', sm.getState());
      expect(rules.some(r => r.id === 'sun_food_gift')).toBe(true);
    });

    it('훈련: 동맹 + 시상 훈련 부족', () => {
      const sm = createState(3, { allied: true });
      sm.updateCity('sishang', { training: 50 });
      const rules = registry.getActiveAdaptiveRules('손권', sm.getState());
      expect(rules.some(r => r.id === 'sun_train')).toBe(true);
    });

    it('비동맹 시 규칙 없음', () => {
      const sm = createState(6);
      sm.updateCity('hagu', { food: 3000 });
      sm.updateCity('sishang', { training: 30 });
      const rules = registry.getActiveAdaptiveRules('손권', sm.getState());
      expect(rules.length).toBe(0);
    });
  });

  describe('resolve 함수', () => {
    it('cao_chibi_deployed resolve — 채모/장윤 배치', () => {
      const sm = createState(9);
      const pending = registry.getPendingMilestones('조조', sm.getState());
      const milestone = pending.find(m => m.id === 'cao_chibi_deployed')!;
      expect(milestone).toBeDefined();
      expect(milestone.resolve).toBeDefined();

      const resolution = milestone.resolve!(sm.getState());
      expect(resolution.deployments).toHaveLength(2);
      expect(resolution.deployments[0].destination).toBe('chibi');
      expect(resolution.messages.length).toBeGreaterThan(0);
    });

    it('cao_m_caoren resolve — 조인이 장릉에 있을 때', () => {
      const sm = createState(5);
      const pending = registry.getPendingMilestones('조조', sm.getState());
      const milestone = pending.find(m => m.id === 'cao_m_caoren')!;
      expect(milestone.resolve).toBeDefined();

      const resolution = milestone.resolve!(sm.getState());
      expect(resolution.actions).toHaveLength(1);
      expect(resolution.actions[0].action).toBe('assign');
    });

    it('cao_m_caoren resolve — 조인이 이미 남군이면 빈 결과', () => {
      const sm = createState(5);
      sm.updateGeneral('caoren', { location: 'nanjun' });
      const pending = registry.getPendingMilestones('조조', sm.getState());
      const milestone = pending.find(m => m.id === 'cao_m_caoren')!;

      const resolution = milestone.resolve!(sm.getState());
      expect(resolution.actions).toHaveLength(0);
    });

    it('sun_chibi_support resolve — 주유 배치', () => {
      const sm = createState(10, { allied: true, chibiDeployed: true });
      const pending = registry.getPendingMilestones('손권', sm.getState());
      const milestone = pending.find(m => m.id === 'sun_chibi_support')!;
      expect(milestone.resolve).toBeDefined();

      const resolution = milestone.resolve!(sm.getState());
      expect(resolution.deployments).toHaveLength(1);
      expect(resolution.deployments[0].generalId).toBe('zhouyu');
      expect(resolution.deployments[0].destination).toBe('chibi');
    });
  });

  describe('isSatisfied', () => {
    it('cao_m_conscript1 — conscript at nanjun 포함 시 만족', () => {
      const pending = registry.getPendingMilestones('조조', createState(3).getState());
      const ms = pending.find(m => m.id === 'cao_m_conscript1')!;
      const actions = [{ type: 'domestic' as const, action: 'conscript' as const, params: { city: 'nanjun', scale: 'medium' as const } }];
      expect(ms.isSatisfied!(actions, [])).toBe(true);
    });

    it('cao_m_conscript1 — 다른 도시 conscript는 불만족', () => {
      const pending = registry.getPendingMilestones('조조', createState(3).getState());
      const ms = pending.find(m => m.id === 'cao_m_conscript1')!;
      const actions = [{ type: 'domestic' as const, action: 'conscript' as const, params: { city: 'jiangling', scale: 'large' as const } }];
      expect(ms.isSatisfied!(actions, [])).toBe(false);
    });

    it('cao_chibi_deployed — chibi 배치 포함 시 만족', () => {
      const pending = registry.getPendingMilestones('조조', createState(9).getState());
      const ms = pending.find(m => m.id === 'cao_chibi_deployed')!;
      const deployments = [{ generalId: 'caimao', destination: 'chibi' }];
      expect(ms.isSatisfied!([], deployments)).toBe(true);
    });
  });
});
