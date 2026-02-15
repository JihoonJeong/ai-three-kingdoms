// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 세력 의사결정 시스템 (Faction AI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  GameState, GameAction, GamePhase, FactionId, BattleState,
} from '../data/types.js';
import {
  FOOD_PRODUCTION_BASE, FOOD_CONSUMPTION_PER_TROOP,
  AGRICULTURE_MULTIPLIER, getTotalTroopsOfCity,
} from '../data/types.js';
import { GameStateManager } from './game-state.js';
import { ActionExecutor } from './action-executor.js';
import type { FactionLLMClient } from '../advisor/faction-llm-client.js';
import type { FactionTurnJSON } from '../advisor/types.js';
import { actionJSONToGameAction } from '../advisor/action-recommender.js';
import type { RecommendationContext } from '../advisor/action-recommender.js';

// ─── 타입 정의 ─────────────────────────────────────────

export interface AITurnPlan {
  actions: GameAction[];
  deployments: Deployment[];
  messages: string[];
  trainingBonus: number;
  foodBonus: number;
  flagsToSet: Record<string, unknown>;
}

export interface Deployment {
  generalId: string;
  destination: string;
}

export interface AIContext {
  turn: number;
  phase: GamePhase;
  isAlliedWithPlayer: boolean;
  playerTotalTroops: number;
  flags: Record<string, unknown>;
}

export interface FactionStrategy {
  readonly factionId: FactionId;
  planTurn(state: Readonly<GameState>, ctx: AIContext, rng: () => number): AITurnPlan;
}

// ─── FactionAIEngine ───────────────────────────────────

export class FactionAIEngine {
  constructor(
    private stateManager: GameStateManager,
    private executor: ActionExecutor,
    private rng: () => number,
    private llmClient?: FactionLLMClient,
  ) {}

  async processAll(): Promise<{ changes: string[]; battle?: BattleState }> {
    const changes: string[] = [];
    const state = this.stateManager.getState();
    let battle: BattleState | undefined;

    for (const faction of state.factions) {
      if (faction.isPlayer) continue;

      let plan: AITurnPlan;

      if (this.llmClient) {
        // LLM 모드: 서버를 통해 LLM 호출
        try {
          const response = await this.llmClient.requestFactionTurn(
            faction.id, state,
          );
          plan = this.convertJSONToPlan(response, state, faction.id);
        } catch {
          // LLM 실패 시 폴백: 기존 하드코딩 전략
          const strategy = STRATEGIES[faction.id];
          if (!strategy) continue;
          const ctx = this.buildContext(state, faction.id);
          plan = strategy.planTurn(state, ctx, this.rng);
        }
      } else {
        // 폴백: 기존 하드코딩 전략
        const strategy = STRATEGIES[faction.id];
        if (!strategy) continue;
        const ctx = this.buildContext(state, faction.id);
        plan = strategy.planTurn(state, ctx, this.rng);
      }

      // ① 플래그 설정 (마일스톤/적응 규칙에서 예약)
      for (const [key, value] of Object.entries(plan.flagsToSet)) {
        this.stateManager.setFlag(key, value);
      }

      // ② 자동 유지: 훈련, 식량
      this.applyMaintenance(faction.id, plan);

      // ③ 전장 배치
      for (const dep of plan.deployments) {
        const general = this.stateManager.getGeneral(dep.generalId);
        if (general && general.condition === '양호') {
          this.stateManager.updateGeneral(dep.generalId, { location: dep.destination });
        }
      }

      // ④ 전략 행동 (ActionExecutor 경유)
      for (const action of plan.actions) {
        const result = this.executor.executeFor(action, faction.id);
        if (result.success) {
          changes.push(result.description);
          if (result.battleTriggered && !battle) {
            battle = result.battleTriggered;
          }
        }
      }

      // executeMarch가 setBattle()을 호출하므로,
      // 다음 세력 처리를 위해 activeBattle 해제 (GameController에서 재설정)
      if (this.stateManager.getState().activeBattle) {
        this.stateManager.setBattle(null);
      }

      changes.push(...plan.messages);
    }

    return { changes, battle };
  }

