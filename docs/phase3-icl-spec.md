# Phase 3: In-Context Learning (ICL) — 제갈량의 Soft Shell

> **ai-ludens Four-Shell Model 기반 학습 시스템**
> Hardware → Core(모델 가중치) → Hard Shell(프롬프트/규칙) → **Soft Shell(축적된 경험)** → Phenotype(관측 행동)

## 1. 개요

### 1.1 문제 정의

Phase 2 시뮬레이션 결과:

| 모델 | 게임 수 | 등급 분포 | 승률 | 비용/게임 | 시간/게임 |
|------|---------|----------|------|----------|----------|
| Qwen3 8B (로컬) | 88 | 88D | 0% | $0 | ~180s |
| Exaone / Llama (로컬) | 다수 | 전패 | 0% | $0 | ~180s |
| **Gemini 3 Flash** (API) | 5 | 5D | 0% | $0.04 | 61s |
| **Claude Haiku 4.5** (API) | 5 | 5D | 0% | $0.07 | 104s |
| **Claude Sonnet 4.5** (API) | 5 | 4D+1F | 0% | $0.21 | 184s |
| GPT-5 (API) | 7 | 3D+4F | 0% | $0.11 | 430s |
| **o4-mini** (API) | 6 | 2C+4D | **33%** | $0.07 | 314s |

#### 핵심 발견: 모델 가격 ≠ 전략 성능

```
가격순:   Flash($0.04) < Haiku($0.07) ≈ o4-mini($0.07) < Sonnet($0.21)
성능순:   Flash = Haiku = Sonnet (전패 0%) <<< o4-mini (33% 승리)
```

Sonnet 4.5는 Haiku의 3배 비용, 2배 느리지만 결과는 동일하거나 더 나쁨(F등급 발생).
**Core 크기(모델 가격)는 이 게임에서 전략 성능을 결정하지 않는다.**
유일한 승리 모델 o4-mini의 차별점은 크기가 아니라 **reasoning 구조(chain-of-thought)**.

#### 실패 스펙트럼 — 전 모델 행동 패턴 분석

| 지표 | Qwen 8B | Gemini Flash | Haiku 4.5 | Sonnet 4.5 | o4-mini (승리) |
|------|---------|-------------|-----------|------------|---------------|
| transfer | 0 | **33** | 13 | **34** | 5+ |
| march | 0 | 0 | 2 (비전략적) | 2 (자살 공격) | 2+ (전략적) |
| develop | 많음 | 79 | **99** | 59 | ~3 |
| send_envoy | 많음 | 65 | **95** | 62 | ~1 |
| scout | 0 | **42** | 0 | 12 | ~1 |
| food transfer | 0 | 0 | 0 | 0 | ? |
| 불완전 턴 | 적음 | 소수 | 28% | **62.6%** | 적음 |
| 탈영/게임 | - | 2,659~5,029 | avg 3,093 | 다수 | - |

```
실패 단계별 분류:

Level 0: 준비도 안 함     — Qwen/Exaone/Llama
                            transfer 0, march 0
                            전략 개념 자체가 없음

Level 1: 준비만 함        — Gemini 3 Flash
                            transfer 33, march 0
                            병력 집중은 하지만 공격 개념 부재
                            "영원한 준비" 모드

Level 1.5: 소극적 시도    — Haiku 4.5 / Sonnet 4.5
                            transfer 13~34, march 2 (비전략적)
                            잘못된 곳(남군 20k)에 부족한 병력(4k)으로 자살 공격
                            Sonnet은 유비 포로 → F등급
                            적벽 방향 march는 단 한 번도 없음

Level 2: 전략적 실행      — o4-mini (유일)
                            transfer → 하구 집중, 적벽 방향 march
                            3단계 전략: 내정 → 집결 → 진군
```

**모든 실패 모델의 공통점**: 적벽(chibi)으로의 전략적 march가 없음.
Sonnet이 Haiku보다 더 많이 transfer(34 vs 13)하고 더 비싸지만, 결과는 동일하거나 더 나쁨.

**근본 원인**: 매 게임이 빈 Soft Shell로 시작한다. "준비 → 실행" 전환(phase transition)의
경험이 없어서, 동일한 실패가 반복된다.
Four-Shell Model 관점에서, 현재 시스템은 Core(모델)와 Hard Shell(프롬프트)만 존재하고
Soft Shell(축적된 경험)이 전무하다.

> **Core를 키우는 것(비싼 모델)은 해결책이 아니다.
> Soft Shell(경험)을 채우는 것이 유일한 탈출구다.**

### 1.2 핵심 가설

> **동일한 Core + Hard Shell이라도, Soft Shell(게임 경험)을 축적하면
> Phenotype(전략 품질)이 유의미하게 향상된다.**

이 가설을 검증하기 위해, 다음 설계를 적용한다:

### 1.3 비대칭 ICL 설계 (Controlled Experiment)

| 요소 | ICL 적용 | 근거 |
|------|---------|------|
| **제갈량 (책사 AI)** | ✅ 전체 | 실험 변수 — Soft Shell 효과 측정 |
| **조조/손권 (세력 AI)** | ❌ 없음 | 통제 변수 — 환경 고정 |
| **Player AI (SimAdvisor)** | ❌~최소 | 인간 시뮬레이션 — 느리고 불완전한 학습 모사 |

- 세력 AI(조조/손권)는 기존 마일스톤+적응규칙 유지 → 게임 환경이 일정
- 오직 제갈량만 경험을 축적 → 단일 변수 실험
- 결과: N번째 게임에서의 등급 변화가 곧 ICL 효과

---

## 2. 아키텍처

### 2.1 Soft Shell = GameExperience

