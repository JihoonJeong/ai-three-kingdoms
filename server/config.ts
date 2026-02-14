// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 서버 설정 관리 (.env 읽기/쓰기)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ProviderConfig, ProviderId } from './providers/types.js';

const ENV_PATH = resolve(process.cwd(), '.env');

// 환경변수 키 매핑
const KEY_MAP: Record<ProviderId, string> = {
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  ollama: '',
};

/** 설정 출처 */
export type ConfigSource = 'env-file' | 'env-var' | 'none';

/** .env 파일 파싱 */
function parseEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};

  const content = readFileSync(ENV_PATH, 'utf-8');
  const vars: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    vars[key] = val;
  }

  return vars;
}

/** 현재 설정 로드 (.env + process.env 병합) */
export function loadConfig(): ProviderConfig | null {
  const env = parseEnvFile();

  // .env에 AI_PROVIDER가 있으면 우선
  const provider = (env.AI_PROVIDER || process.env.AI_PROVIDER) as ProviderId | undefined;
  const model = env.AI_MODEL || process.env.AI_MODEL || '';

  if (provider) {
    const keyName = KEY_MAP[provider];
    const apiKey = keyName ? (env[keyName] || process.env[keyName]) : undefined;
    const baseUrl = env.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL;

    return { provider, model, apiKey, baseUrl };
  }

  // 하위 호환: ANTHROPIC_API_KEY만 있는 경우
  const anthropicKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      provider: 'claude',
      model: model || 'claude-sonnet-4-5-20250929',
      apiKey: anthropicKey,
    };
  }

  return null;
}

/** 설정 출처 판별 */
export function getConfigSource(): ConfigSource {
  const env = parseEnvFile();

  // .env 파일에 우리가 쓴 설정이 있는가?
  if (env.AI_PROVIDER) return 'env-file';

  // .env 파일에 ANTHROPIC_API_KEY가 있는가?
  if (env.ANTHROPIC_API_KEY) return 'env-file';

  // process.env에 관련 키가 있는가?
  if (process.env.AI_PROVIDER || process.env.ANTHROPIC_API_KEY) return 'env-var';

  return 'none';
}

/** .env 파일에 설정 저장 */
export function saveConfig(config: ProviderConfig): void {
  const lines: string[] = [
    '# AI 삼국지 — AI 제공자 설정',
    `AI_PROVIDER=${config.provider}`,
    `AI_MODEL=${config.model}`,
  ];

  const keyName = KEY_MAP[config.provider];
  if (keyName && config.apiKey) {
    lines.push(`${keyName}=${config.apiKey}`);
  }

  if (config.provider === 'ollama' && config.baseUrl) {
    lines.push(`OLLAMA_BASE_URL=${config.baseUrl}`);
  }

  writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');

  // process.env에도 반영 (재시작 없이 적용)
  process.env.AI_PROVIDER = config.provider;
  process.env.AI_MODEL = config.model;
  if (keyName && config.apiKey) {
    process.env[keyName] = config.apiKey;
  }
  if (config.baseUrl) {
    process.env.OLLAMA_BASE_URL = config.baseUrl;
  }
}
