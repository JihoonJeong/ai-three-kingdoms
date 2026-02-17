import { describe, it, expect } from 'vitest';
import {
  calculateBProximity,
  estimateMaxTroopsAtCity,
  getNanjunMarchAttempts,
  getPostChibiTransfers,
  countActions,
  countDesertionEvents,
} from './b-proximity-score.js';
import type { SimResult, TurnLog } from '../sim-config.js';
import type { GameAction } from '../../core/data/types.js';

/** 테스트용 SimResult 생성 헬퍼 */
function makeSimResult(opts: {
  chibiVictory?: boolean;
  turnLogs?: TurnLog[];
  grade?: string;
}): SimResult {
  return {
    gameId: 'test',
    mode: 'A',
    thinking: false,
    seed: 42,
    provider: 'test',
    model: 'test',
    grade: opts.grade ?? 'C',
    title: '테스트',
    totalTurns: 20,
    duration: 1000,
    flags: opts.chibiVictory ? { chibiVictory: true } : {},
    turnLogs: opts.turnLogs ?? [],
    finalState: { cities: [], generals: [] },
  };
}

function makeAction(action: string, params?: Record<string, string>): GameAction {
  const typeMap: Record<string, string> = {
    transfer: 'domestic', march: 'military', conscript: 'domestic',
    develop: 'domestic', train: 'domestic', send_envoy: 'diplomacy',
    scout: 'military', recruit: 'domestic',
  };
  return {
    type: typeMap[action] || 'domestic',
    action,
    params: params ?? {},
  } as GameAction;
}

function makeTurnLog(turn: number, opts?: {
  actions?: Array<{ action: GameAction; result: { success: boolean; description: string } }>;
  events?: string[];
}): TurnLog {
  return {
    turn,
    phase: 'preparation',
    actions: opts?.actions ?? [],
    events: opts?.events ?? [],
    battles: [],
    aiActions: [],
  };
}

describe('B-Proximity Score', () => {
  it('적벽 미승리 → chibiVictory=0, 최대 15점 (conscript+food)', () => {
    const turnLogs = [
      makeTurnLog(1, {
        actions: [
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
        ],
      }),
      makeTurnLog(2, {
        actions: [
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
        ],
      }),
    ];
    const result = makeSimResult({ chibiVictory: false, turnLogs });
    const score = calculateBProximity(result);

    expect(score.chibiVictory).toBe(0);
    expect(score.total).toBeLessThanOrEqual(15);
    // conscript 5회 → 10점 + food 5점 = 15점
    expect(score.conscriptEffort).toBe(10);
    expect(score.foodManagement).toBe(5);
  });

  it('적벽 승리 + 아무것도 안함 → ~35점', () => {
    const turnLogs = [
      makeTurnLog(10, {
        events: ['적벽 대승 소식에 형주 4군의 태수들이 동요합니다.'],
      }),
    ];
    const result = makeSimResult({ chibiVictory: true, turnLogs });
    const score = calculateBProximity(result);

    expect(score.chibiVictory).toBe(30);
    expect(score.total).toBeGreaterThanOrEqual(30);
    expect(score.total).toBeLessThanOrEqual(40);
  });

  it('올바른 보급 + 남군 진군 시도 → 60점+', () => {
    const turnLogs = [
      makeTurnLog(10, {
        events: ['적벽 대승'],
      }),
      makeTurnLog(11, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '1500명 이동' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '1000명 징병' } },
        ],
      }),
      makeTurnLog(12, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '1200명 이동' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '800명 징병' } },
        ],
      }),
      makeTurnLog(13, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '800명 이동' } },
        ],
      }),
      makeTurnLog(14, {
        actions: [
          { action: makeAction('march', { from: 'gangha', to: 'nanjun' }), result: { success: true, description: '3000명으로 진군' } },
        ],
      }),
    ];
    const result = makeSimResult({ chibiVictory: true, turnLogs });
    const score = calculateBProximity(result);

    expect(score.chibiVictory).toBe(30);
    expect(score.postChibiTransfer).toBe(15); // 3회 → 만점
    expect(score.marchAttempt).toBeGreaterThanOrEqual(5);
    expect(score.total).toBeGreaterThanOrEqual(60);
  });

  it('탈영 이벤트가 많으면 foodManagement 감점', () => {
    const turnLogs = [
      makeTurnLog(5, { events: ['식량 부족으로 병사들이 탈영'] }),
      makeTurnLog(8, { events: ['식량 부족으로 병사들이 탈영'] }),
      makeTurnLog(12, { events: ['식량 부족으로 병사들이 탈영'] }),
    ];
    const result = makeSimResult({ chibiVictory: false, turnLogs });
    const score = calculateBProximity(result);

    expect(score.foodManagement).toBe(2); // 5 - 3 = 2
  });

  it('5회 이상 탈영이면 foodManagement 0점', () => {
    const events = Array.from({ length: 6 }, () => '병사 탈영 발생');
    const turnLogs = [makeTurnLog(5, { events })];
    const result = makeSimResult({ chibiVictory: false, turnLogs });
    const score = calculateBProximity(result);

    expect(score.foodManagement).toBe(0);
  });
});

