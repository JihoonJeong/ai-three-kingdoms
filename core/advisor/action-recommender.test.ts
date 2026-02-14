import { describe, it, expect } from 'vitest';
import { parseRecommendations, type RecommendationContext } from './action-recommender.js';

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
  ],
  factions: ['손권', '조조'],
};

describe('parseRecommendations', () => {
  it('정상적인 3개 추천을 파싱한다', () => {
    const text = `주공, 현재 하구의 병력이 부족하오.

---ACTIONS---
1. [conscript|gangha|medium] 75% 강하에서 중규모 징병
2. [train|hagu] 60% 하구 병사 훈련
3. [send_envoy|손권] 50% 손권에게 사신 파견`;

    const result = parseRecommendations(text, CTX);

    expect(result.narrative).toBe('주공, 현재 하구의 병력이 부족하오.');
    expect(result.recommendations).toHaveLength(3);

    expect(result.recommendations[0]).toEqual({
      action: { type: 'domestic', action: 'conscript', params: { city: 'gangha', scale: 'medium' } },
      confidence: 75,
      description: '강하에서 중규모 징병',
    });

    expect(result.recommendations[1]).toEqual({
      action: { type: 'domestic', action: 'train', params: { city: 'hagu' } },
      confidence: 60,
      description: '하구 병사 훈련',
    });

    expect(result.recommendations[2]).toEqual({
      action: { type: 'diplomacy', action: 'send_envoy', params: { target: '손권', purpose: '우호 증진' } },
      confidence: 50,
      description: '손권에게 사신 파견',
    });
  });

  it('---ACTIONS--- 블록 없는 응답은 빈 추천을 반환한다', () => {
    const text = '주공, 현재 상황이 좋습니다. 더 묻고 싶은 것이 있습니까?';
    const result = parseRecommendations(text, CTX);

    expect(result.narrative).toBe(text);
    expect(result.recommendations).toEqual([]);
  });

  it('[pass]를 null 액션으로 파싱한다', () => {
    const text = `분석 결과...

---ACTIONS---
1. [conscript|gangha|small] 70% 소규모 징병
2. [pass] 40% 급하지 않다면 지켜볼 수도 있소
3. [train|hagu] 30% 훈련 강화`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[1].action).toBeNull();
    expect(result.recommendations[1].confidence).toBe(40);
  });

  it('유효하지 않은 줄은 건너뛴다 (부분 파싱)', () => {
    const text = `조언...

---ACTIONS---
1. [conscript|gangha|medium] 80% 징병
2. [invalid_action|foo] 50% 이상한 행동
3. [train|hagu] 60% 훈련`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].action?.action).toBe('conscript');
    expect(result.recommendations[1].action?.action).toBe('train');
  });

  it('도시 이름으로도 파싱 가능하다 (ID 대신 이름 사용)', () => {
    const text = `...

---ACTIONS---
1. [conscript|강하|small] 65% 강하 징병
2. [train|하구] 55% 하구 훈련
3. [pass] 30% 대기`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    const firstAction = result.recommendations[0].action;
    expect(firstAction).not.toBeNull();
    if (firstAction && firstAction.action === 'conscript') {
      expect(firstAction.params.city).toBe('gangha');  // 이름 → ID 변환
    }

    const secondAction = result.recommendations[1].action;
    expect(secondAction).not.toBeNull();
    if (secondAction && secondAction.action === 'train') {
      expect(secondAction.params.city).toBe('hagu');
    }
  });

  it('confidence를 0-100 범위로 클램핑한다', () => {
    const text = `...

---ACTIONS---
1. [train|gangha] 150% 과도한 자신감
2. [train|hagu] 0% 자신감 없음`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].confidence).toBe(100);
    expect(result.recommendations[1].confidence).toBe(0);
  });

  it('외교 액션을 올바르게 파싱한다', () => {
    const text = `...

---ACTIONS---
1. [gift|손권] 70% 손권에게 선물
2. [threaten|조조] 60% 조조에게 위협
3. [pass] 40% 대기`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    const gift = result.recommendations[0].action;
    expect(gift).not.toBeNull();
    if (gift && gift.action === 'gift') {
      expect(gift.params.target).toBe('손권');
      expect(gift.params.amount).toBe(1000);
    }

    const threaten = result.recommendations[1].action;
    expect(threaten).not.toBeNull();
    if (threaten && threaten.action === 'threaten') {
      expect(threaten.params.target).toBe('조조');
    }
  });

  it('군사 액션을 파싱한다 (정찰, 방어)', () => {
    const text = `...

---ACTIONS---
1. [scout|chibi] 80% 적벽 정찰
2. [fortify|hagu] 60% 하구 방어 강화
3. [pass] 30% 대기`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    const scout = result.recommendations[0].action;
    expect(scout).not.toBeNull();
    if (scout && scout.action === 'scout') {
      expect(scout.params.target).toBe('chibi');
    }

    const fortify = result.recommendations[1].action;
    expect(fortify).not.toBeNull();
    if (fortify && fortify.action === 'fortify') {
      expect(fortify.params.city).toBe('hagu');
    }
  });

  it('march 액션은 출발지의 장수를 자동 선택한다', () => {
    const text = `...

---ACTIONS---
1. [march|gangha|chibi|medium] 70% 강하에서 적벽으로 진군`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);

    const march = result.recommendations[0].action;
    expect(march).not.toBeNull();
    if (march && march.action === 'march') {
      expect(march.params.from).toBe('gangha');
      expect(march.params.to).toBe('chibi');
      expect(march.params.troopsScale).toBe('medium');
      // gangha에 주둔한 장수: liubei, guanyu, zhugeliang
      expect(march.params.generals).toEqual(['liubei', 'guanyu', 'zhugeliang']);
    }
  });

  it('장수가 없는 도시에서 march는 실패한다', () => {
    const emptyCtx: RecommendationContext = {
      playerCities: [{ id: 'gangha', name: '강하' }],
      playerGenerals: [],  // 장수 없음
      factions: ['손권'],
    };

    const text = `...

---ACTIONS---
1. [march|gangha|chibi|medium] 70% 진군`;

    const result = parseRecommendations(text, emptyCtx);
    expect(result.recommendations).toHaveLength(0);
  });

  it('최대 3개까지만 파싱한다', () => {
    const text = `...

---ACTIONS---
1. [train|gangha] 80% 훈련1
2. [train|hagu] 70% 훈련2
3. [pass] 60% 대기
4. [scout|chibi] 50% 정찰 (초과)`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);
  });

  it('존재하지 않는 도시 ID는 skip한다', () => {
    const text = `...

---ACTIONS---
1. [train|nonexistent] 80% 없는 도시
2. [train|gangha] 60% 강하 훈련`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].description).toBe('강하 훈련');
  });

  it('대소문자 변형 구분자도 파싱한다 (---Actions---, --- actions --- 등)', () => {
    const variants = [
      '---Actions---',
      '---actions---',
      '--- ACTIONS ---',
      '--Actions--',
    ];

    for (const sep of variants) {
      const text = `서사 텍스트\n\n${sep}\n1. [train|gangha] 70% 훈련`;
      const result = parseRecommendations(text, CTX);
      expect(result.recommendations).toHaveLength(1);
      expect(result.narrative).toBe('서사 텍스트');
    }
  });

  it('develop 액션을 올바르게 파싱한다', () => {
    const text = `...

---ACTIONS---
1. [develop|gangha|agriculture] 70% 강하 농업 개발
2. [develop|hagu|defense] 60% 하구 방어 개발`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);

    const dev1 = result.recommendations[0].action;
    expect(dev1).not.toBeNull();
    if (dev1 && dev1.action === 'develop') {
      expect(dev1.params.city).toBe('gangha');
      expect(dev1.params.focus).toBe('agriculture');
    }
  });
});
