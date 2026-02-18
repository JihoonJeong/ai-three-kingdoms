// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 난이도 조정 시스템 — DifficultyModifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 시나리오 생성 후 GameState를 직접 변형하여 난이도를 조절한다.
// createRedCliffsScenario()는 수정하지 않는다 (순수 함수 유지).

import type { GameState } from '../core/data/types.js';

export interface DifficultyParams {
  /** 적벽 후 남군 병력 감소 비율 (기본 0.5 = 50% 감소) */
  nanjunCollapseRatio: number;

  /** 남군 사기 페널티 (기본 -25) */
  nanjunMoralePenalty: number;

  /** 손권 식량 지원량 (0이면 없음) */
  sunQuanFoodSupport: number;

  /** 남군 초기 병력 배수 (1.0 = 기본, 0.5 = 절반) */
  nanjunTroopMultiplier: number;

  /** 플레이어 초기 식량 배수 (1.0 = 기본) */
  playerFoodMultiplier: number;

  /** 손권 매 턴 식량 지원 중단 임계값 (기본 5000 = 자기 식량 5000 이하면 중단) */
  sunQuanSupportFloor: number;
}

export const DIFFICULTY_PRESETS: Record<string, DifficultyParams> = {
  easy: {
    nanjunCollapseRatio: 0.7,      // 잔존 ~4,830  (검증: 2A+1B)
    nanjunMoralePenalty: -40,
    sunQuanFoodSupport: 5000,
    nanjunTroopMultiplier: 0.7,
    playerFoodMultiplier: 1.5,
    sunQuanSupportFloor: 5000,
  },
  medium: {
    nanjunCollapseRatio: 0.65,     // 잔존 ~6,440  (easy↔normal 사이)
    nanjunMoralePenalty: -35,
    sunQuanFoodSupport: 4000,
    nanjunTroopMultiplier: 0.8,    // 초기 병력 80% (23000 → 18400)
    playerFoodMultiplier: 1.35,
    sunQuanSupportFloor: 5000,
  },
  normal: {
    nanjunCollapseRatio: 0.6,      // 잔존 ~7,820  (구 medium)
    nanjunMoralePenalty: -30,
    sunQuanFoodSupport: 3000,
    nanjunTroopMultiplier: 0.85,
    playerFoodMultiplier: 1.25,
    sunQuanSupportFloor: 5000,
  },
  hard: {
    nanjunCollapseRatio: 0.5,      // 잔존 ~11,500 (구 normal)
    nanjunMoralePenalty: -25,
    sunQuanFoodSupport: 0,
    nanjunTroopMultiplier: 1.0,
    playerFoodMultiplier: 1.0,
    sunQuanSupportFloor: 3000,     // 손권이 더 적극적으로 지원 (3000까지)
  },
  expert: {
    nanjunCollapseRatio: 0.3,      // (구 hard)
    nanjunMoralePenalty: -15,
    sunQuanFoodSupport: 0,
    nanjunTroopMultiplier: 1.2,
    playerFoodMultiplier: 1.0,     // 식량 감소 삭제 (기본값)
    sunQuanSupportFloor: 5000,
  },
};

/**
 * 시나리오 초기 상태에 난이도 파라미터를 적용한다.
 * createRedCliffsScenario() 호출 직후에 사용.
 */
export function applyDifficultyModifier(
  state: GameState,
  difficulty: 'easy' | 'medium' | 'normal' | 'hard' | 'expert',
): void {
  const params = DIFFICULTY_PRESETS[difficulty];
  if (!params) return;

  // 1. 남군 초기 병력 조정
  const nanjun = state.cities.find(c => c.id === 'nanjun');
  if (nanjun) {
    nanjun.troops.infantry = Math.floor(nanjun.troops.infantry * params.nanjunTroopMultiplier);
    nanjun.troops.cavalry = Math.floor(nanjun.troops.cavalry * params.nanjunTroopMultiplier);
    nanjun.troops.navy = Math.floor(nanjun.troops.navy * params.nanjunTroopMultiplier);
  }

  // 2. 플레이어 초기 식량 조정
  for (const city of state.cities) {
    if (city.owner === '유비') {
      city.food = Math.floor(city.food * params.playerFoodMultiplier);
    }
  }

  // 3. 난이도를 flags에 기록 (이벤트 시스템에서 참조)
  state.flags['difficulty'] = difficulty;
  state.flags['nanjunCollapseRatio'] = params.nanjunCollapseRatio;
  state.flags['nanjunMoralePenalty'] = params.nanjunMoralePenalty;
  state.flags['sunQuanFoodSupport'] = params.sunQuanFoodSupport;
  state.flags['sunQuanSupportFloor'] = params.sunQuanSupportFloor;
}
