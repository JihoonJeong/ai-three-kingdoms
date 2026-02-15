// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Faction AI LLM 클라이언트 인터페이스
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { FactionId, GameState } from '../data/types.js';
import type { FactionTurnJSON } from './types.js';

/**
 * Faction AI의 LLM 호출 인터페이스.
 * 웹에서는 /api/faction-turn HTTP 호출로 구현,
 * 서버에서는 직접 LLM 호출로 구현 가능.
 */
export interface FactionLLMClient {
  requestFactionTurn(factionId: FactionId, gameState: GameState): Promise<FactionTurnJSON>;
}
