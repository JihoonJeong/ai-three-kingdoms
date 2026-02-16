// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SimReporter 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect } from 'vitest';
import { SimReporter } from './sim-reporter.js';
import type { SimResult } from './sim-config.js';

function mockResult(overrides: Partial<SimResult> = {}): SimResult {
  return {
    gameId: 'test',
    mode: 'A',
    thinking: false,
    seed: 42,
    provider: 'ollama',
    model: 'test',
    grade: 'B',
    title: '테스트',
    totalTurns: 15,
    duration: 5000,
    flags: {},
    turnLogs: [],
    finalState: { cities: [], generals: [] },
    ...overrides,
  };
}

describe('SimReporter.computeStats', () => {
  it('빈 배열 → 모두 0', () => {
    const stats = SimReporter.computeStats([]);
    expect(stats.winRate).toBe(0);
    expect(stats.avgTurns).toBe(0);
    expect(stats.avgDuration).toBe(0);
  });

  it('등급 분포 계산', () => {
    const results = [
      mockResult({ grade: 'A' }),
      mockResult({ grade: 'A' }),
      mockResult({ grade: 'B' }),
      mockResult({ grade: 'F' }),
    ];
    const stats = SimReporter.computeStats(results);
    expect(stats.gradeDistribution).toEqual({ A: 2, B: 1, F: 1 });
  });

  it('적벽 승률 계산', () => {
    const results = [
      mockResult({ flags: { chibiVictory: true } }),
      mockResult({ flags: { chibiVictory: true } }),
      mockResult({ flags: {} }),
      mockResult({ flags: {} }),
    ];
    const stats = SimReporter.computeStats(results);
    expect(stats.winRate).toBe(0.5);
  });

  it('모드별 비교', () => {
    const results = [
      mockResult({ mode: 'A', flags: { chibiVictory: true } }),
      mockResult({ mode: 'A', flags: {} }),
      mockResult({ mode: 'B', flags: { chibiVictory: true } }),
    ];
    const stats = SimReporter.computeStats(results);
    expect(stats.modeComparison.A.winRate).toBe(0.5);
    expect(stats.modeComparison.B.winRate).toBe(1.0);
  });

  it('Thinking 비교', () => {
    const results = [
      mockResult({ thinking: false, grade: 'A' }),
      mockResult({ thinking: false, grade: 'B' }),
      mockResult({ thinking: true, grade: 'S' }),
    ];
    const stats = SimReporter.computeStats(results);
    expect(stats.thinkingComparison.fast.avgGrade).toBe(4.5); // (5+4)/2
    expect(stats.thinkingComparison.think.avgGrade).toBe(6); // S=6
  });

  it('평균 턴/시간 계산', () => {
    const results = [
      mockResult({ totalTurns: 10, duration: 2000 }),
      mockResult({ totalTurns: 20, duration: 4000 }),
    ];
    const stats = SimReporter.computeStats(results);
    expect(stats.avgTurns).toBe(15);
    expect(stats.avgDuration).toBe(3000);
  });
});
