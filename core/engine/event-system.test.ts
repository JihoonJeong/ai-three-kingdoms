import { describe, it, expect, beforeEach } from 'vitest';
import { EventSystem } from './event-system.js';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario, getScenarioEvents } from '../data/scenarios/red-cliffs.js';

describe('EventSystem', () => {
  let stateManager: GameStateManager;
  let eventSystem: EventSystem;

  beforeEach(() => {
    stateManager = new GameStateManager(createRedCliffsScenario('test'));
    eventSystem = new EventSystem(getScenarioEvents(), () => 0.5);
  });

  describe('checkTriggers', () => {
    it('턴 1에는 이벤트가 발동되지 않는다', () => {
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered).toHaveLength(0);
    });

    it('턴 2에 cao_advance가 발동된다', () => {
      stateManager.advanceTurn(); // turn 2
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'cao_advance')).toBe(true);
    });

    it('턴 3에 동맹 미시작 시 lusu_visit이 발동된다', () => {
      stateManager.advanceTurn(); // 2
      stateManager.advanceTurn(); // 3
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'lusu_visit')).toBe(true);
    });

    it('턴 3에 동맹 시작됐으면 lusu_visit이 발동되지 않는다', () => {
      stateManager.setFlag('allianceStarted', true);
      stateManager.advanceTurn(); // 2
      stateManager.advanceTurn(); // 3
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'lusu_visit')).toBe(false);
    });

    it('턴 5에 plague_in_cao_army가 발동된다', () => {
      for (let i = 0; i < 4; i++) stateManager.advanceTurn();
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'plague_in_cao_army')).toBe(true);
    });

    it('턴 7에 채모 생존 시 chain_formation이 발동된다', () => {
      for (let i = 0; i < 6; i++) stateManager.advanceTurn();
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'chain_formation')).toBe(true);
    });

    it('턴 7에 채모 사망 시 chain_formation이 발동되지 않는다', () => {
      stateManager.updateGeneral('caimao', { condition: '사망' });
      for (let i = 0; i < 6; i++) stateManager.advanceTurn();
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'chain_formation')).toBe(false);
    });

    it('동남풍은 턴 10-14 범위에서 확률적으로 발동된다', () => {
      // rng = 0.5, probability = 0.7 → 0.5 < 0.7 → 발동
      for (let i = 0; i < 9; i++) stateManager.advanceTurn(); // turn 10
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'southeast_wind')).toBe(true);
    });

    it('chibi_victory 플래그 시 후속 이벤트가 발동된다', () => {
      stateManager.setFlag('chibiVictory', true);
      const triggered = eventSystem.checkTriggers(stateManager.getState());
      expect(triggered.some(e => e.id === 'jingzhou_surrender')).toBe(true);
      expect(triggered.some(e => e.id === 'cao_cao_retreat')).toBe(true);
    });
  });

  describe('processTurn', () => {
    it('발동된 이벤트를 완료 목록에 추가한다', () => {
      stateManager.advanceTurn(); // turn 2
      eventSystem.processTurn(stateManager);
      expect(stateManager.isEventCompleted('cao_advance')).toBe(true);
    });

    it('같은 이벤트가 두 번 발동되지 않는다', () => {
      stateManager.advanceTurn(); // turn 2
      const results1 = eventSystem.processTurn(stateManager);
      expect(results1.length).toBeGreaterThan(0);

      // 다시 processTurn (같은 턴)
      const results2 = eventSystem.processTurn(stateManager);
      expect(results2.filter(r => r.eventId === 'cao_advance')).toHaveLength(0);
    });

    it('이벤트 효과가 적용된다', () => {
      stateManager.advanceTurn(); // turn 2
      eventSystem.processTurn(stateManager);
      // cao_advance: urgency_increase 효과
      expect(stateManager.getFlag('urgency')).toBe(1);
    });
  });

  describe('효과 적용', () => {
    it('enemy_debuff가 적 도시 사기를 하락시킨다', () => {
      const moraleBefore = stateManager.getCity('nanjun')!.morale;
      for (let i = 0; i < 4; i++) stateManager.advanceTurn(); // turn 5
      eventSystem.processTurn(stateManager);
      // plague_in_cao_army: morale -15 for 조조 cities
      expect(stateManager.getCity('nanjun')!.morale).toBe(moraleBefore - 15);
    });

    it('enemy_formation이 플래그를 설정한다', () => {
      for (let i = 0; i < 6; i++) stateManager.advanceTurn(); // turn 7
      eventSystem.processTurn(stateManager);
      expect(stateManager.getFlag('enemy_formation')).toBe('연환진');
    });
  });
});
