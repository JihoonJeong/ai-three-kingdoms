import { describe, it, expect, beforeEach } from 'vitest';
import { BattleEngine } from './battle-engine.js';
import type { BattleState, General } from '../data/types.js';

describe('BattleEngine', () => {
  let engine: BattleEngine;
  const fixedRng = () => 0.5;

  beforeEach(() => {
    engine = new BattleEngine(fixedRng);
  });

  const mockGenerals: General[] = [
    {
      id: 'guanyu', name: '관우', courtesyName: '운장', faction: '유비',
      role: '무장', abilities: { command: 'A', martial: 'S', intellect: 'B', politics: 'C', charisma: 'A' },
      skills: ['위풍', '수전', '돌격'], loyalty: '절대', location: 'chibi',
      condition: '양호', historicalNote: '',
    },
    {
      id: 'xiahouyuan', name: '하후연', courtesyName: '묘재', faction: '조조',
      role: '무장', abilities: { command: 'A', martial: 'A', intellect: 'C', politics: 'D', charisma: 'B' },
      skills: ['기병', '돌격', '속전'], loyalty: '절대', location: 'chibi',
      condition: '양호', historicalNote: '',
    },
  ];

  describe('initBattle', () => {
    it('유효한 전투 상태를 생성한다', () => {
      const battle = engine.initBattle({
        location: 'chibi',
        terrain: '수상',
        weather: '맑음',
        attackerFaction: '유비',
        attackerGenerals: ['guanyu'],
        attackerTroops: 5000,
        defenderFaction: '조조',
        defenderGenerals: ['xiahouyuan'],
        defenderTroops: 8000,
      });

      expect(battle.battleId).toBeTruthy();
      expect(battle.location).toBe('chibi');
      expect(battle.terrain).toBe('수상');
      expect(battle.battleTurn).toBe(1);
      expect(battle.maxBattleTurns).toBe(4);
      expect(battle.attackers.troops).toBe(5000);
      expect(battle.defenders.troops).toBe(8000);
      expect(battle.isOver).toBe(false);
      expect(battle.availableTactics.length).toBeGreaterThan(0);
    });

    it('연환진 방어 진형을 설정한다', () => {
      const battle = engine.initBattle({
        location: 'chibi',
        terrain: '수상',
        weather: '맑음',
        attackerFaction: '유비',
        attackerGenerals: ['guanyu'],
        attackerTroops: 5000,
        defenderFaction: '조조',
        defenderGenerals: ['xiahouyuan'],
        defenderTroops: 8000,
        defenderFormation: '연환진',
      });

      expect(battle.defenders.formation).toBe('연환진');
    });
  });

  describe('getAvailableTactics', () => {
    it('기본 전술이 항상 포함된다', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '평야', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      const tacticIds = battle.availableTactics.map(t => t.id);
      expect(tacticIds).toContain('frontal_assault');
      expect(tacticIds).toContain('defend');
    });

    it('수상전에서 화선이 가능하다', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      const tacticIds = battle.availableTactics.map(t => t.id);
      expect(tacticIds).toContain('fire_ships');
    });

    it('평지에서 화선은 불가능하다', () => {
      const battle = engine.initBattle({
        location: 'field', terrain: '평야', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      const tacticIds = battle.availableTactics.map(t => t.id);
      expect(tacticIds).not.toContain('fire_ships');
    });

    it('연환진 시 화공이 가능하다', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
        defenderFormation: '연환진',
      });

      const tacticIds = battle.availableTactics.map(t => t.id);
      expect(tacticIds).toContain('fire_attack');
    });
  });

  describe('executeTactic', () => {
    it('전투 턴이 진행된다', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: ['guanyu'], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: ['xiahouyuan'], defenderTroops: 5000,
      });

      const result = engine.executeTactic(battle, 'frontal_assault', mockGenerals);
      expect(result.log.battleTurn).toBe(1);
      expect(battle.battleTurn).toBe(2);
      expect(result.log.attackerCasualties).toBeGreaterThanOrEqual(0);
      expect(result.log.defenderCasualties).toBeGreaterThanOrEqual(0);
    });

    it('화공 + 연환진 + 동남풍이면 대규모 피해', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '동남풍',
        attackerFaction: '유비', attackerGenerals: ['guanyu'], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: ['xiahouyuan'], defenderTroops: 10000,
        defenderFormation: '연환진',
      });

      const result = engine.executeTactic(battle, 'fire_attack', mockGenerals);
      // 연환진 x2 + 동남풍 x1.5 = 공격력 크게 증가
      expect(result.log.defenderCasualties).toBeGreaterThan(result.log.attackerCasualties);
    });

    it('종료된 전투에서 전술 실행 시 에러', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });
      battle.isOver = true;

      expect(() => engine.executeTactic(battle, 'frontal_assault', [])).toThrow('이미 종료');
    });
  });

  describe('checkBattleEnd', () => {
    it('병력 30% 이하면 패배', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      battle.defenders.troops = 1000; // 20%
      const check = engine.checkBattleEnd(battle);
      expect(check.isOver).toBe(true);
      expect(check.result?.winner).toBe('유비');
    });

    it('사기 20 이하면 패배', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      battle.attackers.morale = 15;
      const check = engine.checkBattleEnd(battle);
      expect(check.isOver).toBe(true);
      expect(check.result?.winner).toBe('조조');
    });

    it('양쪽 다 패배 조건이면 무승부', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      battle.attackers.troops = 1000;
      battle.defenders.troops = 1000;
      const check = engine.checkBattleEnd(battle);
      expect(check.isOver).toBe(true);
      expect(check.result?.winner).toBeNull();
    });

    it('최대 턴 초과 시 전투 종료', () => {
      const battle = engine.initBattle({
        location: 'chibi', terrain: '수상', weather: '맑음',
        attackerFaction: '유비', attackerGenerals: [], attackerTroops: 5000,
        defenderFaction: '조조', defenderGenerals: [], defenderTroops: 5000,
      });

      battle.battleTurn = 5; // > maxBattleTurns (4)
      const check = engine.checkBattleEnd(battle);
      expect(check.isOver).toBe(true);
    });
  });
});