  private buildContext(state: Readonly<GameState>, factionId: FactionId): AIContext {
    const playerFaction = state.factions.find(f => f.isPlayer);
    const isAllied = playerFaction
      ? (this.stateManager.getRelation(factionId, playerFaction.id)?.isAlliance ?? false)
      : false;
    const playerTotalTroops = playerFaction
      ? this.stateManager.getTotalTroops(playerFaction.id)
      : 0;

    return {
      turn: state.turn,
      phase: state.phase,
      isAlliedWithPlayer: isAllied,
      playerTotalTroops,
      flags: state.flags,
    };
  }

  private convertJSONToPlan(
    response: FactionTurnJSON,
    state: Readonly<GameState>,
    factionId: FactionId,
  ): AITurnPlan {
    const ctx = this.buildContext(state, factionId);

    // 해당 세력 시점의 RecommendationContext 구성
    const recCtx: RecommendationContext = {
      playerCities: state.cities.filter(c => c.owner === factionId)
        .map(c => ({ id: c.id, name: c.name })),
      playerGenerals: state.generals.filter(g => g.faction === factionId)
        .map(g => ({ id: g.id, name: g.name, location: g.location })),
      factions: state.factions.filter(f => f.id !== factionId).map(f => f.id),
      allLocations: [
        ...state.cities.map(c => c.id),
        ...state.battlefields.map(b => b.id),
      ],
    };

    const actions: GameAction[] = [];
    const deployments: Deployment[] = [];

    for (const aj of response.actions) {
      // assign으로 전장(chibi 등)에 배치하려는 경우 → deployment로 변환
      if (aj.type === 'assign' && aj.params.destination) {
        const isBattlefield = state.battlefields.some(
          b => b.id === aj.params.destination,
        );
        if (isBattlefield && aj.params.general) {
          deployments.push({
            generalId: aj.params.general,
            destination: aj.params.destination,
          });
          continue;
        }
      }

      const ga = actionJSONToGameAction(aj, recCtx);
      if (ga) actions.push(ga);
    }

    // 유지 보너스 기본값 (하드코딩 전략과 동일)
    let trainingBonus: number;
    let foodBonus: number;

    if (factionId === '조조') {
      trainingBonus = ctx.phase === 'preparation' ? 3 : 2;
      foodBonus = 300;
    } else {
      // 손권
      trainingBonus = ctx.isAlliedWithPlayer ? 5 : 2;
      foodBonus = ctx.isAlliedWithPlayer ? 200 : 0;
    }

    return {
      actions,
      deployments,
      messages: response.message ? [response.message] : [],
      trainingBonus,
      foodBonus,
      flagsToSet: {},
    };
  }

  private applyMaintenance(factionId: FactionId, plan: AITurnPlan): void {
    const cities = this.stateManager.getCitiesByFaction(factionId);

    for (const city of cities) {
      // 훈련 보너스
      if (plan.trainingBonus > 0) {
        this.stateManager.updateCity(city.id, {
          training: Math.min(100, city.training + plan.trainingBonus),
        });
      }

      // 식량 생산/소비 정규화 + 보너스
      const production = Math.floor(
        FOOD_PRODUCTION_BASE[city.population] *
        AGRICULTURE_MULTIPLIER[city.development.agriculture]
      ) + plan.foodBonus;

      const totalTroops = getTotalTroopsOfCity(city);
      const consumption = Math.floor(totalTroops * FOOD_CONSUMPTION_PER_TROOP);
      const net = production - consumption;
      const newFood = Math.max(0, city.food + net);

      this.stateManager.updateCity(city.id, { food: newFood });
    }
  }
}

// ─── CaoStrategy ───────────────────────────────────────

interface Milestone {
  turn: number;
  condition?: (state: Readonly<GameState>, ctx: AIContext) => boolean;
  flag: string;
  apply: (state: Readonly<GameState>, ctx: AIContext, plan: AITurnPlan) => void;
}

interface AdaptiveRule {
  priority: number;
  condition: (state: Readonly<GameState>, ctx: AIContext) => boolean;
  apply: (state: Readonly<GameState>, ctx: AIContext, plan: AITurnPlan) => void;
}

