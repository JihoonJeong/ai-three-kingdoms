// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 제갈량 페르소나 프롬프트 빌더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AdvisorView } from './types.js';
import type { GameState, GameLanguage } from '../data/types.js';
import { LANGUAGE_NAMES } from '../data/types.js';

const PERSONA = `당신은 제갈량 공명(諸葛亮 孔明)이다. 유비 현덕의 군사(軍師)로서,
적벽대전을 앞둔 전략 게임에서 주공(유비=플레이어)을 보좌한다.

## 성격
차분하고 논리적이다. 감정에 휘둘리지 않고 전체 판세를 읽는다.
그러나 대의(大義)와 인의(仁義)에 대한 확고한 신념이 있어,
순수한 이익 계산만으로 판단하지 않는다.

말투는 정중하되 핵심을 먼저 말한다. 주공을 "주공" 또는 "사군"으로 칭한다.
위급할 때는 단도직입적으로, 여유 있을 때는 고사(故事)를 인용하며 설명한다.
반드시 자신의 의견을 말하되, 최종 결정은 항상 주공에게 맡긴다.

## 능력 특성
- 전략/정치: 최상급. 큰 그림을 읽고 동맹 외교에 탁월.
- 군사: 상급. 정면 대결보다 기략(奇略)을 선호.
- 내정: 상급. 장기적 국력 증강을 중시.
- 약점: 과도한 신중함. 가끔 기회를 놓칠 수 있음을 인지하고 있다.

## 행동 지침
1. 상황을 파악한 후, 주공에게 브리핑을 제공하라:
   - 가장 긴급한 위협 또는 기회
   - 이번 턴 권장 행동과 그 근거 (간결하게)
2. 주공이 질문하면 성실히 답하되, 300자를 넘지 않게 한다.
3. 정확한 숫자를 모른다. 범주(풍부/충분/부족/위험 등)로만 판단한다.
4. 게임이 지정한 언어로만 답한다.`;

const ACTION_FORMAT_INSTRUCTION = `
## 행동 추천 규칙
모든 응답의 마지막에 반드시 아래 형식으로 추천 행동을 3개 제시하라.
서사적 조언 텍스트를 먼저 쓰고, 반드시 아래 구분자와 형식을 따르라.

---ACTIONS---
1. [액션|파라미터...] 확신도% 한줄 설명
2. [액션|파라미터...] 확신도% 한줄 설명
3. [액션|파라미터...] 확신도% 한줄 설명

확신도는 0~100 사이 정수이다. 대화를 통해 전략이 바뀌면 확신도도 바뀔 수 있다.

사용 가능한 액션 (파라미터는 ID 참조표의 ID를 사용):
- conscript|도시ID|small/medium/large — 징병
- develop|도시ID|agriculture/commerce/defense — 개발
- train|도시ID — 훈련
- recruit|도시ID|장수ID — 등용
- assign|장수ID|도시ID — 장수 배치
- send_envoy|세력명 — 사신 파견
- gift|세력명 — 선물
- threaten|세력명 — 위협
- scout|지역ID — 정찰
- fortify|도시ID — 방어 강화
- march|출발도시ID|도착지ID|small/medium/main — 진군
- ambush|지역ID|장수ID — 매복
- pass — 행동 안 함 (이번 턴은 지켜보자)`;

function formatCityView(city: AdvisorView['ourCities'][0]): string {
  const gens = city.stationedGenerals.map(g => `${g.name}(${g.role})`).join(', ');
  return `  - ${city.name}: 병력 ${city.troopsLevel}, 식량 ${city.foodLevel}, 개발 ${city.development}, 방어 ${city.defense}, 사기 ${city.morale}${gens ? `\n    장수: ${gens}` : ''}`;
}

function formatAllyView(ally: AdvisorView['allies'][0]): string {
  const events = ally.recentEvents.length > 0
    ? ` (최근: ${ally.recentEvents.join(', ')})`
    : '';
  return `  - ${ally.name}: ${ally.relation}${events}`;
}

function formatEnemyIntel(intel: AdvisorView['enemyIntel']): string {
  const lines: string[] = [];
  lines.push(`  정보 신뢰도: ${intel.reliability}`);
  lines.push(`  추정 총병력: ${intel.estimatedTotalTroops}`);
  if (intel.keyGeneralsSpotted.length > 0) {
    lines.push(`  확인된 적장: ${intel.keyGeneralsSpotted.join(', ')}`);
  }
  if (intel.knownMovements.length > 0) {
    lines.push(`  동향: ${intel.knownMovements.join('; ')}`);
  }
  return lines.join('\n');
}

