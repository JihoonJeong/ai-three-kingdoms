// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Faction 프롬프트 + 상태 필터 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import { buildFactionStateView } from './faction-state-filter.js';
import { buildCaoSystemPrompt, buildSunSystemPrompt } from './faction-prompts.js';

describe('buildFactionStateView', () => {
  it('조조 시점 — 자기 도시에 정확한 수치 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');

    // 조조 도시: 남군, 장릉
    expect(view.ownCities).toHaveLength(2);
    const nanjun = view.ownCities.find(c => c.id === 'nanjun');
    expect(nanjun).toBeDefined();
    expect(nanjun!.troops.infantry).toBe(15000);
    expect(nanjun!.troops.cavalry).toBe(5000);
    expect(nanjun!.troops.navy).toBe(3000);
    expect(nanjun!.totalTroops).toBe(23000);
    expect(nanjun!.food).toBe(20000);
    expect(nanjun!.morale).toBe(80);
  });

  it('조조 시점 — 자기 장수 정보 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');

    // 조조 장수 5명
    expect(view.ownGenerals).toHaveLength(5);
    const caocao = view.ownGenerals.find(g => g.id === 'caocao');
    expect(caocao).toBeDefined();
    expect(caocao!.abilities.command).toBe('S');
    expect(caocao!.location).toBe('nanjun');
  });

  it('조조 시점 — 적 정보는 범주형', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');

    // 유비, 손권 정보
    expect(view.enemyIntel).toHaveLength(2);
    const liuIntel = view.enemyIntel.find(e => e.factionId === '유비');
    expect(liuIntel).toBeDefined();
    // 범주형 문자열 확인
    expect(['압도적', '우세', '비슷', '열세']).toContain(liuIntel!.estimatedTroops);
    // 적 도시는 ID 포함
    expect(liuIntel!.knownCities.length).toBeGreaterThan(0);
    expect(liuIntel!.knownCities[0].id).toBeTruthy();
    expect(liuIntel!.knownCities[0].troopsLevel).toBeTruthy();
  });

  it('손권 시점 — 시상이 자기 도시', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '손권');

    expect(view.ownCities).toHaveLength(1);
    expect(view.ownCities[0].id).toBe('sishang');
    expect(view.ownCities[0].troops.navy).toBe(5000);
  });

  it('외교 관계 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');

    expect(view.diplomacy.relations).toHaveLength(2);
    const liuRel = view.diplomacy.relations.find(r => r.target === '유비');
    expect(liuRel).toBeDefined();
    expect(liuRel!.relation).toBe('적대');
    expect(liuRel!.isAlliance).toBe(false);
  });

  it('관련 플래그만 필터링', () => {
    const state = createRedCliffsScenario();
    state.flags['cao_chibi_deployed'] = true;
    state.flags['sun_chibi_support'] = true;
    state.flags['chibiVictory'] = false;
    state.flags['liu_custom'] = true;

    const caoView = buildFactionStateView(state, '조조');
    expect(caoView.relevantFlags['cao_chibi_deployed']).toBe(true);
    expect(caoView.relevantFlags['chibiVictory']).toBe(false);
    expect(caoView.relevantFlags['sun_chibi_support']).toBeUndefined();
    expect(caoView.relevantFlags['liu_custom']).toBeUndefined();
  });

  it('strategicGoals 파라미터 전달', () => {
    const state = createRedCliffsScenario();
    const goals = ['남군 병력 증강', '적벽 출진 준비'];
    const view = buildFactionStateView(state, '조조', goals);
    expect(view.strategicGoals).toEqual(goals);
  });

  it('기본 strategicGoals는 빈 배열', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    expect(view.strategicGoals).toEqual([]);
  });
});

describe('buildCaoSystemPrompt', () => {
  it('조조 페르소나 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('조조 맹덕');
    expect(prompt).toContain('공격적');
    expect(prompt).toContain('오만');
  });

  it('전략 목표 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('전략 목표');
    // 초기 남군 23000 > 20000 이므로 '충분' 목표
    expect(prompt).toContain('배치 최적화');
  });

  it('남군 병력 부족 시 20,000 목표 표시', () => {
    const state = createRedCliffsScenario();
    // 남군 병력을 줄여서 목표 트리거
    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    nanjun.troops.infantry = 5000;
    nanjun.troops.cavalry = 2000;
    nanjun.troops.navy = 1000;
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('20,000');
    expect(prompt).toContain('현재: 8000');
  });

  it('자기 도시 정확한 수치 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('남군(nanjun)');
    expect(prompt).toContain('보병15000');
    expect(prompt).toContain('식량20000');
  });

  it('<actions> 출력 형식 지시 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('<actions>');
    expect(prompt).toContain('JSON 배열만 출력');
    expect(prompt).toContain('사용 가능한 type');
  });

  it('행동 ID 참조표 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('행동 ID 참조표');
    expect(prompt).toContain('nanjun=남군');
    expect(prompt).toContain('caocao=조조');
  });

  it('preparation phase에서 적벽 출진 목표 (턴 5+)', () => {
    const state = createRedCliffsScenario();
    state.turn = 6;
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('적벽 출진');
    expect(prompt).toContain('채모/장윤');
  });

  it('battle phase 목표', () => {
    const state = createRedCliffsScenario();
    state.phase = 'battle';
    state.turn = 10;
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('적벽에 수군 주력');
    expect(prompt).toContain('하구/강하를 견제');
  });

  it('chibiVictory 시 방어 전환', () => {
    const state = createRedCliffsScenario();
    state.phase = 'aftermath';
    state.flags['chibiVictory'] = true;
    const view = buildFactionStateView(state, '조조');
    const prompt = buildCaoSystemPrompt(view);

    expect(prompt).toContain('방어 전환');
    expect(prompt).toContain('무리한 공격 금지');
  });
});

describe('buildSunSystemPrompt', () => {
  it('손권 페르소나 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('손권 중모');
    expect(prompt).toContain('신중');
    expect(prompt).toContain('실리적');
  });

  it('비동맹 시 관망 목표', () => {
    const state = createRedCliffsScenario();
    // 초기: 유비-손권 비동맹
    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('관망');
    expect(prompt).toContain('내정');
  });

  it('동맹 시 협력 목표', () => {
    const state = createRedCliffsScenario();
    // 동맹 설정
    const rel = state.diplomacy.relations.find(
      r => (r.factionA === '유비' && r.factionB === '손권') ||
           (r.factionA === '손권' && r.factionB === '유비'),
    );
    if (rel) {
      rel.isAlliance = true;
      rel.relation = '우호';
    }

    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('동맹 협력');
    expect(prompt).toContain('식량을 지원');
  });

  it('battle phase + 동맹 시 주유 파견 목표', () => {
    const state = createRedCliffsScenario();
    state.phase = 'battle';
    state.turn = 10;
    const rel = state.diplomacy.relations.find(
      r => (r.factionA === '유비' && r.factionB === '손권') ||
           (r.factionA === '손권' && r.factionB === '유비'),
    );
    if (rel) {
      rel.isAlliance = true;
      rel.relation = '우호';
    }

    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('주유를 적벽에 파견');
  });

  it('시상 도시 정확한 수치 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('시상(sishang)');
    expect(prompt).toContain('수군5000');
  });

  it('<actions> 출력 형식 지시 포함', () => {
    const state = createRedCliffsScenario();
    const view = buildFactionStateView(state, '손권');
    const prompt = buildSunSystemPrompt(view);

    expect(prompt).toContain('<actions>');
    expect(prompt).toContain('JSON 배열만 출력');
  });
});