class CaoStrategy implements FactionStrategy {
  readonly factionId: FactionId = '조조';

  private milestones: Milestone[] = [
    {
      turn: 3,
      flag: 'cao_m_conscript1',
      apply: (_state, _ctx, plan) => {
        plan.actions.push({
          type: 'domestic', action: 'conscript',
          params: { city: 'nanjun', scale: 'large' },
        });
        plan.messages.push('조조: 남군에서 대규모 징집이 이루어지고 있습니다');
      },
    },
    {
      turn: 5,
      flag: 'cao_m_caoren',
      apply: (state, _ctx, plan) => {
        const caoren = state.generals.find(g => g.id === 'caoren' && g.faction === '조조');
        if (caoren && caoren.location === 'jiangling') {
          plan.actions.push({
            type: 'domestic', action: 'assign',
            params: { general: 'caoren', destination: 'nanjun' },
          });
          plan.messages.push('정찰 보고: 조인 장군이 장릉에서 남군으로 이동했습니다');
        }
      },
    },
    {
      turn: 6,
      flag: 'cao_m_conscript2',
      apply: (_state, _ctx, plan) => {
        plan.actions.push({
          type: 'domestic', action: 'conscript',
          params: { city: 'nanjun', scale: 'medium' },
        });
        plan.messages.push('정찰 보고: 조조군이 강하 방면으로 병력을 이동시키고 있습니다');
      },
    },
    {
      turn: 8,
      flag: 'cao_m_march_south',
      apply: (_state, _ctx, plan) => {
        plan.messages.push('정찰 보고: 조조의 대군이 수군을 이끌고 장강을 따라 남하하고 있습니다!');
      },
    },
    {
      turn: 9,
      flag: 'cao_chibi_deployed',
      apply: (state, _ctx, plan) => {
        for (const id of ['caimao', 'zhangyun']) {
          const g = state.generals.find(
            gen => gen.id === id && gen.faction === '조조' && gen.condition === '양호'
          );
          if (g) {
            plan.deployments.push({ generalId: id, destination: 'chibi' });
          }
        }
        plan.messages.push('정찰 보고: 조조의 수군 도독 채모·장윤이 대함대를 이끌고 적벽에 진출했습니다!');
      },
    },
    {
      turn: 10,
      condition: (state) => !!state.flags['cao_chibi_deployed'],
      flag: 'cao_chibi_reinforced',
      apply: (state, _ctx, plan) => {
        const reinforcement = state.generals.find(
          g => g.faction === '조조' && g.location !== 'chibi' &&
               g.condition === '양호' && g.id !== 'caocao'
        );
        if (reinforcement) {
          plan.deployments.push({ generalId: reinforcement.id, destination: 'chibi' });
          plan.messages.push(`정찰 보고: ${reinforcement.name}이(가) 적벽으로 합류했습니다. 조조군이 증강되고 있습니다!`);
        }
      },
    },
  ];

