import { describe, it, expect } from 'vitest';
import {
  parseAdvisorResponse,
  parseFactionResponse,
  parseRecommendations,
  actionJSONToGameAction,
  type RecommendationContext,
} from './action-recommender.js';

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

// ─── parseAdvisorResponse ──────────────────────────

describe('parseAdvisorResponse', () => {
  it('XML 태그로 narrative + actions를 파싱한다', () => {
    const text = `<narrative>
주공, 현재 하구의 병력이 부족하오. 식량 확보와 훈련이 급선무요.
</narrative>
<actions>
[
  {"type":"conscript","params":{"city":"gangha","scale":"medium"},"confidence":75,"description":"강하 중규모 징병"},
  {"type":"train","params":{"city":"hagu"},"confidence":60,"description":"하구 병사 훈련"},
  {"type":"send_envoy","params":{"target":"손권"},"confidence":90,"description":"손권에게 사신 파견"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);

    expect(result.narrative).toContain('하구의 병력이 부족');
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]).toEqual({
      type: 'conscript',
      params: { city: 'gangha', scale: 'medium' },
      confidence: 75,
      description: '강하 중규모 징병',
    });
    expect(result.actions[1]).toEqual({
      type: 'train',
      params: { city: 'hagu' },
      confidence: 60,
      description: '하구 병사 훈련',
    });
    expect(result.actions[2]).toEqual({
      type: 'send_envoy',
      params: { target: '손권' },
      confidence: 90,
      description: '손권에게 사신 파견',
    });
  });

  it('<actions> 태그만 있으면 narrative를 태그 앞 텍스트에서 추출한다', () => {
    const text = `주공, 판세를 분석하겠소.

<actions>
[
  {"type":"train","params":{"city":"gangha"},"confidence":70,"description":"훈련"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.narrative).toBe('주공, 판세를 분석하겠소.');
    expect(result.actions).toHaveLength(1);
  });

  it('태그 없이 bare JSON 배열을 파싱한다 (2차 폴백)', () => {
    const text = `주공, 이번 턴의 조언이오.

[
  {"type":"develop","params":{"city":"hagu","focus":"agriculture"},"confidence":80,"description":"농업 개발"}
]`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.narrative).toBe('주공, 이번 턴의 조언이오.');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('develop');
  });

  it('태그/JSON 모두 없으면 시맨틱 매처 폴백', () => {
    const text = '주공, 강하에서 병사를 훈련하고 손권에게 사신을 보내시오.';
    const result = parseAdvisorResponse(text, CTX);
    expect(result.narrative).toBe(text);
    // 시맨틱 매처가 키워드에서 액션을 추출할 수 있음
    // (빈 배열이거나 매칭된 결과가 있을 수 있음)
  });

  it('JSON 내 잘못된 필드는 무시한다 (graceful)', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"gangha"},"confidence":70,"description":"훈련"},
  {"type":"invalid_type","params":{},"confidence":50,"description":"이상한 행동"},
  {"type":"scout","params":{"target":"chibi"},"confidence":80,"description":"정찰"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].type).toBe('train');
    expect(result.actions[1].type).toBe('scout');
  });

  it('최대 3개까지만 파싱한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"gangha"},"confidence":80,"description":"1"},
  {"type":"train","params":{"city":"hagu"},"confidence":70,"description":"2"},
  {"type":"scout","params":{"target":"chibi"},"confidence":60,"description":"3"},
  {"type":"fortify","params":{"city":"hagu"},"confidence":50,"description":"4"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(3);
  });

  it('confidence를 0-100 범위로 클램핑한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"gangha"},"confidence":150,"description":"과도"},
  {"type":"train","params":{"city":"hagu"},"confidence":-10,"description":"부족"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions[0].confidence).toBe(100);
    expect(result.actions[1].confidence).toBe(0);
  });

  it('confidence가 없으면 기본값 50을 사용한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"gangha"},"description":"훈련"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions[0].confidence).toBe(50);
  });

  it('존재하지 않는 도시 ID는 skip한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"nonexistent"},"confidence":80,"description":"없는 도시"},
  {"type":"train","params":{"city":"gangha"},"confidence":60,"description":"강하 훈련"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].params.city).toBe('gangha');
  });

  it('도시 이름(한국어)을 ID로 변환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"train","params":{"city":"강하"},"confidence":70,"description":"훈련"},
  {"type":"develop","params":{"city":"하구","focus":"농업"},"confidence":75,"description":"개발"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].params.city).toBe('gangha');
    expect(result.actions[1].params).toEqual({ city: 'hagu', focus: 'agriculture' });
  });

  it('pass 액션을 파싱한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"pass","params":{},"confidence":40,"description":"대기"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('pass');
    expect(result.actions[0].params).toEqual({});
  });

  it('액션 별명(alias)을 표준 액션으로 변환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"enlist","params":{"city":"gangha","scale":"medium"},"confidence":80,"description":"징병"},
  {"type":"patrol","params":{"target":"chibi"},"confidence":70,"description":"정찰"},
  {"type":"reassign","params":{"general":"유비","destination":"hagu"},"confidence":60,"description":"배치"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0].type).toBe('conscript');
    expect(result.actions[1].type).toBe('scout');
    expect(result.actions[2].type).toBe('assign');
  });

  it('scale 별명(light→small 등)을 변환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"conscript","params":{"city":"gangha","scale":"light"},"confidence":75,"description":"징병"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions[0].params.scale).toBe('small');
  });

  it('외교 액션을 파싱한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"send_envoy","params":{"target":"손권"},"confidence":90,"description":"사신 파견"},
  {"type":"gift","params":{"target":"손권"},"confidence":70,"description":"선물"},
  {"type":"threaten","params":{"target":"조조"},"confidence":60,"description":"위협"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]).toEqual({
      type: 'send_envoy', params: { target: '손권' },
      confidence: 90, description: '사신 파견',
    });
  });

  it('march 액션을 파싱한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"march","params":{"from":"gangha","to":"chibi","scale":"medium","generals":"guanyu,zhaoyun"},"confidence":70,"description":"진군"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].params).toEqual({
      from: 'gangha', to: 'chibi', scale: 'medium', generals: 'guanyu,zhaoyun',
    });
  });

  it('transfer 액션을 파싱한다', () => {
    const text = `<narrative>보급</narrative>
<actions>
[
  {"type":"transfer","params":{"from":"gangha","to":"hagu","transferType":"troops","scale":"medium"},"confidence":80,"description":"병력 보급"},
  {"type":"transfer","params":{"from":"gangha","to":"hagu","transferType":"food","scale":"small"},"confidence":70,"description":"식량 보급"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].params).toEqual({
      from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'medium',
    });
    expect(result.actions[1].params).toEqual({
      from: 'gangha', to: 'hagu', transferType: 'food', scale: 'small',
    });
  });

  it('scout에 잘못된 지역 ID(장수명 등)를 넣으면 skip한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"scout","params":{"target":"간옹"},"confidence":80,"description":"정찰"},
  {"type":"scout","params":{"target":"chibi"},"confidence":70,"description":"적벽 정찰"}
]
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].params.target).toBe('chibi');
  });

  it('깨진 JSON은 빈 actions를 반환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[{"type":"train", BROKEN JSON...
</actions>`;

    const result = parseAdvisorResponse(text, CTX);
    expect(result.narrative).toBe('조언');
    expect(result.actions).toEqual([]);
  });
});

