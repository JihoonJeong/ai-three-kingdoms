// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 삼국지 — 책사 API 서버
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { filterGameState } from '../core/advisor/state-filter.js';
import { buildSystemPrompt, buildActionReference } from '../core/advisor/prompts.js';
import { loadConfig, saveConfig, getConfigSource } from './config.js';
import { getProvider, getAllProviderInfo } from './providers/registry.js';
import { detectOllama } from './providers/ollama.js';
import type { GameState, GameLanguage } from '../core/data/types.js';
import type { ChatMessage } from '../core/advisor/types.js';
import type { ProviderConfig } from './providers/types.js';

const app = new Hono();
app.use('/api/*', cors());

const PORT = Number(process.env.PORT) || 3001;

// ─── Health check ───────────────────────────────────────

app.get('/api/health', (c) => {
  const config = loadConfig();
  return c.json({
    status: 'ok',
    hasApiKey: config !== null,
    provider: config?.provider ?? null,
  });
});

// ─── Config: 현재 설정 확인 ─────────────────────────────

app.get('/api/config', (c) => {
  const config = loadConfig();
  const source = getConfigSource();
  return c.json({
    configured: config !== null,
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    source,  // 'env-file' | 'env-var' | 'none'
  });
});

// ─── Config: 제공자 목록 ────────────────────────────────

app.get('/api/config/providers', (c) => {
  const providers = getAllProviderInfo();
  return c.json({ providers });
});

// ─── Config: Ollama 자동 감지 ───────────────────────────

app.get('/api/config/ollama/detect', async (c) => {
  const result = await detectOllama();
  return c.json(result);
});

// ─── Config: Ollama 모델 다운로드 (SSE 진행률) ───────────

app.post('/api/config/ollama/pull', async (c) => {
  const { model } = await c.req.json<{ model: string }>();
  if (!model) {
    return c.json({ error: '모델 이름이 필요합니다' }, 400);
  }

  const ollamaBase = process.env.OLLAMA_HOST || 'http://localhost:11434';

  let response: Response;
  try {
    response = await fetch(`${ollamaBase}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    });
  } catch {
    return c.json({ error: 'Ollama 연결 실패 — Ollama가 실행 중인지 확인하세요' }, 502);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    return c.json({ error: `Ollama 오류: ${response.status} ${text}` }, 502);
  }

  // Ollama 스트림 → SSE 변환
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line) as {
                status?: string;
                total?: number;
                completed?: number;
                error?: string;
              };

              if (chunk.error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`));
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'progress',
                  status: chunk.status || '',
                  total: chunk.total || 0,
                  completed: chunk.completed || 0,
                })}\n\n`));
              }
            } catch {
              // skip malformed
            }
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// ─── Config: 연결 테스트 ────────────────────────────────

app.post('/api/config/test', async (c) => {
  const body = await c.req.json<ProviderConfig>();
  const provider = getProvider(body.provider);

  if (!provider) {
    return c.json({ success: false, error: `알 수 없는 제공자: ${body.provider}` });
  }

  const result = await provider.testConnection(body);
  return c.json(result);
});

// ─── Config: 설정 저장 ──────────────────────────────────

app.post('/api/config/save', async (c) => {
  const body = await c.req.json<ProviderConfig>();

  try {
    saveConfig(body);
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '저장 실패';
    return c.json({ success: false, error: message }, 500);
  }
});

// ─── Chat endpoint (streaming) ──────────────────────────

app.post('/api/chat', async (c) => {
  const config = loadConfig();
  if (!config) {
    return c.json({ error: 'AI 제공자가 설정되지 않았습니다' }, 500);
  }

  const provider = getProvider(config.provider);
  if (!provider) {
    return c.json({ error: `알 수 없는 제공자: ${config.provider}` }, 500);
  }

  const body = await c.req.json<{
    messages: ChatMessage[];
    gameState: GameState;
    language?: GameLanguage;
  }>();

  // State filter: GameState → AdvisorView
  const advisorView = filterGameState(body.gameState);
  const language = body.language ?? 'ko';
  const systemPrompt = buildSystemPrompt(advisorView, language) + buildActionReference(body.gameState);

  // 제공자 스트리밍
  const stream = provider.streamChat(
    systemPrompt,
    body.messages.map(m => ({ role: m.role, content: m.content })),
    config,
  );

  return new Response(stream, {
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
  const config = loadConfig();
  if (config) {
    console.log(`✅ AI 제공자: ${config.provider} (${config.model})`);
  } else {
    console.log('⚙️  AI 미설정 — 브라우저에서 설정 마법사를 실행하세요');
  }
});
