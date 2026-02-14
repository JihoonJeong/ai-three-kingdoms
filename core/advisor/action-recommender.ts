// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사 행동 추천 파서
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// AI 응답에서 ---ACTIONS--- 블록을 파싱하여
// 구조화된 GameAction + confidence 로 변환한다.

import type { GameAction, ConscriptScale, DevelopFocus, TroopsScale, FactionId } from '../data/types.js';

// ─── 타입 ──────────────────────────────────────────────

export interface ActionRecommendation {
  action: GameAction | null;  // null = pass (행동 안 함)
  confidence: number;         // 0-100
  description: string;        // 한국어 설명
}

export interface RecommendationContext {
  playerCities: Array<{ id: string; name: string }>;
  playerGenerals: Array<{ id: string; name: string; location: string }>;
  factions: string[];  // 외교 대상 세력
}

export interface ParseResult {
  narrative: string;
  recommendations: ActionRecommendation[];
}

// ─── 구분자 ────────────────────────────────────────────

const SEPARATOR_REGEX = /-{2,}\s*actions\s*-{2,}/i;
// 유연한 매칭: **[...]**, **확신도: N%**, 다양한 구분자
const LINE_REGEX = /^\d+\.\s*\*{0,2}\[([^\]]+)\]\*{0,2}\s*[-–—]?\s*\*{0,2}(?:확신도\s*[:：]?\s*)?(\d+)%\s*\*{0,2}\s*[:：]?\s*(.+)$/;

// ─── 메인 파서 ─────────────────────────────────────────

export function parseRecommendations(
  text: string,
  context: RecommendationContext,
): ParseResult {
  const sepMatch = SEPARATOR_REGEX.exec(text);

  if (!sepMatch) {
    return { narrative: text.trim(), recommendations: [] };
  }

  const narrative = text.slice(0, sepMatch.index).trim();
  const actionBlock = text.slice(sepMatch.index + sepMatch[0].length).trim();
  const lines = actionBlock.split('\n').map(l => l.trim()).filter(Boolean);

  const recommendations: ActionRecommendation[] = [];

  for (const line of lines) {
    if (recommendations.length >= 3) break;

    const match = LINE_REGEX.exec(line);
    if (!match) continue;

    const [, actionStr, confStr, description] = match;
    const confidence = Math.max(0, Math.min(100, parseInt(confStr, 10)));

    if (isNaN(confidence)) continue;

    const action = parseAction(actionStr.trim(), context);
    if (action === undefined) continue;  // 파싱 실패 → skip

    recommendations.push({ action, confidence, description: description.trim() });
  }

  return { narrative, recommendations };
}

// ─── 액션 파싱 ─────────────────────────────────────────

const VALID_SCALES: ConscriptScale[] = ['small', 'medium', 'large'];
const VALID_FOCUSES: DevelopFocus[] = ['agriculture', 'commerce', 'defense'];
const VALID_TROOP_SCALES: TroopsScale[] = ['small', 'medium', 'main'];

// 한국어 → 영어 매핑 (SLM이 한국어 파라미터를 출력하는 경우)
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

function resolveScale(input: string | undefined): ConscriptScale | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (VALID_SCALES.includes(s as ConscriptScale)) return s as ConscriptScale;
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

/**
 * "[action|param1|param2...]" 문자열을 GameAction으로 변환.
 * - 성공 → GameAction
 * - pass → null
 * - 파싱 불가 → undefined (skip)
 */
function parseAction(
  actionStr: string,
  ctx: RecommendationContext,
): GameAction | null | undefined {
  const parts = actionStr.split('|').map(s => s.trim());
  const type = parts[0];

  switch (type) {
    case 'pass':
      return null;

    case 'conscript': {
      const city = resolveCity(parts[1], ctx);
      const scale = resolveScale(parts[2]);
      if (!city || !scale) return undefined;
      return { type: 'domestic', action: 'conscript', params: { city, scale } };
    }

    case 'develop': {
      const city = resolveCity(parts[1], ctx);
      const focus = resolveFocus(parts[2]);
      if (!city || !focus) return undefined;
      return { type: 'domestic', action: 'develop', params: { city, focus } };
    }

    case 'train': {
      const city = resolveCity(parts[1], ctx);
      if (!city) return undefined;
      return { type: 'domestic', action: 'train', params: { city } };
    }

    case 'recruit': {
      const city = resolveCity(parts[1], ctx);
      const general = resolveGeneral(parts[2], ctx);
      if (!city || !general) return undefined;
      return { type: 'domestic', action: 'recruit', params: { city, targetGeneral: general } };
    }

    case 'assign': {
      const general = resolveGeneral(parts[1], ctx);
      const dest = resolveCity(parts[2], ctx);
      if (!general || !dest) return undefined;
      return { type: 'domestic', action: 'assign', params: { general, destination: dest } };
    }

    case 'send_envoy': {
      const target = resolveFaction(parts[1], ctx);
      if (!target) return undefined;
      return { type: 'diplomacy', action: 'send_envoy', params: { target, purpose: '우호 증진' } };
    }

    case 'gift': {
      const target = resolveFaction(parts[1], ctx);
      if (!target) return undefined;
      return { type: 'diplomacy', action: 'gift', params: { target, amount: 1000 } };
    }

    case 'threaten': {
      const target = resolveFaction(parts[1], ctx);
      if (!target) return undefined;
      return { type: 'diplomacy', action: 'threaten', params: { target } };
    }

    case 'march': {
      const from = resolveCity(parts[1], ctx);
      const to = parts[2]?.trim();  // 도착지는 도시 외에 전투장(chibi)도 가능
      const scale = resolveTroopScale(parts[3]);
      if (!from || !to || !scale) return undefined;
      // 출발지의 장수 자동 선택
      const generals = ctx.playerGenerals
        .filter(g => g.location === from)
        .map(g => g.id)
        .slice(0, 3);
      if (generals.length === 0) return undefined;
      return { type: 'military', action: 'march', params: { from, to, generals, troopsScale: scale } };
    }

    case 'scout': {
      const target = parts[1]?.trim();
      if (!target) return undefined;
      return { type: 'military', action: 'scout', params: { target } };
    }

    case 'fortify': {
      const city = resolveCity(parts[1], ctx);
      if (!city) return undefined;
      return { type: 'military', action: 'fortify', params: { city } };
    }

    case 'ambush': {
      const location = parts[1]?.trim();
      const general = resolveGeneral(parts[2], ctx);
      if (!location || !general) return undefined;
      return { type: 'military', action: 'ambush', params: { location, general } };
    }

    default:
      return undefined;
  }
}

// ─── ID 해석 ───────────────────────────────────────────

/** 도시 ID 또는 이름 → 도시 ID */
function resolveCity(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  // ID로 직접 매칭
  if (ctx.playerCities.some(c => c.id === s)) return s;
  // 이름으로 매칭
  const byName = ctx.playerCities.find(c => c.name === s);
  return byName?.id;
}

/** 장수 ID 또는 이름 → 장수 ID */
function resolveGeneral(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.playerGenerals.some(g => g.id === s)) return s;
  const byName = ctx.playerGenerals.find(g => g.name === s);
  return byName?.id;
}

/** 세력 이름 → FactionId */
function resolveFaction(input: string | undefined, ctx: RecommendationContext): FactionId | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (ctx.factions.includes(s)) return s as FactionId;
  return undefined;
}
