// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI 제공자 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProviderId = 'ollama' | 'claude' | 'openai' | 'gemini';

export interface ModelInfo {
  id: string;
  name: string;
}

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;  // Ollama 커스텀 URL
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  description: string;
  requiresApiKey: boolean;
  defaultModels: ModelInfo[];
}

export interface TestResult {
  success: boolean;
  error?: string;
}

export interface AIProvider {
  readonly info: ProviderInfo;
  testConnection(config: ProviderConfig): Promise<TestResult>;
  streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    config: ProviderConfig,
  ): ReadableStream<Uint8Array>;
}
