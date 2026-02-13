import { describe, it, expect, beforeEach } from 'vitest';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';

describe('GameStateManager', () => {
  let manager: GameStateManager;

  beforeEach(() => {
    manager = new GameStateManager(createRedCliffsScenario('test'));
  });

  describe('읽기', () => {
    it('도시를 ID로 조회한다', () => {
      const gangha = manager.getCity('gangha');
      expect(gangha?.name).toBe('강하');
      expect(gangha?.owner).toBe('유비');
    });

    it('장수를 ID로 조회한다', () => {
      const guanyu = manager.getGeneral('guanyu');
      expect(guanyu?.name).toBe('관우');
      expect(guanyu?.abilities.martial).toBe('S');
    });

    it('세력별 도시를 조회한다', () => {
      const liubeiCities = manager.getCitiesByFaction('유비');
      expect(liubeiCities).toHaveLength(2);
      expect(liubeiCities.map(c => c.id).sort()).toEqual(['gangha', 'hagu']);
    });

    it('위치별 장수를 조회한다', () => {
      const ganghaGenerals = manager.getGeneralsByLocation('gangha');
      expect(ganghaGenerals.length).toBeGreaterThan(0);
      expect(ganghaGenerals.some(g => g.name === '유비')).toBe(true);
    });

    it('세력 총 병력을 계산한다', () => {
      const troops = manager.getTotalTroops('유비');
      expect(troops).toBe(5000 + 1000 + 2000 + 3000 + 500 + 1500); // 강하 + 하구
    });

    it('플레이어 세력을 반환한다', () => {
      const faction = manager.getPlayerFaction();
      expect(faction.id).toBe('유비');
    });

    it('외교 관계를 조회한다', () => {
      const relation = manager.getRelation('유비', '손권');
      expect(relation).toBeDefined();
      expect(relation!.relation).toBe('중립');
    });
  });

  describe('쓰기', () => {
    it('도시 정보를 업데이트한다', () => {
      manager.updateCity('gangha', { food: 5000 });
      expect(manager.getCity('gangha')!.food).toBe(5000);
    });

    it('장수 정보를 업데이트한다', () => {
      manager.updateGeneral('guanyu', { location: 'hagu' });
      expect(manager.getGeneral('guanyu')!.location).toBe('hagu');
    });

    it('행동을 소비한다', () => {
      expect(manager.getState().actionsRemaining).toBe(3);
      manager.useAction();
      expect(manager.getState().actionsRemaining).toBe(2);
      manager.useAction();
      manager.useAction();
      expect(manager.getState().actionsRemaining).toBe(0);
    });

    it('행동 초과 시 에러를 던진다', () => {
      manager.useAction();
      manager.useAction();
      manager.useAction();
      expect(() => manager.useAction()).toThrow('행동을 모두 소진');
    });

    it('행동 횟수를 리셋한다', () => {
      manager.useAction();
      manager.resetActions();
      expect(manager.getState().actionsRemaining).toBe(3);
    });

    it('턴을 진행시킨다', () => {
      expect(manager.getState().turn).toBe(1);
      manager.advanceTurn();
      expect(manager.getState().turn).toBe(2);
    });

    it('Phase를 설정한다', () => {
      manager.setPhase('battle');
      expect(manager.getState().phase).toBe('battle');
    });

    it('플래그를 설정/조회한다', () => {
      manager.setFlag('testKey', 42);
      expect(manager.getFlag('testKey')).toBe(42);
    });

    it('외교 관계 수치를 변경하고 레벨을 자동 갱신한다', () => {
      manager.addRelationValue('유비', '손권', 40);
      const relation = manager.getRelation('유비', '손권');
      // 45 + 40 = 85 → 긴밀
      expect(relation!.value).toBe(85);
      expect(relation!.relation).toBe('긴밀');
    });

    it('외교 수치는 0~100 범위로 클램핑된다', () => {
      manager.addRelationValue('유비', '손권', -200);
      expect(manager.getRelation('유비', '손권')!.value).toBe(0);

      manager.addRelationValue('유비', '손권', 500);
      expect(manager.getRelation('유비', '손권')!.value).toBe(100);
    });
  });

  describe('직렬화', () => {
    it('직렬화/역직렬화가 데이터를 유지한다', () => {
      manager.updateCity('gangha', { food: 1234 });
      manager.setFlag('testFlag', true);

      const json = manager.serialize();
      const restored = GameStateManager.deserialize(json);

      expect(restored.getCity('gangha')!.food).toBe(1234);
      expect(restored.getFlag('testFlag')).toBe(true);
      expect(restored.getState().generals).toHaveLength(15);
    });

    it('clone은 독립적인 복사본을 만든다', () => {
      const clone = manager.clone();
      clone.updateCity('gangha', { food: 0 });
      expect(manager.getCity('gangha')!.food).toBe(8000); // 원본 유지
    });
  });
});
