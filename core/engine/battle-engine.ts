// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전투 엔진
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  BattleState, BattleForce, BattleResult, BattleTurnLog,
  BattleInitParams, Tactic, General, FactionId, TerrainType,
} from '../data/types.js';
import {
  GRADE_VALUES, TACTIC_DATA, BATTLE_DEFEAT_TROOP_RATIO,
  BATTLE_DEFEAT_MORALE, MAX_BATTLE_TURNS,
} from '../data/types.js';
import { t, tf } from '../i18n/index.js';

export interface BattleTurnResult {
  log: BattleTurnLog;
  battleOver: boolean;
  result: BattleResult | null;
}

export class BattleEngine {
  constructor(private rng: () => number = Math.random) {}

  initBattle(params: BattleInitParams): BattleState {
    const battleId = `battle-${Date.now()}-${Math.floor(this.rng() * 1000)}`;

    const battle: BattleState = {
      battleId,
      location: params.location,
      terrain: params.terrain,
      weather: params.weather ?? '맑음',
      battleTurn: 1,
      maxBattleTurns: MAX_BATTLE_TURNS,
      attackers: {
        faction: params.attackerFaction,
        generals: params.attackerGenerals,
        troops: params.attackerTroops,
        initialTroops: params.attackerTroops,
        morale: 70,
        formation: null,
      },
      defenders: {
        faction: params.defenderFaction,
        generals: params.defenderGenerals,
        troops: params.defenderTroops,
        initialTroops: params.defenderTroops,
        morale: 70,
        formation: params.defenderFormation ?? null,
      },
      availableTactics: [],
      log: [],
      isOver: false,
      result: null,
    };

    battle.availableTactics = this.getAvailableTactics(battle);
    return battle;
  }

  executeTactic(
    battle: BattleState,
    tacticId: string,
    generals: General[],
    defenderTacticId?: string,
  ): BattleTurnResult {
    if (battle.isOver) {
      throw new Error('전투가 이미 종료되었습니다.');
    }

    const tacticData = TACTIC_DATA[tacticId];
    if (!tacticData) {
      throw new Error(`알 수 없는 전술입니다: ${tacticId}`);
    }

    // 방어측 전술 (AI 자동 선택)
    const defTacticId = defenderTacticId ?? this.selectDefenderTactic(battle);
    const defTacticData = TACTIC_DATA[defTacticId] ?? TACTIC_DATA['frontal_assault']!;

    // 공격력 계산
    const attackerPower = this.calculatePower(
      battle.attackers, tacticData.attackMultiplier,
      this.getAttackerGenerals(generals, battle.attackers.faction),
      battle.terrain, battle.weather,
    );

    const defenderPower = this.calculatePower(
      battle.defenders, defTacticData.attackMultiplier,
      this.getDefenderGenerals(generals, battle.defenders.faction),
      battle.terrain, battle.weather,
    );

    // 전술 특수 효과
    let attackerBonus = 1.0;
    let defenderBonus = 1.0;

    // 화공 특수 효과
    if (tacticId === 'fire_attack' || tacticId === 'fire_ships') {
      if (battle.defenders.formation === '연환진') {
        attackerBonus *= 2.0;
      }
      if (battle.weather === '동남풍') {
        attackerBonus *= 1.5;
      }
      // 화공 실패 조건
      if (battle.weather.includes('북') && tacticId === 'fire_attack') {
        attackerBonus *= 0.3; // 역풍이면 효과 대폭 감소
      }
    }

    // 수성 보너스
    if (defTacticId === 'defend') {
      defenderBonus *= 1.5;
    }

    const finalAttack = attackerPower * attackerBonus;
    const finalDefend = defenderPower * defenderBonus;

    // 피해 계산
    const attackerDamage = Math.floor(
      finalDefend * tacticData.damageMultiplier * (0.8 + this.rng() * 0.4)
    );
    const defenderDamage = Math.floor(
      finalAttack * defTacticData.damageMultiplier * (0.8 + this.rng() * 0.4)
    );

    // 병력 감소
    battle.attackers.troops = Math.max(0, battle.attackers.troops - attackerDamage);
    battle.defenders.troops = Math.max(0, battle.defenders.troops - defenderDamage);

    // 사기 변화
    const attackerWinning = defenderDamage > attackerDamage;
    const attackerMoraleChange = attackerWinning ? 5 : tacticData.moraleEffect;
    const defenderMoraleChange = attackerWinning ? defTacticData.moraleEffect : 5;

    battle.attackers.morale = Math.max(0, Math.min(100,
      battle.attackers.morale + attackerMoraleChange
    ));
    battle.defenders.morale = Math.max(0, Math.min(100,
      battle.defenders.morale + defenderMoraleChange
    ));

    // 전투 로그
    const log: BattleTurnLog = {
      battleTurn: battle.battleTurn,
      attackerTactic: tacticData.name,
      defenderTactic: defTacticData.name,
      description: this.generateBattleDescription(
        tacticData.name, defTacticData.name,
        attackerDamage, defenderDamage, attackerWinning,
      ),
      attackerCasualties: attackerDamage,
      defenderCasualties: defenderDamage,
      attackerMoraleChange,
      defenderMoraleChange,
    };

    battle.log.push(log);
    battle.battleTurn++;

    // 전투 종료 판정
    const endCheck = this.checkBattleEnd(battle);
    if (endCheck.isOver) {
      battle.isOver = true;
      battle.result = endCheck.result!;
    }

    // 가용 전술 갱신
    battle.availableTactics = this.getAvailableTactics(battle);

    return {
      log,
      battleOver: battle.isOver,
      result: battle.result,
    };
  }

