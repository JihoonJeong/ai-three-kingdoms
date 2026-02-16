#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 배치 시뮬레이션 실행 CLI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 사용법:
//   npx tsx sim/run-batch.ts                          # 기본 매트릭스 (60회, Ollama)
//   npx tsx sim/run-batch.ts --mode A --count 5       # Mode A 5회
//   npx tsx sim/run-batch.ts --quick                  # 빠른 테스트 (4회)
//   npx tsx sim/run-batch.ts --dry                    # LLM 없이 (pass 모드)
//
// API 모델:
//   npx tsx sim/run-batch.ts --provider claude --model claude-sonnet-4-5-20250929 --count 5
//   npx tsx sim/run-batch.ts --provider openai --model gpt-5.2 --count 5
//   npx tsx sim/run-batch.ts --provider gemini --model gemini-3-pro --count 5

import { HeadlessSimulator } from './headless-sim.js';
import { SimAdvisor } from './sim-advisor.js';
import { DirectFactionLLMClient } from './direct-faction-client.js';
import { SimReporter } from './sim-reporter.js';
import type { SimConfig, SimResult, BatchResult } from './sim-config.js';
import type { ProviderId } from '../server/providers/types.js';

/** 환경변수에서 API 키 자동 감지 */
function resolveApiKey(provider: ProviderId, cliKey?: string): string | undefined {
  if (cliKey) return cliKey;
  switch (provider) {
    case 'claude': return process.env.ANTHROPIC_API_KEY;
    case 'openai': return process.env.OPENAI_API_KEY;
    case 'gemini': return process.env.GEMINI_API_KEY;
    default: return undefined;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    mode?: 'A' | 'B';
    think?: boolean;
    count?: number;
    quick?: boolean;
    dry?: boolean;
    model?: string;
    provider?: ProviderId;
    apiKey?: string;
    parallel?: number;
    verbose?: boolean;
    host?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode': opts.mode = args[++i] as 'A' | 'B'; break;
      case '--think': opts.think = true; break;
      case '--no-think': case '--fast': opts.think = false; break;
      case '--count': opts.count = parseInt(args[++i], 10); break;
      case '--quick': opts.quick = true; break;
      case '--dry': opts.dry = true; break;
      case '--model': opts.model = args[++i]; break;
      case '--provider': opts.provider = args[++i] as ProviderId; break;
      case '--api-key': opts.apiKey = args[++i]; break;
      case '--parallel': opts.parallel = parseInt(args[++i], 10); break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--host': opts.host = args[++i]; break;
    }
  }
  return opts;
}

function buildMatrix(opts: ReturnType<typeof parseArgs>): SimConfig[] {
  const configs: SimConfig[] = [];
  const provider: ProviderId = opts.provider || 'ollama';
  const apiKey = resolveApiKey(provider, opts.apiKey);

  // API 제공자인데 키가 없으면 경고
  if (provider !== 'ollama' && !apiKey) {
    console.error(`\n[오류] ${provider} 제공자를 사용하려면 API 키가 필요합니다.`);
    console.error(`  --api-key <key> 또는 환경변수 설정:`);
    console.error(`    claude  → ANTHROPIC_API_KEY`);
    console.error(`    openai  → OPENAI_API_KEY`);
    console.error(`    gemini  → GEMINI_API_KEY\n`);
    process.exit(1);
  }

  const baseConfig = {
    model: opts.model || (provider === 'ollama' ? 'qwen3:8b' : ''),
    provider,
    apiKey,
    baseUrl: opts.host || (provider === 'ollama'
      ? (process.env.OLLAMA_HOST || 'http://localhost:11434')
      : undefined),
    directOllama: provider === 'ollama',
    ollamaHost: opts.host || process.env.OLLAMA_HOST || 'http://localhost:11434',
    useLLMFactionAI: false,
    battleAI: 'rule' as const,
    verbose: opts.verbose ?? false,
  };

  if (opts.quick) {
    for (const mode of ['A', 'B'] as const) {
      for (const thinking of [false, true]) {
        configs.push({
          ...baseConfig,
          gameId: `quick-${mode}-${thinking ? 'think' : 'fast'}-1`,
          mode,
          thinking,
          seed: 42,
        });
      }
    }
    return configs;
  }

  // 전체 매트릭스
  const matrix = [
    { mode: 'A' as const, thinking: false, count: opts.count || 20 },
    { mode: 'A' as const, thinking: true,  count: opts.count || 20 },
    { mode: 'B' as const, thinking: false, count: opts.count || 10 },
    { mode: 'B' as const, thinking: true,  count: opts.count || 10 },
  ];

  // 특정 모드/사고만 지정된 경우 필터
  const filtered = matrix.filter(m =>
    (!opts.mode || m.mode === opts.mode) &&
    (opts.think === undefined || m.thinking === opts.think)
  );

  for (const { mode, thinking, count } of filtered) {
    for (let i = 0; i < count; i++) {
      configs.push({
        ...baseConfig,
        gameId: `${mode}-${thinking ? 'think' : 'fast'}-${i + 1}`,
        mode,
        thinking,
        seed: i * 1000 + (thinking ? 500 : 0) + (mode === 'B' ? 100 : 0),
      });
    }
  }

  return configs;
}

async function main() {
  const opts = parseArgs();
  const configs = buildMatrix(opts);
  const parallel = opts.parallel || 1;
  const isDry = opts.dry ?? false;
  const provider = configs[0]?.provider || 'ollama';

  console.log(`\n AI 삼국지 시뮬레이션 시작`);
  console.log(`  총 ${configs.length}회, 동시 실행 ${parallel}개`);
  console.log(`  제공자: ${provider}, 모델: ${configs[0]?.model || 'N/A'}`);
  console.log(`  모드: ${isDry ? 'Dry Run (LLM 없이)' : configs.map(c => `${c.mode}/${c.thinking ? 'Think' : 'Fast'}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);
  console.log('');

  const results: SimResult[] = [];

  for (let i = 0; i < configs.length; i += parallel) {
    const batch = configs.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map(async (config) => {
        const idx = results.length + batch.indexOf(config) + 1;
        console.log(`[${idx}/${configs.length}] ${config.gameId} 시작...`);

        // Player AI: dry 모드면 없음, 아니면 SimAdvisor
        const playerAI = isDry ? undefined : new SimAdvisor(config);
        const sim = new HeadlessSimulator(config, playerAI);

        const result = await sim.runGame();
        console.log(`  -> ${result.grade} (${result.title}) — ${result.totalTurns}턴, ${(result.duration / 1000).toFixed(1)}s`);
        return result;
      })
    );
    results.push(...batchResults);
  }

  // 결과 저장
  const stats = SimReporter.computeStats(results);
  const batchResult: BatchResult = {
    timestamp: new Date().toISOString(),
    model: configs[0]?.model || 'unknown',
    totalGames: results.length,
    results,
    stats,
  };

  for (const r of results) {
    SimReporter.saveGameLog(r);
  }

  const savedPath = SimReporter.saveBatchResult(batchResult);
  SimReporter.printSummary(stats, results.length);

  console.log(`\n결과 저장: ${savedPath}`);
}

main().catch(console.error);
