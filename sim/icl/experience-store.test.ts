import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { ExperienceStore } from './experience-store.js';
import type { GameExperience } from './experience-types.js';

function makeExperience(overrides: Partial<GameExperience> = {}): GameExperience {
  return {
    gameId: `game-${Math.random().toString(36).slice(2, 6)}`,
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
    lessons: ['교훈 없음'],
    turningPoints: [],
    ...overrides,
  };
}

const TEST_FILE = '/tmp/test-experience-store.json';

afterEach(() => {
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
});

describe('ExperienceStore', () => {
  describe('add & size', () => {
    it('경험 추가', () => {
      const store = new ExperienceStore();
      store.add(makeExperience());
      expect(store.size).toBe(1);
    });

    it('maxExperiences 초과 시 pruning', () => {
      const store = new ExperienceStore({ maxExperiences: 3 });
      store.add(makeExperience({ gameId: 'g1', gameNumber: 1 }));
      store.add(makeExperience({ gameId: 'g2', gameNumber: 2 }));
      store.add(makeExperience({ gameId: 'g3', gameNumber: 3 }));
      store.add(makeExperience({ gameId: 'g4', gameNumber: 4 }));

      expect(store.size).toBe(3);
    });

    it('pruning 시 승리 경험 보호', () => {
      const store = new ExperienceStore({ maxExperiences: 2 });
      store.add(makeExperience({ gameId: 'win', chibiVictory: true, grade: 'C' }));
      store.add(makeExperience({ gameId: 'loss1' }));
      store.add(makeExperience({ gameId: 'loss2' }));

      expect(store.size).toBe(2);
      const all = store.getAll();
      expect(all.some(e => e.gameId === 'win')).toBe(true);
    });
  });

  describe('selectForPrompt — balanced', () => {
    it('최고 성적 + 최근 + 실패', () => {
      const store = new ExperienceStore({ selectionStrategy: 'balanced' });
      store.add(makeExperience({ gameId: 'loss1', gameNumber: 1, grade: 'D' }));
      store.add(makeExperience({ gameId: 'win1', gameNumber: 2, grade: 'C', chibiVictory: true }));
      store.add(makeExperience({ gameId: 'loss2', gameNumber: 3, grade: 'D' }));
      store.add(makeExperience({ gameId: 'recent', gameNumber: 4, grade: 'D' }));

      const selected = store.selectForPrompt();
      expect(selected.length).toBe(3);

      const ids = selected.map(e => e.gameId);
      // 최고 성적 = win1
      expect(ids).toContain('win1');
      // 최근 = recent (best와 다른 것)
      expect(ids).toContain('recent');
      // 실패 = loss1 (가장 오래된 실패)
      expect(ids).toContain('loss1');
    });

    it('경험 1개일 때 1개만 반환', () => {
      const store = new ExperienceStore({ selectionStrategy: 'balanced' });
      store.add(makeExperience({ gameId: 'only' }));

      const selected = store.selectForPrompt();
      expect(selected.length).toBe(1);
    });

    it('빈 저장소에서 빈 배열 반환', () => {
      const store = new ExperienceStore();
      expect(store.selectForPrompt()).toEqual([]);
    });
  });

  describe('selectForPrompt — recent', () => {
    it('최근 3개 반환', () => {
      const store = new ExperienceStore({ selectionStrategy: 'recent' });
      for (let i = 1; i <= 5; i++) {
        store.add(makeExperience({ gameId: `g${i}`, gameNumber: i }));
      }

      const selected = store.selectForPrompt();
      expect(selected.length).toBe(3);
      expect(selected.map(e => e.gameId)).toEqual(['g3', 'g4', 'g5']);
    });
  });

  describe('selectForPrompt — best', () => {
    it('등급순 상위 3개 반환', () => {
      const store = new ExperienceStore({ selectionStrategy: 'best' });
      store.add(makeExperience({ gameId: 'a', grade: 'D' }));
      store.add(makeExperience({ gameId: 'b', grade: 'A' }));
      store.add(makeExperience({ gameId: 'c', grade: 'B' }));
      store.add(makeExperience({ gameId: 'd', grade: 'C' }));

      const selected = store.selectForPrompt();
      expect(selected[0].grade).toBe('A');
      expect(selected[1].grade).toBe('B');
      expect(selected[2].grade).toBe('C');
    });
  });

  describe('save & load', () => {
    it('round-trip 저장/로드', () => {
      const store = new ExperienceStore({ maxExperiences: 10 });
      store.add(makeExperience({ gameId: 'saved1', grade: 'C', chibiVictory: true }));
      store.add(makeExperience({ gameId: 'saved2', grade: 'D' }));
      store.save(TEST_FILE);

      const loaded = ExperienceStore.load(TEST_FILE);
      expect(loaded.size).toBe(2);
      const all = loaded.getAll();
      expect(all[0].gameId).toBe('saved1');
      expect(all[1].gameId).toBe('saved2');
    });
  });

  describe('getStats', () => {
    it('빈 저장소 통계', () => {
      const store = new ExperienceStore();
      const stats = store.getStats();
      expect(stats.totalGames).toBe(0);
      expect(stats.learningTrend).toBe('insufficient_data');
    });

    it('5개 미만 — insufficient_data', () => {
      const store = new ExperienceStore();
      store.add(makeExperience({ grade: 'D' }));
      store.add(makeExperience({ grade: 'C', chibiVictory: true }));

      const stats = store.getStats();
      expect(stats.totalGames).toBe(2);
      expect(stats.winRate).toBe(0.5);
      expect(stats.learningTrend).toBe('insufficient_data');
    });

    it('improving 트렌드 감지', () => {
      const store = new ExperienceStore();
      // 초반 5개: 전패
      for (let i = 0; i < 5; i++) {
        store.add(makeExperience({ gameNumber: i + 1, grade: 'D' }));
      }
      // 후반 5개: 승리 포함
      for (let i = 5; i < 10; i++) {
        store.add(makeExperience({
          gameNumber: i + 1,
          grade: i >= 8 ? 'C' : 'D',
          chibiVictory: i >= 8,
        }));
      }

      const stats = store.getStats();
      expect(stats.learningTrend).toBe('improving');
    });

    it('stagnant 트렌드 감지', () => {
      const store = new ExperienceStore();
      for (let i = 0; i < 10; i++) {
        store.add(makeExperience({ gameNumber: i + 1, grade: 'D' }));
      }

      const stats = store.getStats();
      expect(stats.learningTrend).toBe('stagnant');
    });
  });
});
