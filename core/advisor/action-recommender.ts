// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사 행동 추천 파서
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// AI 응답에서 ---ACTIONS--- 블록을 파싱하여
// 구조화된 GameAction + confidence 로 변환한다.

import type { GameAction, ConscriptScale, DevelopFocus, TroopsScale, FactionId, TransferType, TransferScale } from '../data/types.js';
import { matchSemanticActions } from './semantic-matcher.js';

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
  allLocations?: string[];  // 정찰/진군 가능 지역 ID (도시 + 전투장)
}

export interface ParseResult {
  narrative: string;
  recommendations: ActionRecommendation[];
}

// ─── 구분자 ────────────────────────────────────────────

const SEPARATOR_REGEX = /-{2,}\s*actions?\s*-{2,}/i;

// ─── 라인 파서 (N% 기준 분할) ────────────────────────────

/**
 * 추천 줄에서 actionStr, confidence, description 추출.
 * SLM이 출력하는 다양한 포맷을 `N%` 위치 기준으로 파싱.
 *
 * 지원 포맷:
 *  1. [train|gangha] 75% 설명
 *  1. **[send_envoy|손권]** - 확신도 80% : 설명
 *  1. **[send_envoy|손권]**  **확신도: 85%**  설명
 *  1. **send_envoy|손권** | 85% 설명
 */
function parseLine(raw: string): { actionStr: string; confidence: number; description: string } | null {
  // 번호 접두어 확인
  if (!/^\d+\./.test(raw)) return null;

  // 마크다운 볼드 제거 + 번호 제거
  const clean = raw.replace(/\*{1,2}/g, '').replace(/^\d+\.\s*/, '').trim();

  // N% 찾기 (confidence 기준점)
  const confMatch = /(\d+)\s*%/.exec(clean);
  if (!confMatch) return null;

  const confidence = Math.max(0, Math.min(100, parseInt(confMatch[1], 10)));
  if (isNaN(confidence)) return null;

  // [command|params] 대괄호 형식 별도 추출 (AI가 커맨드 + 한국어를 한 줄에 쓸 때)
  const bracketMatch = /\[([a-z_]+(?:\|[^\]]*)?)\]/.exec(clean);
  if (bracketMatch) {
    const actionStr = bracketMatch[1].trim();
    // 설명 = 전체에서 [command|params]와 N%, 확신도 등 제거한 나머지
    const descPart = clean
      .replace(bracketMatch[0], '')
      .replace(/(\d+)\s*%/, '')
      .replace(/\s*확신도\s*[:：]?\s*/g, '')
      .replace(/[\(（\)）]/g, '')
      .replace(/^\s*[-–—|:：,，]+/, '')
      .replace(/\s*[-–—|:：,，]+\s*$/, '')
      .trim()
      .replace(/^퍼센트로\s*/, '')
      .replace(/^퍼센트\s*/, '');
    if (!actionStr) return null;
    return { actionStr, confidence, description: descPart || actionLabel(actionStr) };
  }

  // 대괄호 없는 경우: N% 기준 분할 (기존 로직)
  let actionPart = clean.slice(0, confMatch.index).trim();
  let descPart = clean.slice(confMatch.index + confMatch[0].length).trim();

  // 액션 부분에서 대괄호, "확신도", 후행 구분자 제거
  actionPart = actionPart
    .replace(/[\[\]]/g, '')
    .replace(/\s*확신도\s*[:：]?\s*$/, '')
    .replace(/\s*[-–—|:：]+\s*$/, '')
    .trim();

  // 설명 부분에서 앞쪽 구분자 + "퍼센트(로)" 중복 표현 제거
  descPart = descPart
    .replace(/^[:：\s]+/, '')
    .replace(/^퍼센트로\s*/, '')
    .replace(/^퍼센트\s*/, '')
    .trim();

  if (!actionPart || !descPart) return null;
  return { actionStr: actionPart, confidence, description: descPart };
}

// ─── 메인 파서 ─────────────────────────────────────────

