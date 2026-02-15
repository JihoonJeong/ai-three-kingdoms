import { describe, it, expect } from 'vitest';
import { matchSemanticActions } from './semantic-matcher.js';
import type { RecommendationContext } from './action-recommender.js';

const CTX: RecommendationContext = {
  playerCities: [
    { id: 'gangha', name: '강하' },
    { id: 'hagu', name: '하구' },
  ],
  playerGenerals: [
    { id: 'liubei', name: '유비', location: 'gangha' },
    { id: 'guanyu', name: '관우', location: 'gangha' },
    { id: 'zhangfei', name: '장비', location: 'hagu' },
    { id: 'zhugeliang', name: '제갈량', location: 'gangha' },
    { id: 'zhaoyun', name: '조자룡', location: 'gangha' },
  ],
  factions: ['손권', '조조'],
  allLocations: ['gangha', 'hagu', 'fancheng', 'xiangyang', 'jiangling', 'chibi'],
};

describe('matchSemanticActions', () => {
  // ─── 기본 매칭 ──────────────────────────────────────────

  it('develop: "농업을 발전시켜" → develop action', () => {
    const text = '1. 하구에서 농업을 발전시켜 식량을 확보하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'agriculture' },
    });
  });

  it('conscript: "병력 모집" → conscript action', () => {
    const text = '1. 강하에서 대규모 병력 모집이 필요합니다';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'conscript',
      params: { city: 'gangha', scale: 'large' },
    });
  });

  it('train: "훈련" → train action', () => {
    const text = '1. 강하 병사들의 훈련을 강화하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });
  });

  it('send_envoy: "사신을 보내" → send_envoy action', () => {
    const text = '1. 손권에게 사신을 보내 동맹을 강화하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
  });

  it('scout: "정찰" → scout action', () => {
    const text = '1. 적벽 주변을 정찰하여 적의 동향을 파악하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'chibi' },
    });
  });

  it('fortify: "방어 강화" → fortify action', () => {
    const text = '1. 하구의 방어 강화가 시급합니다';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'military', action: 'fortify',
      params: { city: 'hagu' },
    });
  });

  it('gift: "선물을 보내" → gift action', () => {
    const text = '1. 손권에게 선물을 보내 환심을 사시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'diplomacy', action: 'gift',
      params: { target: '손권', amount: 1000 },
    });
  });

  it('threaten: "조조를 위협" → threaten action', () => {
    const text = '1. 조조에게 경고를 보내 압박하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'diplomacy', action: 'threaten',
      params: { target: '조조' },
    });
  });

  it('pass: "관망" → null (pass) action', () => {
    const text = '1. 지금은 관망하며 때를 기다리시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBeNull();
  });

  // ─── 3개 번호 리스트 ────────────────────────────────────

  it('번호 리스트 3개 → 3개 추천 추출', () => {
    const text = `주공, 현재 판세를 분석하겠소.
1. 하구에서 농업을 개발하여 식량을 확보하시오
2. 강하에서 병사를 훈련시키시오
3. 손권에게 사신을 보내 동맹을 공고히 하시오`;

    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(3);
    expect(recs[0].action?.action).toBe('develop');
    expect(recs[1].action?.action).toBe('train');
    expect(recs[2].action?.action).toBe('send_envoy');
  });

  // ─── 엔티티 추출 ────────────────────────────────────────

  it('세력 별칭: "동오" → 손권으로 매핑', () => {
    const text = '1. 동오에 사신을 파견하여 협력을 강화하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
  });

  it('적벽 → chibi 지역 매핑', () => {
    const text = '1. 적벽 일대를 정찰하여 첩보를 수집하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'chibi' },
    });
  });

  it('develop focus: "상업" → commerce', () => {
    const text = '1. 강하의 상업을 발전시키시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    if (recs[0].action && recs[0].action.action === 'develop') {
      expect(recs[0].action.params.focus).toBe('commerce');
    }
  });

  it('develop focus: "방어 시설 건설" → develop|defense (모호성 해소)', () => {
    const text = '1. 하구에 방어 시설을 건설하여 개발하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'defense' },
    });
  });

  // ─── 모호성 해소 ────────────────────────────────────────

  it('모호성: "병력 충원" → conscript (train 아님)', () => {
    const text = '1. 강하에서 병력을 충원하여 전투에 대비하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action?.action).toBe('conscript');
  });

  it('모호성: "병사 훈련" → train (conscript 아님)', () => {
    const text = '1. 하구에서 병사를 조련하여 전투력을 향상시키시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    expect(recs[0].action?.action).toBe('train');
  });

  // ─── 엣지 케이스 ────────────────────────────────────────

  it('추천 없는 서사 → 빈 배열 반환', () => {
    const text = '주공, 현재 상황이 좋습니다. 지금은 별다른 조치가 필요 없습니다.';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toEqual([]);
  });

  it('도시 1개 자동 선택 (단일 도시 컨텍스트)', () => {
    const singleCityCtx: RecommendationContext = {
      playerCities: [{ id: 'hagu', name: '하구' }],
      playerGenerals: [{ id: 'zhangfei', name: '장비', location: 'hagu' }],
      factions: ['손권'],
    };
    const text = '1. 병사들의 훈련을 강화하시오';
    const recs = matchSemanticActions(text, singleCityCtx);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'hagu' },
    });
  });

  it('중복 액션은 제거한다', () => {
    const text = `1. 강하에서 훈련을 실시하시오
2. 강하 병사의 훈련을 강화하시오
3. 손권에게 사신을 보내시오`;

    const recs = matchSemanticActions(text, CTX);
    // 첫 두 개는 train|gangha로 동일 → 중복 제거
    expect(recs.length).toBeLessThanOrEqual(2);
    const actions = recs.map(r => r.action?.action);
    expect(actions).toContain('train');
    expect(actions).toContain('send_envoy');
  });

  it('최대 3개까지만 추출한다', () => {
    const text = `1. 하구 농업 개발하시오
2. 강하 훈련을 강화하시오
3. 손권에게 사신 파견하시오
4. 적벽을 정찰하시오`;

    const recs = matchSemanticActions(text, CTX);
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  // ─── exaone 실제 출력 스타일 ─────────────────────────────

  it('exaone 스타일: 구조화 없는 자연어 조언에서 추천 추출', () => {
    const text = `주공, 현재 판세가 급박합니다. 조조의 대군이 남하 중이므로 빠른 대비가 필요합니다.

1. 먼저 하구의 농업을 발전시켜 식량을 확보하는 것이 급선무입니다. 식량 없이는 대군을 유지할 수 없습니다.
2. 강하에서 병사들의 훈련을 강화하여 전투력을 높이십시오. 훈련된 병사가 오합지졸보다 낫습니다.
3. 동오의 손권에게 사신을 보내 연합 전선을 공고히 해야 합니다. 단독으로 조조를 상대하기 어렵습니다.`;

    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(3);

    // 1. develop|hagu|agriculture
    expect(recs[0].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'agriculture' },
    });

    // 2. train|gangha
    expect(recs[1].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });

    // 3. send_envoy|손권
    expect(recs[2].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
  });

  it('exaone 스타일: 존재하지 않는 액션명(trade 등) 없이 키워드로 추출', () => {
    const text = `주공, 현재 하구의 식량이 위험 수준입니다.

1. 하구에서 식량 생산을 늘리기 위해 내정에 힘쓰시오. 개간을 통해 농업 기반을 확충해야 합니다.
2. 적벽 주변의 동향을 파악하기 위해 첩보를 수집하시오.
3. 강하에서 소규모 징병을 실시하여 병력을 보충하시오.`;

    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(3);

    expect(recs[0].action?.action).toBe('develop');
    expect(recs[1].action?.action).toBe('scout');
    expect(recs[2].action?.action).toBe('conscript');
  });

  // ─── Confidence 산출 ────────────────────────────────────

  it('confidence: primary keyword가 많을수록 높다', () => {
    const text = '1. 하구에서 병력 모집과 충원을 실시하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    // "병력 모집" + "충원" 두 개 primary hit = base 60
    expect(recs[0].confidence).toBeGreaterThanOrEqual(55);
  });

  it('confidence: 뒤쪽 세그먼트일수록 순서 페널티', () => {
    const text = `1. 하구의 농업을 발전시키시오
2. 강하에서 훈련을 실시하시오
3. 적벽을 정찰하시오`;

    const recs = matchSemanticActions(text, CTX);
    expect(recs.length).toBe(3);
    // 순서 페널티로 뒤로 갈수록 confidence 감소 경향
    expect(recs[0].confidence).toBeGreaterThanOrEqual(recs[2].confidence);
  });

  it('confidence: 최소 30 보장', () => {
    const text = '1. 하구에서 훈련하시오';
    const recs = matchSemanticActions(text, CTX);
    if (recs.length > 0) {
      expect(recs[0].confidence).toBeGreaterThanOrEqual(30);
    }
  });

  // ─── scale 기본값 ───────────────────────────────────────

  it('conscript: 규모 미지정 시 기본값 medium', () => {
    const text = '1. 하구에서 징병하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    if (recs[0].action && recs[0].action.action === 'conscript') {
      expect(recs[0].action.params.scale).toBe('medium');
    }
  });

  it('develop: focus 미지정 시 기본값 agriculture', () => {
    const text = '1. 하구를 개발하시오';
    const recs = matchSemanticActions(text, CTX);
    expect(recs).toHaveLength(1);
    if (recs[0].action && recs[0].action.action === 'develop') {
      expect(recs[0].action.params.focus).toBe('agriculture');
    }
  });
});
