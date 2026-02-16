// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전투 전술 자동 선택 (규칙 기반)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 헤드리스 시뮬레이션에서 플레이어 측 전투 전술을 자동으로 선택한다.
// 기본: 규칙 기반 (LLM 호출 불필요, 빠름)

import type { BattleState } from '../core/data/types.js';

/**
 * 규칙 기반 전투 전술 선택.
 *  - 화공 가능하면 화공 (적벽 화공 시나리오 핵심)
 *  - 화선 가능하면 화선
 *  - 매복 가능하면 매복
 *  - 위장퇴각 가능하면 위장퇴각
 *  - 돌격 가능하면 돌격
 *  - 기본: 정면돌격
 */
export function selectTacticByRule(battle: BattleState): string {
  const tactics = battle.availableTactics || [];
  const ids = new Set(tactics.map(t => t.id));

  if (ids.has('fire_attack')) return 'fire_attack';
  if (ids.has('fire_ships')) return 'fire_ships';
  if (ids.has('ambush')) return 'ambush';
  if (ids.has('feigned_retreat')) return 'feigned_retreat';
  if (ids.has('charge')) return 'charge';

  return 'frontal_assault';
}