  private adaptiveRules: AdaptiveRule[] = [
    // 100: 유비-손권 동맹 감지 시 적벽 배치 가속 (Turn 9→7)
    {
      priority: 100,
      condition: (state, ctx) => {
        const playerAllied = state.diplomacy.relations.some(
          r => r.isAlliance && (r.factionA === '유비' || r.factionB === '유비')
        );
        return playerAllied && ctx.turn >= 7 && !state.flags['cao_chibi_deployed'];
      },
      apply: (state, _ctx, plan) => {
        for (const id of ['caimao', 'zhangyun']) {
          const g = state.generals.find(
            gen => gen.id === id && gen.faction === '조조' && gen.condition === '양호'
          );
          if (g) {
            plan.deployments.push({ generalId: id, destination: 'chibi' });
          }
        }
        plan.flagsToSet['cao_chibi_deployed'] = true;
        plan.messages.push('정찰 보고: 동맹 체결에 반응하여 조조가 적벽 배치를 가속하고 있습니다!');
      },
    },
    // 90: 적벽 대치 압박 메시지 (Turn 11-12)
    {
      priority: 90,
      condition: (state, ctx) =>
        !!state.flags['cao_chibi_deployed'] && ctx.turn >= 11 && ctx.turn <= 12,
      apply: (_state, _ctx, plan) => {
        plan.messages.push('정찰 보고: 적벽의 조조 수군이 연환진을 펼치고 있습니다. 적벽으로의 진군을 서두르십시오!');
      },
    },
    // 80: 강하 견제 공격 (Turn 14+, 4턴 쿨다운)
    {
      priority: 80,
      condition: (state, ctx) => {
        if (!state.flags['cao_chibi_deployed'] || ctx.turn < 14 || !!state.flags['chibiVictory']) {
          return false;
        }
        const lastAttack = state.flags['cao_last_attack_turn'] as number | undefined;
        return !lastAttack || ctx.turn - lastAttack >= 4;
      },
      apply: (state, ctx, plan) => {
        const nanjunGenerals = state.generals.filter(
          g => g.faction === '조조' && g.location === 'nanjun' &&
               g.condition === '양호' && g.id !== 'caocao'
        );
        if (nanjunGenerals.length === 0) return;
        plan.actions.push({
          type: 'military', action: 'march',
          params: {
            from: 'nanjun', to: 'gangha',
            generals: nanjunGenerals.slice(0, 2).map(g => g.id),
            troopsScale: 'small',
          },
        });
        plan.flagsToSet['cao_last_attack_turn'] = ctx.turn;
        plan.messages.push('조조군이 후방 견제를 위해 강하를 공격합니다! 적벽 결전을 서두르십시오!');
      },
    },
    // 70: 남군 병력 < 15000 시 보충 징집
    {
      priority: 70,
      condition: (state) => {
        const nanjun = state.cities.find(c => c.id === 'nanjun');
        return !!nanjun && nanjun.owner === '조조' &&
               getTotalTroopsOfCity(nanjun) < 15000 && nanjun.food >= 800;
      },
      apply: (_state, _ctx, plan) => {
        const alreadyConscripting = plan.actions.some(
          a => a.action === 'conscript'
        );
        if (alreadyConscripting) return;
        plan.actions.push({
          type: 'domestic', action: 'conscript',
          params: { city: 'nanjun', scale: 'medium' },
        });
      },
    },
    // 60: 하구 병력 부족 시 기회 공격
    {
      priority: 60,
      condition: (state, ctx) => {
        const hagu = state.cities.find(c => c.id === 'hagu');
        return ctx.turn >= 10 && !!hagu && hagu.owner === '유비' &&
               getTotalTroopsOfCity(hagu) < 3000 &&
               !!state.flags['cao_chibi_deployed'] && !state.flags['chibiVictory'];
      },
      apply: (state, ctx, plan) => {
        const alreadyMarching = plan.actions.some(
          a => a.action === 'march'
        );
        if (alreadyMarching) return;

        const nanjunGenerals = state.generals.filter(
          g => g.faction === '조조' && g.location === 'nanjun' &&
               g.condition === '양호' && g.id !== 'caocao'
        );
        if (nanjunGenerals.length === 0) return;
        plan.actions.push({
          type: 'military', action: 'march',
          params: {
            from: 'nanjun', to: 'gangha',
            generals: nanjunGenerals.slice(0, 2).map(g => g.id),
            troopsScale: 'small',
          },
        });
        plan.flagsToSet['cao_last_attack_turn'] = ctx.turn;
        plan.messages.push('정찰 보고: 조조군이 하구의 빈 틈을 노리고 강하를 공격합니다!');
      },
    },
    // 50: 남군 병력 < 12000 && food > 3000 시 소규모 징집
    {
      priority: 50,
      condition: (state) => {
        const nanjun = state.cities.find(c => c.id === 'nanjun');
        return !!nanjun && nanjun.owner === '조조' &&
               getTotalTroopsOfCity(nanjun) < 12000 && nanjun.food > 3000;
      },
      apply: (_state, _ctx, plan) => {
        const alreadyConscripting = plan.actions.some(
          a => a.action === 'conscript'
        );
        if (alreadyConscripting) return;
        plan.actions.push({
          type: 'domestic', action: 'conscript',
          params: { city: 'nanjun', scale: 'small' },
        });
      },
    },
  ];