```
┌─────────────────────────────────────────────────┐
│  Four-Shell Model (제갈량)                        │
│                                                   │
│  Core: LLM 가중치 (qwen3/o4-mini/claude/etc)     │
│  Hard Shell: prompts.ts (페르소나+상황+규칙)       │
│  Soft Shell: ← NEW ── GameExperience[]            │
│    ├─ 전략 라이브러리 (승리 패턴)                   │
│    ├─ 실패 교훈 (반복 실수 방지)                    │
│    └─ 중간 반성 (mid-game reflection)             │
│  Phenotype: 추천 행동 + 내러티브                   │
│                                                   │
└─────────────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
Game 1 (빈 Soft Shell)
  → 플레이 → 결과 D등급
  → ExperienceExtractor: 턴로그 → GameExperience 추출
  → 저장: experience-store.json

Game 2 (Soft Shell: Game 1 경험)
  → buildSystemPrompt() + injectSoftShell(experiences)
  → 프롬프트에 과거 교훈 + 승리 패턴 포함
  → 플레이 → 결과 C등급?

Game N (Soft Shell: Game 1~N-1 경험)
  → 축적된 경험이 갈수록 풍부
  → 학습 곡선 측정
```

### 2.3 모듈 구성

```
sim/
  icl/
    experience-types.ts      ← 경험 타입 정의
    experience-extractor.ts   ← SimResult → GameExperience 변환
    experience-store.ts       ← 경험 저장/로드/선택
    soft-shell-builder.ts     ← GameExperience[] → 프롬프트 텍스트
    mid-game-reflector.ts     ← 게임 중간 반성 생성
  sim-advisor.ts              ← 수정: Soft Shell 주입
  run-batch.ts                ← 수정: 순차 학습 모드 추가
```

---

## 3. 상세 설계

### 3.1 경험 타입 (`experience-types.ts`)

```typescript
/** 게임 한 판에서 추출한 경험 */
export interface GameExperience {
  gameId: string;
  gameNumber: number;        // 순차 학습에서의 게임 순서
  grade: string;             // S/A/B/C/D/F
  chibiVictory: boolean;

  // 핵심 지표
  totalTurns: number;
  citiesCaptured: string[];
  allianceMaintained: boolean;
  generalsLost: string[];

  // 전략 요약 (자동 추출)
  strategyProfile: StrategyProfile;

  // 교훈 (LLM or 규칙 기반 생성)
  lessons: string[];         // 1~3문장의 교훈

  // 핵심 전환점
  turningPoints: TurningPoint[];
}

/** 전략 프로파일: 행동 패턴 분석 */
export interface StrategyProfile {
  // 행동 유형별 횟수
  actionCounts: Record<string, number>;  // { transfer: 5, train: 8, march: 2, ... }

  // 전략 단계 전환 (있다면)
  phases: StrategyPhase[];

  // 핵심 행동 시퀀스 (승리 시 중요)
  criticalActions: Array<{
    turn: number;
    action: string;
    description: string;
    impact: string;  // 'decisive' | 'important' | 'minor'
  }>;

  // 보급(transfer) 패턴 — Phase 2 분석에서 핵심 차별화 요소
  transferPattern: {
    totalTransfers: number;
    concentrationTarget?: string;  // 병력 집중 도시
    totalTroopsMoved: number;
  };

  // 진군(march) 타이밍
  firstMarchTurn: number | null;
  marchTargets: string[];
}

/** 전략 단계 */
export interface StrategyPhase {
  name: string;           // 'domestic' | 'consolidation' | 'military' | 'expansion'
  startTurn: number;
  endTurn: number;
  dominantActions: string[];  // 주요 행동 유형
}

/** 전환점: 게임 결과에 결정적 영향을 준 이벤트/행동 */
export interface TurningPoint {
  turn: number;
  type: 'action' | 'event' | 'battle' | 'missed_opportunity';
  description: string;
  outcome: 'positive' | 'negative';
}

/** 경험 저장소 설정 */
export interface ExperienceStoreConfig {
  maxExperiences: number;     // 최대 저장 경험 수 (기본 20)
  selectionStrategy: 'recent' | 'best' | 'diverse' | 'balanced';
  promptBudget: number;       // Soft Shell에 할당할 최대 토큰 수 (기본 800)
}
```

### 3.2 경험 추출 (`experience-extractor.ts`)

SimResult에서 GameExperience를 자동 추출한다.

