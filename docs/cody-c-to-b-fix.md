# C→B 등급 돌파를 위한 구현 가이드

> 20게임 순차학습 결과 13C + 7F, B등급 0회. 이 문서는 C→B 천장을 돌파하기 위한 구현 작업을 정리한다.

## 1. 문제 진단

### 1.1 현상
- Seed ICL로 적벽 승리(chibiVictory)는 95% 달성 → **D→C 돌파 성공**
- 그러나 적벽 후 남군(nanjun) 점령 실패 → B등급 불가
- C와 F의 차이는 전략이 아니라 **유비 포로 여부(20% RNG)**

### 1.2 근본 원인: "0병력 행동" 병리

20게임 F등급 7개 전부 동일한 패턴:

```
적벽 승리 (턴 9~11)
  ↓
전후 처리 (턴 12~15):
  - transfer(강하→하구, troops, medium) → "병력 0명을 보급했습니다" ← 강하가 비어있음
  - transfer(강하→하구) 반복 × 5~8회 ← 매번 0명, 행동 낭비
  - 하구 군량 고갈 → 매턴 300~440명 탈영
  ↓
절망적 진군 (턴 15~19):
  - march(강하→남군, liubei+guanyu+zhangfei, medium) → 0명 vs 15,250명
  - 전투 결과: 조조 승, 유비 포로 → F등급
```

**핵심 문제 3가지:**
1. **0병력 보급(transfer)이 성공 처리됨** — "0명 보급" 메시지만 뜨고 행동 1회 소모
2. **0병력 진군(march)이 전투에 진입함** — 엔진에 `marchTroops <= 0` 체크가 있지만, 실제로 0병력 전투가 발생하고 있음 (확인 필요)
3. **보급 방향이 역전됨** — 적벽 전 강하→하구는 맞지만, 적벽 후에는 하구→강하 (또는 하구→다른 기지)가 필요

### 1.3 C등급과 F등급의 실제 차이

```
C등급 (13게임): 적벽 승리 → 0병력 남군 진군 → 패배 → 유비 생존 (80% 확률)
F등급 (7게임):  적벽 승리 → 0병력 남군 진군 → 패배 → 유비 포로  (20% 확률)
```

**전략 차이 없음. 순수 RNG 차이.** 따라서 F를 C로 바꾸는 것이 아니라, C를 B로 올리는 것이 목표.

## 2. 구현 작업

### 경로 A: 엔진 안전장치 (Layer 1 — Hard Shell)

#### A-1. 0병력 보급(transfer) 거부

**파일:** `core/engine/action-executor.ts` — `executeTransfer()` 메서드

현재 transfer는 0명이어도 성공으로 처리된다. 최소 병력 체크를 추가:

```typescript
// transfer 실행부에서, 실제 이동 병력이 0이면 실패 처리
if (actualTransferred <= 0) {
  return this.fail('보급할 병력이 없습니다. 출발 도시에 병력이 부족합니다.');
}
```

**기대 효과:** 0병력 보급이 행동을 소모하지 않게 되어, AI가 다른 유용한 행동을 선택할 기회를 얻음.

#### A-2. 0병력 진군(march) 거부 확인

**파일:** `core/engine/action-executor.ts` — `executeMarch()` 메서드 (line 589)

이미 `marchTroops <= 0` 체크가 있다:
```typescript
if (marchTroops <= 0) {
  return this.fail('진군할 병력이 없습니다.');
}
```

**그런데** 실제 로그에서 0병력 전투가 발생하고 있다. 가능한 원인:
- `getTotalTroopsOfCity()` 계산에서 미세한 병력이 남아 있어 `marchTroops`가 1~2명이 되는 경우
- 또는 march는 통과했지만 실제 전투 시점에 병력이 0인 경우 (이동 중 탈영?)

**확인 필요:** 실제로 `march` 성공 시 병력이 몇 명인지 로그 확인. 만약 1~2명으로 진군하는 것이라면:

```typescript
// 최소 병력 임계값 추가 (예: 100명)
const MIN_MARCH_TROOPS = 100;
if (marchTroops < MIN_MARCH_TROOPS) {
  return this.fail(`진군 병력이 너무 적습니다 (${marchTroops}명). 최소 ${MIN_MARCH_TROOPS}명이 필요합니다.`);
}
```

**주의:** 이 임계값은 시나리오에 따라 다를 수 있으므로, 100명은 제안일 뿐. 게임 밸런스와 기존 테스트를 확인 후 결정.

#### A-3. 0병력 보급 실패 시 행동 미소모 (선택사항)

