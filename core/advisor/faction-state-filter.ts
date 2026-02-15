// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Faction AI용 상태 필터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 기존 state-filter.ts는 유비(제갈량) 시점 — 범주형.
// 이 필터는 각 세력 AI 시점 — 자기 도시는 정확한 수치, 적은 범주형.

import type {
  GameState, FactionId, GamePhase, Grade,
  GeneralRole, GeneralCondition, LoyaltyLevel,
} from '../data/types.js';
import { getTotalTroopsOfCity } from '../data/types.js';
import { categorizeTroops, categorizeFood } from './state-filter.js';

// ─── Faction State View 타입 ────────────────────────

export interface FactionCityView {
  id: string;
  name: string;
  troops: { infantry: number; cavalry: number; navy: number };
  totalTroops: number;
  food: number;
  morale: number;
  training: number;
  development: { agriculture: Grade; commerce: Grade; defense: Grade };
  adjacent: string[];
}

export interface FactionGeneralView {
  id: string;
  name: string;
  role: GeneralRole;
  abilities: {
    command: Grade; martial: Grade; intellect: Grade;
    politics: Grade; charisma: Grade;
  };
  skills: string[];
  loyalty: LoyaltyLevel;
  location: string;
  condition: GeneralCondition;
}

export interface FactionEnemyIntel {
  factionId: FactionId;
  estimatedTroops: string;
  knownCities: {
    id: string;
    name: string;
    troopsLevel: string;
    foodLevel: string;
  }[];
  knownGenerals: { name: string; location: string }[];
}

export interface FactionDiplomacyView {
  relations: {
    target: FactionId;
    relation: string;
    isAlliance: boolean;
    recentEvents: string[];
  }[];
}

export interface FactionStateView {
  turn: number;
  maxTurns: number;
  phase: GamePhase;
  season: string;

  ownCities: FactionCityView[];
  ownGenerals: FactionGeneralView[];
  enemyIntel: FactionEnemyIntel[];
  diplomacy: FactionDiplomacyView;
  relevantFlags: Record<string, unknown>;
  strategicGoals: string[];
}

// ─── 내부 헬퍼 ──────────────────────────────────────

function estimateRelativeTroops(
  state: GameState, selfId: FactionId, enemyId: FactionId,
): string {
  const selfTroops = state.cities
    .filter(c => c.owner === selfId)
    .reduce((sum, c) => sum + getTotalTroopsOfCity(c), 0);
  const enemyTroops = state.cities
    .filter(c => c.owner === enemyId)
    .reduce((sum, c) => sum + getTotalTroopsOfCity(c), 0);

  const ratio = selfTroops > 0 ? enemyTroops / selfTroops : 999;
  if (ratio >= 3) return '압도적';
  if (ratio >= 1.5) return '우세';
  if (ratio >= 0.7) return '비슷';
  return '열세';
}

function buildEnemyIntel(
  state: GameState, selfId: FactionId, enemyId: FactionId,
): FactionEnemyIntel {
  const knownCities = state.cities
    .filter(c => c.owner === enemyId)
    .map(c => ({
      id: c.id,
      name: c.name,
      troopsLevel: categorizeTroops(getTotalTroopsOfCity(c)),
      foodLevel: categorizeFood(c.food),
    }));

  const knownGenerals = state.generals
    .filter(g => g.faction === enemyId && g.condition === '양호')
    .slice(0, 5)
    .map(g => ({ name: g.name, location: g.location }));

  return {
    factionId: enemyId,
    estimatedTroops: estimateRelativeTroops(state, selfId, enemyId),
    knownCities,
    knownGenerals,
  };
}

const GLOBAL_FLAGS = [
  'chibiVictory', 'chainedShips', 'southeastWind',
  'enemyWeakNavy', 'fireShipsReady',
];

function filterRelevantFlags(
  flags: Record<string, unknown>, factionId: FactionId,
): Record<string, unknown> {
  const prefix = factionId === '조조' ? 'cao_'
    : factionId === '손권' ? 'sun_'
    : 'liu_';

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith(prefix) || GLOBAL_FLAGS.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

// ─── 메인 빌더 ──────────────────────────────────────

export function buildFactionStateView(
  state: GameState,
  factionId: FactionId,
  strategicGoals: string[] = [],
): FactionStateView {
  // 자기 도시: 정확한 수치
  const ownCities: FactionCityView[] = state.cities
    .filter(c => c.owner === factionId)
    .map(c => ({
      id: c.id,
      name: c.name,
      troops: { ...c.troops },
      totalTroops: getTotalTroopsOfCity(c),
      food: c.food,
      morale: c.morale,
      training: c.training,
      development: { ...c.development },
      adjacent: [...c.adjacent],
    }));

  // 자기 장수: 정확한 정보
  const ownGenerals: FactionGeneralView[] = state.generals
    .filter(g => g.faction === factionId)
    .map(g => ({
      id: g.id,
      name: g.name,
      role: g.role,
      abilities: { ...g.abilities },
      skills: [...g.skills],
      loyalty: g.loyalty,
      location: g.location,
      condition: g.condition,
    }));

  // 적/타 세력 정보: 범주형
  const enemyIntel = state.factions
    .filter(f => f.id !== factionId)
    .map(f => buildEnemyIntel(state, factionId, f.id));

  // 외교
  const diplomacy: FactionDiplomacyView = {
    relations: state.diplomacy.relations
      .filter(r => r.factionA === factionId || r.factionB === factionId)
      .map(r => ({
        target: r.factionA === factionId ? r.factionB : r.factionA,
        relation: r.relation,
        isAlliance: r.isAlliance,
        recentEvents: r.events.slice(-3),
      })),
  };

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    phase: state.phase,
    season: state.season,
    ownCities,
    ownGenerals,
    enemyIntel,
    diplomacy,
    relevantFlags: filterRelevantFlags(state.flags, factionId),
    strategicGoals,
  };
}
