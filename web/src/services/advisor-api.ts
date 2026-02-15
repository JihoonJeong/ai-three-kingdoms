// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사 API 클라이언트 (SSE Streaming)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GameState, GameLanguage, FactionId } from '../../../core/data/types.js';
import type { ChatMessage, AdvisorExpression, ChatStreamCallbacks, FactionTurnJSON } from '../../../core/advisor/types.js';

export async function checkHealth(): Promise<{ hasApiKey: boolean }> {
  const res = await fetch('/api/health');
  return res.json();
}

export async function requestFactionTurn(
  factionId: FactionId,
  gameState: GameState,
): Promise<FactionTurnJSON> {
  try {
    const res = await fetch('/api/faction-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factionId, gameState }),
    });
    if (!res.ok) {
      return { actions: [] };
    }
    return await res.json() as FactionTurnJSON;
  } catch {
    return { actions: [] };  // 실패 시 빈 행동
  }
}

export interface StreamChatOptions {
  think?: boolean;
}

export async function streamChat(
  messages: ChatMessage[],
  gameState: GameState,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
  language: GameLanguage = 'ko',
  options?: StreamChatOptions,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, gameState, language, think: options?.think }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    callbacks.onError('서버 연결 실패 — 서버가 실행 중인지 확인하세요');
    return;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '알 수 없는 오류' }));
    callbacks.onError(err.error || `HTTP ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('스트림을 읽을 수 없습니다');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6);

        try {
          const event = JSON.parse(json) as
            | { type: 'token'; token: string }
            | { type: 'done'; fullText: string; expression: AdvisorExpression }
            | { type: 'error'; error: string };

          if (event.type === 'token') {
            callbacks.onToken(event.token);
          } else if (event.type === 'done') {
            callbacks.onComplete(event.fullText, event.expression);
          } else if (event.type === 'error') {
            callbacks.onError(event.error);
          }
        } catch {
          // skip malformed events
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // 중단됨 — reader 정리
      await reader.cancel().catch(() => {});
      return;
    }
    throw err;
  }
}
