// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헤드리스 책사 클라이언트 (SimAdvisor)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 헤드리스 환경에서 제갈량 LLM을 호출하여
// 플레이어 행동을 자동으로 결정한다.
//
// Mode A: 브리핑 → 추천 액션 자동 실행
// Mode B: 브리핑 → 토론(최대 3라운드) → 최종 액션 실행

import { filterGameState } from '../core/advisor/state-filter.js';
import { buildSystemPrompt, buildActionReference, buildBriefingUserMessage } from '../core/advisor/prompts.js';
import {
  parseAdvisorResponse,
  actionJSONToGameAction,
  type RecommendationContext,
} from '../core/advisor/action-recommender.js';
import type { GameState, GameAction, GameLanguage } from '../core/data/types.js';
import { getProvider } from '../server/providers/registry.js';
import { collectStreamText } from '../server/providers/stream-utils.js';
import type { ProviderConfig } from '../server/providers/types.js';
import type { SimConfig, ChatMessage } from './sim-config.js';
import type { SimPlayerAI } from './headless-sim.js';

/** thinking 태그 제거 */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .trim();
}

/** GameState → RecommendationContext */
function buildContext(state: GameState): RecommendationContext {
  const playerFaction = '유비';
  const allLocations = state.cities.map(c => c.id);
  if (!allLocations.includes('chibi')) allLocations.push('chibi');

  return {
    playerCities: state.cities
      .filter(c => c.owner === playerFaction)
      .map(c => ({ id: c.id, name: c.name })),
    playerGenerals: state.generals
      .filter(g => g.faction === playerFaction)
      .map(g => ({ id: g.id, name: g.name, location: g.location })),
    factions: state.factions
      .filter(f => f.id !== playerFaction)
      .map(f => f.id),
    allLocations,
  };
}

export class SimAdvisor implements SimPlayerAI {
  private language: GameLanguage = 'ko';
  private prevActions: Array<{ description: string; success: boolean }> = [];

  constructor(private config: SimConfig) {}

  /** 지난 턴 행동 결과를 저장 (다음 브리핑에 포함) */
  recordActions(actions: Array<{ description: string; success: boolean }>): void {
    this.prevActions = actions;
  }

  async planTurn(state: GameState, config: SimConfig): Promise<{
    actions: GameAction[];
    chatLog?: ChatMessage[];
  }> {
    // 1. 상태 → AdvisorView
    const advisorView = filterGameState(state);

    // 2. 시스템 프롬프트
    const systemPrompt = buildSystemPrompt(advisorView, this.language)
      + buildActionReference(state);

    // 3. 브리핑 요청 메시지
    const briefingMsg = buildBriefingUserMessage(
      state.turn,
      this.language,
      this.prevActions.length > 0 ? this.prevActions : undefined,
    );
    const messages: ChatMessage[] = [{ role: 'user', content: briefingMsg }];

    // 4. LLM 호출
    const response = await this.callLLM(systemPrompt, messages);
    messages.push({ role: 'assistant', content: response });

    // 5. 추천 액션 파싱
    const ctx = buildContext(state);
    const parsed = parseAdvisorResponse(response, ctx);
    let actions = parsed.actions
      .map(a => actionJSONToGameAction(a, ctx))
      .filter((a): a is GameAction => a !== null)
      .slice(0, state.actionsRemaining);

    // 6. Mode B: 토론
    if (config.mode === 'B') {
      for (let round = 0; round < 3; round++) {
        const playerQuestion = await this.generatePlayerQuestion(
          state, parsed.narrative,
          parsed.actions.map(a => ({ description: a.description, confidence: a.confidence })),
          round,
        );
        if (!playerQuestion) break; // 추가 토론 불필요

        messages.push({ role: 'user', content: playerQuestion });
        const reply = await this.callLLM(systemPrompt, messages);
        messages.push({ role: 'assistant', content: reply });

        // 갱신된 추천 재파싱
        const updated = parseAdvisorResponse(reply, ctx);
        if (updated.actions.length > 0) {
          actions = updated.actions
            .map(a => actionJSONToGameAction(a, ctx))
            .filter((a): a is GameAction => a !== null)
            .slice(0, state.actionsRemaining);
        }
      }
    }

    // 이번 턴 결과 초기화 (다음 턴 기록용)
    this.prevActions = [];

    return { actions, chatLog: messages };
  }