export function parseRecommendations(
  text: string,
  context: RecommendationContext,
): ParseResult {
  const sepMatch = SEPARATOR_REGEX.exec(text);

  if (!sepMatch) {
    // Fallback 1: **액션**: 형태
    const fallbackRecs = parseFallbackFormat(text, context);
    if (fallbackRecs.length > 0) {
      return { narrative: text.trim(), recommendations: fallbackRecs };
    }
    // Fallback 2: 서사에 **action|params** 인라인 임베딩
    const inlineRecs = parseInlineFormat(text, context);
    if (inlineRecs.length > 0) {
      return { narrative: text.trim(), recommendations: inlineRecs };
    }
    // Fallback 3: 번호 리스트에서 [action|params] N% 형태 스캔
    const numberedRecs = parseNumberedListFormat(text, context);
    if (numberedRecs.length > 0) {
      return { narrative: text.trim(), recommendations: numberedRecs };
    }
    // Fallback 4: 시맨틱 매칭 (자연어 키워드 → GameAction)
    const semanticRecs = matchSemanticActions(text, context);
    return { narrative: text.trim(), recommendations: semanticRecs };
  }

  const narrative = text.slice(0, sepMatch.index).trim();
  const actionBlock = text.slice(sepMatch.index + sepMatch[0].length).trim();
  const lines = actionBlock.split('\n').map(l => l.trim()).filter(Boolean);

  const recommendations: ActionRecommendation[] = [];

  for (const line of lines) {
    if (recommendations.length >= 3) break;

    const parsed = parseLine(line);
    if (!parsed) continue;

    const action = parseAction(parsed.actionStr, context);
    if (action === undefined) continue;  // 파싱 실패 → skip

    recommendations.push({
      action,
      confidence: parsed.confidence,
      description: parsed.description,
    });
  }

  // 구분자 파서 결과가 0개면 시맨틱 폴백 시도
  if (recommendations.length === 0) {
    const semanticRecs = matchSemanticActions(text, context);
    if (semanticRecs.length > 0) {
      return { narrative, recommendations: semanticRecs };
    }
  }

  return { narrative, recommendations };
}

// ─── 액션 파싱 ─────────────────────────────────────────

const VALID_SCALES: ConscriptScale[] = ['small', 'medium', 'large'];
const VALID_FOCUSES: DevelopFocus[] = ['agriculture', 'commerce', 'defense'];
const VALID_TROOP_SCALES: TroopsScale[] = ['small', 'medium', 'main'];

// 액션 타입 → 한국어 라벨 (description 폴백용)
const ACTION_LABEL_KO: Record<string, string> = {
  'conscript': '병력 징집',
  'develop': '개발',
  'train': '훈련',
  'recruit': '장수 등용',
  'assign': '장수 배치',
  'send_envoy': '외교 사절',
  'gift': '선물 외교',
  'threaten': '위협 외교',
  'scout': '정찰',
  'fortify': '방어 강화',
  'march': '진군',
  'ambush': '매복',
  'transfer': '보급',
  'pass': '대기',
};

/** pipe 구분 커맨드에서 한국어 설명 생성 (fallback용) */
function actionLabel(actionStr: string): string {
  const parts = actionStr.split('|').map(s => s.trim());
  const rawType = parts[0].toLowerCase();
  const type = ACTION_ALIASES[rawType] || rawType;
  return ACTION_LABEL_KO[type] || actionStr;
}

