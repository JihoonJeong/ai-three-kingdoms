// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헤드리스 시뮬레이터 테스트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { describe, it, expect } from 'vitest';
import { HeadlessSimulator } from './headless-sim.js';
import { createSeededRng } from './seeded-rng.js';
import type { SimConfig } from './sim-config.js';

function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    gameId: 'test-1',
    mode: 'A',
    thinking: false,
    model: 'test',
    directOllama: true,
    useLLMFactionAI: false,
    battleAI: 'rule',
    seed: 42,
    verbose: false,
    ...overrides,
  };
}

describe('createSeededRng', () => {
  it('같은 seed → 같은 난수열', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('다른 seed → 다른 난수열', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('[0, 1) 범위 출력', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('HeadlessSimulator', () => {
  it('playerAI 없이 게임 완주 (pass 모드)', async () => {
    const config = makeConfig({ gameId: 'pass-test', seed: 42 });
    const sim = new HeadlessSimulator(config);
    const result = await sim.runGame();

    expect(result.gameId).toBe('pass-test');
    expect(result.totalTurns).toBeGreaterThan(0);
    expect(result.grade).toBeTruthy();
    expect(result.turnLogs.length).toBeGreaterThan(0);
    expect(result.finalState.cities.length).toBeGreaterThan(0);
    expect(result.finalState.generals.length).toBeGreaterThan(0);
  });

  it('결정적 실행: 같은 seed → 같은 결과', async () => {
    const config = makeConfig({ seed: 777 });
    const sim1 = new HeadlessSimulator(config);
    const sim2 = new HeadlessSimulator(config);

    const r1 = await sim1.runGame();
    const r2 = await sim2.runGame();

    expect(r1.grade).toBe(r2.grade);
    expect(r1.totalTurns).toBe(r2.totalTurns);
    expect(r1.turnLogs.length).toBe(r2.turnLogs.length);
  });

  it('다른 seed → 다른 결과 가능', async () => {
    const configs = [10, 20, 30, 40, 50].map(seed => makeConfig({ seed, gameId: `seed-${seed}` }));
    const results = await Promise.all(configs.map(c => new HeadlessSimulator(c).runGame()));

    // 5개 중 적어도 2개는 다른 결과를 가져야 함 (극히 낮은 확률로 모두 같을 수 있지만 실질적으로 불가)
    const grades = results.map(r => r.grade);
    const turns = results.map(r => r.totalTurns);
    // pass 모드에서는 플레이어 행동이 없어 결과가 비슷할 수 있지만,
    // seed에 따라 이벤트/전투 확률이 달라져 turnLogs 내용이 다를 수 있음
    const allLogs = results.map(r => JSON.stringify(r.turnLogs));
    const uniqueLogs = new Set(allLogs);
    expect(uniqueLogs.size).toBeGreaterThanOrEqual(2);
  });

  it('turnLogs에 이벤트/AI 행동이 기록됨', async () => {
    const config = makeConfig({ seed: 42 });
    const sim = new HeadlessSimulator(config);
    const result = await sim.runGame();

    // 이벤트가 하나라도 발생했어야 함 (적벽 시나리오에는 다수 이벤트 존재)
    const totalEvents = result.turnLogs.reduce((sum, t) => sum + t.events.length, 0);
    expect(totalEvents).toBeGreaterThan(0);

    // AI 행동도 기록되어야 함 (조조/손권의 하드코딩 전략)
    const totalAiActions = result.turnLogs.reduce((sum, t) => sum + t.aiActions.length, 0);
    expect(totalAiActions).toBeGreaterThan(0);
  });

  it('AI 전투가 발생하고 해결됨', async () => {
    // 다양한 seed로 시도하여 전투 발생 확인
    const seeds = [42, 100, 200, 300, 400];
    let battleFound = false;
    for (const seed of seeds) {
      const config = makeConfig({ seed, gameId: `battle-${seed}` });
      const sim = new HeadlessSimulator(config);
      const result = await sim.runGame();
      const totalBattles = result.turnLogs.reduce((sum, t) => sum + t.battles.length, 0);
      if (totalBattles > 0) {
        battleFound = true;
        // 전투 로그 구조 검증
        const firstBattle = result.turnLogs.find(t => t.battles.length > 0)!.battles[0];
        expect(firstBattle.location).toBeTruthy();
        expect(firstBattle.attacker).toBeTruthy();
        expect(firstBattle.defender).toBeTruthy();
        expect(firstBattle.turns.length).toBeGreaterThan(0);
        break;
      }
    }
    expect(battleFound).toBe(true);
  });

  it('SimResult 필드가 모두 채워짐', async () => {
    const config = makeConfig({ seed: 42 });
    const sim = new HeadlessSimulator(config);
    const result = await sim.runGame();

    expect(result.mode).toBe('A');
    expect(result.thinking).toBe(false);
    expect(result.seed).toBe(42);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.flags).toBe('object');
    expect(result.title).toBeTruthy();
  });
});
