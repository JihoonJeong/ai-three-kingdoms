// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Faction AI 프롬프트 빌더 (조조/손권)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Faction AI는 <actions> JSON만 출력 (서사 불필요, 스트리밍 불필요).
// 자기 세력 수치는 정확히 제공, 적 세력은 범주형.

import type {
  FactionStateView, FactionCityView,
  FactionGeneralView, FactionEnemyIntel,
} from './faction-state-filter.js';

// ─── 상태 포매팅 헬퍼 ──────────────────────────────

function formatCity(city: FactionCityView): string {
  return `  - ${city.name}(${city.id}): 보병${city.troops.infantry} 기병${city.troops.cavalry} 수군${city.troops.navy} (총${city.totalTroops}) | 식량${city.food} | 사기${city.morale} 훈련${city.training} | 농${city.development.agriculture}/상${city.development.commerce}/방${city.development.defense} | 인접: ${city.adjacent.join(',')}`;
}

function formatGeneral(gen: FactionGeneralView): string {
  return `  - ${gen.name}(${gen.id}): ${gen.role} | 통${gen.abilities.command}/무${gen.abilities.martial}/지${gen.abilities.intellect}/정${gen.abilities.politics}/매${gen.abilities.charisma} | ${gen.skills.join(',')} | 위치:${gen.location} | ${gen.condition} | 충성:${gen.loyalty}`;
}

function formatIntel(intel: FactionEnemyIntel): string {
  const lines = [`  ${intel.factionId} — 추정 병력: ${intel.estimatedTroops}`];
  if (intel.knownCities.length > 0) {
    lines.push(`    도시: ${intel.knownCities.map(c => `${c.name}(${c.id}, 병력:${c.troopsLevel}, 식량:${c.foodLevel})`).join(', ')}`);
  }
  if (intel.knownGenerals.length > 0) {
    lines.push(`    확인된 장수: ${intel.knownGenerals.map(g => `${g.name}(${g.location})`).join(', ')}`);
  }
  return lines.join('\n');
}

function formatStateSection(view: FactionStateView): string {
  const sections: string[] = [];

  sections.push(`\n## 현재 상황\n턴: ${view.turn}/${view.maxTurns} | 시기: ${view.phase} | 계절: ${view.season}`);

  if (view.ownCities.length > 0) {
    sections.push(`\n## 아군 도시\n${view.ownCities.map(formatCity).join('\n')}`);
  }

  if (view.ownGenerals.length > 0) {
    sections.push(`\n## 아군 장수\n${view.ownGenerals.map(formatGeneral).join('\n')}`);
  }

  if (view.enemyIntel.length > 0) {
    sections.push(`\n## 적 정보\n${view.enemyIntel.map(formatIntel).join('\n')}`);
  }

  if (view.diplomacy.relations.length > 0) {
    const relLines = view.diplomacy.relations.map(r => {
      const events = r.recentEvents.length > 0 ? ` (${r.recentEvents.join(', ')})` : '';
      return `  - ${r.target}: ${r.relation}${r.isAlliance ? ' [동맹]' : ''}${events}`;
    });
    sections.push(`\n## 외교\n${relLines.join('\n')}`);
  }

  const flagEntries = Object.entries(view.relevantFlags);
  if (flagEntries.length > 0) {
    const flagLines = flagEntries.map(([k, v]) => `  - ${k}: ${v}`);
    sections.push(`\n## 게임 플래그\n${flagLines.join('\n')}`);
  }

  return sections.join('\n');
}

function buildActionReference(view: FactionStateView): string {
  const cityList = view.ownCities.map(c => `${c.id}=${c.name}`).join(', ');
  const generalList = view.ownGenerals
    .filter(g => g.condition === '양호')
    .map(g => `${g.id}=${g.name}`).join(', ');
  const diplomacyTargets = view.diplomacy.relations
    .map(r => r.target).join(', ');

  // 모든 알려진 위치: 아군 도시 + 적 도시 + 적벽
  const ownCityEntries = view.ownCities.map(c => `${c.id}=${c.name}`);
  const enemyCityEntries = view.enemyIntel
    .flatMap(e => e.knownCities.map(c => `${c.id}=${c.name}`));
  const allLocations = [...ownCityEntries, ...enemyCityEntries, 'chibi=적벽'];
  // 중복 제거
  const uniqueLocations = [...new Map(allLocations.map(l => [l.split('=')[0], l])).values()];

  return `\n## 행동 ID 참조표
아군 도시: ${cityList}
아군 장수: ${generalList}
외교 대상: ${diplomacyTargets}
정찰/진군 가능 지역: ${uniqueLocations.join(', ')}`;
}

// ─── 액션 포맷 (공통) ──────────────────────────────

