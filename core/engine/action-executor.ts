// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 행동 실행기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  GameAction, ActionResult, ConscriptScale, DevelopFocus,
  FactionId, TroopsScale, BattleState, Grade,
  TransferType, TransferScale,
} from '../data/types.js';
import {
  CONSCRIPT_TABLE, DEVELOP_SUCCESS_RATE, TRAINING_INCREASE,
  GRADE_VALUES, gradeUp, getTotalTroopsOfCity,
  TRANSFER_RATIOS, FOOD_TRANSFER_AMOUNTS,
} from '../data/types.js';
import { GameStateManager } from './game-state.js';
import { BattleEngine } from './battle-engine.js';

export class ActionExecutor {
  constructor(
    private stateManager: GameStateManager,
    private battleEngine: BattleEngine,
    private rng: () => number = Math.random,
  ) {}

  execute(action: GameAction): ActionResult {
    const state = this.stateManager.getState();

    // 행동 횟수 체크
    if (state.actionsRemaining <= 0) {
      return {
        success: false,
        description: '이번 턴의 행동을 모두 소진했습니다.',
        sideEffects: [],
        remainingActions: 0,
      };
    }

    // 전투 중에는 행동 불가 (전투 명령은 별도)
    if (state.activeBattle) {
      return {
        success: false,
        description: '전투가 진행 중입니다. 전투를 먼저 해결해주십시오.',
        sideEffects: [],
        remainingActions: state.actionsRemaining,
      };
    }

    const playerFaction = this.stateManager.getPlayerFaction().id;
    const result = this.dispatchAction(action, playerFaction);

    // 성공/실패 관계없이 행동 1회 소모
    const remaining = this.stateManager.useAction();
    result.remainingActions = remaining;

    // 행동 로그 기록
    this.stateManager.addActionLog({
      turn: state.turn,
      action,
      result,
    });

    return result;
  }

  /** AI/범용 세력 행동 실행 (행동 횟수 미소모, 로그 미기록) */
  executeFor(action: GameAction, factionId: FactionId): ActionResult {
    if (this.stateManager.getState().activeBattle) {
      return this.fail('전투가 진행 중입니다.');
    }
    return this.dispatchAction(action, factionId);
  }

  // ─── 공통 디스패치 ─────────────────────────────────────

  private dispatchAction(action: GameAction, factionId: FactionId): ActionResult {
    switch (action.action) {
      // 내정
      case 'conscript':
        return this.executeConscript(factionId, action.params.city, action.params.scale);
      case 'develop':
        return this.executeDevelop(factionId, action.params.city, action.params.focus);
      case 'train':
        return this.executeTrain(factionId, action.params.city);
      case 'recruit':
        return this.executeRecruit(factionId, action.params.city, action.params.targetGeneral);
      case 'assign':
        return this.executeAssign(factionId, action.params.general, action.params.destination);
      case 'transfer':
        return this.executeTransfer(
          factionId, action.params.from, action.params.to,
          action.params.transferType, action.params.scale,
        );
      // 외교
      case 'send_envoy':
        return this.executeSendEnvoy(factionId, action.params.target, action.params.purpose);
      case 'persuade':
        return this.executePersuade(factionId, action.params.targetGeneral, action.params.method);
      case 'threaten':
        return this.executeThreaten(factionId, action.params.target);
      case 'gift':
        return this.executeGift(factionId, action.params.target, action.params.amount);
      // 군사
      case 'march':
        return this.executeMarch(
          factionId, action.params.from, action.params.to,
          action.params.generals, action.params.troopsScale,
        );
      case 'scout':
        return this.executeScout(factionId, action.params.target);
      case 'fortify':
        return this.executeFortify(factionId, action.params.city);
      case 'ambush':
        return this.executeAmbush(factionId, action.params.location, action.params.general);
      default:
        return {
          success: false,
          description: '알 수 없는 행동입니다.',
          sideEffects: [],
          remainingActions: this.stateManager.getState().actionsRemaining,
        };
    }
  }

  // ─── 내정 ────────────────────────────────────────────