describe('헬퍼 함수', () => {
  it('estimateMaxTroopsAtCity: 적벽 후 gangha transfer 병력 합산', () => {
    const turnLogs = [
      makeTurnLog(10, { events: ['적벽 대승'] }),
      makeTurnLog(11, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '2000명 이동' } },
        ],
      }),
      makeTurnLog(12, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '1500명 이동' } },
        ],
      }),
    ];

    const troops = estimateMaxTroopsAtCity(turnLogs, 'gangha', true);
    expect(troops).toBe(3500);
  });

  it('estimateMaxTroopsAtCity: 적벽 전 transfer는 무시 (afterChibi=true)', () => {
    const turnLogs = [
      makeTurnLog(3, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '2000명 이동' } },
        ],
      }),
      // 적벽 이벤트 없음
    ];

    const troops = estimateMaxTroopsAtCity(turnLogs, 'gangha', true);
    expect(troops).toBe(0);
  });

  it('getNanjunMarchAttempts: 남군 진군 시도 추출', () => {
    const turnLogs = [
      makeTurnLog(14, {
        actions: [
          { action: makeAction('march', { from: 'gangha', to: 'nanjun' }), result: { success: true, description: '4000명 진군' } },
        ],
      }),
      makeTurnLog(16, {
        actions: [
          { action: makeAction('march', { from: 'gangha', to: 'nanjun' }), result: { success: false, description: '인접하지 않습니다' } },
        ],
      }),
    ];
    const result = makeSimResult({ chibiVictory: true, turnLogs });
    const attempts = getNanjunMarchAttempts(result);

    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual({ turn: 14, troops: 4000 });
    expect(attempts[1]).toEqual({ turn: 16, troops: 0 });
  });

  it('getPostChibiTransfers: 적벽 후 hagu→gangha 성공만 카운트', () => {
    const turnLogs = [
      makeTurnLog(3, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '이동' } },
        ],
      }),
      makeTurnLog(10, { events: ['적벽 대승'] }),
      makeTurnLog(11, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '이동' } },
          { action: makeAction('transfer', { from: 'gangha', to: 'hagu' }), result: { success: true, description: '이동' } },
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: false, description: '실패' } },
        ],
      }),
      makeTurnLog(12, {
        actions: [
          { action: makeAction('transfer', { from: 'hagu', to: 'gangha' }), result: { success: true, description: '이동' } },
        ],
      }),
    ];
    const result = makeSimResult({ chibiVictory: true, turnLogs });
    const count = getPostChibiTransfers(result, 'hagu', 'gangha');

    // 턴3은 적벽 전 → 제외, 턴11 성공 1개(실패 제외, 역방향 제외), 턴12 성공 1개
    expect(count).toBe(2);
  });

  it('countActions: 성공한 conscript만 카운트', () => {
    const turnLogs = [
      makeTurnLog(1, {
        actions: [
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: true, description: '징병' } },
          { action: makeAction('conscript', { city: 'gangha' }), result: { success: false, description: '식량 부족' } },
          { action: makeAction('develop', { city: 'gangha' }), result: { success: true, description: '개발' } },
        ],
      }),
    ];
    const result = makeSimResult({ turnLogs });

    expect(countActions(result, 'conscript')).toBe(1);
    expect(countActions(result, 'develop')).toBe(1);
  });

  it('countDesertionEvents: 탈영/이탈 이벤트 카운트', () => {
    const turnLogs = [
      makeTurnLog(5, { events: ['식량 부족으로 탈영 발생', '적벽 대승'] }),
      makeTurnLog(6, { events: ['병력 이탈 발생'] }),
    ];
    const result = makeSimResult({ turnLogs });

    expect(countDesertionEvents(result)).toBe(2);
  });
});