```typescript
export class ExperienceExtractor {
  /**
   * 턴 로그를 분석하여 전략 프로파일을 생성
   */
  static extractProfile(result: SimResult): StrategyProfile {
    const actionCounts: Record<string, number> = {};

    for (const turnLog of result.turnLogs) {
      for (const { action } of turnLog.actions) {
        actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
      }
    }

    // transfer 패턴 분석 (Phase 2에서 핵심 차별화 요소로 확인됨)
    const transfers = result.turnLogs.flatMap(t =>
      t.actions.filter(a => a.action.type === 'transfer')
    );
    const transferTargets = transfers.map(t => t.action.params?.to).filter(Boolean);
    const concentrationTarget = mode(transferTargets);

    // 첫 march 턴 찾기
    const firstMarch = result.turnLogs.find(t =>
      t.actions.some(a => a.action.type === 'march')
    );

    // 전략 단계 추출 (연속 2턴 이상 같은 유형 행동)
    const phases = this.detectPhases(result.turnLogs);

    return {
      actionCounts,
      phases,
      criticalActions: this.extractCriticalActions(result),
      transferPattern: {
        totalTransfers: transfers.length,
        concentrationTarget,
        totalTroopsMoved: 0, // 상세 계산은 params에서
      },
      firstMarchTurn: firstMarch?.turn ?? null,
      marchTargets: this.extractMarchTargets(result.turnLogs),
    };
  }

  /**
   * 규칙 기반 교훈 추출 (LLM 불필요)
   */
  static extractLessons(result: SimResult, profile: StrategyProfile): string[] {
    const lessons: string[] = [];

    // 승리 패턴 교훈
    if (result.flags['chibiVictory']) {
      if (profile.transferPattern.totalTransfers >= 3) {
        lessons.push(
          `보급(transfer)으로 ${profile.transferPattern.concentrationTarget || '전진기지'}에 ` +
          `병력을 집중한 것이 적벽 승리의 핵심이었다.`
        );
      }
      if (profile.firstMarchTurn && profile.firstMarchTurn >= 10) {
        lessons.push(
          `내정과 훈련을 충분히 한 후 턴 ${profile.firstMarchTurn}에 진군하여 ` +
          `전투력이 높은 상태에서 교전한 것이 효과적이었다.`
        );
      }
    }

    // 패배 패턴 교훈
    if (!result.flags['chibiVictory']) {
      if (profile.transferPattern.totalTransfers === 0) {
        lessons.push(
          '보급(transfer)을 한 번도 사용하지 않아 병력이 분산되었다. ' +
          '인접 아군 도시 간 병력 집중(transfer)이 필수적이다.'
        );
      }
      if (!profile.firstMarchTurn) {
        lessons.push(
          '한 번도 진군(march)하지 않아 적벽 전투에 참여하지 못했다. ' +
          '턴 10~14 사이에 적벽으로 진군해야 한다.'
        );
      }
      if ((profile.actionCounts['develop'] || 0) > 8) {
        lessons.push(
          `개발(develop)에 ${profile.actionCounts['develop']}회를 사용하여 ` +
          `군사 준비 시간이 부족했다. 내정은 최소화하고 군비에 집중해야 한다.`
        );
      }
      if ((profile.actionCounts['send_envoy'] || 0) + (profile.actionCounts['gift'] || 0) > 5) {
        lessons.push(
          '외교에 과도한 행동을 소비했다. 동맹은 1~2회 사신으로 충분하며, ' +
          '나머지는 군사 준비에 투자해야 한다.'
        );
      }
    }

    // 공통 교훈
    if (profile.phases.length <= 1) {
      lessons.push(
        '한 가지 유형의 행동만 반복했다. ' +
        '초반 내정 → 중반 집결/훈련 → 후반 진군의 3단계 전략이 효과적이다.'
      );
    }

    return lessons.slice(0, 3); // 최대 3개
  }

  /**
   * SimResult → GameExperience 전체 변환
   */
  static extract(result: SimResult, gameNumber: number): GameExperience {
    const profile = this.extractProfile(result);
    const lessons = this.extractLessons(result, profile);
    const turningPoints = this.extractTurningPoints(result);

    return {
      gameId: result.gameId,
      gameNumber,
      grade: result.grade,
      chibiVictory: !!result.flags['chibiVictory'],
      totalTurns: result.totalTurns,
      citiesCaptured: result.finalState.cities
        .filter(c => c.owner === '유비' && !['gangha', 'hagu'].includes(c.id))
        .map(c => c.id),
      allianceMaintained: true, // finalState에서 추출
      generalsLost: result.finalState.generals
        .filter(g => g.faction === '유비' && (g.condition === '사망' || g.condition === '포로'))
        .map(g => g.id),
      strategyProfile: profile,
      lessons,
      turningPoints,
    };
  }
}
```

### 3.3 경험 저장소 (`experience-store.ts`)

```typescript
export class ExperienceStore {
  private experiences: GameExperience[] = [];
  private config: ExperienceStoreConfig;

  constructor(config?: Partial<ExperienceStoreConfig>) {
    this.config = {
      maxExperiences: 20,
      selectionStrategy: 'balanced',
      promptBudget: 800,  // 토큰 기준
      ...config,
    };
  }

  /** 경험 추가 */
  add(exp: GameExperience): void {
    this.experiences.push(exp);
    if (this.experiences.length > this.config.maxExperiences) {
      this.pruneOldest();
    }
  }

  /** 프롬프트에 주입할 경험 선택 */
  selectForPrompt(): GameExperience[] {
    if (this.experiences.length === 0) return [];

    switch (this.config.selectionStrategy) {
      case 'recent':
        return this.experiences.slice(-3);

      case 'best':
        return [...this.experiences]
          .sort((a, b) => gradeScore(b.grade) - gradeScore(a.grade))
          .slice(0, 3);

      case 'diverse':
        return this.selectDiverse();

      case 'balanced':
      default:
        return this.selectBalanced();
    }
  }

  /**
   * balanced 전략:
   * 1) 최고 성적 1개 (Role Model)
   * 2) 최근 1개 (Latest Learning)
   * 3) 대표적 실패 1개 (Anti-Pattern)
   */
  private selectBalanced(): GameExperience[] {
    const selected: GameExperience[] = [];

    // 1. 최고 성적
    const best = [...this.experiences]
      .sort((a, b) => gradeScore(b.grade) - gradeScore(a.grade))[0];
    if (best) selected.push(best);

    // 2. 최근 경험 (best와 다른 것)
    const recent = [...this.experiences]
      .reverse()
      .find(e => e.gameId !== best?.gameId);
    if (recent) selected.push(recent);

    // 3. 대표적 실패 (이미 선택된 것과 다른 것)
    const selectedIds = new Set(selected.map(e => e.gameId));
    const failure = this.experiences
      .filter(e => !e.chibiVictory && !selectedIds.has(e.gameId))
      .sort((a, b) => a.gameNumber - b.gameNumber)[0];
    if (failure) selected.push(failure);

    return selected;
  }

  /** JSON 파일로 저장 */
  save(path: string): void { /* writeFileSync */ }

  /** JSON 파일에서 로드 */
  static load(path: string): ExperienceStore { /* readFileSync + parse */ }

  /** 통계 */
  getStats(): {
    totalGames: number;
    winRate: number;
    gradeProgression: string[];
    learningTrend: 'improving' | 'stagnant' | 'declining' | 'insufficient_data';
  } {
    const grades = this.experiences.map(e => e.grade);
    const recentWins = this.experiences.slice(-5).filter(e => e.chibiVictory).length;
    const earlyWins = this.experiences.slice(0, 5).filter(e => e.chibiVictory).length;

    return {
      totalGames: this.experiences.length,
      winRate: this.experiences.filter(e => e.chibiVictory).length / this.experiences.length,
      gradeProgression: grades,
      learningTrend: this.experiences.length < 5 ? 'insufficient_data'
        : recentWins > earlyWins ? 'improving'
        : recentWins < earlyWins ? 'declining'
        : 'stagnant',
    };
  }
}
```