  private executeConscript(factionId: FactionId, cityId: string, scale: ConscriptScale): ActionResult {
    const city = this.stateManager.getCity(cityId);
    if (!city) return this.fail(`도시를 찾을 수 없습니다: ${cityId}`);
    if (city.owner !== factionId) {
      return this.fail('아군 도시에서만 징병할 수 있습니다.');
    }

    const table = CONSCRIPT_TABLE[scale];
    const sideEffects: string[] = [];

    // 식량 체크
    if (city.food < Math.abs(table.food)) {
      return this.fail(`군량이 부족합니다. 필요: ${Math.abs(table.food)}, 보유: ${city.food}`);
    }

    // 병력 증가 (보병으로 추가)
    this.stateManager.addCityTroops(cityId, 'infantry', table.troops);
    // 식량 소비
    this.stateManager.updateCity(cityId, {
      food: city.food + table.food, // table.food는 음수
    });
    // 민심 하락
    const newMorale = Math.max(0, city.morale + table.morale);
    this.stateManager.updateCity(cityId, { morale: newMorale });

    if (newMorale < 30) {
      sideEffects.push('민심이 매우 낮습니다. 반란 위험이 있습니다.');
    } else if (newMorale < 50) {
      sideEffects.push('민심이 소폭 하락했습니다.');
    }

    const scaleNames = { small: '소규모', medium: '중규모', large: '대규모' };
    return {
      success: true,
      description: `${city.name}에서 ${scaleNames[scale]} 징병을 실시했습니다. 보병 +${table.troops}.`,
      sideEffects,
      remainingActions: 0, // execute()에서 갱신
    };
  }

  private executeDevelop(factionId: FactionId, cityId: string, focus: DevelopFocus): ActionResult {
    const city = this.stateManager.getCity(cityId);
    if (!city) return this.fail(`도시를 찾을 수 없습니다: ${cityId}`);
    if (city.owner !== factionId) {
      return this.fail('아군 도시에서만 개발할 수 있습니다.');
    }

    const focusNames: Record<DevelopFocus, string> = {
      agriculture: '농업', commerce: '상업', defense: '방어',
    };

    const currentGrade = city.development[focus];
    const nextGrade = gradeUp(currentGrade);
    if (currentGrade === nextGrade) {
      return this.fail(`${city.name}의 ${focusNames[focus]}는 이미 최고 등급입니다.`);
    }

    const rateKey = `${currentGrade}_${nextGrade}`;
    const successRate = DEVELOP_SUCCESS_RATE[rateKey] ?? 0;
    const roll = this.rng();

    if (roll < successRate) {
      this.stateManager.updateCity(cityId, {
        development: { ...city.development, [focus]: nextGrade },
      });
      return {
        success: true,
        description: `${city.name}의 ${focusNames[focus]}이(가) ${currentGrade}에서 ${nextGrade}로 발전했습니다.`,
        sideEffects: [],
        remainingActions: 0,
      };
    } else {
      return {
        success: true, // 행동은 소비되지만 등급 상승 실패
        description: `${city.name}의 ${focusNames[focus]} 개발을 시도했으나 아직 성과가 나지 않았습니다. (${currentGrade} 유지)`,
        sideEffects: [],
        remainingActions: 0,
      };
    }
  }

  private executeTrain(factionId: FactionId, cityId: string): ActionResult {
    const city = this.stateManager.getCity(cityId);
    if (!city) return this.fail(`도시를 찾을 수 없습니다: ${cityId}`);
    if (city.owner !== factionId) {
      return this.fail('아군 도시에서만 훈련할 수 있습니다.');
    }

    if (getTotalTroopsOfCity(city) === 0) {
      return this.fail(`${city.name}에 훈련시킬 병력이 없습니다.`);
    }

    const oldTraining = city.training;
    const newTraining = Math.min(100, city.training + TRAINING_INCREASE);
    this.stateManager.updateCity(cityId, { training: newTraining });

    // 장수 스킬 보너스
    const trainers = this.stateManager.getGeneralsByLocation(cityId)
      .filter(g => g.faction === factionId);
    const bestCommand = trainers.reduce((best, g) => {
      const val = GRADE_VALUES[g.abilities.command];
      return val > best ? val : best;
    }, 0);

    const bonus = bestCommand > 0 ? Math.floor(bestCommand * 0.05) : 0;
    if (bonus > 0) {
      const finalTraining = Math.min(100, newTraining + bonus);
      this.stateManager.updateCity(cityId, { training: finalTraining });
    }

    return {
      success: true,
      description: `${city.name}의 부대를 훈련시켰습니다. 훈련도: ${oldTraining} → ${Math.min(100, newTraining + bonus)}.`,
      sideEffects: bonus > 0 ? [`장수의 통솔 능력으로 추가 훈련 효과 (+${bonus})`] : [],
      remainingActions: 0,
    };
  }

