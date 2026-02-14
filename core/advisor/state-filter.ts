// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 게임 상태 → AdvisorView 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 숫자를 범주형으로 변환하여 Claude가 정확한 수치에
// 의존하지 않고 전략적 판단을 내리도록 한다.

import type { GameState, City, General, Grade } from '../data/types.js';
import { getTotalTroopsOfCity, GRADE_VALUES } from '../data/types.js';
import type {
  AdvisorView, AdvisorCityView, AdvisorAllyView,
  AdvisorEnemyIntel, AdvisorBattleView,
  TroopsLevel, FoodLevel, DevelopmentLevel, MoraleLevel,
  EnemyStrength, IntelReliability,
} from './types.js';
import { selectKnowledge } from './knowledge-selector.js';

// ─── 범주 변환 함수 ─────────────────────────────────────

export function categorizeTroops(total: number): TroopsLevel {
  if (total >= 8000) return '풍부';
  if (total >= 4000) return '충분';
  if (total >= 2000) return '부족';
  return '위험';
}

export function categorizeFood(food: number): FoodLevel {
  if (food >= 10000) return '풍부';
  if (food >= 5000) return '충분';
  if (food >= 2000) return '부족';
  return '위험';
}

export function categorizeDevelopment(city: City): DevelopmentLevel {
  const devValues = [
    GRADE_VALUES[city.development.agriculture],
    GRADE_VALUES[city.development.commerce],
    GRADE_VALUES[city.development.defense],
  ];
  const avg = devValues.reduce((a, b) => a + b, 0) / devValues.length;
  if (avg >= 75) return '높음';
  if (avg >= 55) return '보통';
  return '낮음';
}

export function categorizeMorale(morale: number): MoraleLevel {
  if (morale >= 70) return '높음';
  if (morale >= 40) return '보통';
  return '낮음';
}

function bestAbilityGrade(gen: General): Grade {
  const grades: Grade[] = [
    gen.abilities.command,
    gen.abilities.martial,
    gen.abilities.intellect,
    gen.abilities.politics,
    gen.abilities.charisma,
  ];
  const values = grades.map(g => GRADE_VALUES[g]);
  const maxIdx = values.indexOf(Math.max(...values));
  return grades[maxIdx];
}

function estimateEnemyStrength(state: GameState, playerFaction: string): EnemyStrength {
  const playerTroops = state.cities
    .filter(c => c.owner === playerFaction)
    .reduce((sum, c) => sum + getTotalTroopsOfCity(c), 0);

  const enemyTroops = state.cities
    .filter(c => c.owner === '조조')
    .reduce((sum, c) => sum + getTotalTroopsOfCity(c), 0);

  const ratio = playerTroops > 0 ? enemyTroops / playerTroops : 999;
  if (ratio >= 3) return '압도적';
  if (ratio >= 1.5) return '우세';
  if (ratio >= 0.7) return '비슷';
  return '열세';
}

function getIntelReliability(state: GameState): IntelReliability {
  const scouted = state.actionLog.some(
    log => log.action.type === 'military' && log.action.action === 'scout'
  );
  if (scouted) return '대략적';

  if (state.flags['enemyIntelReliable']) return '확실';
  if (state.completedEvents.some(e => e.includes('intel') || e.includes('spy'))) return '대략적';
  return '불확실';
}

// ─── 긴급 사안 & 기회 도출 ──────────────────────────────

function deriveUrgentMatters(state: GameState, playerFaction: string): string[] {
  const urgent: string[] = [];

  const playerCities = state.cities.filter(c => c.owner === playerFaction);

  // 식량 위기
  for (const city of playerCities) {
    if (city.food < 2000) {
      urgent.push(`${city.name}의 식량이 위험 수준입니다`);
    }
  }

  // 사기 저하
  for (const city of playerCities) {
    if (city.morale < 40) {
      urgent.push(`${city.name}의 사기가 낮습니다`);
    }
  }

  // 병력 부족
  const totalTroops = playerCities.reduce((s, c) => s + getTotalTroopsOfCity(c), 0);
  if (totalTroops < 3000) {
    urgent.push('전체 병력이 심각하게 부족합니다');
  }

  // 턴 제한 경고
  const turnsLeft = state.maxTurns - state.turn;
  if (turnsLeft <= 3) {
    urgent.push(`남은 턴이 ${turnsLeft}턴뿐입니다`);
  }

  // 동맹 위기
  const sunRelation = state.diplomacy.relations.find(
    r => (r.factionA === playerFaction && r.factionB === '손권') ||
         (r.factionA === '손권' && r.factionB === playerFaction)
  );
  if (sunRelation && sunRelation.relation === '냉담') {
    urgent.push('손권과의 동맹이 위태롭습니다');
  }

  return urgent;
}

