// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시맨틱 액션 매처 — SLM 자연어 → GameAction 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// SLM이 구조화된 [action|param] 포맷을 지키지 못할 때,
// 한국어 자연어에서 키워드 매칭으로 GameAction을 추출한다.
// parseRecommendations()의 최종 폴백(Fallback 4)으로 사용.

import type { GameAction, ConscriptScale, DevelopFocus, TroopsScale, FactionId, TransferType, TransferScale } from '../data/types.js';
import type { ActionRecommendation, RecommendationContext } from './action-recommender.js';

// ─── 타입 ──────────────────────────────────────────────

type ActionName =
  | 'conscript' | 'develop' | 'train' | 'recruit' | 'assign' | 'transfer'
  | 'send_envoy' | 'gift' | 'threaten' | 'persuade'
  | 'march' | 'scout' | 'fortify' | 'ambush' | 'pass';

type ActionType = 'domestic' | 'diplomacy' | 'military';
type EntityType = 'city' | 'general' | 'faction' | 'location' | 'scale' | 'focus';

interface ActionSignature {
  actionName: ActionName;
  actionType: ActionType;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  requiredEntities: EntitySlot[];
  defaults?: Record<string, string>;
}

interface EntitySlot {
  type: EntityType;
  param: string;
}

interface ScoredMatch {
  signature: ActionSignature;
  score: number;
}

interface EntityDict {
  cities: Map<string, string>;      // 이름/ID → ID
  generals: Map<string, string>;    // 이름/ID → ID
  factions: Map<string, string>;    // 이름/별칭 → ID
  locations: Map<string, string>;   // 이름/ID → ID
}

// ─── 키워드 테이블 (14종) ─────────────────────────────────

const ACTION_SIGNATURES: ActionSignature[] = [
  {
    actionName: 'conscript',
    actionType: 'domestic',
    primaryKeywords: ['징병', '모병', '병력 모집', '충원', '병력 충원'],
    secondaryKeywords: ['병사', '동원', '군사 모집'],
    requiredEntities: [{ type: 'city', param: 'city' }, { type: 'scale', param: 'scale' }],
    defaults: { scale: 'medium' },
  },
  {
    actionName: 'develop',
    actionType: 'domestic',
    primaryKeywords: ['개발', '발전', '내정', '개간'],
    secondaryKeywords: ['경제', '기반', '인프라', '건설'],
    requiredEntities: [{ type: 'city', param: 'city' }, { type: 'focus', param: 'focus' }],
    defaults: { focus: 'agriculture' },
  },
  {
    actionName: 'train',
    actionType: 'domestic',
    primaryKeywords: ['훈련', '조련', '전투력 향상'],
    secondaryKeywords: ['군사 훈련', '병사 훈련', '단련'],
    requiredEntities: [{ type: 'city', param: 'city' }],
  },
  {
    actionName: 'recruit',
    actionType: 'domestic',
    primaryKeywords: ['등용', '영입', '초빙'],
    secondaryKeywords: ['인재', '장수 영입'],
    requiredEntities: [{ type: 'city', param: 'city' }, { type: 'general', param: 'general' }],
  },
  {
    actionName: 'assign',
    actionType: 'domestic',
    primaryKeywords: ['배치', '파견', '주둔', '이동'],
    secondaryKeywords: ['재배치', '전출'],
    requiredEntities: [{ type: 'general', param: 'general' }, { type: 'city', param: 'city' }],
  },
  {
    actionName: 'transfer',
    actionType: 'domestic',
    primaryKeywords: ['보급', '수송', '운송', '이송'],
    secondaryKeywords: ['물자 이동', '식량 수송', '병력 이동'],
    requiredEntities: [{ type: 'city', param: 'from' }, { type: 'city', param: 'to' }],
    defaults: { transferType: 'troops', scale: 'medium' },
  },
  {
    actionName: 'send_envoy',
    actionType: 'diplomacy',
    primaryKeywords: ['사신', '사절', '동맹 강화', '외교'],
    secondaryKeywords: ['연합', '협력', '우호'],
    requiredEntities: [{ type: 'faction', param: 'faction' }],
  },
  {
    actionName: 'gift',
    actionType: 'diplomacy',
    primaryKeywords: ['선물', '예물', '금품', '공물'],
    secondaryKeywords: ['하사', '증여'],
    requiredEntities: [{ type: 'faction', param: 'faction' }],
  },
  {
    actionName: 'threaten',
    actionType: 'diplomacy',
    primaryKeywords: ['위협', '압박', '경고'],
    secondaryKeywords: ['시위', '무력 시위'],
    requiredEntities: [{ type: 'faction', param: 'faction' }],
  },
  {
    actionName: 'persuade',
    actionType: 'diplomacy',
    primaryKeywords: ['설득', '회유', '항복 권유'],
    secondaryKeywords: ['포섭', '투항'],
    requiredEntities: [{ type: 'general', param: 'general' }],
    defaults: { method: '설득' },
  },
  {
    actionName: 'march',
    actionType: 'military',
    primaryKeywords: ['진군', '출병', '공격', '진격'],
    secondaryKeywords: ['출정', '파병', '군대 이동'],
    requiredEntities: [
      { type: 'city', param: 'from' },
      { type: 'location', param: 'to' },
      { type: 'scale', param: 'scale' },
    ],
    defaults: { scale: 'medium' },
  },
  {
    actionName: 'scout',
    actionType: 'military',
    primaryKeywords: ['정찰', '첩보', '동향 파악', '탐색'],
    secondaryKeywords: ['정보 수집', '살피'],
    requiredEntities: [{ type: 'location', param: 'location' }],
  },
  {
    actionName: 'fortify',
    actionType: 'military',
    primaryKeywords: ['방어 강화', '수비', '성벽 보강', '수성'],
    secondaryKeywords: ['방비', '요새화'],
    requiredEntities: [{ type: 'city', param: 'city' }],
  },
  {
    actionName: 'ambush',
    actionType: 'military',
    primaryKeywords: ['매복', '기습', '복병'],
    secondaryKeywords: ['잠복', '기습 공격'],
    requiredEntities: [{ type: 'location', param: 'location' }, { type: 'general', param: 'general' }],
  },
  {
    actionName: 'pass',
    actionType: 'domestic',  // pass는 타입 무관
    primaryKeywords: ['대기', '관망', '지켜보'],
    secondaryKeywords: ['유지', '현상 유지'],
    requiredEntities: [],
  },
];

