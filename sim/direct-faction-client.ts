// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 직접 Ollama 호출 Faction LLM 클라이언트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 서버 없이 Ollama를 직접 호출하는 FactionLLMClient 구현.
// 시뮬레이션에서 조조/손권 AI를 LLM으로 구동할 때 사용.

import type { FactionLLMClient } from '../core/advisor/faction-llm-client.js';
import type { FactionId, GameState } from '../core/data/types.js';
import type { FactionTurnJSON } from '../core/advisor/types.js';
import { buildFactionStateView } from '../core/advisor/faction-state-filter.js';
import { buildCaoSystemPrompt, buildSunSystemPrompt } from '../core/advisor/faction-prompts.js';
import { parseFactionResponse, type RecommendationContext } from '../core/advisor/action-recommender.js';
import { MilestoneRegistry } from '../core/engine/milestones.js';
import type { SimConfig } from './sim-config.js';

/** thinking 태그 제거 */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .trim();
}

/** GameState에서 RecommendationContext 생성 (Faction AI용) */
function buildFactionContext(state: GameState, factionId: FactionId): RecommendationContext {
  const allLocations = state.cities.map(c => c.id);
  if (!allLocations.includes('chibi')) allLocations.push('chibi');

  return {
    playerCities: state.cities
      .filter(c => c.owner === factionId)
      .map(c => ({ id: c.id, name: c.name })),
    playerGenerals: state.generals
      .filter(g => g.faction === factionId)
      .map(g => ({ id: g.id, name: g.name, location: g.location })),
    factions: state.factions
      .filter(f => f.id !== factionId)
      .map(f => f.id),
    allLocations,
  };
}

export class DirectFactionLLMClient implements FactionLLMClient {
  private registry = new MilestoneRegistry();

  constructor(private config: SimConfig) {}

  async requestFactionTurn(factionId: FactionId, gameState: GameState): Promise<FactionTurnJSON> {
    // 1. 상태 필터링
    const view = buildFactionStateView(gameState, factionId);

    // 2. 마일스톤 조회
    const pendingMs = this.registry.getPendingMilestones(factionId, gameState);
    const activeRules = this.registry.getActiveAdaptiveRules(factionId, gameState);

    // 3. 시스템 프롬프트
    const systemPrompt = factionId === '조조'
      ? buildCaoSystemPrompt(view, pendingMs, activeRules)
      : buildSunSystemPrompt(view, pendingMs, activeRules);

    // 4. Ollama 직접 호출
    const ollamaHost = this.config.ollamaHost || 'http://localhost:11434';
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '이번 턴 행동을 결정하라.' },
        ],
        stream: false,
        think: this.config.thinking || undefined,
        options: this.config.thinking
          ? { num_predict: 16384 }
          : { num_predict: 4096 },
      }),
    });

    const data = await response.json() as { message: { content: string } };
    const text = stripThinking(data.message.content);

    // 5. 파싱
    const ctx = buildFactionContext(gameState, factionId);
    return parseFactionResponse(text, ctx);
  }
}
