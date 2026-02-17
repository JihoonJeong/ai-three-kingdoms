# 커리큘럼 학습: 난이도 조정 + B근접도 점수

> C→B 돌파가 불가능한 근본 원인은 게임 난이도가 너무 높아서 AI가 B등급 전략을 "발견"할 수 없기 때문이다. 이 문서는 두 가지 구현을 기술한다:
> 1. **난이도 조정 시스템** — 게임 환경을 커리큘럼 학습에 맞게 조절
> 2. **B근접도 점수** — A~F 등급보다 세밀한 연속 척도(0~100%)

## 배경: 왜 C→B가 불가능한가

### 현재 상황
| 지표 | 값 |
|------|-----|
| 남군 초기 병력 | 23,000 (보병 15k + 기병 5k + 수군 3k) |
| 적벽 후 nanjun_troop_collapse | 50% 감소 → ~11,500 잔존 |
| AI 최대 투사 병력 (o4-mini) | 4,607명 |
| AI 최대 투사 병력 (Flash) | 2,208명 |
| 남군 점령에 필요한 최소 병력 | ~8,000명 (추정) |

### 핵심 갭
- **인간 A등급 전략**: develop → S등급 농업 → food-conscript 루프 (500식량→1000명, 1000→2500명) → 병력 15,000+ 후 진군
- **AI 최선**: 기존 병력 transfer만 사용 → 최대 ~4,600명. conscript 시도는 있으나 1~3회에 그침
- **결론**: 현재 난이도에서 B등급은 인간 전용. AI에게는 "달성 불가능한 시험"

### 학습 이론 근거
- **강화학습**: 보상이 너무 sparse하면 에이전트가 올바른 행동을 탐색할 수 없음
- **커리큘럼 학습**: 난이도를 점진적으로 올려야 효과적 (Zone of Proximal Development)
- **ICL 한계**: 경험 중 B등급 사례가 없으면, Soft Shell에 B전략이 담길 수 없음 (Closed Learning Loop)

---

## Task 1: 난이도 조정 시스템 (DifficultyModifier)

### 1.1 개요

`difficulty` 옵션(`easy` | `normal` | `hard` | `expert`)에 따라 시나리오 초기 상태를 변형한다. 기존 `SimConfig.difficulty`와 `--difficulty` CLI 옵션은 이미 존재하지만 실제 효과가 없다. 이를 구현한다.

### 1.2 난이도별 파라미터

```typescript
// sim/difficulty-modifier.ts (신규)

export interface DifficultyParams {
  /** 적벽 후 남군 병력 감소 비율 (기본 0.5 = 50% 감소) */
  nanjunCollapseRatio: number;

  /** 남군 사기 페널티 (기본 -25) */
  nanjunMoralePenalty: number;

  /** 손권 식량 지원량 (0이면 없음) */
  sunQuanFoodSupport: number;

  /** 남군 초기 병력 배수 (1.0 = 기본, 0.5 = 절반) */
  nanjunTroopMultiplier: number;

  /** 플레이어 초기 식량 배수 (1.0 = 기본) */
  playerFoodMultiplier: number;
}

export const DIFFICULTY_PRESETS: Record<string, DifficultyParams> = {
  easy: {
    nanjunCollapseRatio: 0.7,      // 70% 감소 (기존 50% → 더 많이 약화)
    nanjunMoralePenalty: -40,       // 사기 대폭 하락
    sunQuanFoodSupport: 5000,       // 손권이 식량 5000 지원
    nanjunTroopMultiplier: 0.7,     // 초기 병력 70% (23000 → 16100)
    playerFoodMultiplier: 1.5,      // 초기 식량 50% 증가
  },
  normal: {
    nanjunCollapseRatio: 0.5,       // 현재 값 유지
    nanjunMoralePenalty: -25,
    sunQuanFoodSupport: 0,
    nanjunTroopMultiplier: 1.0,
    playerFoodMultiplier: 1.0,
  },
  hard: {
    nanjunCollapseRatio: 0.3,       // 30% 감소만
    nanjunMoralePenalty: -15,
    sunQuanFoodSupport: 0,
    nanjunTroopMultiplier: 1.2,
    playerFoodMultiplier: 0.8,
  },
  expert: {
    nanjunCollapseRatio: 0.2,       // 20% 감소만
    nanjunMoralePenalty: -10,
    sunQuanFoodSupport: 0,
    nanjunTroopMultiplier: 1.5,
    playerFoodMultiplier: 0.6,
  },
};
```

