import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario, getScenarioEvents, CITIES, GENERALS, BATTLEFIELDS } from './red-cliffs.js';
import { ACTIONS_PER_TURN } from '../types.js';

describe('적벽대전 시나리오 데이터', () => {
  it('도시가 5개이다', () => {
    expect(CITIES).toHaveLength(5);
  });

  it('전투 지역이 1개이다', () => {
    expect(BATTLEFIELDS).toHaveLength(1);
    expect(BATTLEFIELDS[0].id).toBe('chibi');
  });

  it('장수가 15명이다', () => {
    expect(GENERALS).toHaveLength(15);
  });

  it('유비 진영 장수가 8명이다', () => {
    expect(GENERALS.filter(g => g.faction === '유비')).toHaveLength(8);
  });

  it('조조 진영 장수가 5명이다', () => {
    expect(GENERALS.filter(g => g.faction === '조조')).toHaveLength(5);
  });

  it('손권 진영 장수가 2명이다', () => {
    expect(GENERALS.filter(g => g.faction === '손권')).toHaveLength(2);
  });

  it('이벤트가 8개이다', () => {
    const events = getScenarioEvents();
    expect(events).toHaveLength(8);
  });

  it('도시 인접 관계가 유효하다', () => {
    for (const city of CITIES) {
      for (const adjId of city.adjacent) {
        const exists = CITIES.some(c => c.id === adjId) ||
                       BATTLEFIELDS.some(b => b.id === adjId);
        expect(exists, `${city.name}의 인접 ${adjId}가 존재하지 않음`).toBe(true);
      }
    }
  });

  it('모든 장수의 위치가 유효한 도시이다', () => {
    for (const general of GENERALS) {
      const validLocation = CITIES.some(c => c.id === general.location) ||
                            BATTLEFIELDS.some(b => b.id === general.location);
      expect(validLocation, `${general.name}의 위치 ${general.location}이 유효하지 않음`).toBe(true);
    }
  });
});

describe('createRedCliffsScenario', () => {
  it('유효한 초기 GameState를 반환한다', () => {
    const state = createRedCliffsScenario('test-game');
    expect(state.gameId).toBe('test-game');
    expect(state.scenarioId).toBe('red_cliffs');
    expect(state.turn).toBe(1);
    expect(state.maxTurns).toBe(20);
    expect(state.phase).toBe('preparation');
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.gameOver).toBe(false);
    expect(state.activeBattle).toBeNull();
    expect(state.cities).toHaveLength(5);
    expect(state.generals).toHaveLength(15);
    expect(state.factions).toHaveLength(3);
  });

  it('딥 카피를 반환한다 (원본 데이터 오염 방지)', () => {
    const state1 = createRedCliffsScenario();
    const state2 = createRedCliffsScenario();
    state1.cities[0].food = 0;
    expect(state2.cities[0].food).toBe(8000); // 원본 유지
  });

  it('플레이어 세력이 유비이다', () => {
    const state = createRedCliffsScenario();
    const playerFaction = state.factions.find(f => f.isPlayer);
    expect(playerFaction?.id).toBe('유비');
  });
});