### 3.4 Soft Shell 빌더 (`soft-shell-builder.ts`)

GameExperience를 프롬프트 텍스트로 변환한다. 이것이 제갈량의 "기억"이다.

```typescript
export class SoftShellBuilder {
  /**
   * 선택된 경험들을 프롬프트 텍스트로 변환
   * system prompt의 ## 배경지식 뒤에 삽입된다.
   */
  static build(experiences: GameExperience[], budget: number = 800): string {
    if (experiences.length === 0) return '';

    const sections: string[] = [];
    sections.push('## 과거 전역(戰役)의 경험');
    sections.push('이전 전역에서 얻은 교훈이다. 같은 실수를 반복하지 말라.\n');

    // 승리 경험 → "성공 전략"
    const wins = experiences.filter(e => e.chibiVictory);
    if (wins.length > 0) {
      sections.push('### 성공한 전략');
      for (const exp of wins) {
        sections.push(this.formatWinExperience(exp));
      }
    }

    // 패배 경험 → "회피할 패턴"
    const losses = experiences.filter(e => !e.chibiVictory);
    if (losses.length > 0) {
      sections.push('\n### 반복하지 말아야 할 실수');
      for (const exp of losses) {
        sections.push(this.formatLossExperience(exp));
      }
    }

    // 핵심 교훈 요약 (중복 제거)
    const allLessons = [...new Set(experiences.flatMap(e => e.lessons))];
    if (allLessons.length > 0) {
      sections.push('\n### 핵심 교훈');
      for (const lesson of allLessons.slice(0, 5)) {
        sections.push(`- ${lesson}`);
      }
    }

    // 전략 지침 (승리 경험에서 추출)
    if (wins.length > 0) {
      sections.push('\n### 검증된 전략 지침');
      sections.push(this.buildStrategyGuideline(wins));
    }

    return sections.join('\n');
  }

  private static formatWinExperience(exp: GameExperience): string {
    const profile = exp.strategyProfile;
    const phases = profile.phases.map(p => `${p.name}(턴${p.startTurn}-${p.endTurn})`).join(' → ');
    return `- **${exp.grade}등급 승리** (${exp.totalTurns}턴): ${phases || '단계 없음'}
  보급 ${profile.transferPattern.totalTransfers}회 → ${profile.transferPattern.concentrationTarget || '?'}에 집중
  진군 시점: 턴 ${profile.firstMarchTurn ?? '없음'}
  점령 도시: ${exp.citiesCaptured.join(', ') || '없음'}`;
  }

  private static formatLossExperience(exp: GameExperience): string {
    const lessons = exp.lessons.map(l => `  ⚠ ${l}`).join('\n');
    return `- **${exp.grade}등급 패배** (${exp.totalTurns}턴):
${lessons}`;
  }

  private static buildStrategyGuideline(wins: GameExperience[]): string {
    // 승리 경험에서 공통 패턴 추출
    const avgFirstMarch = wins
      .filter(w => w.strategyProfile.firstMarchTurn !== null)
      .reduce((sum, w) => sum + (w.strategyProfile.firstMarchTurn ?? 0), 0) /
      wins.filter(w => w.strategyProfile.firstMarchTurn !== null).length;

    const avgTransfers = wins.reduce(
      (sum, w) => sum + w.strategyProfile.transferPattern.totalTransfers, 0
    ) / wins.length;

    const lines: string[] = [];
    lines.push(`1. 초반(턴1-7): 내정 최소화, 병력 훈련(train) 집중`);
    lines.push(`2. 중반(턴7-${Math.round(avgFirstMarch)}): 보급(transfer)으로 전진기지에 병력 집중 (최소 ${Math.round(avgTransfers)}회)`);
    lines.push(`3. 후반(턴${Math.round(avgFirstMarch)}이후): 적벽 진군(march) → 화공 전투`);
    lines.push(`4. 외교: 손권 동맹은 1-2회 사신으로 충분. 과도한 외교 금지`);

    return lines.join('\n');
  }
}
```

### 3.5 중간 반성 (`mid-game-reflector.ts`)

게임 중반(턴 10)에 지금까지의 행동을 돌아보고, 남은 턴의 전략을 수정한다.

