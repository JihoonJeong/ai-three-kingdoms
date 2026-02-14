// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 지식 청크 선택기
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 게임 상태에 따라 가장 관련 있는 지식 3개를 선택하여
// 제갈량의 프롬프트에 주입한다.

import type { GameState } from '../data/types.js';
import { KNOWLEDGE_CHUNKS, type KnowledgeChunk } from './knowledge.js';

const MAX_CHUNKS = 3;

function scoreChunk(chunk: KnowledgeChunk, state: GameState): number {
  let score = 0;
  const { relevance } = chunk;

  // always 플래그
  if (relevance.always) {
    score += 10;
  }

  // 페이즈 매칭
  if (relevance.phases && relevance.phases.includes(state.phase)) {
    score += 5;
  }

  // 플래그 매칭
  if (relevance.flags) {
    for (const flag of relevance.flags) {
      if (state.flags[flag]) {
        score += 8; // 플래그 매칭은 높은 점수
      }
    }
  }

  // 턴 범위 매칭
  if (relevance.turnRange) {
    if (state.turn >= relevance.turnRange.min && state.turn <= relevance.turnRange.max) {
      score += 3;
    }
  }

  // 상황별 보너스
  if (chunk.id === 'fire_tactic' && state.activeBattle) {
    score += 6;
  }
  if (chunk.id === 'naval_warfare' && state.activeBattle?.terrain === '수상') {
    score += 6;
  }
  if (chunk.id === 'retreat_strategy' && state.activeBattle?.isOver) {
    score += 4;
  }
  if (chunk.id === 'sun_diplomacy') {
    const sunRelation = state.diplomacy.relations.find(
      r => r.factionA === '손권' || r.factionB === '손권'
    );
    if (sunRelation && (sunRelation.relation === '냉담' || sunRelation.relation === '중립')) {
      score += 4; // 외교가 불안할 때 더 중요
    }
  }
  if (chunk.id === 'alliance_maintenance') {
    const sunRelation = state.diplomacy.relations.find(
      r => r.factionA === '손권' || r.factionB === '손권'
    );
    if (sunRelation && sunRelation.relation !== '긴밀') {
      score += 3;
    }
  }

  return score;
}

/**
 * 현재 게임 상태에 가장 적합한 지식 청크를 최대 3개 선택
 */
export function selectKnowledge(state: GameState): string[] {
  const scored = KNOWLEDGE_CHUNKS
    .map(chunk => ({ chunk, score: scoreChunk(chunk, state) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CHUNKS);

  return scored.map(({ chunk }) => `[${chunk.title}]\n${chunk.content}`);
}