// SLM 별명 → 표준 액션명 매핑
const ACTION_ALIASES: Record<string, string> = {
  'reassign': 'assign',         // exaone이 assign 대신 reassign 사용
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
const TRANSFER_TYPE_KO: Record<string, TransferType> = {
  '병력': 'troops', '병사': 'troops', '군사': 'troops',
  '식량': 'food', '군량': 'food', '식': 'food',
};
const TRANSFER_SCALE_KO: Record<string, TransferScale> = {
  '소규모': 'small', '소': 'small',
  '중규모': 'medium', '중': 'medium',
  '대규모': 'large', '대': 'large',
};

// SLM이 잘못된 규모 단어를 사용하는 경우 매핑
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
  // 별명 해석 + 소문자 정규화
  const rawType = parts[0].toLowerCase();
  const type = ACTION_ALIASES[rawType] || rawType;

  switch (type) {
    case 'pass':
      return null;

    case 'conscript': {
      // SLM이 파라미터 순서를 뒤바꾸는 경우 교정 (conscript|essential|hagu → hagu가 도시)
      let city = resolveCity(parts[1], ctx);
      let scale = resolveScale(parts[2]);
      if (!city && parts[2]) {
        // parts[1]이 도시가 아니면 parts[2]에서 도시 탐색
        city = resolveCity(parts[2], ctx);
        scale = resolveScale(parts[1]);
      }
      if (!city || !scale) {
        // scale 없으면 기본값 medium으로 대체 (도시만 맞으면 실행 가능)
        if (city && !scale) scale = 'medium';
        else return undefined;
      }
      return { type: 'domestic', action: 'conscript', params: { city, scale } };
    }

    case 'develop': {
      let city = resolveCity(parts[1], ctx);
      let focus = resolveFocus(parts[2]);
      if (!city && parts[2]) {
        city = resolveCity(parts[2], ctx);
        focus = resolveFocus(parts[1]);
      }
      // focus 없으면 기본값 agriculture
      if (city && !focus) focus = 'agriculture';
      if (!city) return undefined;
      return { type: 'domestic', action: 'develop', params: { city, focus: focus! } };
    }

    case 'train': {
      const city = resolveCity(parts[1], ctx);
      if (!city) return undefined;
      return { type: 'domestic', action: 'train', params: { city } };
    }

    case 'recruit': {
      const city = resolveCity(parts[1], ctx);
      const generalId = parts[2]?.trim();
      if (!city || !generalId) return undefined;
      // 자기 장수면 skip (AI가 아군 장수를 추천하는 버그 방지)
      if (ctx.playerGenerals.some(g => g.id === generalId || g.name === generalId)) {
        return undefined;
      }
      const general = resolveGeneral(generalId, ctx);
      // resolveGeneral이 playerGenerals에서 찾으므로, 적 장수는 ID 그대로 사용
      const targetGeneral = general || generalId;
      return { type: 'domestic', action: 'recruit', params: { city, targetGeneral } };
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
      const target = resolveLocation(parts[1], ctx);
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

    case 'transfer': {
      const from = resolveCity(parts[1], ctx);
      const to = resolveCity(parts[2], ctx);
      const transferType = resolveTransferType(parts[3]);
      const scale = resolveTransferScale(parts[4]);
      if (!from || !to) return undefined;
      return {
        type: 'domestic',
        action: 'transfer',
        params: {
          from,
          to,
          transferType: transferType ?? 'troops',
          scale: scale ?? 'medium',
        },
      };
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

/** 지역 ID 또는 이름 → 지역 ID (도시 + 전투장) */
function resolveLocation(input: string | undefined, ctx: RecommendationContext): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  // allLocations 목록이 있으면 직접 매칭
  if (ctx.allLocations && ctx.allLocations.includes(s)) return s;
  // 도시 ID/이름으로 매칭
  const city = resolveCity(s, ctx);
  if (city) return city;
  // 알려진 전투장 ID
  const knownBattlefields = ['chibi'];
  if (knownBattlefields.includes(s)) return s;
  // allLocations에 있는 경우 (이름 매칭은 도시만 지원)
  if (ctx.allLocations) return undefined;
  // allLocations 미제공 시 fallback: 그대로 반환하지 않고 거부
  return undefined;
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

/** 보급 유형 (troops/food) 해석 */
function resolveTransferType(input: string | undefined): TransferType | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (s === 'troops' || s === 'food') return s;
  return TRANSFER_TYPE_KO[s];
}

/** 보급 규모 (small/medium/large) 해석 */
function resolveTransferScale(input: string | undefined): TransferScale | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (s === 'small' || s === 'medium' || s === 'large') return s;
  return TRANSFER_SCALE_KO[s];
}

// ─── 폴백 파서 (구분자 없는 포맷) ─────────────────────────

/**
 * SLM이 ---ACTIONS--- 구분자 없이 자체 포맷으로 출력할 때.
 * "액션" 키워드가 있는 줄에서 N%를 앵커로 action + confidence 추출.
 *
 * 지원 포맷:
 *  - **액션**: develop|hagu|commerce (확신도: 85%)
 *  - **액션**: develop|hagu|commerce, 확신도 85%
 *  - 액션: develop|hagu|commerce 85%
 *  - **액션**: develop|hagu|commerce (85%)
 */
const FALLBACK_ACTION_LINE_RE = /\*{0,2}액션\*{0,2}\s*[:：]/;
const FALLBACK_TITLE_RE = /^\d+\.\s*\*{0,2}(.+?)\*{0,2}\s*[:：]?\s*$/;
const FALLBACK_DESC_RE = /\*{0,2}설명\*{0,2}\s*[:：]\s*(.+)/;

function parseFallbackFormat(
  text: string,
  context: RecommendationContext,
): ActionRecommendation[] {
  const recommendations: ActionRecommendation[] = [];
  const lines = text.split('\n').map(l => l.trim());

  for (let i = 0; i < lines.length && recommendations.length < 3; i++) {
    if (!FALLBACK_ACTION_LINE_RE.test(lines[i])) continue;

    // **액션**: 접두어 제거
    const content = lines[i].replace(/^.*?\*{0,2}액션\*{0,2}\s*[:：]\s*/, '');

    // N% 앵커 찾기
    const confMatch = /(\d+)\s*%/.exec(content);
    if (!confMatch) continue;

    const confidence = Math.max(0, Math.min(100, parseInt(confMatch[1], 10)));

    // N% 앞 = 액션 (확신도, 괄호, 구분자 제거)
    let actionStr = content.slice(0, confMatch.index).trim()
      .replace(/[\(（]\s*확신도\s*[:：]?\s*$/, '')
      .replace(/\s*확신도\s*[:：]?\s*$/, '')
      .replace(/[\(（\)）]/g, '')
      .replace(/\s*[-–—|:：,，]+\s*$/, '')
      .trim();

    if (!actionStr) continue;

    // 위로 탐색: 번호 제목 (예: "1. **하구의 개발 강화**:")
    let description = '';
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      const titleMatch = FALLBACK_TITLE_RE.exec(lines[j]);
      if (titleMatch) {
        description = titleMatch[1].trim();
        break;
      }
    }

    // 제목 없으면 아래로 탐색: **설명**: 라인
    if (!description) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const descMatch = FALLBACK_DESC_RE.exec(lines[j]);
        if (descMatch) {
          description = descMatch[1].trim();
          if (description.length > 40) description = description.slice(0, 37) + '…';
          break;
        }
      }
    }

    if (!description) {
      description = actionLabel(actionStr);
    }

    const action = parseAction(actionStr, context);
    if (action === undefined) continue;

    recommendations.push({ action, confidence, description });
  }

  return recommendations;
}