### 1.3 구현 위치

#### (A) 시나리오 초기 상태 변형 — `headless-sim.ts`

```typescript
// headless-sim.ts의 run() 메서드, 시나리오 생성 직후

const scenario = createRedCliffsScenario(`sim-${this.config.gameId}`);

// 난이도 적용
if (this.config.difficulty && this.config.difficulty !== 'normal') {
  applyDifficultyModifier(scenario, this.config.difficulty);
}
```

`applyDifficultyModifier()` 구현:

```typescript
// sim/difficulty-modifier.ts

export function applyDifficultyModifier(
  state: GameState,
  difficulty: 'easy' | 'normal' | 'hard' | 'expert'
): void {
  const params = DIFFICULTY_PRESETS[difficulty];
  if (!params) return;

  // 1. 남군 초기 병력 조정
  const nanjun = state.cities.find(c => c.id === 'nanjun');
  if (nanjun) {
    nanjun.troops.infantry = Math.floor(nanjun.troops.infantry * params.nanjunTroopMultiplier);
    nanjun.troops.cavalry = Math.floor(nanjun.troops.cavalry * params.nanjunTroopMultiplier);
    nanjun.troops.navy = Math.floor(nanjun.troops.navy * params.nanjunTroopMultiplier);
  }

  // 2. 플레이어 초기 식량 조정
  for (const city of state.cities) {
    if (city.owner === '유비') {
      city.food = Math.floor(city.food * params.playerFoodMultiplier);
    }
  }

  // 3. 난이도를 flags에 기록 (이벤트 시스템에서 참조)
  state.flags['difficulty'] = difficulty;
  state.flags['nanjunCollapseRatio'] = params.nanjunCollapseRatio;
  state.flags['nanjunMoralePenalty'] = params.nanjunMoralePenalty;
  state.flags['sunQuanFoodSupport'] = params.sunQuanFoodSupport;
}
```

#### (B) 이벤트 시스템 — nanjun_troop_collapse 동적 비율

현재 `red-cliffs.ts`의 이벤트 데이터에 `ratio: 0.5`가 하드코딩 되어 있다. 이것을 flags에서 읽도록 event-system.ts를 수정한다:

```typescript
// event-system.ts의 applyEffect() 중 'troop_loss' 케이스

case 'troop_loss': {
  const city = stateManager.getCity(effect.city);
  if (city && city.owner === effect.target) {
    // 난이도 flags가 있으면 우선 적용
    const collapseRatio = stateManager.getFlag('nanjunCollapseRatio')
      ?? effect.ratio;
    const moralePenalty = stateManager.getFlag('nanjunMoralePenalty')
      ?? effect.moralePenalty;

    const totalTroops = city.troops.infantry + city.troops.cavalry + city.troops.navy;
    const remaining = Math.floor(totalTroops * (1 - collapseRatio));
    // ... 기존 분배 로직 유지
  }
}
```

#### (C) 손권 식량 지원 이벤트 — 신규

적벽 승리 시 손권이 식량을 지원하는 이벤트를 추가한다. easy 난이도에서만 활성화.

```typescript
// red-cliffs.ts 이벤트 배열에 추가

{
  id: 'sun_quan_food_support',
  trigger: { type: 'condition', condition: 'chibi_victory' },
  description: '손권이 동맹의 승리를 축하하며 군량을 보내왔습니다.',
  effects: [
    { type: 'food_support', target: '유비', amount: 'from_flags' },
    // amount는 flags['sunQuanFoodSupport']에서 동적으로 읽음
  ],
}
```

이벤트 핸들러에서:
```typescript
case 'food_support': {
  const amount = stateManager.getFlag('sunQuanFoodSupport') ?? 0;
  if (amount <= 0) break; // normal/hard에서는 skip

  // 하구에 식량 지급 (적벽에 가장 가까운 유비 도시)
  const hagu = stateManager.getCity('hagu');
  if (hagu && hagu.owner === '유비') {
    hagu.food += amount;
  }
  return `손권이 군량 ${amount}을 지원했습니다.`;
}
```