// ─── 세력 별칭 ────────────────────────────────────────────

const FACTION_ALIASES: Record<string, string> = {
  '동오': '손권', '오': '손권', '오나라': '손권', '손': '손권', '손오': '손권',
  '위': '조조', '위나라': '조조', '조': '조조', '조위': '조조',
  '촉': '유비', '촉한': '유비', '유': '유비',
};

// ─── 규모/분야 매핑 ───────────────────────────────────────

const SCALE_MAP: Record<string, ConscriptScale> = {
  '대규모': 'large', '대거': 'large', '대대적': 'large', '대량': 'large',
  '소규모': 'small', '일부': 'small', '소량': 'small',
  '중규모': 'medium',
};

const TROOP_SCALE_MAP: Record<string, TroopsScale> = {
  '대규모': 'main', '대거': 'main', '주력': 'main', '전체': 'main', '전군': 'main',
  '소규모': 'small', '일부': 'small', '소량': 'small',
  '중규모': 'medium',
};

const FOCUS_MAP: Record<string, DevelopFocus> = {
  '농업': 'agriculture', '식량': 'agriculture', '농경': 'agriculture', '농사': 'agriculture',
  '상업': 'commerce', '교역': 'commerce', '무역': 'commerce', '경제': 'commerce',
  '방어': 'defense', '성벽': 'defense', '방비': 'defense', '성곽': 'defense',
};

// ─── 메인 함수 ────────────────────────────────────────────

export function matchSemanticActions(
  text: string,
  context: RecommendationContext,
): ActionRecommendation[] {
  const segments = segmentRecommendations(text);
  const dict = buildEntityDictionary(context);
  const recommendations: ActionRecommendation[] = [];
  const usedActions = new Set<string>();

  for (let i = 0; i < segments.length && recommendations.length < 3; i++) {
    const segment = segments[i];
    if (!isLikelyRecommendation(segment)) continue;

    const matches = scoreSegment(segment);
    if (matches.length === 0) continue;

    const best = disambiguate(segment, matches);
    if (!best) continue;

    // 중복 제거: 같은 액션+주요엔티티 조합 방지
    const entities = extractEntities(segment, best.signature, dict, context);
    const dedupeKey = `${best.signature.actionName}:${JSON.stringify(entities)}`;
    if (usedActions.has(dedupeKey)) continue;

    const action = buildGameAction(best.signature, entities, context);
    if (action === undefined) continue;

    const confidence = computeConfidence(best, entities, best.signature, i);

    usedActions.add(dedupeKey);
    recommendations.push({
      action,
      confidence,
      description: segment.trim().slice(0, 40).replace(/\s+/g, ' '),
    });
  }

  return recommendations;
}

