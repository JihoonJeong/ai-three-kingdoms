// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 삼국지 — 공유 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── 기본 타입 ─────────────────────────────────────────

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export const GRADE_VALUES: Record<Grade, number> = {
  S: 95, A: 80, B: 65, C: 50, D: 35,
};

export const GRADE_ORDER: Grade[] = ['D', 'C', 'B', 'A', 'S'];

export function gradeUp(grade: Grade): Grade {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx < GRADE_ORDER.length - 1 ? GRADE_ORDER[idx + 1] : grade;
}

export function gradeDown(grade: Grade): Grade {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx > 0 ? GRADE_ORDER[idx - 1] : grade;
}

export type GameLanguage = 'ko' | 'en' | 'zh' | 'ja';

export const LANGUAGE_NAMES: Record<GameLanguage, string> = {
  ko: '한국어',
  en: 'English',
  zh: '中文',
  ja: '日本語',
};

export type FactionId = '유비' | '조조' | '손권';

export type PopulationLevel = '대도시' | '중도시' | '소도시';

// ─── 도시 ──────────────────────────────────────────────

export interface City {
  id: string;
  name: string;
  owner: FactionId | null;   // null = 중립/무주
  position: { x: number; y: number };
  population: PopulationLevel;
  development: {
    agriculture: Grade;
    commerce: Grade;
    defense: Grade;
  };
  troops: {
    infantry: number;
    cavalry: number;
    navy: number;
  };
  food: number;
  morale: number;       // 민심 0-100
  training: number;     // 훈련도 0-100
  adjacent: string[];   // 인접 도시/전투지역 ID
  description: string;
  strategicNote: string;
}

export function getTotalTroopsOfCity(city: City): number {
  return city.troops.infantry + city.troops.cavalry + city.troops.navy;
}

// ─── 전투 지역 ─────────────────────────────────────────

export interface Battlefield {
  id: string;
  name: string;
  position: { x: number; y: number };
  terrain: TerrainType;
  description: string;
  adjacentCities: string[];
  special: string;
}

export type TerrainType = '수상' | '평야' | '산지';

// ─── 장수 ──────────────────────────────────────────────

export interface General {
  id: string;
  name: string;
  courtesyName: string;
  faction: FactionId;
  role: GeneralRole;
  abilities: Abilities;
  skills: string[];
  loyalty: LoyaltyLevel;
  location: string;          // 도시 ID 또는 전투지역 ID
  condition: GeneralCondition;
  historicalNote: string;
}

export type GeneralRole = '군주' | '무장' | '문관' | '책사' | '책사/무장';
export type LoyaltyLevel = '절대' | '높음' | '보통' | '불안';
export type GeneralCondition = '양호' | '피로' | '부상' | '포로' | '사망';

export interface Abilities {
  command: Grade;    // 통솔
  martial: Grade;    // 무력
  intellect: Grade;  // 지력
  politics: Grade;   // 정치
  charisma: Grade;   // 매력
}

// ─── 세력 ──────────────────────────────────────────────

export interface Faction {
  id: FactionId;
  name: string;
  leader: string;    // 군주 장수 ID
  isPlayer: boolean;
}

// ─── 외교 ──────────────────────────────────────────────

export type RelationLevel = '긴밀' | '우호' | '중립' | '냉담' | '적대';

export interface DiplomacyRelation {
  factionA: FactionId;
  factionB: FactionId;
  relation: RelationLevel;
  value: number;   // 수치 0-100, 범주 매핑: 0-20 적대, 21-40 냉담, 41-60 중립, 61-80 우호, 81-100 긴밀
  isAlliance: boolean;
  events: string[];  // 최근 외교 이벤트 설명
}

export interface DiplomacyState {
  relations: DiplomacyRelation[];
}

export function getRelationLevel(value: number): RelationLevel {
  if (value >= 81) return '긴밀';
  if (value >= 61) return '우호';
  if (value >= 41) return '중립';
  if (value >= 21) return '냉담';
  return '적대';
}

// ─── 행동 ──────────────────────────────────────────────

export type ConscriptScale = 'small' | 'medium' | 'large';
export type DevelopFocus = 'agriculture' | 'commerce' | 'defense';
export type TroopsScale = 'small' | 'medium' | 'main';
export type TransferType = 'troops' | 'food';
export type TransferScale = 'small' | 'medium' | 'large';

export const TRANSFER_RATIOS: Record<TransferScale, number> = {
  small: 0.3, medium: 0.5, large: 0.7,
} as const;

export const FOOD_TRANSFER_AMOUNTS: Record<TransferScale, number> = {
  small: 1000, medium: 2500, large: 5000,
} as const;