### 1.4 검증 방법

```bash
# easy 난이도 5게임
npx tsx sim/run-batch.ts --provider gemini --model gemini-2.0-flash \
  --count 5 --mode A --sequential --seed-library sim/icl/seeds/o4-mini-wins.json \
  --difficulty easy

# normal 대조군 5게임
npx tsx sim/run-batch.ts --provider gemini --model gemini-2.0-flash \
  --count 5 --mode A --sequential --seed-library sim/icl/seeds/o4-mini-wins.json \
  --difficulty normal
```

**성공 기준**: easy에서 B등급 1회 이상 달성

### 1.5 주의사항

- `createRedCliffsScenario()`는 수정하지 않는다 (순수 함수 유지). 대신 생성 후 modifier 적용.
- 웹 게임(플레이어용)에는 영향 없음 — sim 전용 경로
- 테스트: `difficulty-modifier.test.ts`에서 각 프리셋의 수치 변환 검증

---

## Task 2: B근접도 점수 (B-Proximity Score)

### 2.1 개요

현재 A~F 등급 (6단계)은 ICL 학습에 너무 sparse하다. C등급 사이에서도 "남군 진군을 시도조차 안 한 C"와 "남군 전투에서 2,000명으로 싸우다 진 C"는 품질이 완전히 다르다. 0~100% 연속 점수를 도입하여 이 차이를 포착한다.

### 2.2 점수 설계

```typescript
// sim/icl/b-proximity-score.ts (신규)

export interface BProximityBreakdown {
  chibiVictory: number;       // 0 or 30  — 적벽 승리 (필수 조건)
  troopConcentration: number; // 0~25     — 강하(gangha)에 모은 최대 병력
  marchAttempt: number;       // 0~15     — 남군 진군 시도 여부 + 병력 규모
  postChibiTransfer: number;  // 0~15     — 적벽 후 올바른 방향(hagu→gangha) 보급
  conscriptEffort: number;    // 0~10     — 징병(conscript) 활용도
  foodManagement: number;     // 0~5      — 식량 관리 (탈영 최소화)
  total: number;              // 0~100
}
```

#### 점수 세부 로직

```typescript
export function calculateBProximity(result: SimResult): BProximityBreakdown {
  const breakdown: BProximityBreakdown = {
    chibiVictory: 0,
    troopConcentration: 0,
    marchAttempt: 0,
    postChibiTransfer: 0,
    conscriptEffort: 0,
    foodManagement: 0,
    total: 0,
  };

  // (1) 적벽 승리: 30점 (B의 필수 조건)
  if (result.flags['chibiVictory']) {
    breakdown.chibiVictory = 30;
  }

  // (2) 병력 집중도: 0~25점
  // 강하(gangha)에 도달한 최대 병력 추적
  const maxGanghaTroops = getMaxTroopsAtCity(result, 'gangha', 'after_chibi');
  // 8000명 이상이면 만점, 선형 비례
  breakdown.troopConcentration = Math.min(25, Math.floor((maxGanghaTroops / 8000) * 25));

  // (3) 남군 진군 시도: 0~15점
  const nanjunMarches = getNanjunMarchAttempts(result);
  if (nanjunMarches.length > 0) {
    const bestMarchTroops = Math.max(...nanjunMarches.map(m => m.troops));
    // 진군 시도 자체에 5점, 병력 규모에 따라 최대 10점 추가
    breakdown.marchAttempt = 5 + Math.min(10, Math.floor((bestMarchTroops / 8000) * 10));
  }

  // (4) 적벽 후 올바른 보급: 0~15점
  // hagu→gangha 보급 횟수 (적벽 후)
  const correctTransfers = getPostChibiTransfers(result, 'hagu', 'gangha');
  // 3회 이상이면 만점
  breakdown.postChibiTransfer = Math.min(15, correctTransfers * 5);

  // (5) 징병 활용: 0~10점
  const conscriptCount = countActions(result, 'conscript');
  // 5회 이상이면 만점
  breakdown.conscriptEffort = Math.min(10, conscriptCount * 2);

  // (6) 식량 관리: 0~5점
  // 탈영 이벤트 횟수 (적을수록 좋음)
  const desertions = countDesertionEvents(result);
  // 0회면 5점, 5회 이상이면 0점
  breakdown.foodManagement = Math.max(0, 5 - desertions);

  breakdown.total = breakdown.chibiVictory + breakdown.troopConcentration
    + breakdown.marchAttempt + breakdown.postChibiTransfer
    + breakdown.conscriptEffort + breakdown.foodManagement;

  return breakdown;
}
```

