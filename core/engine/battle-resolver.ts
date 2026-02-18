// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전투 실행 + 결과 처리 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// GameController와 HeadlessSimulator 모두 이 모듈을 사용한다.
// 전투 턴 실행, 종료 판정, 후처리(영토 변경, 장수 귀환, 포로 등)를 담당.

import type { BattleState, FactionId } from '../data/types.js';
import type { GameStateManager } from './game-state.js';
import type { BattleEngine } from './battle-engine.js';
import { tf } from '../i18n/index.js';

/**
 * 전투 턴 1회 실행.
 * 전투 상태(battle)를 직접 변이시킨다.
 *
 * @returns 전투가 종료되었는지 여부
 */
export function executeBattleTurn(
  battle: BattleState,
  tacticId: string,
  stateManager: GameStateManager,
  battleEngine: BattleEngine,
): boolean {
  const state = stateManager.getState();
  const generals = state.generals;
  const playerFaction = stateManager.getPlayerFaction().id;
  const playerIsAttacker = battle.attackers.faction === playerFaction;

  if (playerIsAttacker) {
    battleEngine.executeTactic(battle, tacticId, generals);
  } else {
    const aiTactic = battleEngine.selectAttackerTactic(battle);
    battleEngine.executeTactic(battle, aiTactic, generals, tacticId);
  }

  const endCheck = battleEngine.checkBattleEnd(battle);
  if (endCheck.isOver) {
    battle.isOver = true;
    battle.result = endCheck.result ?? null;
    return true;
  }

  return false;
}

/**
 * 전투 종료 후 후처리:
 * - 적벽 승리 플래그
 * - 전장 장수 양측 귀환
 * - 도시 점령
 * - 공격 패배/무승부 시 공격측 장수 귀환
 * - 포로 처리
 * - 도시 병력 비율 갱신
 * - actionLog 기록
 * - activeBattle 해제
 */
export function processBattleResult(
  battle: BattleState,
  stateManager: GameStateManager,
): void {
  const state = stateManager.getState();
  const playerFaction = stateManager.getPlayerFaction().id;
  const winner = battle.result?.winner ?? null;
  const loser = battle.result?.loser ?? null;
  const battleLocation = battle.location;
  const bf = state.battlefields.find(b => b.id === battleLocation);
  const battleCity = stateManager.getCity(battleLocation);

  if (bf) {
    // 전장 전투 (적벽 등)
    if (bf.id === 'chibi' && winner === playerFaction) {
      stateManager.setFlag('chibiVictory', true);
    }

    // 전장 전투 종료 후 양측 장수를 인접 아군 도시로 자동 귀환
    const returnFactions: FactionId[] = [battle.attackers.faction, battle.defenders.faction];
    for (const faction of returnFactions) {
      const returnCity = bf.adjacentCities
        .map(id => stateManager.getCity(id))
        .find(c => c && c.owner === faction);
      if (!returnCity) continue;
      const factionGenerals = faction === battle.attackers.faction
        ? battle.attackers.generals : battle.defenders.generals;
      for (const gId of factionGenerals) {
        const g = stateManager.getGeneral(gId);
        if (g && g.condition !== '포로' && g.location === bf.id) {
          stateManager.updateGeneral(gId, { location: returnCity.id });
        }
      }
      // 잔여 병력을 귀환 도시에 추가
      const factionTroops = faction === battle.attackers.faction
        ? battle.attackers.troops : battle.defenders.troops;
      if (factionTroops > 0) {
        stateManager.addCityTroops(returnCity.id, 'infantry', factionTroops);
      }
    }
  } else if (battleCity) {
    // 도시 전투 — 공격측 승리 시 도시 점령
    if (winner && winner !== battleCity.owner) {
      battle.result!.territoryChange = battleCity.name;
      stateManager.updateCity(battleCity.id, { owner: winner });
    }
  }

  // 공격 패배 또는 무승부 시 공격측 장수 귀환
  if (loser === battle.attackers.faction || winner === null) {
    const lastMarchLog = [...state.actionLog].reverse().find(
      log => log.action.action === 'march' && log.result.battleTriggered
    );
    const returnTo = lastMarchLog?.action.action === 'march'
      ? lastMarchLog.action.params.from
      : null;
    if (returnTo) {
      for (const gId of battle.attackers.generals) {
        const g = stateManager.getGeneral(gId);
        if (g && g.condition !== '포로') {
          stateManager.updateGeneral(gId, { location: returnTo });
        }
      }
    }
  }

  // 포로 처리
  if (battle.result?.capturedGenerals) {
    for (const gId of battle.result.capturedGenerals) {
      stateManager.updateGeneral(gId, { condition: '포로' });
    }
  }

  // 도시 전투 후: 방어 도시 병력을 전투 잔여 병력으로 갱신
  if (battleCity) {
    const defenderIsOwner = battle.defenders.faction === battleCity.owner;
    if (defenderIsOwner) {
      const remainingTroops = battle.defenders.troops;
      const currentTotal = battleCity.troops.infantry + battleCity.troops.cavalry + battleCity.troops.navy;
      if (currentTotal > 0) {
        const ratio = remainingTroops / currentTotal;
        stateManager.updateCity(battleCity.id, {
          troops: {
            infantry: Math.floor(battleCity.troops.infantry * ratio),
            cavalry: Math.floor(battleCity.troops.cavalry * ratio),
            navy: Math.floor(battleCity.troops.navy * ratio),
          },
        });
      }
    }
  }

  // 전투 종료 시 결과를 actionLog에 기록
  if (battle.result) {
    const locCity = stateManager.getCity(battle.location);
    const bfName = state.battlefields.find(b => b.id === battle.location)?.name;
    const locName = locCity?.name ?? bfName ?? battle.location;
    stateManager.addActionLog({
      turn: state.turn,
      action: { type: 'military', action: 'battle_result', params: { location: battle.location } } as any,
      result: {
        success: battle.result.winner === playerFaction,
        description: battle.result.winner === playerFaction
          ? tf('{loc} 전투에서 승리했습니다!', { loc: locName })
          : battle.result.winner === null
            ? tf('{loc} 전투가 무승부로 끝났습니다.', { loc: locName })
            : tf('{loc} 전투에서 패배했습니다.', { loc: locName }),
        sideEffects: [],
        remainingActions: state.actionsRemaining,
        battleTriggered: battle,
      },
    });
  }

  // 전투 상태 해제
  stateManager.setBattle(null);
}