  private executeRecruit(factionId: FactionId, cityId: string, targetGeneralId: string): ActionResult {
    const city = this.stateManager.getCity(cityId);
    if (!city) return this.fail(`도시를 찾을 수 없습니다: ${cityId}`);

    const target = this.stateManager.getGeneral(targetGeneralId);
    if (!target) return this.fail(`장수를 찾을 수 없습니다: ${targetGeneralId}`);

    if (target.faction === factionId) {
      return this.fail(`${target.name}은(는) 이미 아군입니다.`);
    }

    if (target.loyalty === '절대') {
      return {
        success: true,
        description: `${target.name}에게 등용을 시도했으나, 충성심이 절대적이라 거절당했습니다.`,
        sideEffects: [],
        remainingActions: 0,
      };
    }

    // 등용 성공률: 기본 20% + 매력 보너스
    const faction = this.stateManager.getFaction(factionId);
    const leader = faction ? this.stateManager.getGeneral(faction.leader) : undefined;
    const charismaBonus = leader ? GRADE_VALUES[leader.abilities.charisma] * 0.2 : 0;
    const loyaltyPenalty = target.loyalty === '높음' ? -15 : target.loyalty === '보통' ? 0 : 10;
    const successRate = Math.min(0.8, Math.max(0.05, (20 + charismaBonus + loyaltyPenalty) / 100));

    if (this.rng() < successRate) {
      this.stateManager.updateGeneral(targetGeneralId, {
        faction: factionId,
        location: cityId,
        loyalty: '보통',
      });
      return {
        success: true,
        description: `${target.name}이(가) ${faction?.name ?? factionId}군에 합류했습니다!`,
        sideEffects: ['충성도가 "보통"이므로 관리에 주의하십시오.'],
        remainingActions: 0,
      };
    }

    return {
      success: true,
      description: `${target.name}에게 등용을 시도했으나 거절당했습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeAssign(factionId: FactionId, generalId: string, destination: string): ActionResult {
    const general = this.stateManager.getGeneral(generalId);
    if (!general) return this.fail(`장수를 찾을 수 없습니다: ${generalId}`);
    if (general.faction !== factionId) {
      return this.fail('아군 장수만 배치할 수 있습니다.');
    }
    if (general.condition === '사망' || general.condition === '포로') {
      return this.fail(`${general.name}은(는) ${general.condition} 상태입니다.`);
    }

    const destCity = this.stateManager.getCity(destination);
    if (!destCity) return this.fail(`도시를 찾을 수 없습니다: ${destination}`);
    if (destCity.owner !== factionId) {
      return this.fail('아군 도시로만 배치할 수 있습니다.');
    }

    // 인접 도시 체크
    const currentCity = this.stateManager.getCity(general.location);
    if (currentCity && !currentCity.adjacent.includes(destination) && general.location !== destination) {
      return this.fail(`${general.name}은(는) ${currentCity.name}에 있습니다. ${destCity.name}은(는) 인접하지 않습니다.`);
    }

    const from = currentCity?.name ?? general.location;
    this.stateManager.updateGeneral(generalId, { location: destination });

    return {
      success: true,
      description: `${general.name}을(를) ${from}에서 ${destCity.name}(으)로 배치했습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeTransfer(
    factionId: FactionId,
    fromId: string,
    toId: string,
    transferType: TransferType,
    scale: TransferScale,
  ): ActionResult {
    const fromCity = this.stateManager.getCity(fromId);
    if (!fromCity) return this.fail(`도시를 찾을 수 없습니다: ${fromId}`);
    if (fromCity.owner !== factionId) {
      return this.fail('아군 도시에서만 보급할 수 있습니다.');
    }

    const toCity = this.stateManager.getCity(toId);
    if (!toCity) return this.fail(`도시를 찾을 수 없습니다: ${toId}`);
    if (toCity.owner !== factionId) {
      return this.fail('아군 도시로만 보급할 수 있습니다.');
    }

    if (fromId === toId) {
      return this.fail('같은 도시로는 보급할 수 없습니다.');
    }

    if (!fromCity.adjacent.includes(toId)) {
      return this.fail(`${fromCity.name}에서 ${toCity.name}(으)로 직접 보급할 수 없습니다. 인접하지 않습니다.`);
    }

    const scaleNames: Record<TransferScale, string> = {
      small: '소규모', medium: '중규모', large: '대규모',
    };

    if (transferType === 'troops') {
      const totalTroops = getTotalTroopsOfCity(fromCity);
      if (totalTroops <= 0) {
        return this.fail(`${fromCity.name}에 보급할 병력이 없습니다.`);
      }

      const ratio = TRANSFER_RATIOS[scale];
      const infantryMoved = Math.floor(fromCity.troops.infantry * ratio);
      const cavalryMoved = Math.floor(fromCity.troops.cavalry * ratio);
      const navyMoved = Math.floor(fromCity.troops.navy * ratio);

      this.stateManager.addCityTroops(fromId, 'infantry', -infantryMoved);
      this.stateManager.addCityTroops(fromId, 'cavalry', -cavalryMoved);
      this.stateManager.addCityTroops(fromId, 'navy', -navyMoved);

      this.stateManager.addCityTroops(toId, 'infantry', infantryMoved);
      this.stateManager.addCityTroops(toId, 'cavalry', cavalryMoved);
      this.stateManager.addCityTroops(toId, 'navy', navyMoved);

      const actualMoved = infantryMoved + cavalryMoved + navyMoved;
      return {
        success: true,
        description: `${fromCity.name}에서 ${toCity.name}(으)로 병력 ${actualMoved.toLocaleString()}명을 보급했습니다. (${scaleNames[scale]})`,
        sideEffects: [],
        remainingActions: 0,
      };
    } else {
      const amount = FOOD_TRANSFER_AMOUNTS[scale];
      if (fromCity.food < amount) {
        return this.fail(`${fromCity.name}의 군량이 부족합니다. 필요: ${amount}, 보유: ${fromCity.food}`);
      }

      this.stateManager.updateCity(fromId, { food: fromCity.food - amount });
      const toCityNow = this.stateManager.getCity(toId)!;
      this.stateManager.updateCity(toId, { food: toCityNow.food + amount });

      return {
        success: true,
        description: `${fromCity.name}에서 ${toCity.name}(으)로 군량 ${amount.toLocaleString()}을(를) 보급했습니다. (${scaleNames[scale]})`,
        sideEffects: [],
        remainingActions: 0,
      };
    }
  }

  // ─── 외교 ────────────────────────────────────────────

  private executeSendEnvoy(factionId: FactionId, target: FactionId, purpose: string): ActionResult {
    const relation = this.stateManager.getRelation(factionId, target);
    if (!relation) return this.fail(`${target}과(와)의 외교 관계가 없습니다.`);

    // 성공률 계산
    const faction = this.stateManager.getFaction(factionId);
    const leader = faction ? this.stateManager.getGeneral(faction.leader) : undefined;
    const charismaBonus = leader ? GRADE_VALUES[leader.abilities.charisma] * 0.15 : 0;
    const diplomats = this.stateManager.getGeneralsByFaction(factionId)
      .filter(g => g.skills.includes('외교'));
    const diplomatBonus = diplomats.length > 0 ? 15 : 0;
    const relationBonus = relation.value * 0.2;
    const opportunityBonus = (this.stateManager.getFlag<number>('diplomacy_bonus') ?? 0);

    const baseRate = 40;
    const successRate = Math.min(95, Math.max(10,
      baseRate + charismaBonus + diplomatBonus + relationBonus + opportunityBonus
    )) / 100;

    const roll = this.rng();
    const relationChange = roll < successRate ? 15 : -5;
    const newValue = this.stateManager.addRelationValue(factionId, target, relationChange);

    if (roll < successRate) {
      // 동맹 체결 조건: 관계 80 이상 (purpose 무관, 자동 체결)
      if (newValue >= 80 && !relation.isAlliance) {
        this.stateManager.updateRelation(factionId, target, { isAlliance: true });
        this.stateManager.setFlag('allianceStarted', true);
        if (newValue >= 90) this.stateManager.setFlag('allianceStrong', true);
        return {
          success: true,
          description: `${target}과(와) 동맹이 체결되었습니다!`,
          sideEffects: ['동맹군의 협조를 기대할 수 있습니다.'],
          remainingActions: 0,
        };
      }

      this.stateManager.setFlag('allianceStarted', true);
      return {
        success: true,
        description: `${target}에 사절을 보냈습니다. 관계가 개선되었습니다. (${relation.relation} → ${getRelationLevel(newValue)})`,
        sideEffects: [],
        remainingActions: 0,
      };
    }

    return {
      success: true,
      description: `${target}에 사절을 보냈으나 큰 성과가 없었습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executePersuade(factionId: FactionId, targetGeneralId: string, method: string): ActionResult {
    const target = this.stateManager.getGeneral(targetGeneralId);
    if (!target) return this.fail(`장수를 찾을 수 없습니다: ${targetGeneralId}`);

    if (target.faction === factionId) {
      return this.fail(`${target.name}은(는) 이미 아군입니다.`);
    }

    if (target.loyalty === '절대') {
      return {
        success: true,
        description: `${target.name}에게 회유를 시도했으나, 충의가 굳건하여 통하지 않았습니다.`,
        sideEffects: [],
        remainingActions: 0,
      };
    }

    // 설득 성공률
    const loyaltyMod = target.loyalty === '높음' ? -20 : target.loyalty === '보통' ? 0 : 15;
    const methodMod = method === '의리' ? 10 : method === '이익' ? 5 : 0;
    const successRate = Math.min(0.6, Math.max(0.05, (25 + loyaltyMod + methodMod) / 100));

    if (this.rng() < successRate) {
      this.stateManager.updateGeneral(targetGeneralId, {
        loyalty: '불안',
      });
      return {
        success: true,
        description: `${target.name}의 마음이 흔들리고 있습니다. 충성심이 약화되었습니다.`,
        sideEffects: ['다시 설득하면 투항할 수도 있습니다.'],
        remainingActions: 0,
      };
    }

    return {
      success: true,
      description: `${target.name}에 대한 회유가 실패했습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeThreaten(factionId: FactionId, target: FactionId): ActionResult {
    const relation = this.stateManager.getRelation(factionId, target);
    if (!relation) return this.fail(`${target}과(와)의 외교 관계가 없습니다.`);

    // 위협: 관계 하락, 적 일시적 행동 억제
    this.stateManager.addRelationValue(factionId, target, -15);
    this.stateManager.setFlag(`threaten_${target}`, true);

    return {
      success: true,
      description: `${target}에게 위협적인 서신을 보냈습니다. 관계가 악화되었습니다.`,
      sideEffects: ['상대의 일시적 행동 위축이 예상됩니다.'],
      remainingActions: 0,
    };
  }

  private executeGift(factionId: FactionId, target: FactionId, amount: number): ActionResult {
    const relation = this.stateManager.getRelation(factionId, target);
    if (!relation) return this.fail(`${target}과(와)의 외교 관계가 없습니다.`);

    // 자원 체크: 해당 세력 도시 중 가장 식량이 많은 곳에서 차감
    const cities = this.stateManager.getCitiesByFaction(factionId);
    const richestCity = cities.reduce((best, c) => c.food > best.food ? c : best, cities[0]);
    if (!richestCity || richestCity.food < amount) {
      return this.fail(`선물로 보낼 자원이 부족합니다.`);
    }

    this.stateManager.updateCity(richestCity.id, {
      food: richestCity.food - amount,
    });

    // 받는 쪽 도시 중 식량이 가장 적은 곳에 추가
    const targetCities = this.stateManager.getCitiesByFaction(target);
    const sideEffects: string[] = [`${richestCity.name}의 군량이 ${amount} 감소했습니다.`];
    if (targetCities.length > 0) {
      const poorestCity = targetCities.reduce((worst, c) => c.food < worst.food ? c : worst, targetCities[0]);
      this.stateManager.updateCity(poorestCity.id, {
        food: poorestCity.food + amount,
      });
      sideEffects.push(`${poorestCity.name}에 군량 ${amount}이(가) 도착했습니다.`);
    }

    const relationBonus = Math.floor(amount / 200);
    const newValue = this.stateManager.addRelationValue(factionId, target, relationBonus);

    return {
      success: true,
      description: `${target}에게 군량 ${amount}을(를) 선물했습니다. 관계가 개선되었습니다.`,
      sideEffects,
      remainingActions: 0,
    };
  }

  // ─── 군사 ────────────────────────────────────────────

  private executeMarch(
    factionId: FactionId,
    from: string, to: string, generalIds: string[], troopsScale: TroopsScale,
  ): ActionResult {
    const fromCity = this.stateManager.getCity(from);
    if (!fromCity) return this.fail(`출발 도시를 찾을 수 없습니다: ${from}`);
    if (fromCity.owner !== factionId) {
      return this.fail('아군 도시에서만 진군할 수 있습니다.');
    }

    // 인접 체크
    if (!fromCity.adjacent.includes(to)) {
      const toCity = this.stateManager.getCity(to);
      const toBf = this.stateManager.getBattlefield(to);
      const toName = toCity?.name ?? toBf?.name ?? to;
      return this.fail(`${fromCity.name}에서 ${toName}(으)로 직접 진군할 수 없습니다.`);
    }

    // 장수 체크
    const generals = generalIds.map(id => this.stateManager.getGeneral(id)).filter(Boolean);
    if (generals.length === 0) {
      return this.fail('진군할 장수가 없습니다.');
    }
    for (const g of generals) {
      if (g!.location !== from) {
        return this.fail(`${g!.name}은(는) ${fromCity.name}에 있지 않습니다.`);
      }
    }

    // 병력 계산
    const totalTroops = getTotalTroopsOfCity(fromCity);
    const scaleRatio = troopsScale === 'main' ? 0.7 : troopsScale === 'medium' ? 0.5 : 0.3;
    const marchTroops = Math.floor(totalTroops * scaleRatio);

    if (marchTroops <= 0) {
      return this.fail('진군할 병력이 없습니다.');
    }

    // 병력 차감 (비례적으로)
    const ratio = marchTroops / totalTroops;
    const infantryMoved = Math.floor(fromCity.troops.infantry * ratio);
    const cavalryMoved = Math.floor(fromCity.troops.cavalry * ratio);
    const navyMoved = Math.floor(fromCity.troops.navy * ratio);

    this.stateManager.addCityTroops(from, 'infantry', -infantryMoved);
    this.stateManager.addCityTroops(from, 'cavalry', -cavalryMoved);
    this.stateManager.addCityTroops(from, 'navy', -navyMoved);

    // 장수 이동
    for (const g of generals) {
      this.stateManager.updateGeneral(g!.id, { location: to });
    }

    const actualMarchTroops = infantryMoved + cavalryMoved + navyMoved;

    // 동맹 체크 헬퍼
    const isAllyOf = (other: FactionId) => {
      const rel = this.stateManager.getRelation(factionId, other);
      return rel?.isAlliance ?? false;
    };

    // 전투 발생 체크
    const toCity = this.stateManager.getCity(to);
    const battlefield = this.stateManager.getBattlefield(to);

    if (toCity && toCity.owner && toCity.owner !== factionId &&
        !isAllyOf(toCity.owner)) {
      // 적 도시 → 전투 발생
      const defenderGenerals = this.stateManager.getGeneralsByLocation(to)
        .filter(g => g.faction === toCity.owner);
      const defenderTroops = getTotalTroopsOfCity(toCity);

      const battle = this.battleEngine.initBattle({
        location: to,
        terrain: '평야',
        weather: this.stateManager.getState().season.includes('겨울') ? '북서풍' : '맑음',
        attackerFaction: factionId,
        attackerGenerals: generalIds,
        attackerTroops: actualMarchTroops,
        defenderFaction: toCity.owner,
        defenderGenerals: defenderGenerals.map(g => g.id),
        defenderTroops,
      });

      this.stateManager.setBattle(battle);

      return {
        success: true,
        description: `${fromCity.name}에서 ${toCity.name}(으)로 진군합니다. 적과 조우! 전투가 시작됩니다!`,
        sideEffects: [`병력 ${actualMarchTroops}명 출진`],
        remainingActions: 0,
        battleTriggered: battle,
      };
    }

    if (battlefield) {
      // 전투 지역으로 진군 → 적이 있는지 체크
      const enemies = this.stateManager.getGeneralsByLocation(to)
        .filter(g => g.faction !== factionId && !isAllyOf(g.faction));

      if (enemies.length > 0) {
        const enemyFaction = enemies[0].faction;
        // 적 병력 추정 (인접 도시 병력의 30%)
        const enemyCities = this.stateManager.getCitiesByFaction(enemyFaction);
        const estimatedTroops = enemyCities.reduce(
          (sum, c) => sum + Math.floor(getTotalTroopsOfCity(c) * 0.3), 0
        );

        // 동맹군 합류: 전투 지역에 있는 동맹 장수
        const allies = this.stateManager.getGeneralsByLocation(to)
          .filter(g => g.faction !== factionId && isAllyOf(g.faction));
        const allAttackerGenerals = [...generalIds, ...allies.map(g => g.id)];

        // 동맹 병력 추정 (동맹 도시 병력의 20%)
        const alliedTroops = allies.length > 0
          ? this.stateManager.getCitiesByFaction(allies[0].faction).reduce(
              (sum, c) => sum + Math.floor(getTotalTroopsOfCity(c) * 0.2), 0
            )
          : 0;

        const battle = this.battleEngine.initBattle({
          location: to,
          terrain: battlefield.terrain,
          weather: this.stateManager.getState().season.includes('겨울') ? '북서풍' : '맑음',
          attackerFaction: factionId,
          attackerGenerals: allAttackerGenerals,
          attackerTroops: actualMarchTroops + alliedTroops,
          defenderFaction: enemyFaction,
          defenderGenerals: enemies.map(g => g.id),
          defenderTroops: estimatedTroops,
          defenderFormation: this.stateManager.getFlag<string>('enemy_formation') ?? undefined,
        });

        this.stateManager.setBattle(battle);

        const allyNames = allies.map(g => g.name);
        const allyMsg = allyNames.length > 0
          ? ` 동맹군(${allyNames.join(', ')})이 합류합니다!`
          : '';

        return {
          success: true,
          description: `${fromCity.name}에서 ${battlefield.name}(으)로 진군합니다. 적과 조우! 전투가 시작됩니다!${allyMsg}`,
          sideEffects: [
            `병력 ${actualMarchTroops}명 출진${alliedTroops > 0 ? `, 동맹 지원 ${alliedTroops}명` : ''}`,
          ],
          remainingActions: 0,
          battleTriggered: battle,
        };
      }
    }

    // 적 없음 → 도시로 병력 이동
    if (toCity && (toCity.owner === factionId || toCity.owner === null)) {
      this.stateManager.addCityTroops(to, 'infantry', infantryMoved);
      this.stateManager.addCityTroops(to, 'cavalry', cavalryMoved);
      this.stateManager.addCityTroops(to, 'navy', navyMoved);
    }

    const destName = toCity?.name ?? battlefield?.name ?? to;
    return {
      success: true,
      description: `${fromCity.name}에서 ${destName}(으)로 병력 ${actualMarchTroops}명이 이동했습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeScout(factionId: FactionId, target: string): ActionResult {
    const targetCity = this.stateManager.getCity(target);
    const targetBattlefield = this.stateManager.getBattlefield(target);
    if (!targetCity && !targetBattlefield) {
      return this.fail(`정찰 대상을 찾을 수 없습니다: ${target}`);
    }

    // 정찰 성공률: 기본 70%
    const scouts = this.stateManager.getGeneralsByFaction(factionId)
      .filter(g => g.skills.includes('기략') || g.skills.includes('기습'));
    const scoutBonus = scouts.length > 0 ? 0.15 : 0;
    const successRate = 0.7 + scoutBonus;

    if (this.rng() < successRate) {
      // 적 정보 업데이트
      this.stateManager.setFlag(`scouted_${target}`, true);
      this.stateManager.setFlag('intel_reliability', '대략적');

      const info: string[] = [];
      if (targetCity && targetCity.owner) {
        const troops = getTotalTroopsOfCity(targetCity);
        const troopLevel = troops > 15000 ? '압도적' : troops > 8000 ? '우세' : troops > 3000 ? '비슷' : '열세';
        info.push(`병력 규모: ${troopLevel}`);
        const generals = this.stateManager.getGeneralsByLocation(target);
        if (generals.length > 0) {
          info.push(`확인된 장수: ${generals.map(g => g.name).join(', ')}`);
        }
      }

      return {
        success: true,
        description: `${targetCity?.name ?? targetBattlefield?.name}에 대한 정찰에 성공했습니다. ${info.join('. ')}`,
        sideEffects: [],
        remainingActions: 0,
      };
    }

    return {
      success: true,
      description: `정찰을 시도했으나 유의미한 정보를 얻지 못했습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeFortify(factionId: FactionId, cityId: string): ActionResult {
    const city = this.stateManager.getCity(cityId);
    if (!city) return this.fail(`도시를 찾을 수 없습니다: ${cityId}`);
    if (city.owner !== factionId) {
      return this.fail('아군 도시에서만 방비를 강화할 수 있습니다.');
    }

    const currentDefense = city.development.defense;
    const newDefense = gradeUp(currentDefense);
    const successRate = DEVELOP_SUCCESS_RATE[`${currentDefense}_${newDefense}`] ?? 0;

    if (this.rng() < successRate) {
      this.stateManager.updateCity(cityId, {
        development: { ...city.development, defense: newDefense },
      });
      return {
        success: true,
        description: `${city.name}의 방어를 강화했습니다. 방어 등급: ${currentDefense} → ${newDefense}`,
        sideEffects: [],
        remainingActions: 0,
      };
    }

    return {
      success: true,
      description: `${city.name}의 방비 강화를 시도했으나 아직 완료되지 않았습니다.`,
      sideEffects: [],
      remainingActions: 0,
    };
  }

  private executeAmbush(factionId: FactionId, location: string, generalId: string): ActionResult {
    const general = this.stateManager.getGeneral(generalId);
    if (!general) return this.fail(`장수를 찾을 수 없습니다: ${generalId}`);
    if (general.faction !== factionId) {
      return this.fail('아군 장수만 매복시킬 수 있습니다.');
    }

    // 매복 설정
    this.stateManager.setFlag(`ambush_${location}`, generalId);
    this.stateManager.updateGeneral(generalId, { location });

    const loc = this.stateManager.getCity(location);
    const bf = this.stateManager.getBattlefield(location);
    const locName = loc?.name ?? bf?.name ?? location;

    return {
      success: true,
      description: `${general.name}이(가) ${locName}에 매복을 설치했습니다.`,
      sideEffects: ['적이 이 경로로 진군하면 기습을 가할 수 있습니다.'],
      remainingActions: 0,
    };
  }

  // ─── 유틸 ────────────────────────────────────────────

  private fail(description: string): ActionResult {
    return {
      success: false,
      description,
      sideEffects: [],
      remainingActions: this.stateManager.getState().actionsRemaining,
    };
  }
}

function getRelationLevel(value: number): string {
  if (value >= 81) return '긴밀';
  if (value >= 61) return '우호';
  if (value >= 41) return '중립';
  if (value >= 21) return '냉담';
  return '적대';
}
