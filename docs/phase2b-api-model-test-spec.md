# Phase 2b: API 모델 비교 테스트 스펙

> Qwen3 로컬 시뮬레이션 이후, 유료 API 모델의 전략 성능을 비교 측정한다.

## 1. 배경

### 문제
- Qwen3 7B (로컬)로 60회 시뮬레이션 실행 예정
- 로컬 SLM의 한계인지, 프롬프트/설계 문제인지 구분 필요
- 최신 대형 모델로 소수 테스트하여 **"모델 성능 문제 vs 설계 문제"** 판별

### 판별 기준
```
시나리오 A: Qwen3 승률 15%, API 모델 승률 60%+
  → 모델 성능 차이. SLM 한계. → 규칙 기반 보완 필요

시나리오 B: Qwen3 승률 15%, API 모델 승률 20%
  → 프롬프트/설계 문제. 모든 모델이 보수적. → 프롬프트 튜닝 필요

시나리오 C: Qwen3 승률 40%+
  → 의외로 잘 됨. 미세조정만.
```

## 2. 현재 시뮬레이터 제한사항

### 문제: Ollama 직접 호출만 지원
현재 `sim/sim-advisor.ts`와 `sim/direct-faction-client.ts`는:
- `directOllama: true` → Ollama `/api/chat` 직접 호출
- `directOllama: false` → 서버 `/api/chat` 경유 (서버 프로세스 필요 + `.env` 설정 고정)

API 모델을 테스트하려면 **서버 없이 API 제공자를 직접 호출**할 수 있어야 한다.

### 해결: 서버의 AIProvider를 시뮬레이터에서 직접 사용
`server/providers/` 에 이미 4개 제공자가 구현되어 있다:
- `server/providers/claude.ts` — Claude API (Anthropic)
- `server/providers/openai.ts` — OpenAI API
- `server/providers/gemini.ts` — Gemini API (Google)
- `server/providers/ollama.ts` — Ollama (로컬)

각 제공자는 동일한 `AIProvider` 인터페이스를 구현:
```typescript
interface AIProvider {
  streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    config: ProviderConfig,
    options?: ChatOptions,
  ): ReadableStream<Uint8Array>;
}
```

그리고 `collectStreamText(stream)` 유틸이 SSE 스트림을 전체 텍스트로 수집한다.

**따라서**: `SimAdvisor`와 `DirectFactionLLMClient`에서 Ollama fetch 대신
`getProvider(id).streamChat() → collectStreamText()` 를 사용하면
**서버 프로세스 없이 모든 API 제공자를 직접 호출 가능**.

## 3. 구현 변경사항

### 3.1 SimConfig 확장

```typescript
// sim/sim-config.ts 에 추가

export interface SimConfig {
  // ... 기존 필드 유지 ...

  // LLM 설정 — 확장
  model: string;              // e.g. 'qwen3:7b', 'claude-sonnet-4-5-20250929', 'gpt-5'
  provider: ProviderId;       // 'ollama' | 'claude' | 'openai' | 'gemini'  ← 신규
  apiKey?: string;            // API 키 (ollama 외 필수)                    ← 신규
  baseUrl?: string;           // Ollama 커스텀 URL 등                      ← 신규

  // directOllama 제거 → provider로 통합
  // provider === 'ollama' 이면 기존 directOllama 동작
  // provider !== 'ollama' 이면 서버 providers 직접 사용
}
```

### 3.2 SimAdvisor 변경

`sim/sim-advisor.ts`의 `callLLM()` 수정:

```typescript
private async callLLM(system: string, messages: ChatMessage[]): Promise<string> {
  if (this.config.provider === 'ollama') {
    // 기존 Ollama 직접 호출 (변경 없음)
    return this.callOllamaDirect(system, messages);
  }

  // API 제공자 직접 호출 (서버 불필요)
  return this.callProviderDirect(system, messages);
}

private async callProviderDirect(system: string, messages: ChatMessage[]): Promise<string> {
  const provider = getProvider(this.config.provider);
  if (!provider) throw new Error(`Unknown provider: ${this.config.provider}`);

  const providerConfig: ProviderConfig = {
    provider: this.config.provider,
    model: this.config.model,
    apiKey: this.config.apiKey,
    baseUrl: this.config.baseUrl,
  };

  const stream = provider.streamChat(
    system,
    messages.map(m => ({ role: m.role, content: m.content })),
    providerConfig,
    { think: this.config.thinking },
  );

  return collectStreamText(stream);
}
```

### 3.3 DirectFactionLLMClient 변경

`sim/direct-faction-client.ts` 에도 동일 패턴 적용:
- `provider === 'ollama'` → 기존 Ollama 직접 호출
- 그 외 → `getProvider().streamChat() → collectStreamText()`

### 3.4 run-batch.ts CLI 확장

```bash
# 기존 (Ollama)
npx tsx sim/run-batch.ts --model qwen3:7b

# 신규 (API 모델)
npx tsx sim/run-batch.ts --provider claude --model claude-sonnet-4-5-20250929 --count 5
npx tsx sim/run-batch.ts --provider openai --model gpt-5.2 --count 5
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-pro --count 5
npx tsx sim/run-batch.ts --provider openai --model o4-mini --think --count 5
```