const FACTION_ACTION_FORMAT = `
## 출력 형식 (반드시 준수)

<actions> 태그 안에 JSON 배열만 출력하라. 서사나 설명은 불필요하다.
최대 3개의 행동을 선택하라.

<actions>
[
  {"type":"conscript","params":{"city":"nanjun","scale":"large"},"confidence":90,"description":""},
  {"type":"train","params":{"city":"nanjun"},"confidence":80,"description":""}
]
</actions>

**규칙:**
- <actions> 안에 JSON 배열만 출력. 다른 텍스트 금지
- JSON 필드: type(액션명), params(파라미터), confidence(0-100), description(빈 문자열 가능)
- params의 ID는 반드시 위 참조표의 ID만 사용
- 아래 목록에 없는 type을 절대 만들지 말라

사용 가능한 type:
conscript, develop, train, recruit, assign, transfer, send_envoy, gift, threaten, scout, fortify, march, ambush, pass

주요 params:
- conscript: city, scale(small/medium/large)
- develop: city, focus(agriculture/commerce/defense)
- train: city
- assign: general, destination
- transfer: from, to, transferType(troops/food), scale(small/medium/large)
- march: from, to, scale(small/medium/main), generals(쉼표구분)
- scout: target
- fortify: city
- send_envoy/gift/threaten: target(세력명)
- ambush: location, general
- pass: (없음)`;

// ─── 조조 프롬프트 ──────────────────────────────────

const CAO_PERSONA = `당신은 조조 맹덕(曹操 孟德)이다. 천하통일을 목표로 하는 난세의 간웅.

## 성격
공격적이고 과감하며 자신감이 넘친다. 약점은 오만함.
수전에 약하다는 것을 알고 있으나 과소평가하는 경향이 있다.
병력 수적 우위를 믿고 정면돌파를 선호한다.
실리를 추구하되, 때로는 대담한 도박을 선호한다.

## 제약
- 연환진은 이벤트 시스템이 자동 처리하므로 신경 쓰지 않는다
- chibiVictory 플래그가 설정되면 공격을 중단하고 방어로 전환한다
- 행동은 최대 3개까지만 선택한다`;

function getCaoGoals(view: FactionStateView): string[] {
  const goals: string[] = [];

  if (view.phase === 'preparation') {
    const nanjun = view.ownCities.find(c => c.id === 'nanjun');
    const nanjunTroops = nanjun ? nanjun.totalTroops : 0;
    if (nanjunTroops < 20000) {
      goals.push(`남군 병력을 20,000 이상 확보하라 (현재: ${nanjunTroops})`);
    } else {
      goals.push('남군 병력이 충분하다. 배치 최적화에 집중하라');
    }
    goals.push('장수 배치를 최적화하라');
    if (view.turn >= 5) {
      goals.push('적벽 출진을 준비하라 — 채모/장윤을 적벽에 배치할 시기를 판단하라');
    }
  } else if (view.phase === 'battle') {
    goals.push('적벽에 수군 주력을 배치하라');
    goals.push('하구/강하를 견제하여 적의 후방을 교란하라');
  } else {
    if (view.relevantFlags['chibiVictory']) {
      goals.push('적벽 패배 이후 방어 전환 — 무리한 공격 금지');
    } else {
      goals.push('전과를 확대하라 — 하구/강하 점령 시도');
    }
  }

  return goals;
}

export function buildCaoSystemPrompt(view: FactionStateView): string {
  const goals = getCaoGoals(view);
  const sections: string[] = [CAO_PERSONA];

  sections.push(`\n## 전략 목표\n${goals.map(g => `- ${g}`).join('\n')}`);
  sections.push(formatStateSection(view));
  sections.push(buildActionReference(view));
  sections.push(FACTION_ACTION_FORMAT);

  return sections.join('\n');
}

// ─── 손권 프롬프트 ──────────────────────────────────

const SUN_PERSONA = `당신은 손권 중모(孫權 仲謀)이다. 강동의 주인이자 오나라의 군주.

## 성격
신중하고 실리적이다. 동맹은 이익이 될 때만 유지한다.
주유 도독의 자존심과 독립성을 존중한다.
조조에게 굴복하지 않으려 하나, 무모한 공격도 피한다.
내정과 방어를 중시하며, 동맹 유지에 전략적 가치를 둔다.

## 제약
- 행동은 최대 3개까지만 선택한다
- 비동맹 상태에서는 관망하며 최소한의 행동만 한다 (train/develop 위주)`;

function getSunGoals(view: FactionStateView): string[] {
  const goals: string[] = [];
  const isAllied = view.diplomacy.relations.some(
    r => r.target === '유비' && r.isAlliance,
  );

  if (view.phase === 'preparation') {
    if (isAllied) {
      goals.push('동맹 협력 강화 — 훈련, 식량 비축');
      goals.push('유비에게 식량을 지원하여 동맹을 견고히 하라');
    } else {
      goals.push('관망하며 내정을 다져라 — 훈련, 식량 비축');
    }
  } else if (view.phase === 'battle') {
    if (isAllied) {
      goals.push('주유를 적벽에 파견하여 조조를 공격하라');
      goals.push('시상의 방어를 유지하면서 적벽 전선을 지원하라');
    } else {
      goals.push('관망하며 방어에 집중하라');
    }
  } else {
    goals.push('전후 이익 확보 — 형주 주도권 확보 시도 가능');
  }

  return goals;
}

export function buildSunSystemPrompt(view: FactionStateView): string {
  const goals = getSunGoals(view);
  const sections: string[] = [SUN_PERSONA];

  sections.push(`\n## 전략 목표\n${goals.map(g => `- ${g}`).join('\n')}`);
  sections.push(formatStateSection(view));
  sections.push(buildActionReference(view));
  sections.push(FACTION_ACTION_FORMAT);

  return sections.join('\n');
}