```typescript
export class MidGameReflector {
  /**
   * 턴 10에서 자동 호출.
   * 지금까지의 행동 로그를 분석하고 반성 텍스트를 생성한다.
   * 이 텍스트는 다음 브리핑의 user message에 추가된다.
   */
  static generateReflection(
    turnLogs: TurnLog[],
    experiences: GameExperience[],
    currentState: GameState,
  ): string | null {
    // 반성이 필요한 조건 체크
    const profile = ExperienceExtractor.extractPartialProfile(turnLogs);

    const warnings: string[] = [];

    // 과거 패배 패턴과 비교
    const pastFailures = experiences.filter(e => !e.chibiVictory);
    for (const failure of pastFailures) {
      const fp = failure.strategyProfile;
      // 현재 게임이 과거 패배와 같은 경로를 가고 있는지 감지
      if (fp.transferPattern.totalTransfers === 0 &&
          profile.transferPattern.totalTransfers === 0) {
        warnings.push(
          '⚠ 과거 패배 게임과 동일하게 보급(transfer)을 사용하지 않고 있습니다. ' +
          '인접 도시에서 전진기지로 병력을 집중시키시오.'
        );
      }
      if (!fp.firstMarchTurn && !profile.firstMarchTurn && currentState.turn >= 10) {
        warnings.push(
          '⚠ 턴 10인데 아직 진군(march)하지 않았습니다. ' +
          '과거에도 진군 없이 패배한 적이 있습니다. 즉시 군사 행동을 시작하시오.'
        );
      }
    }

    // 과거 승리 패턴과 비교
    const pastWins = experiences.filter(e => e.chibiVictory);
    if (pastWins.length > 0) {
      const avgWinTransfers = pastWins.reduce(
        (s, w) => s + w.strategyProfile.transferPattern.totalTransfers, 0
      ) / pastWins.length;
      if (profile.transferPattern.totalTransfers < avgWinTransfers * 0.5) {
        warnings.push(
          `승리 게임은 평균 ${Math.round(avgWinTransfers)}회 보급을 사용했으나, ` +
          `현재 ${profile.transferPattern.totalTransfers}회입니다. 병력 집중이 필요합니다.`
        );
      }
    }

    if (warnings.length === 0) return null;

    return `[중간 점검 — 턴 ${currentState.turn}]
과거 전역의 경험에 비추어 현재 전략을 점검합니다:
${warnings.join('\n')}
남은 턴에서 전략을 수정하여 조언해 주시오.`;
  }
}
```

### 3.6 SimAdvisor 수정

```typescript
// sim-advisor.ts 수정사항

export class SimAdvisor implements SimPlayerAI {
  private experienceStore: ExperienceStore | null = null;

  constructor(
    private config: SimConfig,
    experiences?: ExperienceStore,  // ← NEW: Soft Shell 주입
  ) {
    this.experienceStore = experiences ?? null;
  }

  async planTurn(state: GameState, config: SimConfig): Promise<{
    actions: GameAction[];
    chatLog?: ChatMessage[];
  }> {
    // 1. 상태 → AdvisorView (기존)
    const advisorView = filterGameState(state);

    // 2. 시스템 프롬프트 + Soft Shell
    let systemPrompt = buildSystemPrompt(advisorView, this.language)
      + buildActionReference(state);

    // ★ NEW: Soft Shell 주입
    if (this.experienceStore) {
      const selected = this.experienceStore.selectForPrompt();
      const softShell = SoftShellBuilder.build(selected);
      if (softShell) {
        systemPrompt += '\n\n' + softShell;
      }
    }

    // 3. 브리핑 요청 메시지
    let briefingMsg = buildBriefingUserMessage(
      state.turn, this.language, this.prevActions.length > 0 ? this.prevActions : undefined,
    );

    // ★ NEW: 중간 반성 (턴 10에서 트리거)
    if (state.turn === 10 && this.experienceStore) {
      const reflection = MidGameReflector.generateReflection(
        this.turnLogs,        // 현재 게임의 턴 로그 (추가 필드 필요)
        this.experienceStore.selectForPrompt(),
        state,
      );
      if (reflection) {
        briefingMsg = reflection + '\n\n' + briefingMsg;
      }
    }

    // ... 이하 기존 로직 동일
  }
}
```

### 3.7 run-batch.ts 수정 — 순차 학습 모드

```typescript
// run-batch.ts에 --sequential 모드 추가

async function runSequentialLearning(
  baseConfig: SimConfig,
  count: number,
  verbose: boolean,
): Promise<SimResult[]> {
  const store = new ExperienceStore({
    maxExperiences: 20,
    selectionStrategy: 'balanced',
    promptBudget: 800,
  });

  const results: SimResult[] = [];

  for (let i = 0; i < count; i++) {
    const config: SimConfig = {
      ...baseConfig,
      gameId: `seq-${i + 1}`,
      seed: i * 1000,  // 다른 seed → 다른 게임 전개
    };

    console.log(`\n[순차학습 ${i + 1}/${count}] Soft Shell: ${store.getStats().totalGames}개 경험`);

    // 현재까지의 경험으로 SimAdvisor 생성
    const advisor = new SimAdvisor(config, store);
    const sim = new HeadlessSimulator(config, advisor);

    const result = await sim.runGame();
    results.push(result);

    // 경험 추출 및 저장
    const experience = ExperienceExtractor.extract(result, i + 1);
    store.add(experience);

    console.log(`  → ${result.grade}등급 (${result.title}) | 누적 승률: ${(store.getStats().winRate * 100).toFixed(0)}%`);
    console.log(`    교훈: ${experience.lessons.join(' / ')}`);
  }

  // 경험 저장소 저장
  store.save(`sim/results/experience-${baseConfig.model}-${Date.now()}.json`);

  return results;
}

// CLI 옵션 추가
// --sequential     순차 학습 모드 (게임 N의 경험이 게임 N+1에 전달)
// --seq-count 20   순차 학습 게임 수
// --no-icl         ICL 비활성화 (대조군)
```

### 3.8 CLI 사용 예시

```bash
# 순차 학습 20게임 (Qwen3, Mode A)
npx tsx sim/run-batch.ts --sequential --seq-count 20 --mode A --fast

# 대조군: ICL 없이 동일 조건 20게임
npx tsx sim/run-batch.ts --no-icl --count 20 --mode A --fast

# API 모델 순차 학습
npx tsx sim/run-batch.ts --sequential --seq-count 10 \
  --provider claude --model claude-sonnet-4-5-20250929

# 시드 전략 라이브러리로 시작 (o4-mini 승리 패턴 사전 주입)
npx tsx sim/run-batch.ts --sequential --seq-count 20 \
  --seed-library sim/seed-strategies/o4-mini-wins.json
```