  checkBattleEnd(battle: BattleState): { isOver: boolean; result: BattleResult | null } {
    const { attackers, defenders } = battle;

    // 병력 30% 이하 체크
    const attackerRatio = attackers.troops / attackers.initialTroops;
    const defenderRatio = defenders.troops / defenders.initialTroops;

    const attackerDefeated = attackerRatio <= BATTLE_DEFEAT_TROOP_RATIO ||
                              attackers.morale <= BATTLE_DEFEAT_MORALE ||
                              attackers.troops <= 0;
    const defenderDefeated = defenderRatio <= BATTLE_DEFEAT_TROOP_RATIO ||
                              defenders.morale <= BATTLE_DEFEAT_MORALE ||
                              defenders.troops <= 0;

    // 양쪽 다 패배 → 대치 (무승부)
    if (attackerDefeated && defenderDefeated) {
      return {
        isOver: true,
        result: {
          winner: null,
          loser: null,
          capturedGenerals: [],
          spoils: [],
          territoryChange: null,
        },
      };
    }

    if (defenderDefeated) {
      return {
        isOver: true,
        result: this.createVictoryResult(attackers, defenders),
      };
    }

    if (attackerDefeated) {
      return {
        isOver: true,
        result: this.createVictoryResult(defenders, attackers),
      };
    }

    // 최대 전투 턴 초과
    if (battle.battleTurn > battle.maxBattleTurns) {
      // 총 피해 비교: 더 많은 피해를 입힌 쪽이 승리
      const totalAttackerCasualties = battle.log.reduce((s, l) => s + l.attackerCasualties, 0);
      const totalDefenderCasualties = battle.log.reduce((s, l) => s + l.defenderCasualties, 0);

      if (totalDefenderCasualties > totalAttackerCasualties * 1.1) {
        // 공격측이 10% 이상 더 많은 피해를 입힘 → 공격 승
        return {
          isOver: true,
          result: this.createVictoryResult(attackers, defenders),
        };
      } else if (totalAttackerCasualties > totalDefenderCasualties * 1.1) {
        // 방어측이 10% 이상 더 많은 피해를 입힘 → 방어 승
        return {
          isOver: true,
          result: this.createVictoryResult(defenders, attackers),
        };
      }
      // 대치 (무승부)
      return {
        isOver: true,
        result: {
          winner: null,
          loser: null,
          capturedGenerals: [],
          spoils: [],
          territoryChange: null,
        },
      };
    }

    return { isOver: false, result: null };
  }

  getAvailableTactics(battle: BattleState): Tactic[] {
    const tactics: Tactic[] = [];

    // 정면돌격: 항상 가능
    tactics.push({
      id: 'frontal_assault',
      name: TACTIC_DATA['frontal_assault']!.name,
      description: TACTIC_DATA['frontal_assault']!.description,
      risk: TACTIC_DATA['frontal_assault']!.risk,
      requirements: null,
    });

    // 화공: 적 밀집 + 풍향 유리
    if (battle.defenders.formation === '연환진' || battle.weather === '동남풍') {
      tactics.push({
        id: 'fire_attack',
        name: TACTIC_DATA['fire_attack']!.name,
        description: TACTIC_DATA['fire_attack']!.description,
        risk: TACTIC_DATA['fire_attack']!.risk,
        requirements: battle.weather === '동남풍' ? null : t('동남풍 시 효과 극대화'),
      });
    }

    // 매복: 사전 배치 필요
    // (flags에서 체크)
    tactics.push({
      id: 'ambush',
      name: TACTIC_DATA['ambush']!.name,
      description: TACTIC_DATA['ambush']!.description,
      risk: TACTIC_DATA['ambush']!.risk,
      requirements: t('사전 매복 배치 시 효과 증가'),
    });

    // 수성: 방어 시
    tactics.push({
      id: 'defend',
      name: TACTIC_DATA['defend']!.name,
      description: TACTIC_DATA['defend']!.description,
      risk: TACTIC_DATA['defend']!.risk,
      requirements: null,
    });

    // 위장퇴각: 지략 B 이상
    tactics.push({
      id: 'feigned_retreat',
      name: TACTIC_DATA['feigned_retreat']!.name,
      description: TACTIC_DATA['feigned_retreat']!.description,
      risk: TACTIC_DATA['feigned_retreat']!.risk,
      requirements: t('지략 B 이상 장수 필요'),
    });

    // 돌격: 무력 A 이상
    tactics.push({
      id: 'charge',
      name: TACTIC_DATA['charge']!.name,
      description: TACTIC_DATA['charge']!.description,
      risk: TACTIC_DATA['charge']!.risk,
      requirements: t('무력 A 이상 장수 필요'),
    });

    // 화선: 수상전
    if (battle.terrain === '수상') {
      tactics.push({
        id: 'fire_ships',
        name: TACTIC_DATA['fire_ships']!.name,
        description: TACTIC_DATA['fire_ships']!.description,
        risk: TACTIC_DATA['fire_ships']!.risk,
        requirements: battle.weather === '동남풍' ? null : t('동남풍 시 효과 극대화'),
      });
    }

    return tactics;
  }

