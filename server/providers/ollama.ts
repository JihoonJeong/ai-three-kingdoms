// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ollama (로컬) 제공자
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AIProvider, ModelInfo, ProviderConfig, ProviderInfo, TestResult } from './types.js';
import { sseToken, sseDone, sseError, inferExpression } from './stream-utils.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';

const info: ProviderInfo = {
  id: 'ollama',
  name: 'Ollama (로컬)',
  description: '로컬 실행 — 무료, API 키 불필요',
  requiresApiKey: false,
  defaultModels: [],  // 자동 감지
};

function baseUrl(config: ProviderConfig): string {
  return config.baseUrl || DEFAULT_BASE_URL;
}

export async function detectOllama(url?: string): Promise<{ available: boolean; models: ModelInfo[] }> {
  const base = url || DEFAULT_BASE_URL;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return { available: false, models: [] };

    const data = await res.json() as { models?: Array<{ name: string }> };
    const models: ModelInfo[] = (data.models || []).map(m => ({
      id: m.name,
      name: m.name,
    }));

    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

export const ollamaProvider: AIProvider = {
  info,

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    try {
      const base = baseUrl(config);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      // stream: true → 첫 청크만 확인 후 즉시 종료 (모델 로딩 대기 포함)
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `Ollama 응답 오류: ${res.status} ${text}` };
      }

      // 첫 청크만 읽고 연결 확인
      const reader = res.body?.getReader();
      if (reader) {
        await reader.read();
        await reader.cancel();
      }

      return { success: true };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Ollama 응답 시간 초과 (30초) — 모델이 너무 크거나 로딩 중입니다' };
      }
      const message = err instanceof Error ? err.message : '연결 실패';
      return { success: false, error: `Ollama 연결 실패: ${message}` };
    }
  },

  streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    config: ProviderConfig,
  ): ReadableStream<Uint8Array> {
    const base = baseUrl(config);
    const model = config.model;

    return new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          const ollamaMessages = [
            { role: 'system', content: systemPrompt },
            ...messages,
          ];

          const res = await fetch(`${base}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: ollamaMessages,
              stream: true,
            }),
          });

          if (!res.ok || !res.body) {
            controller.enqueue(sseError(`Ollama 오류: ${res.status}`));
            controller.close();
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
                if (chunk.message?.content) {
                  const token = chunk.message.content;
                  fullText += token;
                  controller.enqueue(sseToken(token));
                }
              } catch {
                // skip malformed lines
              }
            }
          }

          controller.enqueue(sseDone(fullText, inferExpression(fullText)));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          controller.enqueue(sseError(message));
        } finally {
          controller.close();
        }
      },
    });
  },
};