// ─── 인라인 파서 (서사에 임베딩된 포맷) ─────────────────────

/**
 * SLM이 서사 텍스트에 액션을 인라인으로 임베딩할 때:
 *   1. **제목**: ... **scout|chibi**으로 ... (**확신도: 85%**)
 *   2. **제목**: ... **develop|hagu|agriculture**으로 ... (확신도: 75%)
 */
const INLINE_ACTION_RE = /\*\*([a-z_]+\|[^*]+)\*\*/;
const INLINE_CONF_RE = /[\(（]\*{0,2}확신도\s*[:：]?\s*(\d+)\s*%\*{0,2}[\)）]/;
const INLINE_CONF_SIMPLE_RE = /[\(（]\*{0,2}(\d+)\s*%\*{0,2}[\)）]/;
const INLINE_TITLE_RE = /^\d+\.\s*\*{0,2}(.+?)\*{0,2}\s*[:：]/;

function parseInlineFormat(
  text: string,
  context: RecommendationContext,
): ActionRecommendation[] {
  const recommendations: ActionRecommendation[] = [];
  const lines = text.split('\n').map(l => l.trim());

  for (let i = 0; i < lines.length && recommendations.length < 3; i++) {
    const line = lines[i];

    // **action_type|params** 패턴 찾기
    const actionMatch = INLINE_ACTION_RE.exec(line);
    if (!actionMatch) continue;

    const actionStr = actionMatch[1].trim();
    // action_type이 유효한 액션인지 확인
    const actionType = actionStr.split('|')[0];
    const validTypes = [
      'conscript', 'develop', 'train', 'recruit', 'assign', 'transfer',
      'send_envoy', 'gift', 'threaten', 'scout', 'fortify',
      'march', 'ambush', 'pass',
    ];
    if (!validTypes.includes(actionType)) continue;

    // confidence 찾기: (**확신도: N%**) 또는 (**N%**)
    const confMatch = INLINE_CONF_RE.exec(line) || INLINE_CONF_SIMPLE_RE.exec(line);
    if (!confMatch) continue;

    const confidence = Math.max(0, Math.min(100, parseInt(confMatch[1], 10)));

    // 제목 추출: "1. **제목**:" 패턴
    let description = '';
    const titleMatch = INLINE_TITLE_RE.exec(line);
    if (titleMatch) {
      description = titleMatch[1].trim();
    }
    if (!description) description = actionLabel(actionStr);

    const action = parseAction(actionStr, context);
    if (action === undefined) continue;

    recommendations.push({ action, confidence, description });
  }

  return recommendations;
}

// ─── 번호 리스트 파서 (최후 폴백) ───────────────────────────

/**
 * ---ACTIONS--- 구분자 없이 번호 리스트에 [action|params] N% 형태로 출력할 때.
 * parseLine을 재활용하여 전체 텍스트에서 유효한 추천을 수집한다.
 *
 * 지원 포맷:
 *  1. **[trade|hagu|external] 95%** 외부 교역 → trade는 invalid → skip
 *  2. **[conscript|gangha|medium] 75%** 징병 → valid
 *  3. **[fortify|hagu] 85%** 방어 강화 → valid
 */
function parseNumberedListFormat(
  text: string,
  context: RecommendationContext,
): ActionRecommendation[] {
  const recommendations: ActionRecommendation[] = [];
  const lines = text.split('\n').map(l => l.trim());

  for (let i = 0; i < lines.length && recommendations.length < 3; i++) {
    if (!/^\d+\./.test(lines[i])) continue;

    const parsed = parseLine(lines[i]);
    if (!parsed) continue;

    const action = parseAction(parsed.actionStr, context);
    if (action === undefined) continue;

    recommendations.push({
      action,
      confidence: parsed.confidence,
      description: parsed.description,
    });
  }

  return recommendations;
}
