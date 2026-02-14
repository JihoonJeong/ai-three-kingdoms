// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 제공자 레지스트리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AIProvider, ProviderId, ProviderInfo } from './types.js';
import { claudeProvider } from './claude.js';
import { ollamaProvider } from './ollama.js';
import { openaiProvider } from './openai.js';
import { geminiProvider } from './gemini.js';

const providers = new Map<ProviderId, AIProvider>([
  ['claude', claudeProvider],
  ['ollama', ollamaProvider],
  ['openai', openaiProvider],
  ['gemini', geminiProvider],
]);

export function getProvider(id: ProviderId): AIProvider | undefined {
  return providers.get(id);
}

export function getAllProviderInfo(): ProviderInfo[] {
  return Array.from(providers.values()).map(p => p.info);
}
