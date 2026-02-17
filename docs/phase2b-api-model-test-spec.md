# Phase 2b: API 모델 비교 테스트 스펙 (v2)

> Qwen3 로컬 시뮬레이션 이후, 유료 API 모델의 전략 성능을 비교 측정한다.

## 1. 배경

### Phase 2 결과 요약

| 모델 | 게임 수 | 등급 분포 | 승률 | 비용 |
|------|---------|----------|------|------|
| Qwen3 8B (로컬) | 88 | 88D | 0% | $0 |
| o4-mini (API) | 6 | 2C + 4D | 33% | ~$0.40 |
| GPT-5 fast (API) | 6 | 3D + 3F | 0% | ~$0.66 |
| GPT-5 think (API) | 1 | 1F | 0% | ~$0.22 |
| Exaone / Llama (로컬) | 다수 | 전패 | 0% | $0 |

### 판별 결과
**시나리오 B 확인**: 로컬 SLM은 전패, API 모델도 대부분 고전.
o4-mini만 33% 승률로 가능성을 보임.

### 남은 질문
1. Claude / Gemini 계열은 어떤 성능을 보이는가?
2. 경량 모델(Haiku 4.5, Gemini 3 Flash)도 o4-mini 급 성능이 나오는가?
3. 중량 모델(Sonnet 4.5, Gemini 3 Pro)은 승률이 얼마나 높은가?
4. Phase 3 ICL 적용 시 어느 모델이 가장 효과적인가? (기준선 수립)

## 2. 인프라 현황

### 이미 구현 완료 (Phase 2에서)

SimConfig에 `provider`/`apiKey` 필드, SimAdvisor에 `callProviderDirect()`,
run-batch.ts에 `--provider`/`--api-key` CLI 옵션이 이미 구현되어 있다.

```bash
# 이미 동작하는 명령 (Phase 2에서 o4-mini, GPT-5 테스트 완료)
npx tsx sim/run-batch.ts --provider openai --model o4-mini --mode A --think --count 5
```

### 환경변수
```bash
ANTHROPIC_API_KEY=sk-ant-...    # Claude
OPENAI_API_KEY=sk-...           # OpenAI (이미 설정됨)
GEMINI_API_KEY=AI...            # Gemini (신규 필요)
```

## 3. 테스트 모델 목록 (2026.02 최신)

### 비용 산출 기준
- 1게임 = 20턴, Mode A (자동수락) + 하드코딩 Faction AI
- 게임당: Input ~36,000 tokens, Output ~6,500 tokens

### 5개 모델 비교 매트릭스

| # | 티어 | 모델 | provider | model ID | $/1M in | $/1M out | 1게임 | 20게임 |
|---|------|------|----------|----------|---------|----------|-------|--------|
| 1 | 💰 경량 | **Gemini 3 Flash** | gemini | gemini-3-flash-preview | $0.50 | $3.00 | $0.04 | **$0.78** |
| 2 | 💰 경량 | **Claude Haiku 4.5** | claude | claude-haiku-4-5-20250929 | $1.00 | $5.00 | $0.07 | **$1.37** |
| 3 | ⚡ 추론 | **o4-mini** | openai | o4-mini | $1.10 | $4.40 | $0.07 | **$1.32** |
| 4 | 🧠 중량 | **Gemini 3 Pro** | gemini | gemini-3-pro-preview | $2.00 | $12.00 | $0.15 | **$2.90** |
| 5 | 🧠 중량 | **Claude Sonnet 4.5** | claude | claude-sonnet-4-5-20250929 | $3.00 | $15.00 | $0.21 | **$4.08** |

### 비교 구도

```
              Gemini            Claude           OpenAI
경량         3 Flash ($0.78)    Haiku 4.5 ($1.37)
추론 특화                                        o4-mini ($1.32) ← 기존 33% 참조점
중량         3 Pro ($2.90)      Sonnet 4.5 ($4.08)
```

### 총 비용

| 범위 | 모델 수 | 게임 수 | 예상 비용 |
|------|---------|---------|----------|
| 경량만 (Flash + Haiku) | 2 | 40 | **~$2.15** |
| 핵심 3 (경량 + 참조점) | 3 | 60 | **~$3.47** |
| **전체 5모델 (권장)** | **5** | **100** | **~$10.45** |

## 4. 실행 계획

### 4.1 실행 전 준비

```bash
# .env 파일에 API 키 설정
# OpenAI는 이미 설정됨 (Phase 2에서 사용)
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
echo "GEMINI_API_KEY=AI..." >> .env
```

### 4.2 실행 스크립트 (모델별 20게임)

```bash
# ── 1. Gemini 3 Flash (20회, ~$0.78) ──────────────
npx tsx sim/run-batch.ts \
  --provider gemini \
  --model gemini-3-flash-preview \
  --mode A --count 20

# ── 2. Claude Haiku 4.5 (20회, ~$1.37) ────────────
npx tsx sim/run-batch.ts \
  --provider claude \
  --model claude-haiku-4-5-20250929 \
  --mode A --count 20

# ── 3. o4-mini (20회, ~$1.32) ── 참조점 확대 ──────
# Phase 2에서 6게임만 했으므로 20게임으로 확대
npx tsx sim/run-batch.ts \
  --provider openai \
  --model o4-mini \
  --mode A --think --count 20

# ── 4. Gemini 3 Pro (20회, ~$2.90) ────────────────
npx tsx sim/run-batch.ts \
  --provider gemini \
  --model gemini-3-pro-preview \
  --mode A --count 20

# ── 5. Claude Sonnet 4.5 (20회, ~$4.08) ───────────
npx tsx sim/run-batch.ts \
  --provider claude \
  --model claude-sonnet-4-5-20250929 \
  --mode A --count 20
```