---

## 4. Seed 전략 라이브러리 (부트스트랩)

Phase 2 분석에서 발견된 o4-mini 승리 패턴을 초기 Soft Shell로 사용할 수 있다.

### 4.1 수동 시드 (o4-mini C등급 승리 패턴)

```typescript
// sim/seed-strategies/o4-mini-pattern.ts

export const O4_MINI_WIN_SEED: GameExperience = {
  gameId: 'o4-mini-ref-1',
  gameNumber: 0,  // 시드
  grade: 'C',
  chibiVictory: true,
  totalTurns: 17,
  citiesCaptured: [],
  allianceMaintained: true,
  generalsLost: [],
  strategyProfile: {
    actionCounts: {
      transfer: 5, train: 8, develop: 3, conscript: 2,
      send_envoy: 1, march: 2, scout: 1,
    },
    phases: [
      { name: 'domestic', startTurn: 1, endTurn: 5, dominantActions: ['develop', 'train'] },
      { name: 'consolidation', startTurn: 6, endTurn: 11, dominantActions: ['transfer', 'train'] },
      { name: 'military', startTurn: 12, endTurn: 17, dominantActions: ['march', 'train'] },
    ],
    criticalActions: [
      { turn: 6, action: 'transfer', description: '강하→하구 병력 보급', impact: 'decisive' },
      { turn: 12, action: 'march', description: '하구→적벽 진군', impact: 'decisive' },
    ],
    transferPattern: {
      totalTransfers: 5,
      concentrationTarget: 'hagu',
      totalTroopsMoved: 3000,
    },
    firstMarchTurn: 12,
    marchTargets: ['chibi'],
  },
  lessons: [
    '보급(transfer)으로 하구에 병력을 5회 집중시킨 것이 적벽 승리의 핵심이었다.',
    '턴 12까지 충분히 훈련(train)한 후 진군하여 높은 전투력으로 교전했다.',
    '외교는 사신 1회로 최소화하고 군사 준비에 집중했다.',
  ],
  turningPoints: [
    { turn: 6, type: 'action', description: '첫 보급: 강하→하구', outcome: 'positive' },
    { turn: 12, type: 'action', description: '적벽 진군 개시', outcome: 'positive' },
    { turn: 14, type: 'battle', description: '적벽 해전 승리', outcome: 'positive' },
  ],
};
```

### 4.2 시드 전략 vs 자력 학습 비교 실험

```
실험 A: 빈 Soft Shell에서 시작 (자력 학습)
  Game 1: 빈 경험 → 아마 D/F
  Game 2: 실패 교훈 1개 → D?
  ...
  Game N: 언제 첫 승리?

실험 B: o4-mini 시드로 시작 (부트스트랩 학습)
  Game 1: 승리 패턴 1개 참조 → C? D?
  Game 2: 시드 + 자체 경험 → 개선?
  ...
  Game N: 시드 효과?

실험 C: ICL 없음 (대조군)
  Game 1~N: 매번 동일한 빈 상태 → 기준선
```

---

## 5. 측정 프레임워크

### 5.1 학습 곡선 (Learning Curve)

```
등급 점수: S=6, A=5, B=4, C=3, D=2, F=1

Game#   1  2  3  4  5  6  7  8  9  10 ... 20
ICL:    D  D  D  C  D  C  C  B  C  B  ... A?
No-ICL: D  D  D  D  D  D  D  D  D  D  ... D

학습 곡선 = 이동평균(window=3)의 기울기
```

### 5.2 핵심 지표

| 지표 | 설명 | 계산 |
|------|------|------|
| **첫 승리까지 게임 수** | ICL 없이 vs 있을 때 | 첫 chibiVictory === true |
| **승률 개선** | 첫 5게임 vs 마지막 5게임 | winRate 비교 |
| **등급 이동평균** | 3게임 이동평균 점수 | 추세선 기울기 |
| **전략 수렴** | 행동 패턴이 승리 패턴에 수렴하는 정도 | transferCount, firstMarchTurn 추이 |
| **교훈 활용률** | AI가 실제로 교훈을 반영한 비율 | 경험 교훈 vs 실제 행동 비교 |

### 5.3 결과 보고서 확장

```typescript
// SimReporter.printLearningCurve() 추가

static printLearningCurve(results: SimResult[]): void {
  console.log('\n── 학습 곡선 ──');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const bar = '#'.repeat(GRADE_SCORES[r.grade] || 0);
    const marker = r.flags['chibiVictory'] ? '★' : ' ';
    console.log(`  ${String(i + 1).padStart(3)}. ${r.grade} ${bar.padEnd(6)} ${marker} ${r.title}`);
  }

  // 이동평균
  const scores = results.map(r => GRADE_SCORES[r.grade] || 0);
  const movingAvg = scores.map((_, i) => {
    const window = scores.slice(Math.max(0, i - 2), i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
  console.log(`\n  이동평균 추이: ${movingAvg.map(v => v.toFixed(1)).join(' → ')}`);

  // 첫 승리
  const firstWin = results.findIndex(r => r.flags['chibiVictory']);
  console.log(`  첫 승리: ${firstWin >= 0 ? `Game ${firstWin + 1}` : '없음'}`);

  // 승률 개선
  const first5 = results.slice(0, 5).filter(r => r.flags['chibiVictory']).length / Math.min(5, results.length);
  const last5 = results.slice(-5).filter(r => r.flags['chibiVictory']).length / Math.min(5, results.length);
  console.log(`  승률: 초반5 ${(first5 * 100).toFixed(0)}% → 후반5 ${(last5 * 100).toFixed(0)}%`);
}
```

---