### 2.3 점수 해석 가이드

| 범위 | 해석 | 예시 |
|------|------|------|
| 0~20 | D/F 수준 — 적벽조차 미도달 | 내정만 하다 턴 소진 |
| 20~35 | Low C — 적벽 승리만 | 적벽 후 아무것도 못함 |
| 35~55 | Mid C — 올바른 방향 인식 | 보급 방향 전환 시도, 병력 부족 |
| 55~75 | High C — B에 근접 | 강하 4000+명, 남군 진군 시도 |
| 75~90 | B등급 수준 | 남군 점령 성공 |
| 90~100 | A등급 수준 | 남군+동맹+장수 보전 |

### 2.4 통합 위치

#### (A) ExperienceExtractor에 추가

```typescript
// sim/icl/experience-extractor.ts 수정

import { calculateBProximity, type BProximityBreakdown } from './b-proximity-score.js';

// extract() 메서드에서:
const bProximity = calculateBProximity(simResult);

return {
  ...existingFields,
  bProximityScore: bProximity.total,
  bProximityBreakdown: bProximity,
};
```

#### (B) GameExperience 타입에 추가

```typescript
// sim/icl/experience-types.ts 수정

export interface GameExperience {
  // ... 기존 필드 ...

  /** B근접도 점수 (0~100). C등급 내에서도 품질을 구분 */
  bProximityScore: number;

  /** B근접도 세부 항목 */
  bProximityBreakdown?: BProximityBreakdown;
}
```

#### (C) ExperienceStore의 선택 로직 개선

```typescript
// sim/icl/experience-store.ts 수정

// selectBalanced() 에서 "best performer" 선택 시:
// 기존: grade만으로 정렬 (S > A > B > C > D > F)
// 개선: 같은 grade면 bProximityScore로 2차 정렬

private selectBalanced(): GameExperience[] {
  const sorted = [...this.experiences].sort((a, b) => {
    const gradeOrder = this.gradeToNumber(b.grade) - this.gradeToNumber(a.grade);
    if (gradeOrder !== 0) return gradeOrder;
    // 같은 등급이면 B근접도로 비교
    return (b.bProximityScore ?? 0) - (a.bProximityScore ?? 0);
  });

  // ... 이하 기존 로직 유지
}
```

#### (D) SoftShellBuilder에 점수 포함

```typescript
// sim/icl/soft-shell-builder.ts 수정

private static formatWinExperience(exp: GameExperience): string {
  const score = exp.bProximityScore ?? 0;
  const profile = exp.strategyProfile;
  // ... 기존 코드 ...
  return `- **${exp.grade}등급** (B근접도: ${score}%, ${exp.totalTurns}턴): ...`;
}
```

#### (E) 배치 결과 통계에 추가

```typescript
// sim/run-batch.ts의 결과 출력부에 추가

// 배치 완료 후 B근접도 통계 출력
const scores = results.map(r => r.bProximityScore ?? 0);
console.log(`  B근접도: 평균 ${avg(scores).toFixed(1)}%, 최대 ${Math.max(...scores)}%, 최소 ${Math.min(...scores)}%`);
```

### 2.5 헬퍼 함수 구현 가이드

아래 함수들은 `SimResult`의 `turnLogs`를 순회하여 추출한다:

