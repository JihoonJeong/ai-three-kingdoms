import { describe, it, expect } from 'vitest';
import { ExperienceExtractor } from './experience-extractor.js';
import type { SimResult, TurnLog } from '../sim-config.js';

/** 테스트용 최소 SimResult 생성 */
function makeResult(overrides: Partial<SimResult> = {}): SimResult {
  return {
    gameId: 'test-1',
    mode: 'A',
    thinking: false,
    seed: 42,
    provider: 'ollama',
    model: 'test',
    grade: 'D',
    title: '패배',
    totalTurns: 20,
    duration: 1000,
    flags: {},
    turnLogs: [],
    finalState: {
      cities: [
        { id: 'gangha', owner: '유비', troops: 3000 },
        { id: 'hagu', owner: '유비', troops: 2000 },
      ],
      generals: [
        { id: 'liubei', faction: '유비', condition: '양호', location: 'gangha' },
        { id: 'guanyu', faction: '유비', condition: '양호', location: 'hagu' },
      ],
    },
    ...overrides,
  };
}

function makeTurnLog(turn: number, actions: Array<{ actionName: string; params?: Record<string, string>; success?: boolean }>): TurnLog {
  return {
    turn,
    phase: 'preparation',
    actions: actions.map(a => ({
      action: {
        type: ['march', 'scout', 'fortify', 'ambush'].includes(a.actionName) ? 'military' :
              ['send_envoy', 'persuade', 'threaten', 'gift'].includes(a.actionName) ? 'diplomacy' : 'domestic',
        action: a.actionName,
        params: a.params || {},
      } as any,
      result: { success: a.success ?? true, description: `${a.actionName} 성공` },
    })),
    events: [],
    battles: [],
    aiActions: [],
  };
}

