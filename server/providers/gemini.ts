// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Google Gemini 제공자
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AIProvider, ProviderConfig, ProviderInfo, TestResult } from './types.js';
import { sseToken, sseDone, sseError, inferExpression } from './stream-utils.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const info: ProviderInfo = {
  id: 'gemini',
  name: 'Google Gemini',
  description: 'Google의 Gemini API — 빠른 응답 속도',
  requiresApiKey: true,
  defaultModels: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)' },
  ],
};

export const geminiProvider: AIProvider = {
  info,

  async testConnection(config: ProviderConfig): Promise<TestResult> {
    try {
      const model = config.model || info.defaultModels[0].id;
      const url = `${BASE_URL}/models/${model}:generateContent?key=${config.apiKey}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: '안녕' }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return { success: false, error: body.error?.message || `HTTP ${res.status}` };
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
  ): ReadableStream<Uint8Array> {
    const model = config.model || info.defaultModels[0].id;

    return new ReadableStream({
      async start(controller) {
        let fullText = '';
        try {
          // Gemini 메시지 변환: user/assistant → user/model
          const geminiContents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));

          const url = `${BASE_URL}/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: geminiContents,
              generationConfig: { maxOutputTokens: 1024 },
            }),
          });

          if (!res.ok || !res.body) {
            const errBody = await res.text();
            controller.enqueue(sseError(`Gemini 오류: ${res.status} ${errBody}`));
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
              if (!data) continue;

              try {
                const chunk = JSON.parse(data) as {
                  candidates?: Array<{
                    content?: { parts?: Array<{ text?: string }> };
                  }>;
                };
                const token = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
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
