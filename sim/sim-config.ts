// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시뮬레이션 설정 + 결과 타입
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GameAction, BattleResult } from '../core/data/types.js';
import type { ProviderId } from '../server/providers/types.js';

// ── 설정 ──

export interface SimConfig {
  gameId: string;

  // 시뮬레이션 모드
  mode: 'A' | 'B';           // A=자동수락, B=숙의
  thinking: boolean;          // thinking 모드 ON/OFF

  // LLM 설정
  model: string;              // e.g. 'qwen3:7b', 'claude-sonnet-4-5-20250929'
  provider: ProviderId;       // 'ollama' | 'claude' | 'openai' | 'gemini'
  apiKey?: string;            // API 키 (ollama 외 필수)
  baseUrl?: string;           // Ollama 커스텀 URL 등

  /** @deprecated provider === 'ollama' 로 대체. 하위 호환용 유지. */
  directOllama: boolean;
  /** @deprecated baseUrl로 대체. 하위 호환용 유지. */
  ollamaHost?: string;

  // Faction AI
  useLLMFactionAI: boolean;   // true: LLM, false: 하드코딩 전략

  // 전투 AI
  battleAI: 'rule' | 'llm';   // 규칙 기반 or LLM 기반

  // RNG
  seed: number;               // 결정적 시뮬레이션용 시드

  // 로깅
  verbose: boolean;           // 상세 로그 출력
}

// ── 결과 ──

export interface SimResult {
  gameId: string;
  mode: 'A' | 'B';
  thinking: boolean;
  seed: number;
  provider: string;
  model: string;
  grade: string;              // S/A/B/C/D/F
  title: string;              // 게임 결과 제목
  totalTurns: number;
  duration: number;           // ms
  flags: Record<string, unknown>;
  turnLogs: TurnLog[];
  finalState: {
    cities: Array<{ id: string; owner: string; troops: number }>;
    generals: Array<{ id: string; faction: string; condition: string; location: string }>;
  };
}

export interface TurnLog {
  turn: number;
  phase: string;
  actions: Array<{
    action: GameAction;
    result: { success: boolean; description: string };
  }>;
  events: string[];
  battles: BattleLog[];
  aiActions: string[];
  advisorChat?: ChatMessage[];   // Mode B만
}

export interface BattleLog {
  location: string;
  attacker: string;
  defender: string;
  turns: Array<{
    tacticUsed: string;
    attackerTroops: number;
    defenderTroops: number;
  }>;
  result: BattleResult | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── 배치 ──

export interface BatchConfig {
  configs: SimConfig[];      // 실행할 시뮬레이션 목록
  parallel: number;          // 동시 실행 수 (Ollama는 보통 1)
}

export interface BatchResult {
  timestamp: string;
  model: string;
  totalGames: number;
  results: SimResult[];
  stats: BatchStats;
}

export interface BatchStats {
  gradeDistribution: Record<string, number>;  // { S: 2, A: 5, B: 8, ... }
  winRate: number;             // chibiVictory === true 비율
  avgTurns: number;
  avgDuration: number;
  modeComparison: {
    A: { winRate: number; avgGrade: number; gradeDistribution: Record<string, number> };
    B: { winRate: number; avgGrade: number; gradeDistribution: Record<string, number> };
  };
  thinkingComparison: {
    fast: { winRate: number; avgGrade: number; gradeDistribution: Record<string, number> };
    think: { winRate: number; avgGrade: number; gradeDistribution: Record<string, number> };
  };
}