  planTurn(state: Readonly<GameState>, ctx: AIContext, _rng: () => number): AITurnPlan {
    const plan: AITurnPlan = {
      actions: [],
      deployments: [],
      messages: [],
      trainingBonus: ctx.phase === 'preparation' ? 3 : 2,
      foodBonus: 300,
      flagsToSet: {},
    };

    // 적벽 승리 후에는 공격 중단 (훈련/식량 유지만)
    if (state.flags['chibiVictory']) {
      return plan;
    }

    // 마일스톤 실행 (해당 턴 이후 & 미실행)
    for (const ms of this.milestones) {
      if (ctx.turn >= ms.turn && !state.flags[ms.flag]) {
        if (ms.condition && !ms.condition(state, ctx)) continue;
        ms.apply(state, ctx, plan);
        plan.flagsToSet[ms.flag] = true;
      }
    }

    // 적응 규칙 (우선순위 내림차순)
    const sortedRules = [...this.adaptiveRules].sort((a, b) => b.priority - a.priority);
    for (const rule of sortedRules) {
      if (rule.condition(state, ctx)) {
        rule.apply(state, ctx, plan);
      }
    }

    // 적벽 대치 후반 압박 메시지 (Turn 13-14)
    if (state.flags['cao_chibi_deployed'] && ctx.turn >= 13 && ctx.turn <= 14) {
      const hasEscalationMsg = plan.messages.some(m => m.includes('적벽'));
      if (!hasEscalationMsg) {
        plan.messages.push('긴급 보고: 조조 대군이 적벽에서 하구를 향해 진격 태세를 갖추고 있습니다!');
      }
    }

    return plan;
  }
}

// ─── SunStrategy ───────────────────────────────────────

class SunStrategy implements FactionStrategy {
  readonly factionId: FactionId = '손권';

  planTurn(state: Readonly<GameState>, ctx: AIContext, _rng: () => number): AITurnPlan {
    const plan: AITurnPlan = {
      actions: [],
      deployments: [],
      messages: [],
      trainingBonus: ctx.isAlliedWithPlayer ? 5 : 2,
      foodBonus: ctx.isAlliedWithPlayer ? 200 : 0,
      flagsToSet: {},
    };

    // 마일스톤: 동맹 + 적벽 배치 시 주유 파견
    if (ctx.isAlliedWithPlayer &&
        state.flags['cao_chibi_deployed'] &&
        !state.flags['sun_chibi_support'] &&
        ctx.turn >= 10) {
      const zhouyu = state.generals.find(
        g => g.id === 'zhouyu' && g.faction === '손권' && g.condition === '양호'
      );
      if (zhouyu) {
        plan.deployments.push({ generalId: 'zhouyu', destination: 'chibi' });
        plan.flagsToSet['sun_chibi_support'] = true;
        plan.messages.push('손권: "주유 도독이 적벽 방면으로 출진합니다!"');
      }
    }

    // 적응 규칙: 동맹 시 식량 지원 (우선순위 80)
    if (ctx.isAlliedWithPlayer && ctx.turn >= 6) {
      const hagu = state.cities.find(c => c.id === 'hagu');
      if (hagu && hagu.owner === '유비' && hagu.food < 6000) {
        plan.actions.push({
          type: 'diplomacy', action: 'gift',
          params: { target: '유비', amount: 1000 },
        });
        plan.messages.push('손권: 동맹 지원으로 군량을 보냈습니다');
      }
    }

    // 적응 규칙: 동맹 시 시상 훈련 (우선순위 40)
    if (ctx.isAlliedWithPlayer) {
      const sishang = state.cities.find(c => c.id === 'sishang');
      if (sishang && sishang.training < 70) {
        plan.actions.push({
          type: 'domestic', action: 'train',
          params: { city: 'sishang' },
        });
      }
    }

    return plan;
  }
}

// ─── 전략 레지스트리 ───────────────────────────────────

const STRATEGIES: Record<string, FactionStrategy> = {
  '조조': new CaoStrategy(),
  '손권': new SunStrategy(),
};
