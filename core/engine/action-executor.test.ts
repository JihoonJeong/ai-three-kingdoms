import { describe, it, expect, beforeEach } from 'vitest';
import { ActionExecutor } from './action-executor.js';
import { BattleEngine } from './battle-engine.js';
import { GameStateManager } from './game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import type { GameAction } from '../data/types.js';

describe('ActionExecutor', () => {
  let stateManager: GameStateManager;
  let executor: ActionExecutor;
  const fixedRng = () => 0.1; // 낮은 값 = 대부분 성공

  beforeEach(() => {
    stateManager = new GameStateManager(createRedCliffsScenario('test'));
    const battleEngine = new BattleEngine(fixedRng);
    executor = new ActionExecutor(stateManager, battleEngine, fixedRng);
  });

  describe('행동 횟수 관리', () => {
    it('행동 소진 시 실패한다', () => {
      stateManager.useAction();
      stateManager.useAction();
      stateManager.useAction();

      const result = executor.execute({
        type: 'domestic', action: 'train', params: { city: 'gangha' },
      });
      expect(result.success).toBe(false);
      expect(result.description).toContain('소진');
    });

    it('성공 시 남은 행동이 감소한다', () => {
      const result = executor.execute({
        type: 'domestic', action: 'train', params: { city: 'gangha' },
      });
      expect(result.success).toBe(true);
      expect(result.remainingActions).toBe(2);
    });
  });

  describe('징병 (conscript)', () => {
    it('소규모 징병이 성공한다', () => {
      const result = executor.execute({
        type: 'domestic', action: 'conscript',
        params: { city: 'gangha', scale: 'small' },
      });
      expect(result.success).toBe(true);
      expect(result.description).toContain('소규모');

      const city = stateManager.getCity('gangha')!;
      expect(city.troops.infantry).toBe(5000 + 1000);
      expect(city.food).toBe(8000 - 500);
    });

    it('대규모 징병은 민심을 크게 하락시킨다', () => {
      const result = executor.execute({
        type: 'domestic', action: 'conscript',
        params: { city: 'gangha', scale: 'large' },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getCity('gangha')!.morale).toBe(70 - 20);
    });

    it('식량 부족 시 실패한다', () => {
      stateManager.updateCity('hagu', { food: 100 });
      const result = executor.execute({
        type: 'domestic', action: 'conscript',
        params: { city: 'hagu', scale: 'large' },
      });
      expect(result.success).toBe(false);
      expect(result.description).toContain('군량이 부족');
    });

    it('적 도시에서 징병 불가', () => {
      const result = executor.execute({
        type: 'domestic', action: 'conscript',
        params: { city: 'nanjun', scale: 'small' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('개발 (develop)', () => {
    it('개발 성공 시 등급이 상승한다 (rng=0.1이면 성공)', () => {
      const result = executor.execute({
        type: 'domestic', action: 'develop',
        params: { city: 'hagu', focus: 'agriculture' },
      });
      expect(result.success).toBe(true);
      // hagu agriculture는 C, rng=0.1 < 0.80 (C→B 확률) 이므로 B로 상승
      expect(stateManager.getCity('hagu')!.development.agriculture).toBe('B');
    });

    it('최고 등급이면 실패한다', () => {
      // gangha의 agriculture는 B, S까지 올리기
      stateManager.updateCity('gangha', {
        development: { agriculture: 'S', commerce: 'C', defense: 'B' },
      });
      const result = executor.execute({
        type: 'domestic', action: 'develop',
        params: { city: 'gangha', focus: 'agriculture' },
      });
      expect(result.success).toBe(false);
      expect(result.description).toContain('최고 등급');
    });
  });

  describe('훈련 (train)', () => {
    it('훈련도가 상승한다', () => {
      const before = stateManager.getCity('gangha')!.training;
      const result = executor.execute({
        type: 'domestic', action: 'train', params: { city: 'gangha' },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getCity('gangha')!.training).toBeGreaterThan(before);
    });

    it('병력 없으면 실패한다', () => {
      stateManager.updateCity('gangha', {
        troops: { infantry: 0, cavalry: 0, navy: 0 },
      });
      const result = executor.execute({
        type: 'domestic', action: 'train', params: { city: 'gangha' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('배치 (assign)', () => {
    it('인접 도시로 장수를 이동시킨다', () => {
      const result = executor.execute({
        type: 'domestic', action: 'assign',
        params: { general: 'guanyu', destination: 'hagu' },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getGeneral('guanyu')!.location).toBe('hagu');
    });

    it('비인접 도시로는 이동 불가', () => {
      // 먼저 위연을 하구에서 강하로 이동 (인접이라 성공)
      executor.execute({
        type: 'domestic', action: 'assign',
        params: { general: 'weiyuan', destination: 'gangha' },
      });
      // sishang을 일시적으로 유비 소유로 변경 (인접 체크 테스트용)
      stateManager.updateCity('sishang', { owner: '유비' });
      // gangha → sishang은 비인접 (gangha.adjacent = ['hagu', 'nanjun'])
      const result = executor.execute({
        type: 'domestic', action: 'assign',
        params: { general: 'weiyuan', destination: 'sishang' },
      });
      expect(result.success).toBe(false);
      expect(result.description).toContain('인접하지 않습니다');
    });

    it('적 장수는 배치 불가', () => {
      const result = executor.execute({
        type: 'domestic', action: 'assign',
        params: { general: 'caocao', destination: 'gangha' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('사절 (send_envoy)', () => {
    it('손권에게 사절을 보내면 관계가 변화한다', () => {
      const before = stateManager.getRelation('유비', '손권')!.value;
      const result = executor.execute({
        type: 'diplomacy', action: 'send_envoy',
        params: { target: '손권', purpose: 'alliance' },
      });
      expect(result.success).toBe(true);
      const after = stateManager.getRelation('유비', '손권')!.value;
      expect(after).not.toBe(before);
    });
  });

  describe('위협 (threaten)', () => {
    it('관계가 하락한다', () => {
      const before = stateManager.getRelation('유비', '손권')!.value;
      executor.execute({
        type: 'diplomacy', action: 'threaten', params: { target: '손권' },
      });
      const after = stateManager.getRelation('유비', '손권')!.value;
      expect(after).toBeLessThan(before);
    });
  });

  describe('선물 (gift)', () => {
    it('식량을 소비하고 관계를 개선한다', () => {
      const foodBefore = stateManager.getCity('gangha')!.food;
      const result = executor.execute({
        type: 'diplomacy', action: 'gift',
        params: { target: '손권', amount: 2000 },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getCity('gangha')!.food).toBe(foodBefore - 2000);
    });

    it('자원 부족 시 실패한다', () => {
      stateManager.updateCity('gangha', { food: 100 });
      stateManager.updateCity('hagu', { food: 100 });
      const result = executor.execute({
        type: 'diplomacy', action: 'gift',
        params: { target: '손권', amount: 5000 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('정찰 (scout)', () => {
    it('정찰 성공 시 정보가 갱신된다', () => {
      const result = executor.execute({
        type: 'military', action: 'scout', params: { target: 'nanjun' },
      });
      expect(result.success).toBe(true);
      expect(result.description).toContain('성공');
    });
  });

  describe('방비 (fortify)', () => {
    it('방어 등급이 상승한다', () => {
      // hagu의 defense는 C, rng=0.1이면 성공
      const result = executor.execute({
        type: 'military', action: 'fortify', params: { city: 'hagu' },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getCity('hagu')!.development.defense).toBe('B');
    });
  });

  describe('진군 (march)', () => {
    it('빈 아군 도시로 병력 이동', () => {
      // 먼저 hagu를 빈 상태로 만들 필요 없음 — 이미 아군 도시
      const result = executor.execute({
        type: 'military', action: 'march',
        params: {
          from: 'gangha', to: 'hagu',
          generals: ['guanyu'], troopsScale: 'small',
        },
      });
      expect(result.success).toBe(true);
      expect(stateManager.getGeneral('guanyu')!.location).toBe('hagu');
    });

    it('적 도시로 진군하면 전투가 발생한다', () => {
      const result = executor.execute({
        type: 'military', action: 'march',
        params: {
          from: 'gangha', to: 'nanjun',
          generals: ['guanyu', 'zhangfei'], troopsScale: 'main',
        },
      });
      expect(result.success).toBe(true);
      expect(result.battleTriggered).toBeDefined();
      expect(stateManager.getState().activeBattle).not.toBeNull();
    });

    it('비인접 도시로 진군 불가', () => {
      const result = executor.execute({
        type: 'military', action: 'march',
        params: {
          from: 'gangha', to: 'sishang',
          generals: ['guanyu'], troopsScale: 'small',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('보급 (transfer)', () => {
    describe('병력 보급', () => {
      it('인접 아군 도시로 소규모 병력 보급 (30%)', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(true);
        expect(result.description).toContain('보급');
        // gangha: infantry 5000*0.3=1500, cavalry 1000*0.3=300, navy 2000*0.3=600
        const afterFrom = stateManager.getCity('gangha')!;
        expect(afterFrom.troops.infantry).toBe(5000 - 1500);
        expect(afterFrom.troops.cavalry).toBe(1000 - 300);
        expect(afterFrom.troops.navy).toBe(2000 - 600);
        const afterTo = stateManager.getCity('hagu')!;
        expect(afterTo.troops.infantry).toBe(3000 + 1500);
        expect(afterTo.troops.cavalry).toBe(500 + 300);
        expect(afterTo.troops.navy).toBe(1500 + 600);
      });

      it('중규모 병력 보급 (50%)', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'medium' },
        });
        expect(result.success).toBe(true);
        const after = stateManager.getCity('gangha')!;
        expect(after.troops.infantry).toBe(5000 - 2500);
      });

      it('대규모 병력 보급 (70%)', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'large' },
        });
        expect(result.success).toBe(true);
        const after = stateManager.getCity('gangha')!;
        expect(after.troops.infantry).toBe(5000 - 3500);
      });

      it('병력 없으면 실패한다', () => {
        stateManager.updateCity('gangha', {
          troops: { infantry: 0, cavalry: 0, navy: 0 },
        });
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(false);
        expect(result.description).toContain('병력');
      });
    });

    describe('식량 보급', () => {
      it('인접 아군 도시로 소규모 식량 보급 (1000)', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'food', scale: 'small' },
        });
        expect(result.success).toBe(true);
        expect(stateManager.getCity('gangha')!.food).toBe(8000 - 1000);
        expect(stateManager.getCity('hagu')!.food).toBe(4000 + 1000);
      });

      it('대규모 식량 보급 (5000)', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'food', scale: 'large' },
        });
        expect(result.success).toBe(true);
        expect(stateManager.getCity('gangha')!.food).toBe(8000 - 5000);
        expect(stateManager.getCity('hagu')!.food).toBe(4000 + 5000);
      });

      it('식량 부족 시 실패한다', () => {
        stateManager.updateCity('gangha', { food: 800 });
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'food', scale: 'small' },
        });
        expect(result.success).toBe(false);
        expect(result.description).toContain('군량이 부족');
      });
    });

    describe('검증', () => {
      it('비인접 도시로 보급 불가', () => {
        // gangha.adjacent = ['hagu', 'nanjun'] — sishang은 비인접
        stateManager.updateCity('sishang', { owner: '유비' });
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'sishang', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(false);
        expect(result.description).toContain('인접');
      });

      it('적 도시로 보급 불가', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'nanjun', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(false);
        expect(result.description).toContain('아군');
      });

      it('같은 도시로 보급 불가', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'gangha', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(false);
      });

      it('장수 없이도 보급 가능하다', () => {
        // gangha의 장수를 전부 hagu로 이동
        const generals = stateManager.getState().generals.filter(
          g => g.faction === '유비' && g.location === 'gangha',
        );
        for (const g of generals) {
          stateManager.updateGeneral(g.id, { location: 'hagu' });
        }
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'troops', scale: 'small' },
        });
        expect(result.success).toBe(true);
      });

      it('행동 1회를 소모한다', () => {
        const result = executor.execute({
          type: 'domestic', action: 'transfer',
          params: { from: 'gangha', to: 'hagu', transferType: 'food', scale: 'small' },
        });
        expect(result.remainingActions).toBe(2);
      });
    });
  });
});
