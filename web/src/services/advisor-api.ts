// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사 API 클라이언트 (SSE Streaming)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GameState } from '../../../core/data/types.js';
import type { ChatMessage, AdvisorExpression, ChatStreamCallbacks } from '../../../core/advisor/types.js';

export async function checkHealth(): Promise<{ hasApiKey: boolean }> {
  const res = await fetch('/api/health');
  return res.json();
}

export async function streamChat(
  messages: ChatMessage[],
  gameState: GameState,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, gameState }),
    });
  } catch {
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
}