// ─── 세그먼트 분리 ────────────────────────────────────────

function segmentRecommendations(text: string): string[] {
  const lines = text.split('\n');
  const segments: string[] = [];
  let current = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // 번호 리스트 시작 (1., 2., - 등)
    if (/^\d+[.．)\s]/.test(trimmed) || /^[-•·]/.test(trimmed)) {
      if (current.trim()) segments.push(current.trim());
      current = trimmed;
    } else if (trimmed === '') {
      if (current.trim()) segments.push(current.trim());
      current = '';
    } else {
      current += ' ' + trimmed;
    }
  }
  if (current.trim()) segments.push(current.trim());

  // 번호 없는 단일 블록인 경우, 문장 단위로 분할
  if (segments.length === 1 && !segments[0].match(/^\d+[.．)\s]/)) {
    const sentences = segments[0].split(/(?<=[.。!！?？])\s*/).filter(Boolean);
    if (sentences.length > 1) return sentences;
  }

  return segments;
}

// ─── 추천 문장 필터 ───────────────────────────────────────

function isLikelyRecommendation(segment: string): boolean {
  // 최소 길이
  if (segment.length < 4) return false;
  // 액션 키워드가 하나라도 있으면 추천 후보
  return ACTION_SIGNATURES.some(sig =>
    sig.primaryKeywords.some(kw => segment.includes(kw)) ||
    sig.secondaryKeywords.some(kw => segment.includes(kw))
  );
}

// ─── 엔티티 사전 구축 ─────────────────────────────────────

function buildEntityDictionary(context: RecommendationContext): EntityDict {
  const cities = new Map<string, string>();
  for (const c of context.playerCities) {
    cities.set(c.id, c.id);
    cities.set(c.name, c.id);
  }

  const generals = new Map<string, string>();
  for (const g of context.playerGenerals) {
    generals.set(g.id, g.id);
    generals.set(g.name, g.id);
  }

  const factions = new Map<string, string>();
  for (const f of context.factions) {
    factions.set(f, f);
  }
  for (const [alias, canonical] of Object.entries(FACTION_ALIASES)) {
    if (context.factions.includes(canonical)) {
      factions.set(alias, canonical);
    }
  }

  const locations = new Map<string, string>(cities);
  // 전투장 추가
  const knownBattlefields: Record<string, string> = { '적벽': 'chibi' };
  for (const [name, id] of Object.entries(knownBattlefields)) {
    locations.set(name, id);
    locations.set(id, id);
  }
  if (context.allLocations) {
    for (const loc of context.allLocations) {
      locations.set(loc, loc);
    }
  }

  return { cities, generals, factions, locations };
}

// ─── 키워드 스코어링 ──────────────────────────────────────

function scoreSegment(segment: string): ScoredMatch[] {
  const matches: ScoredMatch[] = [];

  for (const sig of ACTION_SIGNATURES) {
    let score = 0;
    for (const kw of sig.primaryKeywords) {
      if (segment.includes(kw)) score += 30;
    }
    for (const kw of sig.secondaryKeywords) {
      if (segment.includes(kw)) score += 10;
    }
    if (score > 0) {
      matches.push({ signature: sig, score: Math.min(score, 90) });
    }
  }

  // 점수 내림차순 정렬
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── 모호성 해소 ──────────────────────────────────────────

function disambiguate(segment: string, matches: ScoredMatch[]): ScoredMatch | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // 동점인 후보들만 모호성 해소 대상
  const topScore = matches[0].score;
  const tied = matches.filter(m => m.score === topScore);
  if (tied.length === 1) return tied[0];

  const names = tied.map(m => m.signature.actionName);

  // 규칙 1: "병력 강화" — conscript vs train
  if (names.includes('conscript') && names.includes('train')) {
    if (/모집|충원|징/.test(segment)) return tied.find(m => m.signature.actionName === 'conscript')!;
    if (/훈련|조련/.test(segment)) return tied.find(m => m.signature.actionName === 'train')!;
    return tied.find(m => m.signature.actionName === 'train')!;
  }

  // 규칙 2: "방어" — develop|defense vs fortify
  if (names.includes('develop') && names.includes('fortify')) {
    if (/시설|건설|개발/.test(segment)) return tied.find(m => m.signature.actionName === 'develop')!;
    if (/강화|태세|수비/.test(segment)) return tied.find(m => m.signature.actionName === 'fortify')!;
    return tied.find(m => m.signature.actionName === 'fortify')!;
  }

  // 규칙 3: "보내" — send_envoy vs gift vs assign
  if (names.includes('send_envoy') && names.includes('gift')) {
    if (/사신|외교|사절/.test(segment)) return tied.find(m => m.signature.actionName === 'send_envoy')!;
    if (/선물|예물/.test(segment)) return tied.find(m => m.signature.actionName === 'gift')!;
    return tied.find(m => m.signature.actionName === 'send_envoy')!;
  }

  // 기본: 최고 점수 첫 번째
  return tied[0];
}

