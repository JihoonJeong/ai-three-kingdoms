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
  allLocations: ['gangha', 'hagu', 'fancheng', 'xiangyang', 'jiangling', 'chibi'],
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

  it('scout에 잘못된 지역 ID(장수명 등)를 넣으면 skip한다', () => {
    const text = `...

---ACTIONS---
1. [scout|간옹] 80% 간옹으로 정찰
2. [scout|chibi] 70% 적벽 정찰`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'chibi' },
    });
  });

  it('scout에 도시 이름(한국어)도 ID로 변환한다', () => {
    const text = `...

---ACTIONS---
1. [scout|강하] 80% 강하 정찰`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'gangha' },
    });
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

  it('SLM 스타일 포맷을 파싱한다 (마크다운 볼드, 확신도 접두어, 한국어 파라미터)', () => {
    const text = `상황 분석...

### 추천 행동:
---ACTIONS---
1. **[send_envoy|손권]** - 확신도 80% : 손권에게 사신 파견
2. **[develop|하구|농업]** - 확신도 75% : 하구의 농업 개발
3. **[scout|chibi]** - 확신도 90% : 적벽 정찰`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    // send_envoy
    expect(result.recommendations[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
    expect(result.recommendations[0].confidence).toBe(80);

    // develop with Korean focus
    expect(result.recommendations[1].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'agriculture' },
    });

    // scout with valid location ID
    expect(result.recommendations[2].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'chibi' },
    });
  });

  it('대괄호 없는 볼드 포맷을 파싱한다 (**action|param** | N%)', () => {
    const text = `분석...

---ACTIONS---
1. **send_envoy|손권** | 85% 손권에게 사신 파견
2. **develop|강하|농업** | 90% 강하 농업 개발
3. **train|강하** | 80% 강하 군대 훈련`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    expect(result.recommendations[0].confidence).toBe(85);
    expect(result.recommendations[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });

    expect(result.recommendations[1].confidence).toBe(90);
    expect(result.recommendations[1].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'gangha', focus: 'agriculture' },
    });

    expect(result.recommendations[2].confidence).toBe(80);
    expect(result.recommendations[2].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });
  });

  it('볼드 확신도 포맷을 파싱한다 (**확신도: N%**)', () => {
    const text = `분석...

---ACTIONS---
1. **[send_envoy|손권]**  **확신도: 85%**  손권에게 사신 파견
2. **[fortify|하구]**  **확신도: 90%** 하구 방어 강화
3. **[train|강하]**  **확신도: 80%** 강하 군대 훈련`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    expect(result.recommendations[0].confidence).toBe(85);
    expect(result.recommendations[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });

    expect(result.recommendations[1].confidence).toBe(90);
    expect(result.recommendations[1].action).toEqual({
      type: 'military', action: 'fortify',
      params: { city: 'hagu' },
    });

    expect(result.recommendations[2].confidence).toBe(80);
    expect(result.recommendations[2].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });
  });

  it('폴백: ---ACTIONS--- 없이 **액션**: 포맷을 파싱한다', () => {
    const text = `주공, 현재 상황을 분석해 보겠습니다.
하구는 식량이 부족하고 강하는 병력이 풍부합니다.

### 이번 턴 권장 행동:
1. **하구의 개발 강화**:
- **액션**: develop|hagu|commerce (확신도: 85%)
- **설명**: 하구의 식량 부족 문제를 해결하고 상업 개발을 통해 자원을 확충해야 합니다.
2. **강하의 병력 훈련 강화**:
- **액션**: train|gangha (확신도: 90%)
- **설명**: 강하의 병력을 훈련시켜 전투력을 높이고 적벽 전투에서 필요한 기동력과 전투 능력을 갖추게 합니다.
3. **손권과의 외교 강화**:
- **액션**: send_envoy|손권 (확신도: 95%)
- **설명**: 손권에게 사신을 보내 동맹의 중요성을 강조하고 구체적인 협력 방안을 제안합니다.`;

    const result = parseRecommendations(text, CTX);

    // narrative에 전체 텍스트가 포함됨 (구분자가 없으므로)
    expect(result.narrative).toContain('주공, 현재 상황을 분석해 보겠습니다.');
    expect(result.recommendations).toHaveLength(3);

    // 1. develop|hagu|commerce
    expect(result.recommendations[0].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'commerce' },
    });
    expect(result.recommendations[0].confidence).toBe(85);
    expect(result.recommendations[0].description).toBe('하구의 개발 강화');

    // 2. train|gangha
    expect(result.recommendations[1].action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });
    expect(result.recommendations[1].confidence).toBe(90);
    expect(result.recommendations[1].description).toBe('강하의 병력 훈련 강화');

    // 3. send_envoy|손권
    expect(result.recommendations[2].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
    expect(result.recommendations[2].confidence).toBe(95);
  });

  it('폴백: 제목 없이 설명만 있어도 파싱한다', () => {
    const text = `분석 결과...

- **액션**: train|gangha (확신도: 80%)
- **설명**: 강하 훈련
- **액션**: scout|chibi (확신도: 70%)
- **설명**: 적벽 정찰`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].description).toBe('강하 훈련');
    expect(result.recommendations[1].description).toBe('적벽 정찰');
  });

  it('폴백: 한국어 파라미터도 처리한다', () => {
    const text = `조언...

1. **농업 개발**:
- **액션**: develop|강하|농업 (확신도: 75%)
- **설명**: 강하 농업 개발`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);

    const dev = result.recommendations[0].action;
    expect(dev).not.toBeNull();
    if (dev && dev.action === 'develop') {
      expect(dev.params.city).toBe('gangha');
      expect(dev.params.focus).toBe('agriculture');
    }
  });

  it('폴백: ---ACTIONS--- 포맷이 우선한다', () => {
    const text = `서사...

---ACTIONS---
1. [train|gangha] 80% 강하 훈련`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    // ---ACTIONS--- 파서가 사용됨 → narrative는 서사 부분만
    expect(result.narrative).toBe('서사...');
  });

  it('폴백: 괄호 없이 확신도 N% 형태도 파싱한다', () => {
    const text = `분석...

1. **훈련 강화**:
- **액션**: train|gangha, 확신도 90%
- **설명**: 강하 훈련

2. **정찰**:
- **액션**: scout|chibi 확신도: 75%
- **설명**: 적벽 정찰`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].confidence).toBe(90);
    expect(result.recommendations[0].description).toBe('훈련 강화');
    expect(result.recommendations[1].confidence).toBe(75);
  });

  it('폴백: 확신도 없이 (N%) 만 있어도 파싱한다', () => {
    const text = `권장 행동:

1. **사신 파견**:
- **액션**: send_envoy|손권 (85%)
- **설명**: 동맹 강화`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].confidence).toBe(85);
    expect(result.recommendations[0].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
  });

  it('인라인: 서사에 **action|params** 임베딩된 포맷을 파싱한다', () => {
    const text = `주공, 현재 시기는 건안 13년 가을로, 조조의 남하가 임박한 상황입니다.

1. **정찰 우선**: 조조의 실제 동향과 군사력을 정확히 파악해야 합니다. **scout|chibi**으로 주변 상황을 정찰하는 것이 우선입니다. (**확신도: 85%**)
2. **내부 준비 강화**: 하구의 식량 부족 문제를 해결해야 합니다. **develop|hagu|agriculture**으로 식량 생산 능력을 향상시키는 것이 바람직합니다. (**확신도: 75%**)
3. **동맹 유지**: 손권과의 동맹을 재확인하는 것이 좋습니다. **send_envoy|손권**으로 사신을 보내 상황을 공유합시다. (**확신도: 90%**)`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(3);

    expect(result.recommendations[0].action).toEqual({
      type: 'military', action: 'scout',
      params: { target: 'chibi' },
    });
    expect(result.recommendations[0].confidence).toBe(85);
    expect(result.recommendations[0].description).toBe('정찰 우선');

    expect(result.recommendations[1].action).toEqual({
      type: 'domestic', action: 'develop',
      params: { city: 'hagu', focus: 'agriculture' },
    });
    expect(result.recommendations[1].confidence).toBe(75);

    expect(result.recommendations[2].action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
    expect(result.recommendations[2].confidence).toBe(90);
  });

  it('인라인: 확신도 없이 (N%) 만 있는 인라인도 파싱한다', () => {
    const text = `분석...

1. **훈련**: 강하를 훈련합시다. **train|gangha**으로 전투력 향상. (**80%**)`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].confidence).toBe(80);
  });
});
