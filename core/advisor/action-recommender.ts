// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사 행동 추천 파서 (XML/JSON 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// AI 응답에서 <narrative>/<actions> XML 태그를 파싱하여
// 구조화된 ActionJSON으로 변환한다.
// 시맨틱 매처는 최종 폴백으로 보존.

import type {
  GameAction, ConscriptScale, DevelopFocus, TroopsScale,
  FactionId, TransferType, TransferScale,
} from '../data/types.js';
import type { ActionJSON, AdvisorResponse, FactionTurnJSON } from './types.js';
import { matchSemanticActions } from './semantic-matcher.js';

// ─── 타입 (기존 호환) ───────────────────────────────

export interface ActionRecommendation {
  action: GameAction | null;  // null = pass (행동 안 함)
  confidence: number;         // 0-100
  description: string;        // 한국어 설명
}

export interface RecommendationContext {
  playerCities: Array<{ id: string; name: string }>;
  playerGenerals: Array<{ id: string; name: string; location: string }>;
  factions: string[];  // 외교 대상 세력
  allLocations?: string[];  // 정찰/진군 가능 지역 ID (도시 + 전투장)
}

export interface ParseResult {
  narrative: string;
  recommendations: ActionRecommendation[];
}

// ─── 유효 액션 타입 ────────────────────────────────

const VALID_ACTION_TYPES = [
  'conscript', 'develop', 'train', 'recruit', 'assign', 'transfer',
  'send_envoy', 'gift', 'threaten', 'scout', 'fortify',
  'march', 'ambush', 'pass',
];

// ─── 메인 파서: 제갈량 응답 ──────────────────────────

export function parseAdvisorResponse(
  text: string,
  context: RecommendationContext,
): AdvisorResponse {
  // 1차: <narrative>...</narrative> + <actions>...</actions>
  const narrativeMatch = /<narrative>([\s\S]*?)<\/narrative>/i.exec(text);
  const actionsMatch = /<actions>([\s\S]*?)<\/actions>/i.exec(text);

  if (actionsMatch) {
    const narrative = narrativeMatch?.[1]?.trim()
      ?? extractNarrativeFallback(text, actionsMatch.index);
    const actions = parseActionJSON(actionsMatch[1], context);
    return { narrative, actions };
  }

  // 2차: 태그 없이 JSON 배열만 있는 경우
  const jsonMatch = /\[[\s\S]*?\{[\s\S]*?"type"[\s\S]*?\}[\s\S]*?\]/.exec(text);
  if (jsonMatch) {
    const narrative = text.slice(0, jsonMatch.index).trim();
    const actions = parseActionJSON(jsonMatch[0], context);
    return { narrative, actions };
  }

  // 3차: 시맨틱 매처 (SLM 안전망)
  const semanticRecs = matchSemanticActions(text, context);
  return {
    narrative: text.trim(),
    actions: semanticRecs.map(r => ({
      type: r.action ? getActionName(r.action) : 'pass',
      params: r.action ? extractParams(r.action) : {},
      confidence: r.confidence,
      description: r.description,
    })),
  };
}

// ─── Faction AI용 파서 ──────────────────────────────

export function parseFactionResponse(
  text: string,
  context: RecommendationContext,
): FactionTurnJSON {
  const actionsMatch = /<actions>([\s\S]*?)<\/actions>/i.exec(text);
  if (actionsMatch) {
    return { actions: parseActionJSON(actionsMatch[1], context) };
  }

  // JSON 직접 파싱 시도
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return { actions: validateActions(parsed, context) };
    }
    if (parsed.actions && Array.isArray(parsed.actions)) {
      return { actions: validateActions(parsed.actions, context) };
    }
  } catch { /* fall through */ }

  return { actions: [] };
}

// ─── JSON 파싱 내부 ────────────────────────────────

function parseActionJSON(jsonStr: string, ctx: RecommendationContext): ActionJSON[] {
  try {
    const parsed = JSON.parse(jsonStr.trim());
    if (!Array.isArray(parsed)) return [];
    return validateActions(parsed, ctx);
  } catch {
    return [];
  }
}

function validateActions(arr: unknown[], ctx: RecommendationContext): ActionJSON[] {
  const results: ActionJSON[] = [];
  for (const item of arr) {
    if (results.length >= 3) break;
    const validated = validateActionObj(item, ctx);
    if (validated) results.push(validated);
  }
  return results;
}

