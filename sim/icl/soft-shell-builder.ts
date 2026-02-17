// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Soft Shell 빌더 — GameExperience[] → 프롬프트 텍스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 제갈량의 "기억"을 프롬프트 텍스트로 변환한다.
// system prompt 뒤에 추가되어 과거 전역의 경험을 전달한다.

import type { GameExperience } from './experience-types.js';

/** Easy 모드 전략 가이드라인 (Hard Shell 강화) */
export const EASY_STRATEGY_GUIDE = `
## 전략 가이드 (핵심 요약)

적벽대전에서 승리하려면 다음 4단계 전략을 따르라:

**1단계 (턴 1~7): 기반 구축**
- 훈련(train)으로 병사 전투력 강화 (3~5회)
- 개발(develop)은 1~2회로 최소화
- 손권에게 사신(send_envoy) 1회 → 동맹 확보

**2단계 (턴 7~12): 병력 집결**
- 보급(transfer)으로 강하/하구에서 전진기지로 병력 이동 (3~5회)
- 이것이 가장 중요하다 — 분산된 병력을 한 곳에 모아야 한다
- 훈련 병행으로 사기/훈련도 유지

**3단계 (턴 12~): 적벽 결전**
- 정찰(scout) 후 진군(march)으로 적벽 진출
- 화공 조건이 갖춰지면 화공 전술 사용
- 적벽 승리 후 즉시 4단계로 전환

**4단계: 적벽 승리 후 형주 공략**
- 적벽 승리 직후, 보급 방향을 역전하라
- 하구(hagu)에서 강하(gangha)로 병력 보급 (transfer, hagu→gangha)
- 강하에 충분한 병력(2000명 이상)을 모은 후 남군(nanjun)으로 진군
- 병력 없이 진군하면 반드시 패배한다 — 보급 먼저, 진군은 나중에
- 유비(liubei)를 진군에 포함시키지 마라 — 포로가 되면 게임 오버

**절대 하지 말 것:**
- 개발만 반복하다 시간 낭비
- 외교에 3회 이상 소비
- 보급 없이 소규모 병력으로 진군
- 적벽 후에도 강하→하구 방향으로 보급 (강하는 이미 비어있다!)
- 0명 병력으로 진군 시도
`;

export class SoftShellBuilder {
  /**
   * 선택된 경험들을 프롬프트 텍스트로 변환.
   * system prompt 뒤에 '\n\n' + 이 텍스트를 추가한다.
   */
  static build(experiences: GameExperience[], budget: number = 800): string {
    if (experiences.length === 0) return '';

    const sections: string[] = [];
    sections.push('## 과거 전역(戰役)의 경험');
    sections.push('이전 전역에서 얻은 교훈이다. 같은 실수를 반복하지 말라.\n');

    // 승리 경험 → "성공 전략"
    const wins = experiences.filter(e => e.chibiVictory);
    if (wins.length > 0) {
      sections.push('### 성공한 전략');
      for (const exp of wins) {
        sections.push(this.formatWinExperience(exp));
      }
    }

    // 패배 경험 → "회피할 패턴"
    const losses = experiences.filter(e => !e.chibiVictory);
    if (losses.length > 0) {
      sections.push('\n### 반복하지 말아야 할 실수');
      for (const exp of losses) {
        sections.push(this.formatLossExperience(exp));
      }
    }

    // 핵심 교훈 요약 (중복 제거)
    const allLessons = [...new Set(experiences.flatMap(e => e.lessons))];
    if (allLessons.length > 0) {
      sections.push('\n### 핵심 교훈');
      for (const lesson of allLessons.slice(0, 5)) {
        sections.push(`- ${lesson}`);
      }
    }

    // 전략 지침 (승리 경험에서 추출)
    if (wins.length > 0) {
      sections.push('\n### 검증된 전략 지침');
      sections.push(this.buildStrategyGuideline(wins));
    }

    return sections.join('\n');
  }

  private static formatWinExperience(exp: GameExperience): string {
    const score = exp.bProximityScore ?? 0;
    const profile = exp.strategyProfile;
    const phases = profile.phases
      .map(p => `${p.name}(턴${p.startTurn}-${p.endTurn})`)
      .join(' → ');
    return `- **${exp.grade}등급** (B근접도: ${score}%, ${exp.totalTurns}턴): ${phases || '단계 없음'}
  보급 ${profile.transferPattern.totalTransfers}회 → ${profile.transferPattern.concentrationTarget || '?'}에 집중
  진군 시점: 턴 ${profile.firstMarchTurn ?? '없음'}
  점령 도시: ${exp.citiesCaptured.join(', ') || '없음'}`;
  }

  private static formatLossExperience(exp: GameExperience): string {
    const score = exp.bProximityScore ?? 0;
    const lessons = exp.lessons.map(l => `  - ${l}`).join('\n');
    return `- **${exp.grade}등급 패배** (B근접도: ${score}%, ${exp.totalTurns}턴):
${lessons}`;
  }

  private static buildStrategyGuideline(wins: GameExperience[]): string {
    const winsWithMarch = wins.filter(w => w.strategyProfile.firstMarchTurn !== null);
    const avgFirstMarch = winsWithMarch.length > 0
      ? winsWithMarch.reduce((sum, w) => sum + (w.strategyProfile.firstMarchTurn ?? 0), 0) / winsWithMarch.length
      : 12;

    const avgTransfers = wins.reduce(
      (sum, w) => sum + w.strategyProfile.transferPattern.totalTransfers, 0
    ) / wins.length;

    const lines: string[] = [];
    lines.push(`1. 초반(턴1-7): 내정 최소화, 병력 훈련(train) 집중`);
    lines.push(`2. 중반(턴7-${Math.round(avgFirstMarch)}): 보급(transfer)으로 전진기지에 병력 집중 (최소 ${Math.round(avgTransfers)}회)`);
    lines.push(`3. 후반(턴${Math.round(avgFirstMarch)}이후): 적벽 진군(march) → 화공 전투`);
    lines.push(`4. 적벽 후: 보급 방향 역전(하구→강하), 충분한 병력 집결 후 남군 진군`);
    lines.push(`5. 외교: 손권 동맹은 1-2회 사신으로 충분. 과도한 외교 금지`);

    return lines.join('\n');
  }
}