CLI 인자 추가:
- `--provider <id>`: claude | openai | gemini | ollama (기본: ollama)
- `--api-key <key>`: API 키 (환경변수 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`로도 가능)

환경변수 자동 감지:
```typescript
function resolveApiKey(provider: ProviderId, cliKey?: string): string | undefined {
  if (cliKey) return cliKey;
  switch (provider) {
    case 'claude': return process.env.ANTHROPIC_API_KEY;
    case 'openai': return process.env.OPENAI_API_KEY;
    case 'gemini': return process.env.GEMINI_API_KEY;
    default: return undefined;
  }
}
```

## 4. 테스트 모델 목록 + 비용 추정

### 비용 산출 기준
- 1게임 = 20턴, Mode A + 하드코딩 Faction AI
- Input: ~36,000 tokens, Output: ~6,500 tokens/game

### Tier 1: 최강 모델 (각 5회)

| 모델 | provider | model ID | 1게임 | 5게임 | 목적 |
|------|----------|----------|-------|-------|------|
| Claude Sonnet 4.5 | claude | claude-sonnet-4-5-20250929 | $0.21 | **$1.05** | 한국어 최강, 기준선 |
| GPT-5.2 | openai | gpt-5.2 | $0.15 | **$0.77** | OpenAI 최신 flagship |
| Gemini 3 Pro | gemini | gemini-3-pro | $0.15 | **$0.75** | Google 최신 |

### Tier 2: Reasoning 모델 (각 5회)

| 모델 | provider | model ID | 1게임 | 5게임 | 목적 |
|------|----------|----------|-------|-------|------|
| o4-mini | openai | o4-mini | $0.07 | **$0.33** | 가성비 reasoning |
| o3 | openai | o3 | $0.12 | **$0.62** | 강력 reasoning |

### Tier 3: 가성비 모델 (각 5회)

| 모델 | provider | model ID | 1게임 | 5게임 | 목적 |
|------|----------|----------|-------|-------|------|
| Gemini 3 Flash | gemini | gemini-3-flash | $0.04 | **$0.19** | 초저가 최신 |
| GPT-5 Mini | openai | gpt-5-mini | $0.02 | **$0.11** | 바닥 성능 확인 |
| Claude Haiku 4.5 | claude | claude-haiku-4-5-20250929 | $0.07 | **$0.35** | Anthropic 경량 |

### 비용 합계

| 범위 | 모델 수 | 게임 수 | 예상 비용 |
|------|---------|---------|----------|
| 최소 (핵심 3개만) | 3 | 15 | **~$2.60** |
| 권장 (Tier 1+2) | 5 | 25 | **~$3.52** |
| 전체 (Tier 1+2+3) | 8 | 40 | **~$4.17** |

## 5. 실행 계획

### Phase 2a: Qwen3 로컬 (무료)
```bash
# Windows Lab
npm run sim              # 60회 전체 매트릭스
# → sim/results/batch-qwen3-7b-*.json
```

### Phase 2b: API 모델 비교 (유료, ~$4)
Qwen3 결과 분석 후, 승률에 따라 테스트 범위 결정.

#### 실행 전 준비
```bash
# .env 파일에 API 키 설정 (또는 환경변수로)
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
echo "OPENAI_API_KEY=sk-..." >> .env
echo "GEMINI_API_KEY=AI..." >> .env
```

#### 실행 스크립트

```bash
# ── Tier 1: 최강 모델 ──────────────────────────

# Claude Sonnet 4.5 (5회, ~$1.05)
npx tsx sim/run-batch.ts \
  --provider claude \
  --model claude-sonnet-4-5-20250929 \
  --mode A --count 5

# GPT-5.2 (5회, ~$0.77)
npx tsx sim/run-batch.ts \
  --provider openai \
  --model gpt-5.2 \
  --mode A --count 5

# Gemini 3 Pro (5회, ~$0.75)
npx tsx sim/run-batch.ts \
  --provider gemini \
  --model gemini-3-pro \
  --mode A --count 5

# ── Tier 2: Reasoning 모델 ──────────────────────

# o4-mini thinking (5회, ~$0.33)
npx tsx sim/run-batch.ts \
  --provider openai \
  --model o4-mini \
  --mode A --think --count 5

# o3 thinking (5회, ~$0.62)
npx tsx sim/run-batch.ts \
  --provider openai \
  --model o3 \
  --mode A --think --count 5

# ── Tier 3: 가성비 모델 ──────────────────────────

# Gemini 3 Flash (5회, ~$0.19)
npx tsx sim/run-batch.ts \
  --provider gemini \
  --model gemini-3-flash \
  --mode A --count 5

# GPT-5 Mini (5회, ~$0.11)
npx tsx sim/run-batch.ts \
  --provider openai \
  --model gpt-5-mini \
  --mode A --count 5

# Claude Haiku 4.5 (5회, ~$0.35)
npx tsx sim/run-batch.ts \
  --provider claude \
  --model claude-haiku-4-5-20250929 \
  --mode A --count 5
```

#### 원라인 전체 실행 (Tier 1+2, 권장)
```bash
# 한 줄로 순차 실행 (총 25게임, ~$3.52)
npx tsx sim/run-batch.ts --provider claude --model claude-sonnet-4-5-20250929 --mode A --count 5 && \
npx tsx sim/run-batch.ts --provider openai --model gpt-5.2 --mode A --count 5 && \
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-pro --mode A --count 5 && \
npx tsx sim/run-batch.ts --provider openai --model o4-mini --mode A --think --count 5 && \
npx tsx sim/run-batch.ts --provider openai --model o3 --mode A --think --count 5
```

## 6. 구현 순서

### Step 1: SimConfig에 provider/apiKey 추가
- `sim/sim-config.ts` 수정
- `directOllama` 필드는 하위 호환 유지 (deprecated, `provider === 'ollama'`로 대체)

### Step 2: SimAdvisor에 API 제공자 직접 호출 추가
- `sim/sim-advisor.ts`의 `callLLM()` 수정
- `server/providers/` 의 `getProvider()` + `collectStreamText()` 사용
- Ollama 경로 기존 동작 유지

### Step 3: DirectFactionLLMClient에 동일 적용
- `sim/direct-faction-client.ts` 수정
- (현재 Faction AI는 하드코딩이 기본이므로, LLM 모드 활성화 시에만 해당)

### Step 4: run-batch.ts CLI 확장
- `--provider`, `--api-key` 인자 추가
- 환경변수 자동 감지 (`ANTHROPIC_API_KEY` 등)
- `buildMatrix()`에서 provider/apiKey를 config에 포함

### Step 5: 테스트
- 기존 `npm run sim:dry` 통과 확인 (하위 호환)
- 기존 `npm run sim:quick` 통과 확인 (Ollama)
- API 모델 1회 테스트: `--provider claude --model claude-sonnet-4-5-20250929 --count 1`

## 7. 결과 분석 가이드

### 배치 결과 파일 구조
```
sim/results/
  batch-qwen3-7b-2026-02-16.json           # Qwen3 60회
  batch-claude-sonnet-4-5-2026-02-17.json   # Claude 5회
  batch-gpt-5.2-2026-02-17.json            # GPT 5회
  batch-gemini-3-pro-2026-02-17.json        # Gemini 5회
  batch-o4-mini-2026-02-17.json             # o4-mini 5회
  batch-o3-2026-02-17.json                  # o3 5회
```

### 비교 분석 포인트

1. **적벽 승률**: `stats.winRate` — 모델별 차이가 핵심 지표
2. **등급 분포**: `stats.gradeDistribution` — S/A 비율이 높은 모델 = 전략적
3. **평균 등급 점수**: `stats.avgGrade` (S=6, A=5, ..., F=1)
4. **행동 패턴 분석**: `turnLogs[].actions` — 어떤 모델이 군사 행동을 더 잘 하는지
   - 내정 비율 vs 군사 비율
   - march/conscript 타이밍
   - 적벽 전 병력 배치 시점

### 결과 비교 테이블 (수동 또는 스크립트)
```
| 모델                | 승률  | 평균등급 | S  | A  | B  | C  | D  | F  | 비용/5게임 |
|---------------------|-------|---------|----|----|----|----|----|----|-----------|
| Qwen3 7B (60회)     |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $0        |
| Claude Sonnet 4.5   |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $1.05     |
| GPT-5.2             |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $0.77     |
| Gemini 3 Pro        |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $0.75     |
| o4-mini (think)     |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $0.33     |
| o3 (think)          |  ?%   |  ?.?   | ?  | ?  | ?  | ?  | ?  | ?  | $0.62     |
```

## 8. 주의사항

### 모델 ID 확인
- 실제 API에서 사용하는 model ID는 제공자마다 다름
- 실행 전 `--provider X --model Y --count 1`로 1회 테스트 필수
- 모델 ID가 바뀌었으면 제공자 공식 문서 확인

### API 키 보안
- `.env` 파일은 `.gitignore`에 포함되어 있음
- CLI `--api-key` 인자는 shell history에 남으므로 환경변수 방식 권장
- 결과 JSON에는 API 키가 포함되지 않음

### 비용 제한
- 예상 비용은 추정치. 실제 토큰 수는 게임 상태에 따라 ±20% 변동
- `--count 1`로 1회 먼저 실행하여 실제 비용 확인 후 배치 실행 권장
- 총 예산 상한: $5 (Tier 1+2 기준)

### Thinking 모드 주의
- `--think` 플래그는 각 제공자가 자체 방식으로 처리
- Claude: extended thinking, OpenAI (o3/o4-mini): 기본 reasoning 내장
- Gemini: thinking 지원 여부 확인 필요
- o3, o4-mini는 `--think` 없이도 reasoning이 기본 내장됨. `--think`는 추가 확인용
