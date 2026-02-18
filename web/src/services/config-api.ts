// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정 API 클라이언트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { t } from '../../../core/i18n/index.js';

export interface ConfigStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  source: 'env-file' | 'env-var' | 'none';
  hasApiKey: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultModels: ModelInfo[];
}

export interface OllamaDetectResult {
  available: boolean;
  models: ModelInfo[];
}

export interface TestResult {
  success: boolean;
  error?: string;
}

export async function checkConfig(): Promise<ConfigStatus> {
  const res = await fetch('/api/config');
  return res.json();
}

export async function getProviders(): Promise<ProviderInfo[]> {
  const res = await fetch('/api/config/providers');
  const data = await res.json() as { providers: ProviderInfo[] };
  return data.providers;
}

export async function detectOllama(): Promise<OllamaDetectResult> {
  const res = await fetch('/api/config/ollama/detect');
  return res.json();
}

export async function testConnection(config: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<TestResult> {
  const res = await fetch('/api/config/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

export interface PullProgressEvent {
  type: 'progress' | 'done' | 'error';
  status?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export async function pullOllamaModel(
  model: string,
  onProgress: (event: PullProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/config/ollama/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: t('알 수 없는 오류') })) as { error?: string };
    onProgress({ type: 'error', error: err.error || `HTTP ${res.status}` });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onProgress({ type: 'error', error: t('스트림을 읽을 수 없습니다') });
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
        try {
          const event = JSON.parse(line.slice(6)) as PullProgressEvent;
          onProgress(event);
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    throw err;
  }
}

export async function saveConfig(config: {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/config/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}