```typescript
/** 특정 도시의 최대 병력 (적벽 승리 후 턴만) */
function getMaxTroopsAtCity(result: SimResult, cityId: string, after: 'after_chibi'): number {
  let chibiTurn = -1;
  let maxTroops = 0;

  for (const log of result.turnLogs) {
    // chibi_victory 이벤트 감지
    if (log.events.some(e => e.includes('적벽') && e.includes('승리'))) {
      chibiTurn = log.turn;
    }
    if (chibiTurn < 0) continue;

    // finalState에서 해당 도시 병력 확인
    const cityState = result.finalState.cities.find(c => c.id === cityId);
    if (cityState) {
      maxTroops = Math.max(maxTroops, cityState.troops);
    }
  }

  // 주의: finalState는 최종 상태만 담고 있음.
  // 정확한 구현을 위해서는 각 턴의 도시 상태가 필요.
  // 대안: turnLogs의 action result에서 transfer/conscript 성공 시 병력 변화 추적
  // 또는 SimResult에 턴별 도시 스냅샷 필드를 추가하는 것이 가장 정확.

  return maxTroops;
}

/** 남군 진군 시도 목록 (시도한 턴 + 투입 병력) */
function getNanjunMarchAttempts(result: SimResult): Array<{turn: number, troops: number}> {
  const attempts: Array<{turn: number, troops: number}> = [];

  for (const log of result.turnLogs) {
    for (const { action, result: actionResult } of log.actions) {
      if (action.type === 'march' && action.params?.to === 'nanjun') {
        // 투입 병력은 result.description에서 파싱하거나,
        // action.params에서 추정 (from 도시의 이전 병력 × scale 비율)
        const troopsMatch = actionResult.description.match(/(\d+)명/);
        const troops = troopsMatch ? parseInt(troopsMatch[1]) : 0;
        attempts.push({ turn: log.turn, troops });
      }
    }
  }

  return attempts;
}

/** 적벽 후 특정 방향 보급 횟수 */
function getPostChibiTransfers(result: SimResult, from: string, to: string): number {
  let chibiOccurred = false;
  let count = 0;

  for (const log of result.turnLogs) {
    if (log.events.some(e => e.includes('적벽'))) chibiOccurred = true;
    if (!chibiOccurred) continue;

    for (const { action, result: actionResult } of log.actions) {
      if (action.type === 'transfer'
        && action.params?.from === from
        && action.params?.to === to
        && actionResult.success) {
        count++;
      }
    }
  }

  return count;
}

/** 특정 액션 타입의 총 횟수 */
function countActions(result: SimResult, actionType: string): number {
  let count = 0;
  for (const log of result.turnLogs) {
    for (const { action } of log.actions) {
      if (action.type === actionType) count++;
    }
  }
  return count;
}

/** 탈영 이벤트 횟수 (식량 부족으로 인한) */
function countDesertionEvents(result: SimResult): number {
  let count = 0;
  for (const log of result.turnLogs) {
    for (const event of log.events) {
      if (event.includes('탈영') || event.includes('이탈')) count++;
    }
  }
  return count;
}
```

**중요**: `getMaxTroopsAtCity()`의 정확한 구현을 위해 턴별 도시 스냅샷이 필요할 수 있다. 현재 `SimResult.finalState`는 최종 상태만 담고 있으므로, 중간 상태 추적이 불가하다. 두 가지 옵션:

1. **간이 접근** (추천): transfer/conscript 액션의 result.description에서 병력 변화를 파싱하여 추정
2. **정밀 접근**: TurnLog에 `citySnapshots` 필드를 추가하여 매 턴 도시 상태를 기록

우선 간이 접근으로 구현하고, 필요 시 정밀 접근으로 전환한다.

### 2.6 검증 방법

```bash
# 기존 결과 파일들에 B근접도 역산 적용 (검증용 스크립트)
npx tsx sim/tools/recalc-proximity.ts sim/results/batch-*.json
```

**기대 결과**:
- F등급 게임: 0~20점
- D등급 게임: 10~25점
- C등급 (보급 미시도): 30~40점
- C등급 (보급 방향 전환 시도): 40~55점
- C등급 (남군 진군 시도): 50~65점
- B등급 이상: 75점+

### 2.7 테스트

