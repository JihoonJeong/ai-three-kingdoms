// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UI 레이어 공유 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { FactionId, General, City, BattleState, GameState } from '../data/types.js';

// ─── 캐릭터 표시 ─────────────────────────────────────

export type Expression =
  | 'default'
  | 'angry' | 'worried' | 'happy' | 'determined'
  | 'smile' | 'thinking' | 'warning' | 'combat'
  | 'roar' | 'laugh' | 'majestic' | 'tired'
  | 'ambitious' | 'displeased' | 'nervous' | 'scheming'
  | 'fearful' | 'decisive' | 'contemplating'
  | 'confident' | 'strategic' | 'charge' | 'alert'
  | 'defend' | 'arrogant' | 'sneer';

export interface CharacterDisplayState {
  generalId: string;
  expression: Expression;
  isSpeaking: boolean;
  isDimmed: boolean;
  position: 'left' | 'right' | 'center';
}

export interface ExpressionContext {
  type: 'battle' | 'battle_win' | 'battle_lose' | 'threat' | 'diplomacy_success'
    | 'diplomacy_fail' | 'ally_danger' | 'advisor_warning'
    | 'turn_start' | 'event' | 'idle';
  severity?: 'low' | 'medium' | 'high';
}

// ─── 전략 맵 ─────────────────────────────────────────

export interface MapMarker {
  id: string;
  type: 'city' | 'battlefield' | 'army';
  position: { x: number; y: number }; // 0-100 percentage
  faction: FactionId | null;
  label: string;
  state: 'normal' | 'selected' | 'battle' | 'alert';
}

export interface ArmyMovement {
  from: { x: number; y: number };
  to: { x: number; y: number };
  faction: FactionId;
  isAnimating: boolean;
}

export interface MapViewState {
  markers: MapMarker[];
  movements: ArmyMovement[];
  season: string;
  selectedMarkerId: string | null;
}

// ─── 전투 화면 ───────────────────────────────────────

export interface BattleViewState {
  battle: BattleState;
  attackerDisplay: CharacterDisplayState[];
  defenderDisplay: CharacterDisplayState[];
  selectedTacticId: string | null;
  isAnimating: boolean;
  activeEffect: 'fire' | 'wind' | 'charge' | null;
}

// ─── 이벤트 컷신 ────────────────────────────────────

export interface CutsceneStep {
  imageKey: string;               // assets/events/ 내 파일명 (확장자 제외)
  text: string;
  characterId?: string;           // 사이드 초상화 표시할 장수
  characterExpression?: Expression;
  duration: number;               // ms, 자동 진행 시간
}

export interface CutsceneState {
  eventId: string;
  steps: CutsceneStep[];
  currentStep: number;
  isTyping: boolean;
  isSkippable: boolean;
}

// ─── 에셋 경로 헬퍼 ─────────────────────────────────

export const ASSET_BASE = 'assets';

export function getCharacterAssetPath(generalId: string, expression: Expression): string {
  return `${ASSET_BASE}/characters/${generalId}/${expression}.webp`;
}

export function getEventAssetPath(eventKey: string): string {
  return `${ASSET_BASE}/events/${eventKey}.webp`;
}

export function getBattleBgPath(terrain: string): string {
  const terrainMap: Record<string, string> = {
    '수상': 'bg-water',
    '평야': 'bg-plains',
    '산지': 'bg-castle',
  };
  return `${ASSET_BASE}/battle/${terrainMap[terrain] ?? 'bg-plains'}.webp`;
}

export function getTacticCardPath(tacticId: string): string {
  return `${ASSET_BASE}/ui/tactic-cards/${tacticId}.webp`;
}

export function getEmblemPath(faction: FactionId): string {
  const factionMap: Record<FactionId, string> = {
    '유비': 'liu',
    '조조': 'cao',
    '손권': 'sun',
  };
  return `${ASSET_BASE}/ui/emblems/${factionMap[faction]}.webp`;
}