function validateActionObj(raw: unknown, ctx: RecommendationContext): ActionJSON | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // type 정규화
  const rawType = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : '';
  const type = ACTION_ALIASES[rawType] || rawType;
  if (!VALID_ACTION_TYPES.includes(type)) return null;

  // params
  const rawParams = obj.params && typeof obj.params === 'object' && !Array.isArray(obj.params)
    ? obj.params as Record<string, unknown>
    : {};

  // 파라미터 정규화
  const params = normalizeParams(type, rawParams, ctx);
  if (!params) return null;

  // confidence & description
  const confidence = typeof obj.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(obj.confidence)))
    : 50;
  const description = typeof obj.description === 'string' ? obj.description : '';

  return { type, params, confidence, description };
}

// ─── 파라미터 정규화 ──────────────────────────────

function normalizeParams(
  type: string,
  params: Record<string, unknown>,
  ctx: RecommendationContext,
): Record<string, string> | null {
  const p = (key: string): string => {
    const v = params[key];
    return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  };

  switch (type) {
    case 'pass':
      return {};

    case 'conscript': {
      const city = resolveCity(p('city'), ctx);
      const scale = resolveScale(p('scale')) ?? 'medium';
      if (!city) return null;
      return { city, scale };
    }

    case 'develop': {
      const city = resolveCity(p('city'), ctx);
      const focus = resolveFocus(p('focus')) ?? 'agriculture';
      if (!city) return null;
      return { city, focus };
    }

    case 'train': {
      const city = resolveCity(p('city'), ctx);
      if (!city) return null;
      return { city };
    }

    case 'recruit': {
      const city = resolveCity(p('city'), ctx);
      const general = p('general') || p('targetGeneral');
      if (!city || !general) return null;
      return { city, general };
    }

    case 'assign': {
      const general = resolveGeneral(p('general'), ctx);
      const destination = resolveCity(p('destination'), ctx);
      if (!general || !destination) return null;
      return { general, destination };
    }

    case 'transfer': {
      const from = resolveCity(p('from'), ctx);
      const to = resolveCity(p('to'), ctx);
      const transferType = resolveTransferType(p('transferType')) ?? 'troops';
      const scale = resolveTransferScale(p('scale')) ?? 'medium';
      if (!from || !to) return null;
      return { from, to, transferType, scale };
    }

    case 'send_envoy': {
      const target = resolveFaction(p('target'), ctx);
      if (!target) return null;
      return { target };
    }

    case 'gift': {
      const target = resolveFaction(p('target'), ctx);
      if (!target) return null;
      return { target };
    }

    case 'threaten': {
      const target = resolveFaction(p('target'), ctx);
      if (!target) return null;
      return { target };
    }

    case 'march': {
      const from = resolveCity(p('from'), ctx);
      const to = p('to');  // 전투장 포함 가능
      const scale = resolveTroopScale(p('scale')) ?? 'medium';
      if (!from || !to) return null;
      // generals: 쉼표 구분 문자열 또는 배열
      const generalsRaw = params.generals;
      let generals = '';
      if (Array.isArray(generalsRaw)) {
        generals = generalsRaw.map(String).join(',');
      } else if (typeof generalsRaw === 'string') {
        generals = generalsRaw;
      }
      return { from, to, scale, ...(generals ? { generals } : {}) };
    }

    case 'scout': {
      const target = resolveLocation(p('target'), ctx);
      if (!target) return null;
      return { target };
    }

    case 'fortify': {
      const city = resolveCity(p('city'), ctx);
      if (!city) return null;
      return { city };
    }

    case 'ambush': {
      const location = p('location');
      const general = resolveGeneral(p('general'), ctx);
      if (!location || !general) return null;
      return { location, general };
    }

    default:
      return null;
  }
}

// ─── 서사 추출 헬퍼 ──────────────────────────────

function extractNarrativeFallback(text: string, actionsStart?: number): string {
  if (actionsStart !== undefined) {
    return text.slice(0, actionsStart).trim();
  }
  return text.trim();
}

// ─── GameAction → ActionJSON 헬퍼 ──────────────────

function getActionName(action: GameAction): string {
  return action.action;
}

