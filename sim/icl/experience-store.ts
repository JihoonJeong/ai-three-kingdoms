// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 경험 저장소 — GameExperience 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameExperience, ExperienceStoreConfig } from './experience-types.js';

const GRADE_SCORES: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };

function gradeScore(grade: string): number {
  return GRADE_SCORES[grade] ?? 0;
}

export class ExperienceStore {
  private experiences: GameExperience[] = [];
  private config: ExperienceStoreConfig;

  constructor(config?: Partial<ExperienceStoreConfig>) {
    this.config = {
      maxExperiences: 20,
      selectionStrategy: 'balanced',
      promptBudget: 800,
      ...config,
    };
  }

  /** 경험 추가 */
  add(exp: GameExperience): void {
    this.experiences.push(exp);
    if (this.experiences.length > this.config.maxExperiences) {
      this.pruneOldest();
    }
  }

  /** 전체 경험 목록 */
  getAll(): GameExperience[] {
    return [...this.experiences];
  }

  /** 경험 개수 */
  get size(): number {
    return this.experiences.length;
  }

  /** 프롬프트에 주입할 경험 선택 (최대 3개) */
  selectForPrompt(): GameExperience[] {
    if (this.experiences.length === 0) return [];

    switch (this.config.selectionStrategy) {
      case 'recent':
        return this.experiences.slice(-3);

      case 'best':
        return [...this.experiences]
          .sort((a, b) => gradeScore(b.grade) - gradeScore(a.grade))
          .slice(0, 3);

      case 'diverse':
        return this.selectDiverse();

      case 'balanced':
      default:
        return this.selectBalanced();
    }
  }

  /**
   * balanced 전략:
   * 1) 최고 성적 1개 (Role Model)
   * 2) 최근 1개 (Latest Learning)
   * 3) 대표적 실패 1개 (Anti-Pattern)
   */
  private selectBalanced(): GameExperience[] {
    const selected: GameExperience[] = [];

    // 1. 최고 성적 (같은 등급이면 B근접도로 2차 정렬)
    const best = [...this.experiences]
      .sort((a, b) => {
        const gradeOrder = gradeScore(b.grade) - gradeScore(a.grade);
        if (gradeOrder !== 0) return gradeOrder;
        return (b.bProximityScore ?? 0) - (a.bProximityScore ?? 0);
      })[0];
    if (best) selected.push(best);

    // 2. 최근 경험 (best와 다른 것)
    const recent = [...this.experiences]
      .reverse()
      .find(e => e.gameId !== best?.gameId);
    if (recent) selected.push(recent);

    // 3. 대표적 실패 (이미 선택된 것과 다른 것)
    const selectedIds = new Set(selected.map(e => e.gameId));
    const failure = this.experiences
      .filter(e => !e.chibiVictory && !selectedIds.has(e.gameId))
      .sort((a, b) => a.gameNumber - b.gameNumber)[0];
    if (failure) selected.push(failure);

    return selected;
  }

  /** diverse 전략: 승리 1 + 중간 1 + 실패 1 */
  private selectDiverse(): GameExperience[] {
    const selected: GameExperience[] = [];
    const sorted = [...this.experiences].sort((a, b) => gradeScore(b.grade) - gradeScore(a.grade));

    // 최고
    if (sorted.length > 0) selected.push(sorted[0]);
    // 최저 (최고와 다른 것)
    const worst = sorted.filter(e => e.gameId !== sorted[0]?.gameId).pop();
    if (worst) selected.push(worst);
    // 중간
    const selectedIds = new Set(selected.map(e => e.gameId));
    const mid = sorted.find(e => !selectedIds.has(e.gameId));
    if (mid) selected.push(mid);

    return selected;
  }

  /** 가장 오래된 경험 제거 (승리 경험은 보호) */
  private pruneOldest(): void {
    // 패배 경험 중 가장 오래된 것부터 제거
    const failureIdx = this.experiences.findIndex(e => !e.chibiVictory);
    if (failureIdx >= 0) {
      this.experiences.splice(failureIdx, 1);
    } else {
      // 모두 승리면 가장 오래된 것 제거
      this.experiences.shift();
    }
  }

  /** JSON 파일로 저장 */
  save(path: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify({
      config: this.config,
      experiences: this.experiences,
    }, null, 2));
  }

  /** JSON 파일에서 로드 */
  static load(path: string): ExperienceStore {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const store = new ExperienceStore(raw.config);
    for (const exp of raw.experiences) {
      store.experiences.push(exp);
    }
    return store;
  }

  /** 통계 */
  getStats(): {
    totalGames: number;
    winRate: number;
    gradeProgression: string[];
    learningTrend: 'improving' | 'stagnant' | 'declining' | 'insufficient_data';
  } {
    if (this.experiences.length === 0) {
      return {
        totalGames: 0,
        winRate: 0,
        gradeProgression: [],
        learningTrend: 'insufficient_data',
      };
    }

    const grades = this.experiences.map(e => e.grade);
    const totalWins = this.experiences.filter(e => e.chibiVictory).length;

    if (this.experiences.length < 5) {
      return {
        totalGames: this.experiences.length,
        winRate: totalWins / this.experiences.length,
        gradeProgression: grades,
        learningTrend: 'insufficient_data',
      };
    }

    const recentWins = this.experiences.slice(-5).filter(e => e.chibiVictory).length;
    const earlyWins = this.experiences.slice(0, 5).filter(e => e.chibiVictory).length;

    // 등급 점수 기반 트렌드도 고려
    const earlyAvg = this.experiences.slice(0, 5).reduce((s, e) => s + gradeScore(e.grade), 0) / 5;
    const recentAvg = this.experiences.slice(-5).reduce((s, e) => s + gradeScore(e.grade), 0) / 5;

    let trend: 'improving' | 'stagnant' | 'declining';
    if (recentWins > earlyWins || recentAvg > earlyAvg + 0.5) {
      trend = 'improving';
    } else if (recentWins < earlyWins || recentAvg < earlyAvg - 0.5) {
      trend = 'declining';
    } else {
      trend = 'stagnant';
    }

    return {
      totalGames: this.experiences.length,
      winRate: totalWins / this.experiences.length,
      gradeProgression: grades,
      learningTrend: trend,
    };
  }
}