  selectAttackerTactic(battle: BattleState): string {
    const { attackers } = battle;
    const ratio = attackers.troops / attackers.initialTroops;
    if (ratio < 0.4) return 'defend';
    if (this.rng() < 0.3) return 'charge';
    return 'frontal_assault';
  }

  // ─── 내부 계산 ───────────────────────────────────────

  private calculatePower(
    force: BattleForce,
    tacticMultiplier: number,
    generals: General[],
    terrain: TerrainType,
    weather: string,
  ): number {
    // 기본 전투력
    const basePower = force.troops * 0.1;

    // 장수 보너스
    let generalBonus = 0;
    if (generals.length > 0) {
      const avgAbility = generals.reduce((sum, g) => {
        return sum + (GRADE_VALUES[g.abilities.command] + GRADE_VALUES[g.abilities.martial]) / 2;
      }, 0) / generals.length;
      generalBonus = avgAbility * force.troops * 0.001;
    }

    // 사기 보정
    const moraleModifier = force.morale / 70; // 70이 기준

    // 지형 보정
    let terrainModifier = 1.0;
    if (terrain === '수상') {
      terrainModifier = 0.8; // 수상전은 기본 불리 (수전 스킬 없으면)
      if (generals.some(g => g.skills.includes('수전'))) {
        terrainModifier = 1.2; // 수전 스킬 있으면 유리
      }
    } else if (terrain === '산지') {
      terrainModifier = 0.9;
    }

    return (basePower + generalBonus) * moraleModifier * terrainModifier * tacticMultiplier;
  }

  private selectDefenderTactic(battle: BattleState): string {
    // AI 방어 전술 선택 (간단한 룰 기반)
    const { defenders } = battle;
    const ratio = defenders.troops / defenders.initialTroops;

    if (ratio < 0.5) return 'defend';         // 열세면 수성
    if (defenders.formation === '연환진') return 'frontal_assault'; // 연환진이면 정면돌격
    if (this.rng() < 0.3) return 'charge';    // 30% 확률 돌격
    return 'frontal_assault';                  // 기본 정면돌격
  }

  private getAttackerGenerals(allGenerals: General[], faction: FactionId): General[] {
    return allGenerals.filter(g => g.faction === faction);
  }

  private getDefenderGenerals(allGenerals: General[], faction: FactionId): General[] {
    return allGenerals.filter(g => g.faction === faction);
  }

  private createVictoryResult(winner: BattleForce, loser: BattleForce): BattleResult {
    // 포로 확률: 패배 측 장수 20% 확률
    const captured = loser.generals.filter(() => this.rng() < 0.2);

    return {
      winner: winner.faction,
      loser: loser.faction,
      capturedGenerals: captured,
      spoils: loser.troops > 0 ? [tf('잔여 병력 {troops}명 확보', { troops: loser.troops })] : [],
      territoryChange: null, // 호출자가 설정
    };
  }

  private generateBattleDescription(
    attackerTactic: string,
    defenderTactic: string,
    attackerCasualties: number,
    defenderCasualties: number,
    attackerWinning: boolean,
  ): string {
    const aTactic = t(attackerTactic);
    const dTactic = t(defenderTactic);

    if (attackerTactic === '화공' || attackerTactic === '화선') {
      if (attackerWinning) {
        return tf('{tactic}이(가) 적진을 휩쓸었습니다! 방어측 피해 {casualties}명.', { tactic: aTactic, casualties: defenderCasualties });
      }
      return tf('{tactic}을(를) 시도했으나 효과가 미미합니다. 공격측 피해 {casualties}명.', { tactic: aTactic, casualties: attackerCasualties });
    }

    if (attackerWinning) {
      return tf('공격측의 {aTactic}이(가) 방어측의 {dTactic}을(를) 제압했습니다. 방어측 -{dCas}명, 공격측 -{aCas}명.', { aTactic, dTactic, dCas: defenderCasualties, aCas: attackerCasualties });
    }
    return tf('방어측의 {dTactic}이(가) 공격측의 {aTactic}을(를) 막아냈습니다. 공격측 -{aCas}명, 방어측 -{dCas}명.', { dTactic, aTactic, aCas: attackerCasualties, dCas: defenderCasualties });
  }
}
