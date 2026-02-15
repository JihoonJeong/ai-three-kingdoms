// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 삼국지 — 책사 시스템 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GamePhase, FactionId, Grade, RelationLevel } from '../data/types.js';

// ─── 범주형 레벨 ────────────────────────────────────────

export type TroopsLevel = '풍부' | '충분' | '부족' | '위험';
export type FoodLevel = '풍부' | '충분' | '부족' | '위험';
export type DevelopmentLevel = '높음' | '보통' | '낮음';
export type MoraleLevel = '높음' | '보통' | '낮음';
export type IntelReliability = '확실' | '대략적' | '불확실' | '정보없음';
export type EnemyStrength = '압도적' | '우세' | '비슷' | '열세';

// ─── Advisor View (필터링된 게임 상태) ──────────────────

export interface AdvisorCityView {
  name: string;
  troopsLevel: TroopsLevel;
  foodLevel: FoodLevel;
  development: DevelopmentLevel;
  defense: Grade;
  morale: MoraleLevel;
  stationedGenerals: {
    name: string;
    role: string;
    abilityGrade: Grade;
  }[];
}

export interface AdvisorAllyView {
  name: string;
  relation: RelationLevel;
  recentEvents: string[];
}

export interface AdvisorEnemyIntel {
  reliability: IntelReliability;
  knownMovements: string[];
  estimatedTotalTroops: EnemyStrength;
  keyGeneralsSpotted: string[];
}

export interface AdvisorBattleView {
  location: string;
  terrain: string;
  weather: string;
  battleTurn: number;
  maxBattleTurns: number;
  ourTroopsRatio: string;    // e.g. "70%"
  ourMorale: MoraleLevel;
  enemyMorale: MoraleLevel;
  availableTactics: string[];
  recentLog: string[];
}

export interface AdvisorView {
  turn: number;
  maxTurns: number;
  phase: GamePhase;
  season: string;
  actionsRemaining: number;

  ourCities: AdvisorCityView[];
  allies: AdvisorAllyView[];
  enemyIntel: AdvisorEnemyIntel;

  activeBattle: AdvisorBattleView | null;

  urgentMatters: string[];
  opportunities: string[];
  lastTurnResults: string[];

  contextKnowledge: string[];
}

// ─── 액션 JSON 스키마 ────────────────────────────────────

/** LLM이 출력하는 단일 액션 */
export interface ActionJSON {
  type: string;                    // conscript, develop, train, recruit, assign,
                                   // transfer, send_envoy, gift, threaten,
                                   // scout, fortify, march, ambush, pass
  params: Record<string, string>;  // 액션별 파라미터
  confidence: number;              // 0-100
  description: string;             // 한국어 설명 (Faction AI는 빈 문자열 가능)
}

/** 제갈량 응답 파싱 결과 */
export interface AdvisorResponse {
  narrative: string;               // 서사 브리핑
  actions: ActionJSON[];           // 추천 액션 (최대 3개)
}

/** Faction AI 턴 계획 (LLM 출력) */
export interface FactionTurnJSON {
  actions: ActionJSON[];           // 이번 턴 행동 (최대 3개)
  message?: string;                // 정찰 보고용 메시지 (선택)
}

// ─── 채팅 메시지 ────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AdvisorExpression = 'default' | 'thinking' | 'smile' | 'serious' | 'warning';

// ─── API 요청/응답 ─────────────────────────────────────

export interface ChatRequest {
  messages: ChatMessage[];
  gameState: AdvisorView;
}

export interface ChatStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string, expression: AdvisorExpression) => void;
  onError: (error: string) => void;
}
