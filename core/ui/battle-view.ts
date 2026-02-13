// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전투 화면 컴포넌트
// 전투 상태 → 시각 표현 매핑
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { BattleState, Tactic } from '../data/types.js';
import type { BattleViewState, CharacterDisplayState, Expression } from './types.js';
import { getBattleBgPath, getTacticCardPath } from './types.js';
import { resolveExpression } from './character-display.js';

// ─── BattleView 클래스 ──────────────────────────────

export class BattleView {
  private state: BattleViewState;

  constructor(battle: BattleState) {
    this.state = {
      battle,
      attackerDisplay: battle.attackers.generals.map(gId => ({
        generalId: gId,
        expression: 'default' as Expression,
        isSpeaking: false,
        isDimmed: false,
        position: 'left' as const,
      })),
      defenderDisplay: battle.defenders.generals.map(gId => ({
        generalId: gId,
        expression: 'default' as Expression,
        isSpeaking: false,
        isDimmed: false,
        position: 'right' as const,
      })),
      selectedTacticId: null,
      isAnimating: false,
      activeEffect: null,
    };
  }

  /** 전투 상태를 갱신한다. */
  updateBattle(battle: BattleState): void {
    this.state.battle = battle;
  }

  /** 전술을 선택한다. */
  selectTactic(tacticId: string | null): void {
    this.state.selectedTacticId = tacticId;
  }

  /** 전술 실행 후 연출 상태를 설정한다. */
  playTacticAnimation(tacticId: string): void {
    this.state.isAnimating = true;

    // 전술에 따른 이펙트 결정
    if (tacticId === 'fire_attack' || tacticId === 'fire_ships') {
      this.state.activeEffect = 'fire';
    } else if (tacticId === 'charge' || tacticId === 'cavalry_charge') {
      this.state.activeEffect = 'charge';
    } else {
      this.state.activeEffect = null;
    }

    // 공격자: 전투 표정
    for (const display of this.state.attackerDisplay) {
      display.expression = resolveExpression(display.generalId, { type: 'battle_win' });
    }

    // 방어자: 위협 표정
    for (const display of this.state.defenderDisplay) {
      display.expression = resolveExpression(display.generalId, { type: 'threat' });
    }
  }

  /** 애니메이션 완료 처리. */
  finishAnimation(): void {
    this.state.isAnimating = false;
    this.state.activeEffect = null;
  }

  /** 전투 결과에 따른 표정을 설정한다. */
  setResultExpressions(attackerWon: boolean): void {
    const winContext = { type: 'battle_win' as const };
    const loseContext = { type: 'battle_lose' as const };

    for (const display of this.state.attackerDisplay) {
      display.expression = resolveExpression(
        display.generalId,
        attackerWon ? winContext : loseContext,
      );
    }
    for (const display of this.state.defenderDisplay) {
      display.expression = resolveExpression(
        display.generalId,
        attackerWon ? loseContext : winContext,
      );
    }
  }

  /** 현재 상태를 반환한다. */
  getState(): Readonly<BattleViewState> {
    return this.state;
  }

  /** 전투 배경 에셋 경로. */
  getBackgroundPath(): string {
    return getBattleBgPath(this.state.battle.terrain);
  }

  /** 바람 이펙트 표시 여부 (동남풍). */
  shouldShowWindEffect(): boolean {
    return this.state.battle.weather === '동남풍';
  }

  /** HP 바 퍼센트 계산. */
  getTroopPercentage(side: 'attacker' | 'defender'): number {
    const force = side === 'attacker'
      ? this.state.battle.attackers
      : this.state.battle.defenders;
    return Math.max(0, Math.round((force.troops / force.initialTroops) * 100));
  }

  /** 사기 바 퍼센트. */
  getMoralePercentage(side: 'attacker' | 'defender'): number {
    const force = side === 'attacker'
      ? this.state.battle.attackers
      : this.state.battle.defenders;
    return Math.max(0, Math.min(100, force.morale));
  }

  /** 전술 카드 에셋 경로 목록. */
  getTacticCards(): Array<{ tactic: Tactic; assetPath: string; isSelected: boolean }> {
    return this.state.battle.availableTactics.map(t => ({
      tactic: t,
      assetPath: getTacticCardPath(t.id),
      isSelected: t.id === this.state.selectedTacticId,
    }));
  }
}
