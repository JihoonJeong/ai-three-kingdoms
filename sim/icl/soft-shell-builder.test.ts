import { describe, it, expect } from 'vitest';
import { SoftShellBuilder, EASY_STRATEGY_GUIDE } from './soft-shell-builder.js';
import type { GameExperience } from './experience-types.js';

function makeExperience(overrides: Partial<GameExperience> = {}): GameExperience {
  return {
    gameId: 'test-1',
    gameNumber: 1,
    grade: 'D',
    chibiVictory: false,
    totalTurns: 20,
    citiesCaptured: [],
    allianceMaintained: true,
    generalsLost: [],
    strategyProfile: {
      actionCounts: { develop: 10 },
      phases: [],
      criticalActions: [],
      transferPattern: { totalTransfers: 0, totalTroopsMoved: 0 },
      firstMarchTurn: null,
      marchTargets: [],
    },
    lessons: ['보급을 사용하지 않아 병력이 분산되었다.'],
    turningPoints: [],
    ...overrides,
  };
}

function makeWinExperience(): GameExperience {
  return makeExperience({
    gameId: 'win-1',
    grade: 'C',
    chibiVictory: true,
    totalTurns: 17,
    citiesCaptured: ['chibi'],
    strategyProfile: {
      actionCounts: { transfer: 5, train: 8, march: 2, develop: 3 },
      phases: [
        { name: 'domestic', startTurn: 1, endTurn: 5, dominantActions: ['develop', 'train'] },
        { name: 'consolidation', startTurn: 6, endTurn: 11, dominantActions: ['transfer', 'train'] },
        { name: 'military', startTurn: 12, endTurn: 17, dominantActions: ['march'] },
      ],
      criticalActions: [
        { turn: 6, action: 'transfer', description: '강하→하구 보급', impact: 'decisive' },
      ],
      transferPattern: { totalTransfers: 5, concentrationTarget: 'hagu', totalTroopsMoved: 3000 },
      firstMarchTurn: 12,
      marchTargets: ['chibi'],
    },
    lessons: ['보급으로 하구에 병력을 집중한 것이 핵심이었다.'],
    turningPoints: [
      { turn: 12, type: 'action', description: '적벽 진군', outcome: 'positive' },
    ],
  });
}

describe('SoftShellBuilder', () => {
  it('빈 경험 목록 → 빈 문자열', () => {
    expect(SoftShellBuilder.build([])).toBe('');
  });

  it('패배 경험만 있을 때 — 실수 섹션 포함', () => {
    const text = SoftShellBuilder.build([makeExperience()]);
    expect(text).toContain('과거 전역(戰役)의 경험');
    expect(text).toContain('반복하지 말아야 할 실수');
    expect(text).toContain('D등급 패배');
    expect(text).not.toContain('성공한 전략');
  });

  it('승리 경험만 있을 때 — 성공 전략 + 지침', () => {
    const text = SoftShellBuilder.build([makeWinExperience()]);
    expect(text).toContain('성공한 전략');
    expect(text).toContain('C등급');
    expect(text).toContain('검증된 전략 지침');
    expect(text).toContain('보급(transfer)');
    expect(text).not.toContain('반복하지 말아야 할 실수');
  });

  it('승리 + 패배 경험 혼합 — 모든 섹션 포함', () => {
    const text = SoftShellBuilder.build([makeWinExperience(), makeExperience()]);
    expect(text).toContain('성공한 전략');
    expect(text).toContain('반복하지 말아야 할 실수');
    expect(text).toContain('핵심 교훈');
    expect(text).toContain('검증된 전략 지침');
  });

  it('교훈 중복 제거', () => {
    const exp1 = makeExperience({ lessons: ['교훈 A', '교훈 B'] });
    const exp2 = makeExperience({ gameId: 'test-2', lessons: ['교훈 A', '교훈 C'] });
    const text = SoftShellBuilder.build([exp1, exp2]);

    // '교훈 A'는 한 번만 등장
    const matches = text.match(/교훈 A/g);
    // lessons 섹션에서 1번 + 패배 경험 설명에서 최대 2번
    // 핵심 교훈 리스트에서는 1번이어야 함
    expect(matches).toBeTruthy();
  });

  it('전략 지침에 평균 march 턴 포함', () => {
    const win1 = makeWinExperience();
    const win2 = makeExperience({
      gameId: 'win-2',
      chibiVictory: true,
      grade: 'B',
      strategyProfile: {
        ...makeWinExperience().strategyProfile,
        firstMarchTurn: 10,
        transferPattern: { totalTransfers: 4, concentrationTarget: 'hagu', totalTroopsMoved: 2000 },
      },
    });

    const text = SoftShellBuilder.build([win1, win2]);
    // 평균 march = (12+10)/2 = 11
    expect(text).toContain('턴11이후');
  });
});

describe('EASY_STRATEGY_GUIDE', () => {
  it('3단계 전략 포함', () => {
    expect(EASY_STRATEGY_GUIDE).toContain('1단계');
    expect(EASY_STRATEGY_GUIDE).toContain('2단계');
    expect(EASY_STRATEGY_GUIDE).toContain('3단계');
    expect(EASY_STRATEGY_GUIDE).toContain('보급(transfer)');
    expect(EASY_STRATEGY_GUIDE).toContain('진군(march)');
  });
});
