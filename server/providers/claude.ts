// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Claude (Anthropic) 제공자
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ProviderConfig, ProviderInfo, TestResult } from './types.js';
import { sseToken, sseDone, sseError, inferExpression } from './stream-utils.js';

const info: ProviderInfo = {
  id: 'claude',
  name: 'Claude (Anthropic)',
  description: 'Anthropic의 Claude API — 고품질 한국어 응답',
  requiresApiKey: true,
  defaultModels: [
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
  ],
};

function createClient(config: ProviderConfig): Anthropic {
  return new Anthropic({ apiKey: config.apiKey });
}

export const claudeProvider: AIProvider = {
  info,

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    try {
      const client = createClient(config);
      await client.messages.create({
        model: config.model || info.defaultModels[0].id,
        max_tokens: 16,
        messages: [{ role: 'user', content: '안녕' }],
      });
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
  ): ReadableStream<Uint8Array> {
    const client = createClient(config);
    const model = config.model || info.defaultModels[0].id;

    return new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          const stream = client.messages.stream({
            model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages.map(m => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          });

          for await (const event of stream) {
            if (event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta') {
              const token = event.delta.text;
              fullText += token;
              controller.enqueue(sseToken(token));
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