function extractParams(action: GameAction): Record<string, string> {
  const result: Record<string, string> = {};
  const p = action.params as Record<string, unknown>;
  for (const [key, value] of Object.entries(p)) {
    if (Array.isArray(value)) {
      result[key] = value.join(',');
    } else if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

// ─── ActionJSON → GameAction 변환 ──────────────────

export function actionJSONToGameAction(
  json: ActionJSON,
  ctx: RecommendationContext,
): GameAction | null {
  const type = ACTION_ALIASES[json.type.toLowerCase()] || json.type.toLowerCase();
  const p = json.params;

  switch (type) {
    case 'pass':
      return null;

    case 'conscript': {
      const city = resolveCity(p.city, ctx);
      const scale = resolveScale(p.scale) ?? 'medium';
      if (!city) return null;
      return { type: 'domestic', action: 'conscript', params: { city, scale } };
    }

    case 'develop': {
      const city = resolveCity(p.city, ctx);
      const focus = resolveFocus(p.focus) ?? 'agriculture';
      if (!city) return null;
      return { type: 'domestic', action: 'develop', params: { city, focus } };
    }

    case 'train': {
      const city = resolveCity(p.city, ctx);
      if (!city) return null;
      return { type: 'domestic', action: 'train', params: { city } };
    }

    case 'recruit': {
      const city = resolveCity(p.city, ctx);
      const general = p.general || p.targetGeneral;
      if (!city || !general) return null;
      return { type: 'domestic', action: 'recruit', params: { city, targetGeneral: general } };
    }

    case 'assign': {
      const general = resolveGeneral(p.general, ctx);
      const dest = resolveCity(p.destination, ctx);
      if (!general || !dest) return null;
      return { type: 'domestic', action: 'assign', params: { general, destination: dest } };
    }

    case 'transfer': {
      const from = resolveCity(p.from, ctx);
      const to = resolveCity(p.to, ctx);
      const transferType = resolveTransferType(p.transferType) ?? 'troops';
      const scale = resolveTransferScale(p.scale) ?? 'medium';
      if (!from || !to) return null;
      return { type: 'domestic', action: 'transfer', params: { from, to, transferType, scale } };
    }

    case 'send_envoy': {
      const target = resolveFaction(p.target, ctx);
      if (!target) return null;
      return { type: 'diplomacy', action: 'send_envoy', params: { target, purpose: '우호 증진' } };
    }

    case 'gift': {
      const target = resolveFaction(p.target, ctx);
      if (!target) return null;
      return { type: 'diplomacy', action: 'gift', params: { target, amount: 1000 } };
    }

    case 'threaten': {
      const target = resolveFaction(p.target, ctx);
      if (!target) return null;
      return { type: 'diplomacy', action: 'threaten', params: { target } };
    }

    case 'march': {
      const from = resolveCity(p.from, ctx);
      const to = p.to;
      const scale = resolveTroopScale(p.scale) ?? 'medium';
      if (!from || !to) return null;
      let generals: string[] = [];
      if (p.generals) {
        generals = p.generals.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (generals.length === 0) {
        generals = ctx.playerGenerals
          .filter(g => g.location === from)
          .map(g => g.id)
          .slice(0, 3);
      }
      if (generals.length === 0) return null;
      return { type: 'military', action: 'march', params: { from, to, generals, troopsScale: scale } };
    }

    case 'scout': {
      const target = resolveLocation(p.target, ctx);
      if (!target) return null;
      return { type: 'military', action: 'scout', params: { target } };
    }

    case 'fortify': {
      const city = resolveCity(p.city, ctx);
      if (!city) return null;
      return { type: 'military', action: 'fortify', params: { city } };
    }

    case 'ambush': {
      const location = p.location;
      const general = resolveGeneral(p.general, ctx);
      if (!location || !general) return null;
      return { type: 'military', action: 'ambush', params: { location, general } };
    }

    default:
      return null;
  }
}

// ─── 기존 호환 래퍼 ────────────────────────────────

/**
 * 기존 parseRecommendations 호환 래퍼.
 * 내부적으로 parseAdvisorResponse를 호출하고
 * ActionJSON → ActionRecommendation으로 변환한다.
 */
export function parseRecommendations(
  text: string,
  context: RecommendationContext,
): ParseResult {
  const result = parseAdvisorResponse(text, context);
  return {
    narrative: result.narrative,
    recommendations: result.actions.map(a => ({
      action: actionJSONToGameAction(a, context),
      confidence: a.confidence,
      description: a.description,
    })),
  };
}

// ─── ID 해석 ───────────────────────────────────────

/** 도시 ID 또는 이름 → 도시 ID */
export function resolveCity(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.playerCities.some(c => c.id === s)) return s;
  const byName = ctx.playerCities.find(c => c.name === s);
  return byName?.id;
}

/** 지역 ID 또는 이름 → 지역 ID (도시 + 전투장) */
export function resolveLocation(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.allLocations && ctx.allLocations.includes(s)) return s;
  const city = resolveCity(s, ctx);
  if (city) return city;
  const knownBattlefields = ['chibi'];
  if (knownBattlefields.includes(s)) return s;
  if (ctx.allLocations) return undefined;
  return undefined;
}

/** 장수 ID 또는 이름 → 장수 ID */
export function resolveGeneral(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.playerGenerals.some(g => g.id === s)) return s;
  const byName = ctx.playerGenerals.find(g => g.name === s);
  return byName?.id;
}

