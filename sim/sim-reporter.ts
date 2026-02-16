// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시뮬레이션 결과 수집 + 통계
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SimResult, BatchResult, BatchStats } from './sim-config.js';

const GRADE_SCORES: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

function computeSubStats(results: SimResult[]) {
  if (results.length === 0) {
    return { winRate: 0, avgGrade: 0, gradeDistribution: {} as Record<string, number> };
  }
  const winRate = results.filter(r => r.flags['chibiVictory'] === true).length / results.length;
  const avgGrade = results.reduce((sum, r) => sum + (GRADE_SCORES[r.grade] ?? 0), 0) / results.length;
  const gradeDistribution: Record<string, number> = {};
  for (const r of results) {
    gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
  }
  return { winRate, avgGrade, gradeDistribution };
}

export class SimReporter {
  /** 배치 결과를 JSON 파일로 저장 */
  static saveBatchResult(result: BatchResult, dir: string = 'sim/results'): string {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `batch-${result.timestamp.replace(/[:.]/g, '-')}.json`;
    const path = join(dir, filename);
    writeFileSync(path, JSON.stringify(result, null, 2));
    return path;
  }

  /** 개별 게임 상세 로그 저장 */
  static saveGameLog(result: SimResult, dir: string = 'sim/results'): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `game-${result.gameId}.json`;
    writeFileSync(join(dir, filename), JSON.stringify(result, null, 2));
  }

  /** 배치 결과에서 통계 산출 */
  static computeStats(results: SimResult[]): BatchStats {
    const gradeDistribution: Record<string, number> = {};
    for (const r of results) {
      gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
    }

    const winRate = results.length > 0
      ? results.filter(r => r.flags['chibiVictory'] === true).length / results.length
      : 0;
    const avgTurns = results.length > 0
      ? results.reduce((sum, r) => sum + r.totalTurns, 0) / results.length
      : 0;
    const avgDuration = results.length > 0
      ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
      : 0;

    const modeA = results.filter(r => r.mode === 'A');
    const modeB = results.filter(r => r.mode === 'B');
    const fast = results.filter(r => !r.thinking);
    const think = results.filter(r => r.thinking);

    return {
      gradeDistribution,
      winRate,
      avgTurns,
      avgDuration,
      modeComparison: {
        A: computeSubStats(modeA),
        B: computeSubStats(modeB),
      },
      thinkingComparison: {
        fast: computeSubStats(fast),
        think: computeSubStats(think),
      },
    };
  }

  /** 콘솔에 통계 요약 출력 */
  static printSummary(stats: BatchStats, totalGames: number): void {
    console.log('\n══════════════════════════════════════');
    console.log('  AI 삼국지 시뮬레이션 결과 요약');
    console.log('══════════════════════════════════════\n');

    console.log(`총 게임: ${totalGames}회\n`);

    console.log('등급 분포:');
    for (const grade of ['S', 'A', 'B', 'C', 'D', 'F']) {
      const count = stats.gradeDistribution[grade] || 0;
      if (count > 0) {
        const bar = '#'.repeat(count);
        console.log(`  ${grade}: ${bar} (${count})`);
      }
    }

    console.log(`\n적벽 승률: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`평균 턴: ${stats.avgTurns.toFixed(1)}`);
    console.log(`평균 시간: ${(stats.avgDuration / 1000).toFixed(1)}s`);

    if (stats.modeComparison.A.winRate > 0 || stats.modeComparison.B.winRate > 0) {
      console.log('\n-- 모드별 비교 --');
      console.log(`  Mode A (자동수락): 승률 ${(stats.modeComparison.A.winRate * 100).toFixed(1)}%`);
      console.log(`  Mode B (숙의):     승률 ${(stats.modeComparison.B.winRate * 100).toFixed(1)}%`);
    }

    if (stats.thinkingComparison.fast.avgGrade > 0 || stats.thinkingComparison.think.avgGrade > 0) {
      console.log('\n-- Thinking 비교 --');
      console.log(`  Fast:  승률 ${(stats.thinkingComparison.fast.winRate * 100).toFixed(1)}%`);
      console.log(`  Think: 승률 ${(stats.thinkingComparison.think.winRate * 100).toFixed(1)}%`);
    }
  }
}
