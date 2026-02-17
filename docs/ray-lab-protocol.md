# Windows Lab 실험 프로토콜 — Ray용

> **목적**: 로컬 모델에서 커리큘럼 학습 재현 + ICL 효력 정량 측정
> **작성**: Buddy (2026-02-17)
> **실행**: Ray (Windows Lab)

---

## 0. 사전 준비

### 환경 확인
```bash
npm install
npm test                 # 전체 테스트 통과 확인
npm run sim:dry          # LLM 없이 시뮬레이터 작동 확인
```

### Ollama 모델
추천 순서 (VRAM 기준 택 1):
1. **qwen3:8b** — Phase 2에서 가장 많이 테스트됨, 기본 권장
2. **exaone3.5:7.8b** — 한국어 강점
3. **llama3.1:8b** — 영어 기반 비교군

```bash
ollama pull qwen3:8b     # 또는 이미 받은 모델
ollama list              # 사용 가능 모델 확인
```

### 시드 라이브러리 확인
```bash
ls sim/icl/seeds/        # o4-mini-wins.json 존재 확인
```

---

## 1. 실험 매트릭스 총괄

| # | 실험명 | 목적 | ICL | 코칭 | 난이도 | 게임수 | 우선순위 |
|---|--------|------|-----|------|--------|--------|----------|
| A1 | **Easy 커리큘럼 재현** | Gemini 결과가 로컬에서도 재현되는가? | ON | ON | easy | 20 | **P0** |
| A2 | **Easy 대조군 (ICL OFF)** | ICL 없이 코칭만으로 되는가? | **OFF** | ON | easy | 20 | **P0** |
| B1 | **Easy 대조군 (코칭 OFF)** | 코칭 없이 ICL만으로 되는가? | ON | **OFF** | easy | 20 | P1 |
| B2 | **Easy 대조군 (둘 다 OFF)** | 순수 모델 베이스라인 | **OFF** | **OFF** | easy | 20 | P1 |
| C1 | Medium 커리큘럼 | Easy A 시드로 medium 도전 | ON | ON | medium | 20 | P2 |
| C2 | Normal 커리큘럼 | Medium A 시드로 normal 도전 | ON | ON | normal | 20 | P2 |
| D1 | Hard 베이스라인 (ICL OFF) | 원래 난이도에서 순수 모델 | OFF | OFF | hard | 10 | P3 |

**총 게임**: ~130게임, **비용**: $0 (로컬 모델)

---

## 2. 실험별 실행 명령

### P0: 핵심 실험 (가장 먼저)

#### A1: Easy 커리큘럼 재현 (ICL ON + 코칭 ON)
```bash
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty easy \
  --seed-library sim/icl/seeds/o4-mini-wins.json \
  --parallel 1
```

#### A2: Easy 대조군 — ICL OFF (코칭만)
```bash
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty easy \
  --no-icl \
  --parallel 1
```

> **핵심 비교**: A1 vs A2 = ICL의 순수 효과
> - A1이 A2보다 B+등급 많으면 → ICL이 효과 있음
> - A1 ≈ A2면 → 코칭만으로도 충분 (ICL 불필요)

---

### P1: 요인 분해 (ablation)

#### B1: ICL ON + 코칭 OFF
```bash
# 코칭 비활성화를 위해 코드 수정 필요 — 아래 "코칭 토글" 섹션 참고
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty easy \
  --seed-library sim/icl/seeds/o4-mini-wins.json \
  --no-coach \
  --parallel 1
```

#### B2: 순수 베이스라인 (ICL OFF + 코칭 OFF)
```bash
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty easy \
  --no-icl --no-coach \
  --parallel 1
```

> **2×2 요인 분석표**:
> |  | 코칭 ON | 코칭 OFF |
> |--|---------|----------|
> | **ICL ON** | A1 | B1 |
> | **ICL OFF** | A2 | B2 |
>
> - A1 - A2 - B1 + B2 = **상호작용 효과** (ICL+코칭 시너지)

---

### P2: 커리큘럼 전이

#### C1: Medium 커리큘럼
A1에서 생성된 experience 파일을 시드로 사용:
```bash
# A1 실행 후 생성된 experience 파일 확인
ls sim/results/experience-qwen3*

# A1 경험을 시드로 medium 실행
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty medium \
  --seed-library sim/results/experience-qwen3-8b-XXXXXXXXXX.json \
  --parallel 1
```