/** 세력 이름 → FactionId */
export function resolveFaction(input: string | undefined, ctx: RecommendationContext): FactionId | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.factions.includes(s)) return s as FactionId;
  return undefined;
}

// ─── 파라미터 해석 헬퍼 ─────────────────────────────

// SLM 별명 → 표준 액션명 매핑
const ACTION_ALIASES: Record<string, string> = {
  'reassign': 'assign',
  'dispatch': 'assign',
  'move': 'assign',
  'diplomacy': 'send_envoy',
  'envoy': 'send_envoy',
  'attack': 'march',
  'advance': 'march',
  'defend': 'fortify',
  'patrol': 'scout',
  'reconnaissance': 'scout',
  'recon': 'scout',
  'recruit_troops': 'conscript',
  'enlist': 'conscript',
  'build': 'develop',
  'supply': 'transfer',
  'transport': 'transfer',
  'logistics': 'transfer',
};

const VALID_SCALES: ConscriptScale[] = ['small', 'medium', 'large'];
const VALID_FOCUSES: DevelopFocus[] = ['agriculture', 'commerce', 'defense'];
const VALID_TROOP_SCALES: TroopsScale[] = ['small', 'medium', 'main'];

const SCALE_KO: Record<string, ConscriptScale> = {
  '소규모': 'small', '소': 'small',
  '중규모': 'medium', '중': 'medium',
  '대규모': 'large', '대': 'large',
};
const FOCUS_KO: Record<string, DevelopFocus> = {
  '농업': 'agriculture', '농': 'agriculture',
  '상업': 'commerce', '상': 'commerce',
  '방어': 'defense', '방': 'defense',
};
const TROOP_SCALE_KO: Record<string, TroopsScale> = {
  '소규모': 'small', '소': 'small',
  '중규모': 'medium', '중': 'medium',
  '주력': 'main', '전체': 'main',
};
const TRANSFER_TYPE_KO: Record<string, TransferType> = {
  '병력': 'troops', '병사': 'troops', '군사': 'troops',
  '식량': 'food', '군량': 'food', '식': 'food',
};
const TRANSFER_SCALE_KO: Record<string, TransferScale> = {
  '소규모': 'small', '소': 'small',
  '중규모': 'medium', '중': 'medium',
  '대규모': 'large', '대': 'large',
};
const SCALE_ALIASES: Record<string, ConscriptScale> = {
  'light': 'small', 'minor': 'small',
  'moderate': 'medium', 'mid': 'medium', 'normal': 'medium',
  'heavy': 'large', 'major': 'large', 'full': 'large',
};

function resolveScale(input: string | undefined): ConscriptScale | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (VALID_SCALES.includes(s as ConscriptScale)) return s as ConscriptScale;
  if (SCALE_ALIASES[s]) return SCALE_ALIASES[s];
  return SCALE_KO[s];
}

function resolveFocus(input: string | undefined): DevelopFocus | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (VALID_FOCUSES.includes(s as DevelopFocus)) return s as DevelopFocus;
  return FOCUS_KO[s];
}

function resolveTroopScale(input: string | undefined): TroopsScale | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (VALID_TROOP_SCALES.includes(s as TroopsScale)) return s as TroopsScale;
  return TROOP_SCALE_KO[s];
}

function resolveTransferType(input: string | undefined): TransferType | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (s === 'troops' || s === 'food') return s;
  return TRANSFER_TYPE_KO[s];
}

function resolveTransferScale(input: string | undefined): TransferScale | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (s === 'small' || s === 'medium' || s === 'large') return s;
  return TRANSFER_SCALE_KO[s];
}
