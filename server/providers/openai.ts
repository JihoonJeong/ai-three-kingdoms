// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OpenAI 제공자
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AIProvider, ChatOptions, ProviderConfig, ProviderInfo, TestResult } from './types.js';
import { sseToken, sseDone, sseError, inferExpression } from './stream-utils.js';

const BASE_URL = 'https://api.openai.com/v1';
const utf8 = new TextEncoder();

const info: ProviderInfo = {
  id: 'openai',
  name: 'OpenAI',
  description: 'OpenAI GPT 모델 — ChatGPT와 동일',
  requiresApiKey: true,
  defaultModels: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'o4-mini', name: 'o4-mini' },
    { id: 'gpt-5.2', name: 'GPT-5.2' },
  ],
};

export const openaiProvider: AIProvider = {
  info,

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    try {
      const model = config.model || info.defaultModels[0].id;
      const isNew = /^(o[134]|gpt-5)/.test(model);
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'user', content: 'hi' }],
      };
      if (isNew) {
        body.max_completion_tokens = 16;
      } else {
        body.max_tokens = 16;
      }

      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: utf8.encode(JSON.stringify(body)),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errObj = body.error as Record<string, unknown> | undefined;
        return { success: false, error: (errObj?.message as string) || `HTTP ${res.status}` };
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : '연결 실패';
      return { success: false, error: message };
    }
  },

  streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    config: ProviderConfig,
    chatOptions?: ChatOptions,
  ): ReadableStream<Uint8Array> {
    const model = config.model || info.defaultModels[0].id;
    const useThinking = chatOptions?.think ?? false;
    // max_completion_tokens 사용 모델 (o-시리즈 + GPT-5 이상)
    const isNewModel = /^(o[134]|gpt-5)/.test(model);

    return new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          const openaiMessages = [
            { role: 'system', content: systemPrompt },
            ...messages,
          ];

          const body: Record<string, unknown> = {
            model,
            messages: openaiMessages,
            stream: true,
          };

          if (isNewModel) {
            // 추론 모델: reasoning_effort로 강도 조절
            body.reasoning_effort = useThinking ? 'high' : 'low';
            body.max_completion_tokens = useThinking ? 8000 : 2048;
          } else {
            body.max_tokens = 1024;
          }

          const res = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: utf8.encode(JSON.stringify(body)),
          });

          if (!res.ok || !res.body) {
            const errBody = await res.text();
            controller.enqueue(sseError(`OpenAI 오류: ${res.status} ${errBody}`));
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
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const chunk = JSON.parse(data) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const token = chunk.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  controller.enqueue(sseToken(token));
                }
              } catch {
                // skip
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