export type GameAction =
  // 내정
  | { type: 'domestic'; action: 'conscript'; params: { city: string; scale: ConscriptScale } }
  | { type: 'domestic'; action: 'develop'; params: { city: string; focus: DevelopFocus } }
  | { type: 'domestic'; action: 'train'; params: { city: string } }
  | { type: 'domestic'; action: 'recruit'; params: { city: string; targetGeneral: string } }
  | { type: 'domestic'; action: 'assign'; params: { general: string; destination: string } }
  | { type: 'domestic'; action: 'transfer'; params: { from: string; to: string; transferType: TransferType; scale: TransferScale } }
  // 외교
  | { type: 'diplomacy'; action: 'send_envoy'; params: { target: FactionId; purpose: string } }
  | { type: 'diplomacy'; action: 'persuade'; params: { targetGeneral: string; method: string } }
  | { type: 'diplomacy'; action: 'threaten'; params: { target: FactionId } }
  | { type: 'diplomacy'; action: 'gift'; params: { target: FactionId; amount: number } }
  // 군사
  | { type: 'military'; action: 'march'; params: { from: string; to: string; generals: string[]; troopsScale: TroopsScale } }
  | { type: 'military'; action: 'scout'; params: { target: string } }
  | { type: 'military'; action: 'fortify'; params: { city: string } }
  | { type: 'military'; action: 'ambush'; params: { location: string; general: string } };

export interface ActionResult {
  success: boolean;
  description: string;
  sideEffects: string[];
  remainingActions: number;
  battleTriggered?: BattleState;
}

export interface ActionLogEntry {
  turn: number;
  action: GameAction;
  result: ActionResult;
}

// ─── 전투 ──────────────────────────────────────────────

export interface BattleState {
  battleId: string;
  location: string;
  terrain: TerrainType;
  weather: string;
  battleTurn: number;
  maxBattleTurns: number;
  attackers: BattleForce;
  defenders: BattleForce;
  availableTactics: Tactic[];
  log: BattleTurnLog[];
  isOver: boolean;
  result: BattleResult | null;
}

export interface BattleForce {
  faction: FactionId;
  generals: string[];       // 장수 ID 목록
  troops: number;
  initialTroops: number;    // 전투 시작 병력 (종료 판정용)
  morale: number;           // 0-100
  formation: string | null;
}

export interface Tactic {
  id: string;
  name: string;
  description: string;
  risk: '낮음' | '보통' | '높음';
  requirements: string | null;
}

export interface BattleTurnLog {
  battleTurn: number;
  attackerTactic: string;
  defenderTactic: string;
  description: string;
  attackerCasualties: number;
  defenderCasualties: number;
  attackerMoraleChange: number;
  defenderMoraleChange: number;
}

export interface BattleResult {
  winner: FactionId | null;  // null = 무승부/대치
  loser: FactionId | null;
  capturedGenerals: string[];
  spoils: string[];
  territoryChange: string | null;
}

export interface BattleInitParams {
  location: string;
  terrain: TerrainType;
  weather: string;
  attackerFaction: FactionId;
  attackerGenerals: string[];
  attackerTroops: number;
  defenderFaction: FactionId;
  defenderGenerals: string[];
  defenderTroops: number;
  defenderFormation?: string;
}

// ─── 이벤트 ────────────────────────────────────────────

export interface ScenarioEvent {
  id: string;
  trigger: EventTrigger;
  description: string;
  effects: EventEffect[];
  advisorKnowledge?: string;
}

export type EventTrigger =
  | { type: 'turn'; turn: number; condition?: string }
  | { type: 'turn_range'; min: number; max: number; probability: number }
  | { type: 'condition'; condition: string };

export type EventEffect =
  | { type: 'enemy_intel_update'; data: Record<string, unknown> }
  | { type: 'urgency_increase' }
  | { type: 'diplomacy_opportunity'; target: string; bonus: number }
  | { type: 'enemy_debuff'; target: string; stat: string; amount: number }
  | { type: 'enemy_formation'; formation: string }
  | { type: 'unlock_tactic'; tactic: string; bonusMultiplier: number }
  | { type: 'weather_change'; weather: string }
  | { type: 'tactic_bonus'; tactic: string; bonus: number }
  | { type: 'special_tactic_available'; tactic: string }
  | { type: 'pursuit_opportunity'; target: string; location: string }
  | { type: 'troop_loss'; target: string; city: string; ratio: number; moralePenalty: number }
  | { type: 'food_support'; target: string; amount: string };

export interface EventResult {
  eventId: string;
  description: string;
  impact: string;
  appliedEffects: string[];
}

// ─── 게임 상태 ─────────────────────────────────────────

export type GamePhase = 'preparation' | 'battle' | 'aftermath';