현재 `execute()` 메서드는 성공/실패와 무관하게 `actionsRemaining--`를 먼저 한다 (line 33-34 근처). 만약 실패 시 행동을 돌려주면 AI가 다른 행동을 시도할 기회를 얻음. 단, 이는 게임 밸런스에 영향을 줄 수 있으므로 **선택사항**.

### 경로 B: Soft Shell 강화 (Layer 2 — ICL/프롬프트)

#### B-1. EASY_STRATEGY_GUIDE에 "4단계: 적벽 후 전략" 추가

**파일:** `sim/icl/soft-shell-builder.ts` — `EASY_STRATEGY_GUIDE` 상수

현재 3단계까지만 있다. 4단계를 추가:

```typescript
export const EASY_STRATEGY_GUIDE = `
## 전략 가이드 (핵심 요약)

적벽대전에서 승리하려면 다음 4단계 전략을 따르라:

**1단계 (턴 1~7): 기반 구축**
- 훈련(train)으로 병사 전투력 강화 (3~5회)
- 개발(develop)은 1~2회로 최소화
- 손권에게 사신(send_envoy) 1회 → 동맹 확보

**2단계 (턴 7~12): 병력 집결**
- 보급(transfer)으로 강하/하구에서 전진기지로 병력 이동 (3~5회)
- 이것이 가장 중요하다 — 분산된 병력을 한 곳에 모아야 한다
- 훈련 병행으로 사기/훈련도 유지

**3단계 (턴 12~): 적벽 결전**
- 정찰(scout) 후 진군(march)으로 적벽 진출
- 화공 조건이 갖춰지면 화공 전술 사용
- 적벽 승리 후 즉시 4단계로 전환

**4단계: 적벽 승리 후 형주 공략** ← 핵심 추가
- 적벽 승리 직후, 보급 방향을 역전하라
- 하구(hagu)에서 강하(gangha)로 병력 보급 (transfer, hagu→gangha)
- 강하에 충분한 병력(2000명 이상)을 모은 후 남군(nanjun)으로 진군
- 병력 없이 진군하면 반드시 패배한다 — 보급 먼저, 진군은 나중에
- 유비(liubei)를 진군에 포함시키지 마라 — 포로가 되면 게임 오버

**절대 하지 말 것:**
- 개발만 반복하다 시간 낭비
- 외교에 3회 이상 소비
- 보급 없이 소규모 병력으로 진군
- 적벽 후에도 강하→하구 방향으로 보급 (강하는 이미 비어있다!)
- 0명 병력으로 진군 시도
`;
```

#### B-2. 합성 B등급 시드 경험 생성

**파일:** `sim/icl/seeds/o4-mini-wins.json` — experiences 배열에 추가

현재 시드는 C등급 2개 (적벽 승리하지만 남군 미점령). B등급 합성 경험을 추가:

```json
{
  "gameId": "synthetic-B-1",
  "gameNumber": 0,
  "grade": "B",
  "chibiVictory": true,
  "totalTurns": 21,
  "citiesCaptured": ["nanjun"],
  "allianceMaintained": true,
  "generalsLost": [],
  "strategyProfile": {
    "actionCounts": {
      "train": 6,
      "transfer": 10,
      "send_envoy": 2,
      "scout": 2,
      "march": 4,
      "develop": 2
    },
    "phases": [
      { "name": "내정기", "startTurn": 1, "endTurn": 7, "dominantActions": ["train", "send_envoy", "develop"] },
      { "name": "집결기", "startTurn": 8, "endTurn": 12, "dominantActions": ["transfer", "train"] },
      { "name": "적벽전", "startTurn": 13, "endTurn": 16, "dominantActions": ["scout", "march"] },
      { "name": "형주공략", "startTurn": 17, "endTurn": 21, "dominantActions": ["transfer", "march"] }
    ],
    "criticalActions": [
      { "turn": 3, "action": "transfer(gangha→hagu)", "description": "강하 병력을 하구에 집결", "impact": "important" },
      { "turn": 10, "action": "march(hagu→chibi)", "description": "적벽으로 주력 진군", "impact": "decisive" },
      { "turn": 17, "action": "transfer(hagu→gangha)", "description": "적벽 후 보급 방향 전환 — 하구에서 강하로", "impact": "decisive" },
      { "turn": 19, "action": "march(gangha→nanjun)", "description": "충분한 병력으로 남군 진군", "impact": "decisive" }
    ],
    "transferPattern": {
      "totalTransfers": 10,
      "concentrationTarget": "hagu→gangha (적벽 후 역전)",
      "totalTroopsMoved": 12000
    },
    "firstMarchTurn": 10,
    "marchTargets": ["chibi", "nanjun"]
  },
  "lessons": [
    "적벽 승리 후 보급 방향을 역전하라: 하구→강하로 병력 이동",
    "남군 진군 전 최소 2000명 이상 집결 필수",
    "유비는 남군 진군에 포함시키지 않는다 — 포로 위험"
  ],
  "turningPoints": [
    { "turn": 10, "type": "battle", "description": "적벽 화공으로 조조군 대파", "outcome": "positive" },
    { "turn": 17, "type": "action", "description": "보급 방향 전환 (하구→강하)", "outcome": "positive" },
    { "turn": 19, "type": "battle", "description": "충분한 병력으로 남군 점령 성공", "outcome": "positive" }
  ]
}
```