// ─── parseFactionResponse ──────────────────────────

describe('parseFactionResponse', () => {
  it('<actions> 태그에서 JSON 배열을 파싱한다', () => {
    const text = `<actions>
[
  {"type":"conscript","params":{"city":"gangha","scale":"large"},"confidence":90,"description":""},
  {"type":"train","params":{"city":"gangha"},"confidence":80,"description":""}
]
</actions>`;

    const result = parseFactionResponse(text, CTX);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].type).toBe('conscript');
    expect(result.actions[1].type).toBe('train');
  });

  it('태그 없이 JSON 배열 직접 파싱', () => {
    const text = `[
  {"type":"train","params":{"city":"gangha"},"confidence":80,"description":""}
]`;

    const result = parseFactionResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('train');
  });

  it('태그 없이 { actions: [...] } 형태 파싱', () => {
    const text = `{"actions":[{"type":"train","params":{"city":"gangha"},"confidence":80,"description":""}]}`;

    const result = parseFactionResponse(text, CTX);
    expect(result.actions).toHaveLength(1);
  });

  it('파싱 실패 시 빈 actions 반환', () => {
    const text = '이것은 유효하지 않은 응답입니다.';
    const result = parseFactionResponse(text, CTX);
    expect(result.actions).toEqual([]);
  });

  it('잘못된 액션은 skip한다', () => {
    const text = `<actions>
[
  {"type":"train","params":{"city":"gangha"},"confidence":80,"description":""},
  {"type":"fly_away","params":{},"confidence":50,"description":""},
  {"type":"fortify","params":{"city":"hagu"},"confidence":70,"description":""}
]
</actions>`;

    const result = parseFactionResponse(text, CTX);
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0].type).toBe('train');
    expect(result.actions[1].type).toBe('fortify');
  });
});

// ─── actionJSONToGameAction ────────────────────────

