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
import { ExperienceStore } from './icl/experience-store.js';
import { ExperienceExtractor } from './icl/experience-extractor.js';
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
    sequential?: boolean;
    seedLibrary?: string;
    difficulty?: 'easy' | 'medium' | 'normal' | 'hard' | 'expert';
    noIcl?: boolean;
    noCoach?: boolean;
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
      case '--sequential': opts.sequential = true; break;
      case '--seed-library': opts.seedLibrary = args[++i]; break;
      case '--difficulty': opts.difficulty = args[++i] as 'easy' | 'medium' | 'normal' | 'hard' | 'expert'; break;
      case '--no-icl': opts.noIcl = true; break;
      case '--no-coach': opts.noCoach = true; break;
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

  const model = opts.model || (provider === 'ollama' ? 'qwen3:8b' : '');
  // 모델명에서 간결한 prefix 생성 (예: 'o4-mini', 'gpt-5', 'gemini-3-flash-preview' → 'gem3fp')
  const modelTag = model.replace(/[:\/]/g, '-');

  const baseConfig = {
    model,
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
          gameId: `${modelTag}-quick-${mode}-${thinking ? 'think' : 'fast'}-1`,
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
        gameId: `${modelTag}-${mode}-${thinking ? 'think' : 'fast'}-${i + 1}`,
        mode,
        thinking,
        seed: i * 1000 + (thinking ? 500 : 0) + (mode === 'B' ? 100 : 0),
      });
    }
  }

  return configs;
}

/** 순차 학습 모드: 게임 N의 경험이 게임 N+1에 전달된다 */
async function runSequentialLearning(
  baseConfig: Omit<SimConfig, 'gameId' | 'seed'> & { gameId?: string; seed?: number },
  count: number,
  verbose: boolean,
  seedLibraryPath?: string,
  noIcl?: boolean,
  isDry?: boolean,
): Promise<SimResult[]> {
  const store = noIcl ? null : new ExperienceStore({
    maxExperiences: baseConfig.icl?.maxExperiences ?? 20,
    selectionStrategy: baseConfig.icl?.selectionStrategy ?? 'balanced',
    promptBudget: 800,
  });

  // 시드 라이브러리 로드
  if (seedLibraryPath && store) {
    try {
      const seedStore = ExperienceStore.load(seedLibraryPath);
      for (const exp of seedStore.getAll()) {
        store.add(exp);
      }
      console.log(`  시드 라이브러리 로드: ${seedStore.size}개 경험`);
    } catch (e) {
      console.error(`  시드 라이브러리 로드 실패: ${seedLibraryPath}`, e);
    }
  }

  const results: SimResult[] = [];

  for (let i = 0; i < count; i++) {
    const config: SimConfig = {
      ...baseConfig,
      gameId: `seq-${i + 1}`,
      seed: i * 1000,
    } as SimConfig;

    const storeInfo = store ? `Soft Shell: ${store.size}개 경험` : 'ICL OFF';
    console.log(`\n[순차학습 ${i + 1}/${count}] ${storeInfo}`);

    const advisor = isDry ? undefined : new SimAdvisor(config, store ?? undefined);
    const sim = new HeadlessSimulator(config, advisor);

    const result = await sim.runGame();
    results.push(result);

    // 경험 추출 및 저장
    if (store) {
      const experience = ExperienceExtractor.extract(result, i + 1);
      store.add(experience);

      const stats = store.getStats();
      const bScore = experience.bProximityScore ?? 0;
      console.log(`  → ${result.grade}등급 (${result.title}) | B근접도: ${bScore}% | 누적 승률: ${(stats.winRate * 100).toFixed(0)}%`);
      console.log(`    교훈: ${experience.lessons.join(' / ')}`);
    } else {
      console.log(`  → ${result.grade}등급 (${result.title})`);
    }
  }

  // 경험 저장소 저장
  if (store) {
    const modelTag = baseConfig.model?.replace(/[:\/]/g, '-') || 'unknown';
    const storePath = `sim/results/experience-${modelTag}-${Date.now()}.json`;
    store.save(storePath);
    console.log(`\n경험 저장소: ${storePath}`);
  }

  return results;
}

async function main() {
  const opts = parseArgs();
  const isDry = opts.dry ?? false;
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

  const model = opts.model || (provider === 'ollama' ? 'qwen3:8b' : '');
  const modelTag = model.replace(/[:\/]/g, '-');

  const baseConfig = {
    model,
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
    difficulty: opts.difficulty,
    coaching: !opts.noCoach,
    icl: opts.sequential ? {
      enabled: !opts.noIcl,
      seedLibrary: opts.seedLibrary,
    } : undefined,
  };

  // 순차 학습 모드
  if (opts.sequential) {
    const count = opts.count || 20;
    const mode = opts.mode || 'A';
    const thinking = opts.think ?? false;

    console.log(`\n AI 삼국지 순차학습 시뮬레이션`);
    console.log(`  ${count}게임, 제공자: ${provider}, 모델: ${model}`);
    console.log(`  모드: ${mode}/${thinking ? 'Think' : 'Fast'}, 난이도: ${opts.difficulty || 'normal'}`);
    console.log(`  ICL: ${opts.noIcl ? 'OFF' : 'ON'}, 코칭: ${opts.noCoach ? 'OFF' : 'ON'}`);
    if (opts.seedLibrary) console.log(`  시드: ${opts.seedLibrary}`);

    const results = await runSequentialLearning(
      { ...baseConfig, mode, thinking } as any,
      count,
      baseConfig.verbose,
      opts.seedLibrary,
      opts.noIcl,
      isDry,
    );

    const stats = SimReporter.computeStats(results);
    const batchResult: BatchResult = {
      timestamp: new Date().toISOString(),
      model,
      totalGames: results.length,
      results,
      stats,
    };

    for (const r of results) {
      SimReporter.saveGameLog(r);
    }

    const savedPath = SimReporter.saveBatchResult(batchResult);
    SimReporter.printSummary(stats, results.length);
    SimReporter.printLearningCurve(results);

    // B근접도 통계 (경험 추출하여 계산)
    if (!opts.noIcl) {
      const bScores = results.map((r, idx) => {
        const exp = ExperienceExtractor.extract(r, idx + 1);
        return exp.bProximityScore ?? 0;
      });
      const avg = bScores.reduce((s, v) => s + v, 0) / bScores.length;
      console.log(`\n  B근접도: 평균 ${avg.toFixed(1)}%, 최대 ${Math.max(...bScores)}%, 최소 ${Math.min(...bScores)}%`);
    }

    console.log(`\n결과 저장: ${savedPath}`);
    return;
  }

  // 기존 병렬 배치 모드
  const configs = buildMatrix(opts);
  const parallel = opts.parallel || 1;

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