export interface GameState {
  gameId: string;
  scenarioId: string;
  turn: number;
  maxTurns: number;
  phase: GamePhase;
  season: string;
  cities: City[];
  battlefields: Battlefield[];
  generals: General[];
  factions: Faction[];
  diplomacy: DiplomacyState;
  activeBattle: BattleState | null;
  completedEvents: string[];
  actionLog: ActionLogEntry[];
  actionsRemaining: number;
  flags: Record<string, unknown>;
  gameOver: boolean;
  result: GameResult | null;
}

// ─── 게임 결과 ─────────────────────────────────────────

export type VictoryGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface GameResult {
  grade: VictoryGrade;
  title: string;
  description: string;
  stats: {
    totalTurns: number;
    battlesWon: number;
    battlesLost: number;
    citiesCaptured: number;
    generalsLost: number;
    allianceMaintained: boolean;
    enemiesDefeated: number;
    generalsCaptured: number;
    maxTroops: number;
  };
}

export interface GameOverCheck {
  isOver: boolean;
  reason?: string;
}

// ─── 턴 관리 결과 ──────────────────────────────────────

export interface TurnStartResult {
  turn: number;
  phase: GamePhase;
  season: string;
  actionsAvailable: number;
}

export interface TurnEndResult {
  events: EventResult[];
  stateChanges: string[];
  nextTurnPreview: string;
  gameOver: boolean;
  result?: GameResult;
  aiInitiatedBattle?: BattleState;
}

// ─── 상수 ──────────────────────────────────────────────

export const ACTIONS_PER_TURN = 3;

export const CONSCRIPT_TABLE = {
  small:  { troops: 1000, food: -500,  morale: -5  },
  medium: { troops: 2500, food: -1200, morale: -10 },
  large:  { troops: 5000, food: -2500, morale: -20 },
} as const;

export const DEVELOP_SUCCESS_RATE: Record<string, number> = {
  'D_C': 0.95,
  'C_B': 0.80,
  'B_A': 0.50,
  'A_S': 0.20,
  'S_S': 0.00,
};

export const TRAINING_INCREASE = 15;

export const FOOD_CONSUMPTION_PER_TROOP = 0.1;  // 턴당 병사 1명당 식량 소비

// 식량 생산: 도시 인구 기반 × 농업 등급 배율
export const FOOD_PRODUCTION_BASE: Record<PopulationLevel, number> = {
  '대도시': 600,
  '중도시': 400,
  '소도시': 200,
};

export const AGRICULTURE_MULTIPLIER: Record<Grade, number> = {
  D: 0.4,
  C: 0.7,
  B: 1.0,
  A: 1.4,
  S: 1.8,
};

export const BATTLE_DEFEAT_TROOP_RATIO = 0.3;    // 병력 30% 이하 패배
export const BATTLE_DEFEAT_MORALE = 20;           // 사기 20 이하 패배
export const MAX_BATTLE_TURNS = 4;

export const TACTIC_DATA: Record<string, {
  name: string;
  description: string;
  risk: '낮음' | '보통' | '높음';
  attackMultiplier: number;
  damageMultiplier: number;
  moraleEffect: number;
  requirements: string | null;
}> = {
  frontal_assault: {
    name: '정면돌격',
    description: '높은 피해 교환, 사기전',
    risk: '보통',
    attackMultiplier: 1.0,
    damageMultiplier: 1.0,
    moraleEffect: -20,
    requirements: null,
  },
  fire_attack: {
    name: '화공',
    description: '적 밀집 + 풍향 유리 시 대규모 피해',
    risk: '높음',
    attackMultiplier: 1.8,
    damageMultiplier: 0.3,
    moraleEffect: -30,
    requirements: '적 밀집 + 풍향 유리',
  },
  ambush: {
    name: '매복',
    description: '기습 피해 + 혼란',
    risk: '보통',
    attackMultiplier: 1.5,
    damageMultiplier: 0.5,
    moraleEffect: -25,
    requirements: '사전 매복 배치',
  },
  defend: {
    name: '수성',
    description: '피해 감소, 시간 벌기',
    risk: '낮음',
    attackMultiplier: 0.5,
    damageMultiplier: 0.3,
    moraleEffect: 0,
    requirements: '방어 시',
  },
  feigned_retreat: {
    name: '위장퇴각',
    description: '적 유인 후 반격',
    risk: '높음',
    attackMultiplier: 1.3,
    damageMultiplier: 0.7,
    moraleEffect: -15,
    requirements: '지략 B 이상 장수',
  },
  charge: {
    name: '돌격',
    description: '적장 일기토 유도',
    risk: '높음',
    attackMultiplier: 1.4,
    damageMultiplier: 0.8,
    moraleEffect: -10,
    requirements: '무력 A 이상 장수',
  },
  fire_ships: {
    name: '화선',
    description: '적 함선 소각',
    risk: '높음',
    attackMultiplier: 2.0,
    damageMultiplier: 0.2,
    moraleEffect: -35,
    requirements: '수상전 + 인화물',
  },
};