**핵심 포인트:**
- `phases`에 "형주공략" 4단계 추가
- `criticalActions`에 턴 17 "transfer(hagu→gangha)" 보급 방향 역전 포함
- `lessons`에 "보급 방향 역전" + "최소 병력" + "유비 보호" 세 가지 교훈
- `marchTargets`에 nanjun 포함

#### B-3. buildStrategyGuideline()에 적벽 후 단계 추가

**파일:** `sim/icl/soft-shell-builder.ts` — `buildStrategyGuideline()` 메서드 (line 102)

현재 3단계만 생성한다. 4단계 추가:

```typescript
private static buildStrategyGuideline(wins: GameExperience[]): string {
  // ... 기존 코드 ...

  lines.push(`1. 초반(턴1-7): 내정 최소화, 병력 훈련(train) 집중`);
  lines.push(`2. 중반(턴7-${Math.round(avgFirstMarch)}): 보급(transfer)으로 전진기지에 병력 집중 (최소 ${Math.round(avgTransfers)}회)`);
  lines.push(`3. 후반(턴${Math.round(avgFirstMarch)}이후): 적벽 진군(march) → 화공 전투`);
  lines.push(`4. 적벽 후: 보급 방향 역전(하구→강하), 충분한 병력 집결 후 남군 진군`);
  lines.push(`5. 외교: 손권 동맹은 1-2회 사신으로 충분. 과도한 외교 금지`);

  return lines.join('\n');
}
```

### 경로 C: 시드 개선 (기존 C등급 시드 lessons 강화)

#### C-1. 기존 시드에 "반성 교훈" 추가

**파일:** `sim/icl/seeds/o4-mini-wins.json` — 기존 2개 경험의 `lessons` 강화

기존 시드의 lessons가 적벽까지만 다루고 있다면, 남군 실패 교훈을 추가:

```json
"lessons": [
  "기존 교훈 유지...",
  "적벽 승리 후 남군을 점령해야 B등급 이상 — 보급 방향 전환 필수"
]
```

## 3. 우선순위

| 순서 | 작업 | 파일 | 영향 | 난이도 |
|------|------|------|------|--------|
| 1 | A-1: 0병력 transfer 거부 | action-executor.ts | 행동 낭비 방지 | 낮음 |
| 2 | A-2: 0병력 march 원인 확인 | action-executor.ts | 근본 원인 파악 | 조사 |
| 3 | B-1: EASY_STRATEGY_GUIDE 4단계 | soft-shell-builder.ts | 프롬프트 교육 | 낮음 |
| 4 | B-2: B등급 합성 시드 | o4-mini-wins.json | ICL 교육 확장 | 중간 |
| 5 | B-3: guideline 4단계 | soft-shell-builder.ts | 동적 지침 확장 | 낮음 |

## 4. 검증 실험 계획

구현 후 다음 순서로 테스트:

```bash
# 1) 엔진 수정 확인 — 기존 테스트 통과
npm test

# 2) Easy + B등급 시드 5게임 (빠른 검증)
npx tsx sim/run-batch.ts \
  --provider gemini --model gemini-3-flash-preview \
  --mode A --count 5 --difficulty easy --icl seed

# 3) 20게임 순차학습 (B등급 출현 여부 확인)
npx tsx sim/run-sequential.ts \
  --provider gemini --model gemini-3-flash-preview \
  --mode A --count 20 --difficulty easy --icl sequential
```

**성공 기준:** B등급 1회 이상 출현

## 5. 테스트 주의사항

- A-1 (transfer 거부) 수정 시 기존 테스트 중 `transfer` 관련 테스트 확인
- `executeMarch()`의 `marchTroops <= 0` 체크가 실제로 동작하는지 디버그 로그 추가 권장
- 합성 시드의 JSON 구조가 `GameExperience` 타입과 정확히 일치하는지 확인
- EASY_STRATEGY_GUIDE 변경 시 기존 테스트에 가이드 텍스트를 검증하는 테스트가 있을 수 있으니 확인
