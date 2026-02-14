// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 삼국지 — 책사 API 서버
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import Anthropic from '@anthropic-ai/sdk';
import { filterGameState } from '../core/advisor/state-filter.js';
import { buildSystemPrompt } from '../core/advisor/prompts.js';
import type { GameState } from '../core/data/types.js';
import type { ChatMessage, AdvisorExpression } from '../core/advisor/types.js';

const app = new Hono();
app.use('/api/*', cors());

const PORT = Number(process.env.PORT) || 3001;

// ─── API Key 확인 ───────────────────────────────────────

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// ─── Expression 추론 (키워드 기반) ──────────────────────

function inferExpression(text: string): AdvisorExpression {
  if (/급|위험|경고|주의|위태|긴급/.test(text)) return 'warning';
  if (/심각|패배|위기|절체절명/.test(text)) return 'serious';
  if (/승리|축하|훌륭|탁월|좋은/.test(text)) return 'smile';
  if (/고려|생각|분석|판단|살펴/.test(text)) return 'thinking';
  return 'default';
}

// ─── Health check ───────────────────────────────────────

app.get('/api/health', (c) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  return c.json({ status: 'ok', hasApiKey: hasKey });
});

// ─── Chat endpoint (streaming) ──────────────────────────

app.post('/api/chat', async (c) => {
  const client = getClient();
  if (!client) {
    return c.json(
      { error: 'ANTHROPIC_API_KEY not set' },
      500,
    );
  }

  const body = await c.req.json<{
    messages: ChatMessage[];
    gameState: GameState;
  }>();

  // State filter: GameState → AdvisorView
  const advisorView = filterGameState(body.gameState);
  const systemPrompt = buildSystemPrompt(advisorView);

  // Claude API streaming
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: systemPrompt,
    messages: body.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  // SSE response
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let fullText = '';

      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta') {
            const token = event.delta.text;
            fullText += token;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`),
            );
          }
        }

        const expression = inferExpression(fullText);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done', fullText, expression })}\n\n`),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// ─── Start server ───────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`📜 책사 서버 시작 — http://localhost:${info.port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('⚠️  ANTHROPIC_API_KEY 미설정 — /api/chat 사용 불가');
  }
});