// ─── 엔티티 추출 ──────────────────────────────────────────

function extractEntities(
  segment: string,
  signature: ActionSignature,
  dict: EntityDict,
  context: RecommendationContext,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const slot of signature.requiredEntities) {
    const value = extractEntityByType(segment, slot, dict, context, result);
    if (value !== undefined) {
      result[slot.param] = value;
    }
  }

  // march 특수 처리: "X에서" → from, "Y으로 진군" → to
  if (signature.actionName === 'march') {
    extractMarchEntities(segment, dict, result);
  }

  return result;
}

function extractEntityByType(
  segment: string,
  slot: EntitySlot,
  dict: EntityDict,
  context: RecommendationContext,
  alreadyExtracted: Record<string, string>,
): string | undefined {
  switch (slot.type) {
    case 'city': {
      // 긴 이름부터 매칭
      const sorted = [...dict.cities.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [name, id] of sorted) {
        if (segment.includes(name) && !Object.values(alreadyExtracted).includes(id)) {
          return id;
        }
      }
      // 도시가 1개뿐이면 자동 선택
      if (context.playerCities.length === 1) return context.playerCities[0].id;
      return undefined;
    }
    case 'general': {
      const sorted = [...dict.generals.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [name, id] of sorted) {
        if (segment.includes(name) && !Object.values(alreadyExtracted).includes(id)) {
          return id;
        }
      }
      return undefined;
    }
    case 'faction': {
      const sorted = [...dict.factions.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [name, id] of sorted) {
        if (segment.includes(name)) return id;
      }
      return undefined;
    }
    case 'location': {
      const sorted = [...dict.locations.entries()].sort((a, b) => b[0].length - a[0].length);
      for (const [name, id] of sorted) {
        if (segment.includes(name) && !Object.values(alreadyExtracted).includes(id)) {
          return id;
        }
      }
      return undefined;
    }
    case 'scale': {
      // march는 troop scale, conscript는 conscript scale
      for (const [kw, val] of Object.entries(SCALE_MAP)) {
        if (segment.includes(kw)) return val;
      }
      return undefined;
    }
    case 'focus': {
      for (const [kw, val] of Object.entries(FOCUS_MAP)) {
        if (segment.includes(kw)) return val;
      }
      return undefined;
    }
  }
}

function extractMarchEntities(
  segment: string,
  dict: EntityDict,
  result: Record<string, string>,
): void {
  // "X에서" → from
  const fromMatch = /(.+?)에서/.exec(segment);
  if (fromMatch) {
    const text = fromMatch[1].trim();
    // 끝에서부터 도시명 찾기
    const sorted = [...dict.locations.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [name, id] of sorted) {
      if (text.includes(name)) {
        result['from'] = id;
        break;
      }
    }
  }

  // "Y(으)로 진군/진격/출병/공격" → to
  const toMatch = /(.+?)(?:으로|로)\s*(?:진군|진격|출병|공격)/.exec(segment);
  if (toMatch) {
    const text = toMatch[1].trim();
    const sorted = [...dict.locations.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [name, id] of sorted) {
      if (text.includes(name) && id !== result['from']) {
        result['to'] = id;
        break;
      }
    }
  }

  // troop scale (march는 TroopsScale 사용)
  if (!result['scale']) {
    for (const [kw, val] of Object.entries(TROOP_SCALE_MAP)) {
      if (segment.includes(kw)) {
        result['scale'] = val;
        break;
      }
    }
  }
}

// ─── GameAction 조립 ──────────────────────────────────────