```typescript
// sim/icl/b-proximity-score.test.ts

describe('B-Proximity Score', () => {
  it('적벽 미승리 → 최대 0점 (chibiVictory=0)', () => {
    const result = makeSimResult({ chibiVictory: false });
    expect(calculateBProximity(result).total).toBeLessThanOrEqual(15);
    // conscript, food만으로 최대 15점
  });

  it('적벽 승리 + 아무것도 안함 → ~30점', () => {
    const result = makeSimResult({ chibiVictory: true, noPostActions: true });
    const score = calculateBProximity(result);
    expect(score.chibiVictory).toBe(30);
    expect(score.total).toBeGreaterThanOrEqual(30);
    expect(score.total).toBeLessThanOrEqual(40);
  });

  it('올바른 보급 + 남군 진군 시도 → 60점+', () => {
    const result = makeSimResult({
      chibiVictory: true,
      postChibiTransfers: [
        { from: 'hagu', to: 'gangha', troops: 1500 },
        { from: 'hagu', to: 'gangha', troops: 1200 },
        { from: 'hagu', to: 'gangha', troops: 800 },
      ],
      nanjunMarch: { troops: 3000 },
      conscriptCount: 3,
    });
    expect(calculateBProximity(result).total).toBeGreaterThanOrEqual(60);
  });
});
```

---

## Task 3: 통합 — 커리큘럼 실험 파이프라인

### 3.1 실험 계획

```
Stage 1: easy + Seed ICL + MilestoneCoach → 5게임
  - 목표: B등급 1회 이상 달성
  - B 달성 시 → 그 경험을 시드에 추가

Stage 2: easy → normal 전환 (커리큘럼)
  - easy에서 발견된 B 시드를 들고 normal 5게임
  - 목표: normal에서도 B근접도 60+ 달성

Stage 3: B근접도 기반 experience selection
  - bProximityScore 상위 경험을 우선 선택
  - C등급 중에서도 "질 좋은 C"를 학습 재료로 사용
```

### 3.2 우선순위

1. **Task 1 (난이도 조정)** — 가장 먼저. 이것 없이는 B 달성 자체가 불가
2. **Task 2 (B근접도)** — Task 1과 병렬 작업 가능. 측정 → 분석 기반
3. **Task 3 (통합 실험)** — Task 1,2 완료 후 Ray에게 실험 요청

### 3.3 파일 목록

| 파일 | 작업 | 신규/수정 |
|------|------|-----------|
| `sim/difficulty-modifier.ts` | 난이도 파라미터 + 적용 함수 | 신규 |
| `sim/difficulty-modifier.test.ts` | 난이도 단위 테스트 | 신규 |
| `sim/headless-sim.ts` | 시나리오 생성 후 난이도 적용 호출 | 수정 |
| `core/engine/event-system.ts` | troop_loss에 flags 기반 동적 비율 | 수정 |
| `core/data/scenarios/red-cliffs.ts` | sun_quan_food_support 이벤트 추가 | 수정 |
| `sim/icl/b-proximity-score.ts` | B근접도 계산 로직 | 신규 |
| `sim/icl/b-proximity-score.test.ts` | B근접도 단위 테스트 | 신규 |
| `sim/icl/experience-types.ts` | GameExperience에 bProximityScore 추가 | 수정 |
| `sim/icl/experience-extractor.ts` | extract()에서 B근접도 계산 호출 | 수정 |
| `sim/icl/experience-store.ts` | selectBalanced()에 B근접도 2차 정렬 | 수정 |
| `sim/icl/soft-shell-builder.ts` | 경험 포맷에 B근접도 표시 | 수정 |

---

## 부록: 현재 코드 참조

### 남군 초기 병력 (red-cliffs.ts:60-75)
```
nanjun: infantry 15000, cavalry 5000, navy 3000 = 23,000
```

### nanjun_troop_collapse 이벤트 (red-cliffs.ts:431-437)
```
ratio: 0.5, moralePenalty: -25
→ 적벽 후 남군 잔존: ~11,500명
```

### 등급 판정 (victory-judge.ts:84-108)
```
S: chibiVictory + nanjun + jiangling + alliance + 0 losses
A: chibiVictory + nanjun + alliance
B: chibiVictory + citiesCaptured > 0    ← 이것이 목표
C: chibiVictory only
D: !chibiVictory + liubei alive
F: liubei dead/captured or no cities
```

### difficulty CLI (run-batch.ts:73)
```
--difficulty easy|normal|hard|expert  (이미 존재, 효과 미구현)
```

### headless-sim.ts 시나리오 생성 (line 55)
```typescript
const scenario = createRedCliffsScenario(`sim-${this.config.gameId}`);
// ← 여기 바로 뒤에 applyDifficultyModifier() 호출 추가
```
