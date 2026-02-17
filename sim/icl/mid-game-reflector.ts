// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 중간 반성 — 턴 10에서 과거 경험 기반 전략 점검
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TurnLog } from '../sim-config.js';
import type { GameExperience } from './experience-types.js';
import { ExperienceExtractor } from './experience-extractor.js';

export class MidGameReflector {
  /**
   * 게임 중반에서 현재 행동 패턴을 과거 경험과 비교하여 경고를 생성한다.
   * 반환된 텍스트는 briefing user message 앞에 삽입된다.
   */
  static generateReflection(
    turnLogs: TurnLog[],
    experiences: GameExperience[],
    currentTurn: number,
  ): string | null {
    if (experiences.length === 0) return null;

    const profile = ExperienceExtractor.extractPartialProfile(turnLogs);
    const warnings: string[] = [];

    // 과거 패배 패턴과 비교
    const pastFailures = experiences.filter(e => !e.chibiVictory);
    for (const failure of pastFailures) {
      const fp = failure.strategyProfile;
      if (fp.transferPattern.totalTransfers === 0 &&
          profile.transferPattern.totalTransfers === 0) {
        warnings.push(
          '과거 패배 게임과 동일하게 보급(transfer)을 사용하지 않고 있습니다. ' +
          '인접 도시에서 전진기지로 병력을 집중시키시오.'
        );
        break; // 동일 경고 중복 방지
      }
    }

    for (const failure of pastFailures) {
      const fp = failure.strategyProfile;
      if (!fp.firstMarchTurn && !profile.firstMarchTurn && currentTurn >= 10) {
        warnings.push(
          `턴 ${currentTurn}인데 아직 진군(march)하지 않았습니다. ` +
          '과거에도 진군 없이 패배한 적이 있습니다. 즉시 군사 행동을 시작하시오.'
        );
        break;
      }
    }

    // 과거 승리 패턴과 비교
    const pastWins = experiences.filter(e => e.chibiVictory);
    if (pastWins.length > 0) {
      const avgWinTransfers = pastWins.reduce(
        (s, w) => s + w.strategyProfile.transferPattern.totalTransfers, 0
      ) / pastWins.length;
      if (profile.transferPattern.totalTransfers < avgWinTransfers * 0.5) {
        warnings.push(
          `승리 게임은 평균 ${Math.round(avgWinTransfers)}회 보급을 사용했으나, ` +
          `현재 ${profile.transferPattern.totalTransfers}회입니다. 병력 집중이 필요합니다.`
        );
      }
    }

    if (warnings.length === 0) return null;

    return `[중간 점검 — 턴 ${currentTurn}]\n` +
      `과거 전역의 경험에 비추어 현재 전략을 점검합니다:\n` +
      warnings.map(w => `- ${w}`).join('\n') +
      '\n남은 턴에서 전략을 수정하여 조언해 주시오.';
  }
}