  /**
   * Mode B — Player AI가 책사에게 질문을 생성.
   * 별도 LLM 호출로 "유비 역할의 질문자"를 시뮬레이션.
   */
  private async generatePlayerQuestion(
    state: GameState,
    narrative: string,
    actions: Array<{ description: string; confidence: number }>,
    round: number,
  ): Promise<string | null> {
    const actionList = actions.map(a => `- ${a.description} (신뢰도 ${a.confidence}%)`).join('\n');
    const playerPrompt = `당신은 유비(劉備)다. 군사 제갈량이 이번 턴 전략을 브리핑했다.
현재 상황과 제갈량의 조언을 검토하고, 의문점이나 대안이 있으면 질문하라.
더 이상 토론할 것이 없으면 "동의합니다"라고만 답하라.
간결하게 1-2문장으로 답하라.

제갈량의 조언:
${narrative}

추천 행동:
${actionList}

토론 라운드: ${round + 1}/3`;

    const response = await this.callLLM(playerPrompt, [
      { role: 'user', content: '검토하고 의견을 말하라.' },
    ]);

    // "동의합니다"면 토론 종료
    if (response.includes('동의') && response.length < 30) {
      return null;
    }

    return response;
  }

  /** LLM 호출 — provider에 따라 분기 */
  private async callLLM(system: string, messages: ChatMessage[]): Promise<string> {
    const provider = this.config.provider;
    if (provider && provider !== 'ollama') {
      return this.callProviderDirect(system, messages);
    }
    if (this.config.directOllama) {
      return this.callOllamaDirect(system, messages);
    }
    return this.callViaServer(system, messages);
  }

  /** API 제공자 직접 호출 (서버 불필요) */
  private async callProviderDirect(system: string, messages: ChatMessage[]): Promise<string> {
    const provider = getProvider(this.config.provider);
    if (!provider) throw new Error(`Unknown provider: ${this.config.provider}`);

    const providerConfig: ProviderConfig = {
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
    };

    const stream = provider.streamChat(
      system,
      messages.map(m => ({ role: m.role, content: m.content })),
      providerConfig,
      { think: this.config.thinking },
    );

    return collectStreamText(stream);
  }

  private async callOllamaDirect(system: string, messages: ChatMessage[]): Promise<string> {
    const ollamaHost = this.config.ollamaHost || 'http://localhost:11434';

    // qwen3 등은 기본적으로 <think> 출력 — /no_think 으로 제어
    const mappedMessages = messages.map(m => ({ role: m.role, content: m.content }));
    if (!this.config.thinking && mappedMessages.length > 0) {
      const last = mappedMessages[mappedMessages.length - 1];
      last.content = last.content.trimEnd() + ' /no_think';
    }

    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          ...mappedMessages,
        ],
        stream: false,
        options: {
          num_predict: this.config.thinking ? 16384 : 4096,
        },
      }),
    });

    const data = await response.json() as { message?: { content: string }; error?: string };
    if (data.error || !data.message) {
      throw new Error(`Ollama error: ${data.error || 'no message in response'}`);
    }
    return stripThinking(data.message.content);
  }

  private async callViaServer(system: string, messages: ChatMessage[]): Promise<string> {
    // 서버 /api/chat를 호출하고 SSE 스트림을 수집
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        gameState: {}, // 서버가 system prompt를 직접 빌드하지만, 우리는 이미 빌드했으므로
        think: this.config.thinking,
      }),
    });

    // SSE 스트림에서 전체 텍스트 수집
    const text = await response.text();
    const lines = text.split('\n');
    let fullText = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'token') fullText += data.token;
          if (data.type === 'done') return data.fullText ?? fullText;
        } catch { /* skip */ }
      }
    }
    return stripThinking(fullText);
  }
}