function buildGameAction(
  signature: ActionSignature,
  entities: Record<string, string>,
  context: RecommendationContext,
): GameAction | null | undefined {
  const { actionName, defaults } = signature;

  // 기본값 적용
  const filled = { ...entities };
  if (defaults) {
    for (const [key, val] of Object.entries(defaults)) {
      if (!filled[key]) filled[key] = val;
    }
  }

  switch (actionName) {
    case 'pass':
      return null;

    case 'conscript': {
      const city = filled['city'];
      if (!city) return undefined;
      const scale = (filled['scale'] || 'medium') as ConscriptScale;
      return { type: 'domestic', action: 'conscript', params: { city, scale } };
    }

    case 'develop': {
      const city = filled['city'];
      if (!city) return undefined;
      const focus = (filled['focus'] || 'agriculture') as DevelopFocus;
      return { type: 'domestic', action: 'develop', params: { city, focus } };
    }

    case 'train': {
      const city = filled['city'];
      if (!city) return undefined;
      return { type: 'domestic', action: 'train', params: { city } };
    }

    case 'recruit': {
      const city = filled['city'];
      const general = filled['general'];
      if (!city || !general) return undefined;
      return { type: 'domestic', action: 'recruit', params: { city, targetGeneral: general } };
    }

    case 'assign': {
      const general = filled['general'];
      const city = filled['city'];
      if (!general || !city) return undefined;
      return { type: 'domestic', action: 'assign', params: { general, destination: city } };
    }

    case 'send_envoy': {
      const faction = filled['faction'];
      if (!faction) return undefined;
      return { type: 'diplomacy', action: 'send_envoy', params: { target: faction as FactionId, purpose: '우호 증진' } };
    }

    case 'gift': {
      const faction = filled['faction'];
      if (!faction) return undefined;
      return { type: 'diplomacy', action: 'gift', params: { target: faction as FactionId, amount: 1000 } };
    }

    case 'threaten': {
      const faction = filled['faction'];
      if (!faction) return undefined;
      return { type: 'diplomacy', action: 'threaten', params: { target: faction as FactionId } };
    }

    case 'persuade': {
      const general = filled['general'];
      if (!general) return undefined;
      return { type: 'diplomacy', action: 'persuade', params: { targetGeneral: general, method: filled['method'] || '설득' } };
    }

    case 'march': {
      const from = filled['from'];
      const to = filled['to'];
      if (!from || !to) return undefined;
      const troopsScale = (filled['scale'] || 'medium') as TroopsScale;
      const generals = context.playerGenerals
        .filter(g => g.location === from)
        .map(g => g.id)
        .slice(0, 3);
      if (generals.length === 0) return undefined;
      return { type: 'military', action: 'march', params: { from, to, generals, troopsScale } };
    }

    case 'scout': {
      const target = filled['location'];
      if (!target) return undefined;
      return { type: 'military', action: 'scout', params: { target } };
    }

    case 'fortify': {
      const city = filled['city'];
      if (!city) return undefined;
      return { type: 'military', action: 'fortify', params: { city } };
    }

    case 'ambush': {
      const location = filled['location'];
      const general = filled['general'];
      if (!location || !general) return undefined;
      return { type: 'military', action: 'ambush', params: { location, general } };
    }

    case 'transfer': {
      const from = filled['from'] || filled['city'];
      const to = filled['to'];
      if (!from || !to) return undefined;
      const transferType = (filled['transferType'] || 'troops') as TransferType;
      const scale = (filled['scale'] || 'medium') as TransferScale;
      return {
        type: 'domestic',
        action: 'transfer',
        params: { from, to, transferType, scale },
      };
    }

    default:
      return undefined;
  }
}

// ─── Confidence 산출 ──────────────────────────────────────

function computeConfidence(
  match: ScoredMatch,
  entities: Record<string, string>,
  signature: ActionSignature,
  segmentIndex: number,
): number {
  let base = match.score;  // primary hit: +30/ea, secondary: +10/ea, 상한 90

  // 엔티티 미충족 페널티
  let penalty = 0;
  for (const slot of signature.requiredEntities) {
    if (!entities[slot.param]) {
      // 기본값이 있으면 감점만, 없으면 큰 감점
      if (signature.defaults && slot.param in signature.defaults) {
        penalty += 5;
      } else {
        penalty += 20;
      }
    }
  }

  // 기본값 사용 페널티 (이미 채워진 것 중 기본값인지 확인은 어려우므로, defaults에 있고 원래 비어있었으면)
  // → 위 로직에서 이미 처리됨

  // 순서 페널티
  const positional = segmentIndex === 1 ? 5 : segmentIndex >= 2 ? 10 : 0;

  const final = Math.max(30, base - penalty - positional);
  return Math.min(100, final);
}