### 4.3 원라인 전체 실행

```bash
# 5모델 순차 실행 (총 100게임, ~$10.45)
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-flash-preview --mode A --count 20 && \
npx tsx sim/run-batch.ts --provider claude --model claude-haiku-4-5-20250929 --mode A --count 20 && \
npx tsx sim/run-batch.ts --provider openai --model o4-mini --mode A --think --count 20 && \
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-pro-preview --mode A --count 20 && \
npx tsx sim/run-batch.ts --provider claude --model claude-sonnet-4-5-20250929 --mode A --count 20
```

### 4.4 빠른 검증 (모델 연결 테스트)

```bash
# 각 모델 1회 테스트 — 먼저 동작 확인
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-flash-preview --mode A --count 1
npx tsx sim/run-batch.ts --provider claude --model claude-haiku-4-5-20250929 --mode A --count 1
npx tsx sim/run-batch.ts --provider gemini --model gemini-3-pro-preview --mode A --count 1
npx tsx sim/run-batch.ts --provider claude --model claude-sonnet-4-5-20250929 --mode A --count 1
```

## 5. Gemini 제공자 주의사항

### model ID 확인 필요
Gemini 3 계열은 현재 **preview** 상태. model ID가 변경될 수 있다:
- `gemini-3-flash-preview` (현재 preview ID)
- `gemini-3-pro-preview` (현재 preview ID)
- 안정화 시 `gemini-3-flash`, `gemini-3-pro`로 변경 예상

실행 전 Google AI Studio에서 최신 model ID를 확인하거나,
`--count 1`로 1회 테스트하여 모델 연결 확인.

### Thinking 모드
- Gemini 3 Flash: thinking 모드 지원 (출력 단가 $3.50/M으로 상승)
- 기본 테스트는 fast 모드로 진행, 추후 thinking 비교 가능

## 6. 결과 분석 가이드

### 배치 결과 파일
```
sim/results/
  batch-gemini-3-flash-preview-2026-02-XX.json
  batch-claude-haiku-4-5-2026-02-XX.json
  batch-o4-mini-2026-02-XX.json
  batch-gemini-3-pro-preview-2026-02-XX.json
  batch-claude-sonnet-4-5-2026-02-XX.json
```

### 비교 분석 테이블

```
| 모델                  | 게임 | 승률  | 평균등급 | S  | A  | B  | C  | D  | F  | 비용   |
|-----------------------|------|-------|---------|----|----|----|----|----|----|--------|
| Qwen3 8B (로컬)       | 88   |  0%   |  2.0   |  0 |  0 |  0 |  0 | 88 |  0 | $0     |
| Gemini 3 Flash        | 20   |  ?%   |  ?.?   |  ? |  ? |  ? |  ? |  ? |  ? | $0.78  |
| Claude Haiku 4.5      | 20   |  ?%   |  ?.?   |  ? |  ? |  ? |  ? |  ? |  ? | $1.37  |
| o4-mini               | 20   |  ?%   |  ?.?   |  ? |  ? |  ? |  ? |  ? |  ? | $1.32  |
| Gemini 3 Pro          | 20   |  ?%   |  ?.?   |  ? |  ? |  ? |  ? |  ? |  ? | $2.90  |
| Claude Sonnet 4.5     | 20   |  ?%   |  ?.?   |  ? |  ? |  ? |  ? |  ? |  ? | $4.08  |
```

### 분석 포인트

1. **경량 대결**: Gemini 3 Flash vs Haiku 4.5 — 가격 차이(2배)만큼 성능 차이?
2. **중량 대결**: Gemini 3 Pro vs Sonnet 4.5 — 최강 모델은?
3. **가성비**: 승률 ÷ 비용 — 어느 모델이 가장 효율적?
4. **행동 패턴**: transfer 사용 횟수, 첫 march 턴, 외교 비율 등
5. **Phase 3 ICL 기준선**: 각 모델의 ICL 전 승률 → Phase 3에서 ICL 후 승률과 비교

### Phase 3 연결

이 결과는 Phase 3 (ICL) 실험의 **기준선(baseline)**이 된다:
- 각 모델별 ICL 없이 20게임 → ICL 있으면 20게임 → 개선 폭 비교
- 약한 Core(Flash/Haiku) + 풍부한 Soft Shell vs 강한 Core(Pro/Sonnet) + 적은 Soft Shell

## 7. 주의사항

### 모델 ID 확인
- 실제 API model ID는 제공자마다 다를 수 있음
- **실행 전 `--count 1`로 1회 테스트 필수**
- Gemini 3 preview ID는 변경될 수 있으므로 공식 문서 확인

### API 키 보안
- `.env` 파일은 `.gitignore`에 포함
- CLI `--api-key` 인자는 shell history에 남으므로 환경변수 방식 권장
- 결과 JSON에는 API 키 미포함

### 비용 제한
- 예상 비용은 추정치. 실제 토큰 수는 ±20% 변동
- `--count 1`로 1회 먼저 실행하여 실제 비용 확인 후 배치 권장
- **총 예산 상한: $12** (5모델 × 20게임 + 여유)

### Thinking 모드
- o4-mini: reasoning 내장, `--think` 권장
- Claude/Gemini: 기본 fast 모드로 테스트 (thinking은 Phase 3에서 비교)
- GPT-5: Phase 2에서 fast/think 모두 저조 → 이번에는 제외