function deriveOpportunities(state: GameState, playerFaction: string): string[] {
  const opps: string[] = [];

  // 높은 훈련도
  const trainedCities = state.cities.filter(
    c => c.owner === playerFaction && c.training >= 80
  );
  if (trainedCities.length > 0) {
    opps.push(`${trainedCities.map(c => c.name).join(', ')}의 군사 훈련이 우수합니다`);
  }

  // 동맹 견고
  const sunRelation = state.diplomacy.relations.find(
    r => (r.factionA === playerFaction && r.factionB === '손권') ||
         (r.factionA === '손권' && r.factionB === playerFaction)
  );
  if (sunRelation && (sunRelation.relation === '긴밀' || sunRelation.relation === '우호')) {
    opps.push('손권과의 동맹이 견고합니다');
  }

  // 화공 조건
  if (state.flags['southeastWind'] || state.flags['fireShipsReady']) {
    opps.push('화공 조건이 갖추어지고 있습니다');
  }

  // 적 약점
  if (state.flags['enemyWeakNavy'] || state.flags['chainedShips']) {
    opps.push('조조 수군에 약점이 노출되었습니다');
  }

  return opps;
}

// ─── 최근 턴 결과 ───────────────────────────────────────

function getLastTurnResults(state: GameState): string[] {
  const currentTurn = state.turn;
  const prevTurnLogs = state.actionLog.filter(log => log.result && log.turn === currentTurn - 1);

  return prevTurnLogs.map(log => {
    const success = log.result.success ? '성공' : '실패';
    return `[${success}] ${log.result.description}`;
  });
}

// ─── 메인 필터 함수 ─────────────────────────────────────

export function filterGameState(state: GameState, playerFaction: string = '유비'): AdvisorView {
  const playerCities = state.cities.filter(c => c.owner === playerFaction);
  const playerGenerals = state.generals.filter(g => g.faction === playerFaction);

  // 아군 도시
  const ourCities: AdvisorCityView[] = playerCities.map(city => {
    const totalTroops = getTotalTroopsOfCity(city);
    const stationedGens = playerGenerals.filter(g => g.location === city.id);

    return {
      name: city.name,
      troopsLevel: categorizeTroops(totalTroops),
      foodLevel: categorizeFood(city.food),
      development: categorizeDevelopment(city),
      defense: city.development.defense,
      morale: categorizeMorale(city.morale),
      stationedGenerals: stationedGens.map(g => ({
        name: g.name,
        role: g.role,
        abilityGrade: bestAbilityGrade(g),
      })),
    };
  });

  // 동맹
  const allies: AdvisorAllyView[] = [];
  for (const rel of state.diplomacy.relations) {
    const otherFaction = rel.factionA === playerFaction ? rel.factionB : rel.factionA;
    if (otherFaction === '조조') continue; // 적은 별도 처리
    if (rel.factionA !== playerFaction && rel.factionB !== playerFaction) continue;

    allies.push({
      name: otherFaction,
      relation: rel.relation,
      recentEvents: rel.events.slice(-3),
    });
  }

  // 적 정보
  const enemyGenerals = state.generals.filter(g => g.faction === '조조');
  const knownMovements: string[] = [];

  // 정찰로 발견된 적 동향
  const scoutLogs = state.actionLog.filter(
    l => l.action.type === 'military' && l.action.action === 'scout' && l.result.success
  );
  if (scoutLogs.length > 0) {
    const lastScout = scoutLogs[scoutLogs.length - 1];
    knownMovements.push(lastScout.result.description);
  }

  const enemyIntel: AdvisorEnemyIntel = {
    reliability: getIntelReliability(state),
    knownMovements,
    estimatedTotalTroops: estimateEnemyStrength(state, playerFaction),
    keyGeneralsSpotted: enemyGenerals
      .filter(g => g.condition === '양호')
      .slice(0, 5)
      .map(g => g.name),
  };

  // 전투 정보
  let activeBattle: AdvisorBattleView | null = null;
  if (state.activeBattle) {
    const b = state.activeBattle;
    const isAttacker = b.attackers.faction === playerFaction;
    const ourForce = isAttacker ? b.attackers : b.defenders;
    const enemyForce = isAttacker ? b.defenders : b.attackers;

    const troopsRatio = ourForce.initialTroops > 0
      ? Math.round((ourForce.troops / ourForce.initialTroops) * 100)
      : 0;

    activeBattle = {
      location: b.location,
      terrain: b.terrain,
      weather: b.weather,
      battleTurn: b.battleTurn,
      maxBattleTurns: b.maxBattleTurns,
      ourTroopsRatio: `${troopsRatio}%`,
      ourMorale: categorizeMorale(ourForce.morale),
      enemyMorale: categorizeMorale(enemyForce.morale),
      availableTactics: b.availableTactics.map(t => t.name),
      recentLog: b.log.slice(-3).map(l => l.description),
    };
  }

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    phase: state.phase,
    season: state.season,
    actionsRemaining: state.actionsRemaining,
    ourCities,
    allies,
    enemyIntel,
    activeBattle,
    urgentMatters: deriveUrgentMatters(state, playerFaction),
    opportunities: deriveOpportunities(state, playerFaction),
    lastTurnResults: getLastTurnResults(state),
    contextKnowledge: selectKnowledge(state),
  };
}