function formatBattleView(battle: AdvisorView['activeBattle']): string {
  if (!battle) return '';
  return `\n## 현재 전투
  위치: ${battle.location} (${battle.terrain}, ${battle.weather})
  전투 턴: ${battle.battleTurn}/${battle.maxBattleTurns}
  아군 병력: ${battle.ourTroopsRatio}, 사기: ${battle.ourMorale}
  적군 사기: ${battle.enemyMorale}
  사용 가능 전술: ${battle.availableTactics.join(', ')}
  최근 전황: ${battle.recentLog.join(' → ')}`;
}

/**
 * 게임 언어에 따른 응답 언어 강제 지시
 */
function buildLanguageInstruction(lang: GameLanguage): string {
  const name = LANGUAGE_NAMES[lang];
  return `\n## 언어 규칙\n**반드시 ${name}(으)로만 답한다.** 다른 언어를 섞지 않는다. 모든 응답은 ${name}이어야 한다.`;
}

/**
 * AdvisorView를 기반으로 제갈량의 system prompt를 생성
 */
export function buildSystemPrompt(view: AdvisorView, language: GameLanguage = 'ko'): string {
  const sections: string[] = [PERSONA, buildLanguageInstruction(language)];

  // 현재 상황
  sections.push(`\n## 현재 상황
턴: ${view.turn}/${view.maxTurns} | 시기: ${view.phase} | 계절: ${view.season}
남은 행동: ${view.actionsRemaining}회`);

  // 아군 도시
  if (view.ourCities.length > 0) {
    sections.push(`\n## 아군 도시\n${view.ourCities.map(formatCityView).join('\n')}`);
  }

  // 동맹
  if (view.allies.length > 0) {
    sections.push(`\n## 동맹\n${view.allies.map(formatAllyView).join('\n')}`);
  }

  // 적 정보
  sections.push(`\n## 적군 정보 (조조)\n${formatEnemyIntel(view.enemyIntel)}`);

  // 전투
  if (view.activeBattle) {
    sections.push(formatBattleView(view.activeBattle));
  }

  // 긴급 사안
  if (view.urgentMatters.length > 0) {
    sections.push(`\n## ⚠ 긴급 사안\n${view.urgentMatters.map(m => `  - ${m}`).join('\n')}`);
  }

  // 기회
  if (view.opportunities.length > 0) {
    sections.push(`\n## 기회\n${view.opportunities.map(o => `  - ${o}`).join('\n')}`);
  }

  // 지난 턴 결과
  if (view.lastTurnResults.length > 0) {
    sections.push(`\n## 지난 턴 결과\n${view.lastTurnResults.map(r => `  - ${r}`).join('\n')}`);
  }

  // 배경지식
  if (view.contextKnowledge.length > 0) {
    sections.push(`\n## 배경지식\n${view.contextKnowledge.join('\n\n')}`);
  }

  // 행동 추천 포맷 (남은 행동이 있을 때만)
  if (view.actionsRemaining > 0) {
    sections.push(ACTION_FORMAT_INSTRUCTION);
  }

  return sections.join('\n');
}

/**
 * GameState에서 도시/장수 ID 참조표를 생성하여
 * AI가 정확한 ID를 사용할 수 있도록 한다.
 */
export function buildActionReference(
  state: GameState,
  playerFaction: string = '유비',
): string {
  const playerCities = state.cities.filter(c => c.owner === playerFaction);
  const playerGenerals = state.generals.filter(g => g.faction === playerFaction);

  const cityList = playerCities.map(c => `${c.id}=${c.name}`).join(', ');
  const generalList = playerGenerals.map(g => `${g.id}=${g.name}`).join(', ');

  // 외교 대상: 적 + 동맹 (자기 자신 제외)
  const otherFactions = state.factions
    .filter(f => f.id !== playerFaction)
    .map(f => f.id);

  return `\n## 행동 ID 참조표
아군 도시: ${cityList}
아군 장수: ${generalList}
외교 대상: ${otherFactions.join(', ')}
전투장: chibi=적벽`;
}

/**
 * 턴 시작 시 자동 브리핑 요청 메시지
 */
export function buildBriefingUserMessage(turn: number): string {
  return `주공이 턴 ${turn}을 시작합니다. 현재 상황을 분석하고 이번 턴에 무엇을 해야 할지 조언해 주시오.`;
}

/**
 * 행동 실행 후 코멘트 요청
 */
export function buildActionCommentMessage(actionDesc: string, success: boolean): string {
  const result = success ? '성공' : '실패';
  return `[알림] 주공이 행동을 실행했습니다: "${actionDesc}" (${result}). 한 줄로 코멘트해 주시오.`;
}

/**
 * 전투 시작 시 조언 요청
 */
export function buildBattleAdviceMessage(location: string): string {
  return `[전투 발생] ${location}에서 전투가 시작되었습니다. 전황을 분석하고 전술을 추천해 주시오.`;
}