describe('actionJSONToGameAction', () => {
  it('conscript → GameAction 변환', () => {
    const action = actionJSONToGameAction(
      { type: 'conscript', params: { city: 'gangha', scale: 'medium' }, confidence: 75, description: '' },
      CTX,
    );
    expect(action).toEqual({
      type: 'domestic', action: 'conscript',
      params: { city: 'gangha', scale: 'medium' },
    });
  });

  it('pass → null 반환', () => {
    const action = actionJSONToGameAction(
      { type: 'pass', params: {}, confidence: 40, description: '' },
      CTX,
    );
    expect(action).toBeNull();
  });

  it('send_envoy → GameAction 변환 (purpose 자동 추가)', () => {
    const action = actionJSONToGameAction(
      { type: 'send_envoy', params: { target: '손권' }, confidence: 90, description: '' },
      CTX,
    );
    expect(action).toEqual({
      type: 'diplomacy', action: 'send_envoy',
      params: { target: '손권', purpose: '우호 증진' },
    });
  });

  it('gift → GameAction 변환 (amount 자동 추가)', () => {
    const action = actionJSONToGameAction(
      { type: 'gift', params: { target: '손권' }, confidence: 70, description: '' },
      CTX,
    );
    expect(action).toEqual({
      type: 'diplomacy', action: 'gift',
      params: { target: '손권', amount: 1000 },
    });
  });

  it('march → generals 자동 선택', () => {
    const action = actionJSONToGameAction(
      { type: 'march', params: { from: 'gangha', to: 'chibi', scale: 'medium' }, confidence: 70, description: '' },
      CTX,
    );
    expect(action).not.toBeNull();
    if (action && action.action === 'march') {
      expect(action.params.from).toBe('gangha');
      expect(action.params.to).toBe('chibi');
      expect(action.params.generals).toEqual(['liubei', 'guanyu', 'zhugeliang']);
    }
  });

  it('march — 장수 없는 도시에서는 null 반환', () => {
    const emptyCtx: RecommendationContext = {
      playerCities: [{ id: 'gangha', name: '강하' }],
      playerGenerals: [],
      factions: ['손권'],
    };
    const action = actionJSONToGameAction(
      { type: 'march', params: { from: 'gangha', to: 'chibi', scale: 'medium' }, confidence: 70, description: '' },
      emptyCtx,
    );
    expect(action).toBeNull();
  });

  it('transfer → GameAction 변환', () => {
    const action = actionJSONToGameAction(
      { type: 'transfer', params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'medium' }, confidence: 80, description: '' },
      CTX,
    );
    expect(action).toEqual({
      type: 'domestic', action: 'transfer',
      params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'medium' },
    });
  });

  it('한국어 도시명을 ID로 변환한다', () => {
    const action = actionJSONToGameAction(
      { type: 'train', params: { city: '강하' }, confidence: 70, description: '' },
      CTX,
    );
    expect(action).toEqual({
      type: 'domestic', action: 'train',
      params: { city: 'gangha' },
    });
  });

  it('잘못된 도시에서는 null 반환', () => {
    const action = actionJSONToGameAction(
      { type: 'train', params: { city: 'nonexistent' }, confidence: 70, description: '' },
      CTX,
    );
    expect(action).toBeNull();
  });
});

// ─── parseRecommendations (기존 호환 래퍼) ──────────

describe('parseRecommendations', () => {
  it('XML 태그 응답을 ActionRecommendation[]으로 변환한다', () => {
    const text = `<narrative>
주공, 현재 하구의 병력이 부족하오.
</narrative>
<actions>
[
  {"type":"conscript","params":{"city":"gangha","scale":"medium"},"confidence":75,"description":"강하 징병"},
  {"type":"train","params":{"city":"hagu"},"confidence":60,"description":"하구 훈련"},
  {"type":"send_envoy","params":{"target":"손권"},"confidence":90,"description":"사신 파견"}
]
</actions>`;

    const result = parseRecommendations(text, CTX);

    expect(result.narrative).toContain('하구의 병력이 부족');
    expect(result.recommendations).toHaveLength(3);

    expect(result.recommendations[0]).toEqual({
      action: { type: 'domestic', action: 'conscript', params: { city: 'gangha', scale: 'medium' } },
      confidence: 75,
      description: '강하 중규모 징병',
    });

    expect(result.recommendations[1]).toEqual({
      action: { type: 'domestic', action: 'train', params: { city: 'hagu' } },
      confidence: 60,
      description: '하구 병사 훈련',
    });

    expect(result.recommendations[2]).toEqual({
      action: { type: 'diplomacy', action: 'send_envoy', params: { target: '손권', purpose: '우호 증진' } },
      confidence: 90,
      description: '손권에게 사신 파견',
    });
  });

  it('pass를 null 액션으로 변환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"pass","params":{},"confidence":40,"description":"대기"}
]
</actions>`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].action).toBeNull();
    expect(result.recommendations[0].confidence).toBe(40);
  });

  it('태그 없는 텍스트는 빈 recommendations 또는 시맨틱 결과 반환', () => {
    const text = '주공, 질문에 답하겠소. 현재 상황은 좋습니다.';
    const result = parseRecommendations(text, CTX);
    expect(result.narrative).toBe(text);
    // 시맨틱 매처가 키워드를 찾지 못하면 빈 배열
  });

  it('scout 액션을 올바르게 변환한다', () => {
    const text = `<narrative>조언</narrative>
<actions>
[
  {"type":"scout","params":{"target":"chibi"},"confidence":80,"description":"적벽 정찰"},
  {"type":"fortify","params":{"city":"hagu"},"confidence":60,"description":"방어 강화"}
]
</actions>`;

    const result = parseRecommendations(text, CTX);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].action).toEqual({
      type: 'military', action: 'scout', params: { target: 'chibi' },
    });
    expect(result.recommendations[1].action).toEqual({
      type: 'military', action: 'fortify', params: { city: 'hagu' },
    });
  });
});