#### C2: Normal 커리큘럼
C1에서 생성된 experience 파일을 시드로:
```bash
npx tsx sim/run-batch.ts \
  --sequential --count 20 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty normal \
  --seed-library sim/results/experience-qwen3-8b-XXXXXXXXXX.json \
  --parallel 1
```

---

### P3: 참고 베이스라인

#### D1: Hard 베이스라인
```bash
npx tsx sim/run-batch.ts \
  --sequential --count 10 --mode A --no-think \
  --provider ollama --model qwen3:8b \
  --difficulty hard \
  --no-icl \
  --parallel 1
```

---

## 3. 코칭 토글 (Cody 구현 필요)

현재 `--no-coach` 플래그는 **미구현**. Cody에게 요청 필요:

**요구사항**: `SimConfig`에 `coaching?: boolean` 필드 추가, `--no-coach` CLI 플래그로 MilestoneCoach 비활성화.

> **임시 방법** (Cody 구현 전):
> `sim/icl/milestone-coach.ts`의 `check()` 메서드에서 `return null;`을 첫 줄에 추가하면 코칭 비활성화.
> B1, B2 실험 후 반드시 원복할 것.

---

## 4. 결과 수집 가이드

### 실행 후 자동 생성 파일
```
sim/results/
  batch-YYYY-MM-DDTHH-MM-SS-MMMZ.json    ← 배치 전체 결과
  experience-qwen3-8b-XXXXXXXXXX.json      ← 순차학습 경험 (시드로 재사용)
```

### 기록할 핵심 지표

각 실험 완료 후 아래 표를 채워주세요:

```markdown
| 실험 | 등급 분포 | 적벽 승률 | B+등급 | F등급 | B근접도 평균 | B근접도 최대 |
|------|-----------|-----------|--------|-------|-------------|-------------|
| A1   |           |           |        |       |             |             |
| A2   |           |           |        |       |             |             |
| B1   |           |           |        |       |             |             |
| B2   |           |           |        |       |             |             |
| C1   |           |           |        |       |             |             |
| C2   |           |           |        |       |             |             |
| D1   |           |           |        |       |             |             |
```

### 배치 결과에서 수동 추출
```bash
# 가장 최근 배치 파일 확인
ls -t sim/results/batch-*.json | head -1

# JSON에서 핵심 통계 추출 (jq 필요)
cat sim/results/batch-XXXX.json | jq '.stats.gradeDistribution'
cat sim/results/batch-XXXX.json | jq '.stats.winRate'
cat sim/results/batch-XXXX.json | jq '[.results[].flags.bProximityScore] | add/length'
```

`jq` 없으면 파일을 직접 열어서 `stats` 섹션 확인.

---

## 5. 실행 순서 권장

```
Day 1: A1 → A2 (P0, 각 20게임, 2시간 예상)
       → 즉시 ICL 효과 1차 판단 가능

Day 2: B1 → B2 (P1, 각 20게임) — 코칭 토글 구현 후
       → 2×2 완전 요인 분석

Day 3: C1 → C2 (P2, 각 20게임) — A1 시드 활용
       → 커리큘럼 전이 검증

Day 4 (선택): D1 (P3, 10게임)
       → 참고용 hard 베이스라인
```

**시간 추정** (qwen3:8b, 1 parallel):
- 1게임 ≈ 3~8분 (턴 수에 따라)
- 20게임 ≈ 60~160분

---

## 6. 주의사항

1. **`--parallel 1`**: Ollama 로컬은 동시 요청 시 메모리 문제 가능. 1로 고정.
2. **`--no-think`**: 로컬 7B 모델의 thinking 모드는 큰 효과 없음. fast 모드 권장.
3. **시드 재사용**: 각 실험의 experience 파일은 다음 난이도의 시드로 사용. 파일명 기록 필수.
4. **RNG seed**: `--sequential`은 게임마다 seed가 자동 증가. 재현성 보장됨.
5. **VRAM 부족 시**: `ollama ps`로 현재 로드된 모델 확인, `ollama stop <model>`로 해제.
