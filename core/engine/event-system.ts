// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이벤트 시스템
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  ScenarioEvent, EventResult, EventEffect, GameState,
} from '../data/types.js';
import { GameStateManager } from './game-state.js';

export class EventSystem {
  constructor(
    private events: ScenarioEvent[],
    private rng: () => number = Math.random,
  ) {}

  processTurn(stateManager: GameStateManager): EventResult[] {
    const state = stateManager.getState();
    const triggered = this.checkTriggers(state);
    const results: EventResult[] = [];

    for (const event of triggered) {
      if (stateManager.isEventCompleted(event.id)) continue;
      const result = this.applyEffects(event, stateManager);
      stateManager.addCompletedEvent(event.id);
      results.push(result);
    }

    return results;
  }

  checkTriggers(state: GameState): ScenarioEvent[] {
    const triggered: ScenarioEvent[] = [];

    for (const event of this.events) {
      if (state.completedEvents.includes(event.id)) continue;

      switch (event.trigger.type) {
        case 'turn': {
          if (state.turn === event.trigger.turn) {
            if (event.trigger.condition) {
              if (this.evaluateCondition(event.trigger.condition, state)) {
                triggered.push(event);
              }
            } else {
              triggered.push(event);
            }
          }
          break;
        }
        case 'turn_range': {
          if (state.turn >= event.trigger.min && state.turn <= event.trigger.max) {
            if (this.rng() < event.trigger.probability) {
              triggered.push(event);
            }
          }
          break;
        }
        case 'condition': {
          if (this.evaluateCondition(event.trigger.condition, state)) {
            triggered.push(event);
          }
          break;
        }
      }
    }

    return triggered;
  }

  applyEffects(event: ScenarioEvent, stateManager: GameStateManager): EventResult {
    const appliedEffects: string[] = [];

    for (const effect of event.effects) {
      const desc = this.applyEffect(effect, stateManager);
      appliedEffects.push(desc);
    }

    // 어드바이저 지식 플래그 설정
    if (event.advisorKnowledge) {
      stateManager.setFlag(`knowledge_${event.advisorKnowledge}`, true);
    }

    return {
      eventId: event.id,
      description: event.description,
      impact: this.categorizeImpact(event.effects),
      appliedEffects,
    };
  }

