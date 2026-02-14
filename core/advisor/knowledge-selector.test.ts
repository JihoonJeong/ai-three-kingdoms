import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import { selectKnowledge } from './knowledge-selector.js';

describe('knowledge-selector', () => {
  it('최대 3개 지식을 선택한다', () => {
    const state = createRedCliffsScenario('test');
    const chunks = selectKnowledge(state);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('preparation 페이즈에 관련 지식을 선택한다', () => {
    const state = createRedCliffsScenario('test');
    state.phase = 'preparation';
    const chunks = selectKnowledge(state);
    const joined = chunks.join('\n');

    // preparation에는 외교/화공/형주 등이 관련
    const hasRelevant =
      joined.includes('외교') ||
      joined.includes('화공') ||
      joined.includes('형주') ||
      joined.includes('동맹');
    expect(hasRelevant).toBe(true);
  });

  it('battle 페이즈에 전투 관련 지식을 선택한다', () => {
    const state = createRedCliffsScenario('test');
    state.phase = 'battle';
    const chunks = selectKnowledge(state);
    const joined = chunks.join('\n');

    const hasRelevant =
      joined.includes('화공') ||
      joined.includes('수전') ||
      joined.includes('전술') ||
      joined.includes('후퇴');
    expect(hasRelevant).toBe(true);
  });

  it('플래그 매칭 시 높은 우선순위를 부여한다', () => {
    const state = createRedCliffsScenario('test');
    state.flags['southeastWindHint'] = true;
    const chunks = selectKnowledge(state);
    const joined = chunks.join('\n');

    // 동남풍 힌트가 있으면 동남풍 지식이 선택되어야 함
    expect(joined).toContain('동남풍');
  });

  it('전투 중 수상 지형이면 수전 지식을 선택한다', () => {
    const state = createRedCliffsScenario('test');
    state.phase = 'battle';
    state.activeBattle = {
      battleId: 'test-battle',
      location: '적벽',
      terrain: '수상',
      weather: '맑음',
      battleTurn: 1,
      maxBattleTurns: 4,
      attackers: {
        faction: '유비', generals: [], troops: 5000,
        initialTroops: 5000, morale: 80, formation: null,
      },
      defenders: {
        faction: '조조', generals: [], troops: 15000,
        initialTroops: 15000, morale: 70, formation: '연환진',
      },
      availableTactics: [],
      log: [],
      isOver: false,
      result: null,
    };

    const chunks = selectKnowledge(state);
    const joined = chunks.join('\n');
    expect(joined).toContain('수전');
  });

  it('결과는 제목과 내용을 포함한다', () => {
    const state = createRedCliffsScenario('test');
    const chunks = selectKnowledge(state);

    for (const chunk of chunks) {
      // [제목]\n내용 형식
      expect(chunk).toMatch(/^\[.+\]\n/);
    }
  });
});
