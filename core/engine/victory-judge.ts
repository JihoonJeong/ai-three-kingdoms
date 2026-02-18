// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 승리 판정
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GameState, GameResult, GameOverCheck, VictoryGrade } from '../data/types.js';
import { t } from '../i18n/index.js';

export class VictoryJudge {
  checkGameOver(state: GameState): GameOverCheck {
    // 유비 사망/포로 → 즉시 게임 오버
    const liubei = state.generals.find(g => g.id === 'liubei');
    if (liubei && (liubei.condition === '사망' || liubei.condition === '포로')) {
      return {
        isOver: true,
        reason: liubei.condition === '사망'
          ? t('유비가 전사했습니다. 게임 오버.')
          : t('유비가 포로가 되었습니다. 게임 오버.'),
      };
    }

    // 유비군 도시가 0개 → 게임 오버
    const playerCities = state.cities.filter(c => c.owner === '유비');
    if (playerCities.length === 0) {
      return {
        isOver: true,
        reason: t('모든 거점을 잃었습니다. 게임 오버.'),
      };
    }

    // 턴 초과 → 게임 종료 (등급 판정)
    if (state.turn >= state.maxTurns) {
      return {
        isOver: true,
        reason: t('최대 턴에 도달했습니다. 게임 종료.'),
      };
    }

    return { isOver: false };
  }

  judge(state: GameState): GameResult {
    const chibiVictory = !!state.flags['chibiVictory'];
    const nanjunCaptured = state.cities.find(c => c.id === 'nanjun')?.owner === '유비';
    const jianglingCaptured = state.cities.find(c => c.id === 'jiangling')?.owner === '유비';
    const allianceMaintained = this.isAllianceMaintained(state);
    const generalsLost = this.countGeneralsLost(state);
    const battlesWon = this.countBattlesWon(state);
    const battlesLost = this.countBattlesLost(state);
    const citiesCaptured = this.countCitiesCaptured(state);
    const enemiesDefeated = this.countEnemiesDefeated(state);
    const generalsCaptured = this.countGeneralsCaptured(state);
    const maxTroops = this.getMaxTroops(state);

    const stats = {
      totalTurns: state.turn,
      battlesWon,
      battlesLost,
      citiesCaptured,
      generalsLost,
      allianceMaintained,
      enemiesDefeated,
      generalsCaptured,
      maxTroops,
    };

    // 유비 사망/포로 → F
    const liubei = state.generals.find(g => g.id === 'liubei');
    if (liubei && (liubei.condition === '사망' || liubei.condition === '포로')) {
      return {
        grade: 'F',
        title: t('패망'),
        description: t('유비가 쓰러졌습니다. 한실 부흥의 꿈은 여기서 끝입니다.'),
        stats,
      };
    }

    // 도시 없음 → F
    if (state.cities.filter(c => c.owner === '유비').length === 0) {
      return {
        grade: 'F',
        title: t('항복'),
        description: t('모든 거점을 잃었습니다. 유비군은 역사 속으로 사라집니다.'),
        stats,
      };
    }

    let grade: VictoryGrade;
    let title: string;
    let description: string;

    if (chibiVictory && nanjunCaptured && jianglingCaptured && allianceMaintained && generalsLost === 0) {
      grade = 'S';
      title = t('천하삼분의 기틀');
      description = t('적벽 대승, 형주 완전 장악, 동맹 건재, 장수 무손실. 천하삼분지계의 완벽한 첫 걸음입니다.');
    } else if (chibiVictory && nanjunCaptured && allianceMaintained) {
      grade = 'A';
      title = t('형주의 주인');
      description = t('적벽에서 승리하고 남군을 확보했습니다. 손권과의 동맹도 유지됩니다. 훌륭한 성과입니다.');
    } else if (chibiVictory && citiesCaptured > 0) {
      grade = 'B';
      title = t('적벽의 영웅');
      description = t('적벽에서 승리하고 영토를 일부 확보했습니다. 더 많은 것을 얻을 수 있었지만, 나쁘지 않습니다.');
    } else if (chibiVictory) {
      grade = 'C';
      title = t('아쉬운 승리');
      description = t('적벽에서 승리했으나 후속 영토 확보에 실패했습니다. 전쟁은 이겼으나 평화의 과실을 놓쳤습니다.');
    } else if (!chibiVictory && liubei?.condition === '양호') {
      grade = 'D';
      title = t('패배 속의 생존');
      description = citiesCaptured >= 3
        ? t('적벽 대전을 거치지 않았으나, 독자적인 길로 천하를 호령했습니다.')
        : t('적벽에서 패했으나 유비는 살아남았습니다. 다시 일어설 수 있는 기회는 남아있습니다.');
    } else {
      grade = 'F';
      title = t('완패');
      description = t('전쟁에 패하고 유비군은 와해되었습니다.');
    }

    return { grade, title, description, stats };
  }