## 6. 난이도 조절 관점 (Difficulty Adjustment)

ICL과 별도로, Hard Shell(프롬프트) 수준에서의 난이도 조절도 가능하다.

### 6.1 난이도 레벨

| 레벨 | 이름 | Hard Shell 변경 | 용도 |
|------|------|----------------|------|
| **Easy** | 입문 | 전략 가이드라인 포함 (3단계 전략, transfer 강조) | 약한 모델 보조 |
| **Normal** | 기본 | 현재 프롬프트 그대로 | 기본값 |
| **Hard** | 도전 | 지식 청크 축소, 범주형 정보만 | 강한 모델 평가 |
| **Expert** | 극한 | 행동 참조표 없음, 최소 정보 | 연구용 |

### 6.2 프롬프트 난이도 = Hard Shell 두께

```
Expert  ←  Hard Shell 얇음 (정보 적음, 가이드 없음)
                    ↕
Easy    ←  Hard Shell 두꺼움 (전략 가이드, 행동 예시, 단계별 안내)
```

```typescript
// sim-config.ts 확장
export interface SimConfig {
  // ... 기존 필드
  difficulty?: 'easy' | 'normal' | 'hard' | 'expert';
  icl?: {
    enabled: boolean;
    seedLibrary?: string;      // 시드 전략 라이브러리 경로
    maxExperiences?: number;
    selectionStrategy?: 'recent' | 'best' | 'diverse' | 'balanced';
  };
}
```

### 6.3 Easy 모드 프롬프트 추가 (전략 가이드라인)

```typescript
const EASY_STRATEGY_GUIDE = `
## 전략 가이드 (핵심 요약)

적벽대전에서 승리하려면 다음 3단계 전략을 따르라:

**1단계 (턴 1~7): 기반 구축**
- 훈련(train)으로 병사 전투력 강화 (3~5회)
- 개발(develop)은 1~2회로 최소화
- 손권에게 사신(send_envoy) 1회 → 동맹 확보

**2단계 (턴 7~12): 병력 집결**
- 보급(transfer)으로 강하/하구에서 전진기지로 병력 이동 (3~5회)
- 이것이 가장 중요하다 — 분산된 병력을 한 곳에 모아야 한다
- 훈련 병행으로 사기/훈련도 유지

**3단계 (턴 12~): 결전**
- 정찰(scout) 후 진군(march)으로 적벽 진출
- 화공 조건이 갖춰지면 화공 전술 사용
- 적벽 승리 후 남군(nanjun)으로 진군

**절대 하지 말 것:**
- 개발만 반복하다 시간 낭비
- 외교에 3회 이상 소비
- 보급 없이 소규모 병력으로 진군
`;
```

---

## 7. 구현 단계

### Step 1: 경험 타입 + 추출기 (1일)
- `sim/icl/experience-types.ts` 작성
- `sim/icl/experience-extractor.ts` 작성
- 기존 SimResult에서 GameExperience 추출 테스트

### Step 2: 경험 저장소 (0.5일)
- `sim/icl/experience-store.ts` 작성
- JSON 저장/로드, 선택 전략

### Step 3: Soft Shell 빌더 (0.5일)
- `sim/icl/soft-shell-builder.ts` 작성
- GameExperience → 프롬프트 텍스트 변환

### Step 4: SimAdvisor 통합 (1일)
- SimAdvisor에 ExperienceStore 주입
- buildSystemPrompt 뒤에 Soft Shell 텍스트 추가
- 중간 반성(MidGameReflector) 통합

### Step 5: 순차 학습 배치 모드 (0.5일)
- run-batch.ts에 `--sequential` 모드 추가
- 게임 간 경험 전달 루프

### Step 6: 측정 + 보고 (0.5일)
- SimReporter.printLearningCurve() 추가
- 학습 곡선, 첫 승리, 승률 개선 지표

### Step 7: 시드 전략 라이브러리 (0.5일)
- o4-mini 승리 패턴 시드 작성
- `--seed-library` CLI 옵션

### Step 8: 난이도 조절 (선택, 0.5일)
- `--difficulty easy|normal|hard|expert` 옵션
- Easy 모드 전략 가이드 프롬프트

---

## 8. 실험 계획

### 8.1 1차 실험: Gemini 3 Flash (API, 최저비용)

Gemini Flash는 ICL 실험의 **최적 대상**:
- 1분/게임으로 빠른 반복 (Qwen 2분, o4-mini 5분)
- transfer 개념은 이미 이해 → **march만 학습하면 승리 가능성**
- ~$0.04/게임으로 API 모델 중 최저비용

| 실험 | 조건 | 게임 수 | 예상 시간 | 비용 |
|------|------|---------|----------|------|
| 대조군 | ICL 없음, Normal 난이도 | 20 | ~20분 | ~$0.78 |
| ICL 자력 | ICL ON, 빈 Soft Shell | 20 | ~20분 | ~$0.84* |
| ICL 시드 | ICL ON, o4-mini 시드 | 20 | ~20분 | ~$0.84* |
| Easy 모드 | ICL 없음, Easy 난이도 | 20 | ~20분 | ~$0.78 |
| Easy+ICL | ICL ON, Easy 난이도, 빈 시작 | 20 | ~20분 | ~$0.84* |

*ICL 프롬프트 추가로 토큰 ~8% 증가 추정

**총: 100게임, ~1.7시간, ~$4.08**

### 8.2 1차-b 실험: Qwen3 8B / 로컬 SLM (무비용, 병행)

로컬에서 무비용으로 Qwen 동일 실험 병행. ICL이 **약한 Core도 보완**하는지 검증.