describe('ExperienceExtractor', () => {
  describe('extractProfile', () => {
    it('기본 행동 집계', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'develop' }, { actionName: 'train' }, { actionName: 'develop' }]),
          makeTurnLog(2, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      expect(profile.actionCounts['develop']).toBe(2);
      expect(profile.actionCounts['train']).toBe(1);
      expect(profile.actionCounts['transfer']).toBe(1);
    });

    it('transfer 패턴 분석 — 집중 타겟', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(5, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(6, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(7, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      expect(profile.transferPattern.totalTransfers).toBe(3);
      expect(profile.transferPattern.concentrationTarget).toBe('hagu');
    });

    it('첫 march 턴 감지', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'develop' }]),
          makeTurnLog(9, [{ actionName: 'march', params: { from: 'hagu', to: 'chibi', generals: ['liubei'] as any } }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      expect(profile.firstMarchTurn).toBe(9);
      expect(profile.marchTargets).toContain('chibi');
    });

    it('march 없으면 firstMarchTurn = null', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'develop' }]),
          makeTurnLog(2, [{ actionName: 'develop' }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      expect(profile.firstMarchTurn).toBeNull();
    });
  });

  describe('extractPartialProfile', () => {
    it('부분 턴 로그에서 프로파일 추출', () => {
      const logs: TurnLog[] = [
        makeTurnLog(1, [{ actionName: 'train' }, { actionName: 'develop' }]),
        makeTurnLog(2, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
      ];

      const profile = ExperienceExtractor.extractPartialProfile(logs);
      expect(profile.actionCounts['train']).toBe(1);
      expect(profile.transferPattern.totalTransfers).toBe(1);
    });
  });

  describe('extractLessons', () => {
    it('패배 — 보급 미사용 교훈', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'develop' }, { actionName: 'develop' }, { actionName: 'develop' }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      const lessons = ExperienceExtractor.extractLessons(result, profile);
      expect(lessons.some(l => l.includes('보급(transfer)'))).toBe(true);
    });

    it('패배 — 진군 미실시 교훈', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'develop' }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      const lessons = ExperienceExtractor.extractLessons(result, profile);
      expect(lessons.some(l => l.includes('진군(march)'))).toBe(true);
    });

    it('패배 — 과도한 개발 교훈', () => {
      const logs = Array.from({ length: 5 }, (_, i) =>
        makeTurnLog(i + 1, [{ actionName: 'develop' }, { actionName: 'develop' }])
      );

      const result = makeResult({ turnLogs: logs });
      const profile = ExperienceExtractor.extractProfile(result);
      const lessons = ExperienceExtractor.extractLessons(result, profile);
      expect(lessons.some(l => l.includes('개발(develop)'))).toBe(true);
    });

    it('승리 — 보급 성공 교훈', () => {
      const result = makeResult({
        flags: { chibiVictory: true },
        grade: 'C',
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(2, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(3, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(12, [{ actionName: 'march', params: { from: 'hagu', to: 'chibi' } }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      const lessons = ExperienceExtractor.extractLessons(result, profile);
      expect(lessons.some(l => l.includes('보급(transfer)'))).toBe(true);
    });

    it('최대 3개 교훈', () => {
      const result = makeResult({
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'send_envoy' }, { actionName: 'send_envoy' }, { actionName: 'gift' }]),
          makeTurnLog(2, [{ actionName: 'send_envoy' }, { actionName: 'gift' }, { actionName: 'gift' }]),
        ],
      });

      const profile = ExperienceExtractor.extractProfile(result);
      const lessons = ExperienceExtractor.extractLessons(result, profile);
      expect(lessons.length).toBeLessThanOrEqual(3);
    });
  });

  describe('detectPhases (via extractProfile)', () => {
    it('3단계 전략 감지', () => {
      const logs = [
        makeTurnLog(1, [{ actionName: 'develop' }, { actionName: 'conscript' }]),
        makeTurnLog(2, [{ actionName: 'develop' }, { actionName: 'develop' }]),
        makeTurnLog(3, [{ actionName: 'develop' }, { actionName: 'recruit' }]),
        makeTurnLog(5, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }, { actionName: 'train' }]),
        makeTurnLog(6, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }, { actionName: 'train' }]),
        makeTurnLog(7, [{ actionName: 'train' }, { actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
        makeTurnLog(10, [{ actionName: 'march', params: { from: 'hagu', to: 'chibi' } }]),
        makeTurnLog(11, [{ actionName: 'march', params: { from: 'hagu', to: 'nanjun' } }]),
      ];

      const result = makeResult({ turnLogs: logs });
      const profile = ExperienceExtractor.extractProfile(result);
      expect(profile.phases.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extract (전체 변환)', () => {
    it('승리 게임 — chibiVictory, transfer, march', () => {
      const result = makeResult({
        gameId: 'win-1',
        grade: 'C',
        totalTurns: 17,
        flags: { chibiVictory: true },
        turnLogs: [
          makeTurnLog(1, [{ actionName: 'train' }]),
          makeTurnLog(5, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(6, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(7, [{ actionName: 'transfer', params: { from: 'gangha', to: 'hagu' } }]),
          makeTurnLog(12, [{ actionName: 'march', params: { from: 'hagu', to: 'chibi' } }]),
        ],
        finalState: {
          cities: [
            { id: 'gangha', owner: '유비', troops: 1000 },
            { id: 'hagu', owner: '유비', troops: 5000 },
            { id: 'chibi', owner: '유비', troops: 3000 },
          ],
          generals: [
            { id: 'liubei', faction: '유비', condition: '양호', location: 'chibi' },
          ],
        },
      });

      const exp = ExperienceExtractor.extract(result, 1);
      expect(exp.chibiVictory).toBe(true);
      expect(exp.grade).toBe('C');
      expect(exp.strategyProfile.transferPattern.totalTransfers).toBe(3);
      expect(exp.strategyProfile.firstMarchTurn).toBe(12);
      expect(exp.citiesCaptured).toContain('chibi');
      expect(exp.lessons.length).toBeGreaterThan(0);
    });

    it('패배 게임 — march 없음', () => {
      const result = makeResult({
        turnLogs: Array.from({ length: 7 }, (_, i) =>
          makeTurnLog(i + 1, [{ actionName: 'develop' }, { actionName: 'develop' }, { actionName: 'send_envoy' }])
        ),
      });

      const exp = ExperienceExtractor.extract(result, 2);
      expect(exp.chibiVictory).toBe(false);
      expect(exp.strategyProfile.firstMarchTurn).toBeNull();
      expect(exp.lessons.some(l => l.includes('진군'))).toBe(true);
    });

    it('장수 손실 감지', () => {
      const result = makeResult({
        finalState: {
          cities: [{ id: 'gangha', owner: '유비', troops: 1000 }],
          generals: [
            { id: 'liubei', faction: '유비', condition: '포로', location: 'nanjun' },
            { id: 'guanyu', faction: '유비', condition: '양호', location: 'gangha' },
          ],
        },
        turnLogs: [makeTurnLog(1, [{ actionName: 'develop' }])],
      });

      const exp = ExperienceExtractor.extract(result, 1);
      expect(exp.generalsLost).toContain('liubei');
      expect(exp.generalsLost).not.toContain('guanyu');
    });
  });
});