  private applyEffect(effect: EventEffect, stateManager: GameStateManager): string {
    switch (effect.type) {
      case 'enemy_intel_update': {
        for (const [key, value] of Object.entries(effect.data)) {
          stateManager.setFlag(`intel_${key}`, value);
        }
        return `적 정보 갱신: ${JSON.stringify(effect.data)}`;
      }

      case 'urgency_increase': {
        const current = stateManager.getFlag<number>('urgency') ?? 0;
        stateManager.setFlag('urgency', current + 1);
        return '위기감 증가';
      }

      case 'diplomacy_opportunity': {
        const current = stateManager.getFlag<number>('diplomacy_bonus') ?? 0;
        stateManager.setFlag('diplomacy_bonus', current + effect.bonus);
        return `${effect.target}과(와)의 외교 기회 발생 (보너스 +${effect.bonus})`;
      }

      case 'enemy_debuff': {
        // 적 도시의 해당 스탯 하락
        const state = stateManager.getState();
        for (const city of state.cities) {
          if (city.owner === effect.target as any) {
            if (effect.stat === 'morale') {
              stateManager.updateCity(city.id, {
                morale: Math.max(0, city.morale + effect.amount),
              });
            }
          }
        }
        stateManager.setFlag(`debuff_${effect.target}_${effect.stat}`, effect.amount);
        return `${effect.target} 진영 ${effect.stat} ${effect.amount}`;
      }

      case 'enemy_formation': {
        stateManager.setFlag('enemy_formation', effect.formation);
        return `적 진형 변경: ${effect.formation}`;
      }

      case 'unlock_tactic': {
        stateManager.setFlag(`tactic_bonus_${effect.tactic}`, effect.bonusMultiplier);
        return `전술 해금: ${effect.tactic} (배율 x${effect.bonusMultiplier})`;
      }

      case 'weather_change': {
        stateManager.setFlag('weather', effect.weather);
        return `날씨 변화: ${effect.weather}`;
      }

      case 'tactic_bonus': {
        const currentBonus = stateManager.getFlag<number>(`tactic_bonus_${effect.tactic}`) ?? 0;
        stateManager.setFlag(`tactic_power_${effect.tactic}`, currentBonus + effect.bonus);
        return `${effect.tactic} 전술 효과 +${effect.bonus}%`;
      }

      case 'special_tactic_available': {
        stateManager.setFlag(`special_tactic_${effect.tactic}`, true);
        return `특수 전술 사용 가능: ${effect.tactic}`;
      }

      case 'pursuit_opportunity': {
        stateManager.setFlag('pursuit_target', effect.target);
        stateManager.setFlag('pursuit_location', effect.location);
        return `추격 기회: ${effect.target} (${effect.location})`;
      }

      case 'troop_loss': {
        const city = stateManager.getCity(effect.city);
        if (city && city.owner === effect.target as any) {
          // 난이도 flags가 있으면 우선 적용
          const collapseRatio = (stateManager.getFlag('nanjunCollapseRatio') as number | undefined)
            ?? effect.ratio;
          const moralePenalty = (stateManager.getFlag('nanjunMoralePenalty') as number | undefined)
            ?? effect.moralePenalty;

          const total = city.troops.infantry + city.troops.cavalry + city.troops.navy;
          if (total > 0) {
            const keepRatio = 1 - collapseRatio;
            stateManager.updateCity(effect.city, {
              troops: {
                infantry: Math.floor(city.troops.infantry * keepRatio),
                cavalry: Math.floor(city.troops.cavalry * keepRatio),
                navy: Math.floor(city.troops.navy * keepRatio),
              },
              morale: Math.max(0, city.morale + moralePenalty),
            });
          }
        }
        const lostPercent = Math.round(effect.ratio * 100);
        return `${effect.target} ${city?.name ?? effect.city} 병력 ${lostPercent}% 손실`;
      }

      case 'food_support': {
        const amount = (stateManager.getFlag('sunQuanFoodSupport') as number | undefined) ?? 0;
        if (amount <= 0) return '식량 지원 없음';

        // 하구에 식량 지급 (적벽에 가장 가까운 유비 도시)
        const hagu = stateManager.getCity('hagu');
        if (hagu && hagu.owner === effect.target as any) {
          stateManager.updateCity('hagu', { food: hagu.food + amount });
        }
        return `${effect.target}에게 군량 ${amount} 지원`;
      }

      default:
        return '알 수 없는 효과';
    }
  }

  private evaluateCondition(condition: string, state: GameState): boolean {
    switch (condition) {
      case 'alliance_not_started':
        return !state.flags['allianceStarted'];

      case 'alliance_strong_and_turn>=8':
        return !!state.flags['allianceStrong'] && state.turn >= 8;

      case 'chibi_victory':
        return !!state.flags['chibiVictory'];

      case 'caimao_alive': {
        const caimao = state.generals.find(g => g.id === 'caimao');
        return caimao ? caimao.condition !== '사망' && caimao.condition !== '포로' : false;
      }

      case 'cao_at_chibi':
        return state.generals.some(
          g => g.faction === '조조' && g.location === 'chibi' && g.condition === '양호'
        );

      default:
        // 일반 플래그 체크
        return !!state.flags[condition];
    }
  }

  private categorizeImpact(effects: EventEffect[]): string {
    const types = effects.map(e => e.type);
    if (types.includes('weather_change') || types.includes('enemy_formation')) {
      return '전략적 변화';
    }
    if (types.includes('diplomacy_opportunity')) {
      return '외교 기회';
    }
    if (types.includes('enemy_debuff')) {
      return '적 약화';
    }
    if (types.includes('urgency_increase') || types.includes('enemy_intel_update')) {
      return '위협 증가';
    }
    if (types.includes('special_tactic_available') || types.includes('unlock_tactic')) {
      return '전술 기회';
    }
    if (types.includes('pursuit_opportunity')) {
      return '추격 기회';
    }
    if (types.includes('food_support')) {
      return '보급 지원';
    }
    return '정보 갱신';
  }
}