| 실험 | 조건 | 게임 수 | 예상 시간 |
|------|------|---------|----------|
| 대조군 | ICL 없음, Normal | 20 | ~40분 |
| ICL 시드 | ICL ON, o4-mini 시드 | 20 | ~40분 |
| Easy+ICL | ICL ON, Easy, 빈 시작 | 20 | ~40분 |

**총: 60게임, ~2시간, $0**

### 8.3 2차 실험: API 모델 비교 (ICL 효과 × Core 크기)

Phase 2b 기준선(ICL 없음 20게임)에 이어 ICL 시드 20게임 추가.

| 모델 | 티어 | ICL 시드 20게임 비용 | Phase 2b 기준선 | 합계 |
|------|------|---------------------|----------------|------|
| Claude Haiku 4.5 | 경량 | ~$1.47 | ~$1.37 | ~$2.84 |
| o4-mini | 추론 | ~$1.42 | ~$1.32 | ~$2.74 |
| Gemini 3 Pro | 중량 | ~$3.10 | ~$2.90 | ~$6.00 |
| Claude Sonnet 4.5 | 중량 | ~$4.50 | ~$4.08 | ~$8.58 |

**핵심 비교축 (기준선 확정):**
```
                        ICL 없음 (확정)       ICL 시드 (Phase 3)     개선폭
Gemini Flash (경량)     0% (5D)               ?%                     Δ₁ ← 가장 순수한 실험
Haiku 4.5 (경량)        0% (5D)               ?%                     Δ₂
o4-mini (추론)          33% (2C+4D)           ?%                     Δ₃
Sonnet 4.5 (중량)       0% (4D+1F)            ?%                     Δ₄

질문 1: Δ₁~Δ₄ 중 누가 가장 큰가?
질문 2: $0.04 Flash + ICL이 $0.07 o4-mini (ICL 없음)를 이길 수 있는가?
질문 3: Core 크기와 ICL 효과는 보완적인가, 대체적인가?
```

**Gemini Pro는 ICL 이후로 연기**: Flash/Haiku/Sonnet이 전부 0%인 상황에서
Pro만 다를 이유 없음. 그 비용($2.90)은 ICL 실험에 투자하는 것이 효율적.

### 8.4 성공 기준

- **최소 성공**: ICL 자력 학습에서 20게임 내 첫 승리 달성
- **의미 있는 성공**: 대조군 대비 승률 20%p 이상 개선
- **인상적 성공**: 학습 곡선 기울기가 통계적으로 유의미 (p < 0.05)
- **Four-Shell 가설 검증**: 동일 Core+Hard Shell에서 Soft Shell만으로 등급 1단계 이상 향상

---

## 9. Four-Shell Model 연결

이 실험의 결과는 ai-ludens의 Four-Shell Model에 다음과 같이 기여한다:

```
Core (모델 가중치)     ← 고정: qwen3:8b, o4-mini 등
Hard Shell (프롬프트)   ← 고정: 제갈량 페르소나 + 게임 규칙 + 난이도
Soft Shell (경험)      ← 변수: 게임 경험 축적 (0개 → N개)
                          └─ 전략 라이브러리 + 교훈 + 중간 반성
Phenotype (행동)       ← 관측: 등급, 승률, 행동 패턴
```

**실험이 검증하는 것:**
1. Soft Shell 축적이 Phenotype을 실제로 변화시키는가?
2. Core 능력(모델 크기)과 Soft Shell 효과 사이의 상호작용은?
   - 약한 Core도 풍부한 Soft Shell로 보완 가능한가?
   - 강한 Core는 적은 Soft Shell로도 빠르게 학습하는가?
3. 시드 Soft Shell(다른 AI의 경험 이식) vs 자력 축적 Soft Shell — 어느 것이 효과적인가?

**Phase 2 데이터가 보여준 것:**
```
Core 수준별 "준비 → 실행" 능력:
  로컬 SLM (Qwen/Exaone/Llama): 준비도 안 함      → Soft Shell로 준비를 가르칠 수 있는가?
  경량 API (Gemini Flash):       준비만 함, 실행 안 함 → Soft Shell로 실행을 가르칠 수 있는가?
  추론 특화 (o4-mini):           준비 → 실행 전환 가능  → Soft Shell로 더 빨리/정확히 하는가?
```

특히 Gemini Flash는 **ICL의 가장 순수한 실험 대상**: 이미 transfer(준비)는 할 줄 알지만
march(실행)는 못 한다. ICL로 "턴 12에 march하라"는 패턴을 주입하면
이 단 하나의 갭을 채울 수 있는지 직접 관찰 가능하다.

이는 ai-ludens Category B(Human-AI 게임)에서의 **AI 학습 메커니즘** 연구에
실증적 데이터를 제공한다.

**4개 모델 × ICL 실험 = Core-Soft Shell 상호작용 맵:**
```
              Gemini Flash  Haiku 4.5  o4-mini     Sonnet 4.5
Core 강도      약           약          중(추론)     강
Core 유형      생성         생성        추론 특화    생성
ICL 전 승률    0% (5D)      0% (5D)    33% (2C+4D)  0% (4D+1F)
실패 레벨      Lv1          Lv1.5      Lv2          Lv1.5
ICL 후 승률    ?%           ?%         ?%           ?%
ICL 개선폭     Δ₁           Δ₂         Δ₃           Δ₄
비용/게임      $0.04        $0.07      $0.07        $0.21
```

**Phase 2b가 증명한 것:**
Core 크기/가격은 전략 성능과 무관하다.
Sonnet($0.21)이 Flash($0.04)의 5배 비용이지만 동일 실패.
유일한 차별점은 reasoning 구조(o4-mini).

**Phase 3이 검증할 것:**
Soft Shell(ICL)이 reasoning의 부재를 보완할 수 있는가?
$0.04 Flash + ICL > $0.07 o4-mini (without ICL) 이면,
Soft Shell이 Core 구조를 대체할 수 있다는 증거.