  private isAllianceMaintained(state: GameState): boolean {
    const relation = state.diplomacy.relations.find(
      r => (r.factionA === '유비' && r.factionB === '손권') ||
           (r.factionA === '손권' && r.factionB === '유비')
    );
    return relation?.isAlliance ?? false;
  }

  private countGeneralsLost(state: GameState): number {
    return state.generals.filter(
      g => g.faction === '유비' && (g.condition === '사망' || g.condition === '포로')
    ).length;
  }

  private countBattlesWon(state: GameState): number {
    return state.actionLog.filter(
      log => log.result.battleTriggered?.result?.winner === '유비'
    ).length;
  }

  private countBattlesLost(state: GameState): number {
    return state.actionLog.filter(
      log => log.result.battleTriggered?.result?.loser === '유비'
    ).length;
  }

  private countCitiesCaptured(state: GameState): number {
    // 초기에 유비 소유가 아닌 도시 중 현재 유비 소유인 도시 수
    const initialPlayerCities = ['gangha', 'hagu'];
    return state.cities.filter(
      c => c.owner === '유비' && !initialPlayerCities.includes(c.id)
    ).length;
  }

  /** 격파한 적 병력 총합 (유비가 승리한 전투의 적 피해) */
  private countEnemiesDefeated(state: GameState): number {
    let total = 0;
    for (const log of state.actionLog) {
      const battle = log.result.battleTriggered;
      if (!battle?.result || !battle.log) continue;
      // 유비가 참여한 전투에서의 적 피해만 합산
      const isAttacker = battle.attackers?.faction === '유비';
      const isDefender = battle.defenders?.faction === '유비';
      if (!isAttacker && !isDefender) continue;
      for (const turnLog of battle.log) {
        total += isAttacker ? turnLog.defenderCasualties : turnLog.attackerCasualties;
      }
    }
    return total;
  }

  /** 유비가 포로로 잡은 적장 수 */
  private countGeneralsCaptured(state: GameState): number {
    let total = 0;
    for (const log of state.actionLog) {
      const battle = log.result.battleTriggered;
      if (!battle?.result) continue;
      if (battle.result.winner === '유비' && battle.result.capturedGenerals) {
        total += battle.result.capturedGenerals.length;
      }
    }
    return total;
  }

  /** 최대 보유 병력 (flags에 기록된 peak 또는 현재 계산) */
  private getMaxTroops(state: GameState): number {
    const peak = typeof state.flags['_maxTroops'] === 'number'
      ? state.flags['_maxTroops'] as number
      : 0;
    const current = this.calcCurrentTroops(state);
    return Math.max(peak, current);
  }

  private calcCurrentTroops(state: GameState): number {
    return state.cities
      .filter(c => c.owner === '유비')
      .reduce((sum, c) => sum + (c.troops?.infantry ?? 0) + (c.troops?.cavalry ?? 0) + (c.troops?.navy ?? 0), 0);
  }
}
