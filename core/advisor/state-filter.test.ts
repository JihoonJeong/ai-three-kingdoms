import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import {
  filterGameState,
  categorizeTroops, categorizeFood, categorizeDevelopment, categorizeMorale,
} from './state-filter.js';

describe('state-filter', () => {
  describe('범주 변환', () => {
    it('병력을 범주형으로 변환한다', () => {
      expect(categorizeTroops(10000)).toBe('풍부');
      expect(categorizeTroops(8000)).toBe('풍부');
      expect(categorizeTroops(5000)).toBe('충분');
      expect(categorizeTroops(4000)).toBe('충분');
      expect(categorizeTroops(3000)).toBe('부족');
      expect(categorizeTroops(2000)).toBe('부족');
      expect(categorizeTroops(1000)).toBe('위험');
      expect(categorizeTroops(0)).toBe('위험');
    });

    it('식량을 범주형으로 변환한다', () => {
      expect(categorizeFood(15000)).toBe('풍부');
      expect(categorizeFood(10000)).toBe('풍부');
      expect(categorizeFood(7000)).toBe('충분');
      expect(categorizeFood(3000)).toBe('부족');
      expect(categorizeFood(1000)).toBe('위험');
    });

    it('사기를 범주형으로 변환한다', () => {
      expect(categorizeMorale(80)).toBe('높음');
      expect(categorizeMorale(70)).toBe('높음');
      expect(categorizeMorale(50)).toBe('보통');
      expect(categorizeMorale(40)).toBe('보통');
      expect(categorizeMorale(30)).toBe('낮음');
    });

    it('개발도를 범주형으로 변환한다', () => {
      const scenario = createRedCliffsScenario('test');
      const gangha = scenario.cities.find(c => c.id === 'gangha')!;
      // 강하: agriculture B(65), commerce C(50), defense B(65) → avg=60 → 보통
      expect(categorizeDevelopment(gangha)).toBe('보통');

      const nanjun = scenario.cities.find(c => c.id === 'nanjun')!;
      // 남군: all A(80) → avg=80 → 높음
      expect(categorizeDevelopment(nanjun)).toBe('높음');
    });
  });

  describe('filterGameState', () => {
    it('AdvisorView를 올바르게 생성한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      expect(view.turn).toBe(1);
      expect(view.maxTurns).toBe(20);
      expect(view.phase).toBe('preparation');
      expect(view.season).toBeDefined();
    });

    it('아군 도시만 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      // 유비 도시: 강하, 하구
      expect(view.ourCities).toHaveLength(2);
      expect(view.ourCities.map(c => c.name).sort()).toEqual(['강하', '하구']);
    });

    it('도시에 장수를 배치한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      const gangha = view.ourCities.find(c => c.name === '강하');
      expect(gangha).toBeDefined();
      expect(gangha!.stationedGenerals.length).toBeGreaterThan(0);
    });

    it('동맹 정보를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      expect(view.allies.length).toBeGreaterThan(0);
      const sun = view.allies.find(a => a.name === '손권');
      expect(sun).toBeDefined();
      expect(sun!.relation).toBeDefined();
    });

    it('적군 정보를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      expect(view.enemyIntel).toBeDefined();
      expect(view.enemyIntel.estimatedTotalTroops).toBeDefined();
      expect(view.enemyIntel.keyGeneralsSpotted.length).toBeGreaterThan(0);
    });

    it('정확한 숫자를 포함하지 않는다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const json = JSON.stringify(view);

      // 실제 병력/식량 숫자가 노출되지 않아야 함
      expect(json).not.toContain('"8000"');  // 강하 식량
      expect(json).not.toContain('"5000"');  // 강하 보병
      // 범주형 값은 포함
      expect(json).toContain('충분');
    });

    it('전투가 없으면 activeBattle은 null', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      expect(view.activeBattle).toBeNull();
    });

    it('배경지식을 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      expect(view.contextKnowledge.length).toBeGreaterThan(0);
      expect(view.contextKnowledge.length).toBeLessThanOrEqual(3);
    });

    it('식량 위기 시 긴급 사안을 생성한다', () => {
      const state = createRedCliffsScenario('test');
      // 하구 식량을 위험 수준으로 낮추기
      const hagu = state.cities.find(c => c.id === 'hagu')!;
      hagu.food = 1000;

      const view = filterGameState(state);
      expect(view.urgentMatters.some(m => m.includes('하구'))).toBe(true);
    });
  });
});
