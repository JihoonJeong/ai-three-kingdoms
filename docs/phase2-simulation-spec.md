# Phase 2: 헤드리스 시뮬레이션 시스템

> AI 삼국지 밸런스 자동 검증을 위한 헤드리스 시뮬레이터 설계

## 1. 목표

수동 플레이테스트를 **자동화된 대량 시뮬레이션**으로 대체한다.
- 밸런스 수치 변경 → 자동 검증 (등급 분포, 승률)
- Windows Lab (4070Ti, Qwen3 7B, Ollama)에서 비용 없이 대량 실행
- 결과 JSON → 통계 분석 → 밸런스 튜닝 피드백 루프

## 2. 시뮬레이션 모드

### Mode A: 자동 수락 (Auto-Accept)
- 매 턴 책사(제갈량 LLM) 브리핑을 받음
- 추천 액션 3개를 **그대로 실행** (원클릭 실행과 동일)
- 전투 전술도 LLM 추천을 자동 선택
- **목적**: 순수 AI 전략 성능 측정

### Mode B: 숙의 (Deliberation)
- 매 턴 책사 브리핑 → 추천 액션 확인
- **Player AI (LLM)**가 추천을 검토하고 채팅으로 토론 (최대 3라운드)
- 토론 후 최종 갱신된 추천을 실행
- 전투 전술도 토론 후 결정
- **목적**: LLM 간 협의(deliberation) 효과 측정

### Thinking 차원 (Fast vs Think)
- **Fast**: thinking 모드 OFF (`{ think: false }`)
- **Think**: thinking 모드 ON (`{ think: true }`) — Qwen3의 reasoning 모드
- 모든 LLM 호출(책사 + Faction AI + Player AI)에 동일 적용

### 테스트 매트릭스
```
Mode A + Fast:  20회
Mode A + Think: 20회
Mode B + Fast:  10회
Mode B + Think: 10회
총 60회
```

## 3. 아키텍처

### 3.1 전체 구조

```
sim/
  headless-sim.ts       ← 시뮬레이션 러너 (메인)
  sim-advisor.ts        ← 헤드리스 책사 클라이언트 (Player AI)
  sim-config.ts         ← 시뮬레이션 설정 타입
  sim-reporter.ts       ← 결과 수집 + JSON/통계 출력
  sim-battle-ai.ts      ← 전투 전술 자동 선택
  run-batch.ts          ← 배치 실행 CLI 진입점

결과 저장:
  sim/results/
    batch-{timestamp}.json    ← 배치 전체 결과
    game-{id}.json            ← 개별 게임 상세 로그
```

### 3.2 모듈 관계

```
run-batch.ts (CLI)
  └── HeadlessSimulator
        ├── core 엔진 (직접 사용, web/src/game-controller.ts 미사용)
        │   ├── GameStateManager
        │   ├── TurnManager
        │   ├── ActionExecutor
        │   ├── BattleEngine
        │   ├── EventSystem
        │   └── VictoryJudge
        │
        ├── SimAdvisor (Player AI - 책사 역할)
        │   ├── Mode A: 브리핑 → 액션 파싱 → 자동 실행
        │   └── Mode B: 브리핑 → 토론(최대 3라운드) → 최종 액션 실행
        │
        ├── FactionAIEngine (기존 코드 재사용)
        │   ├── LLM 모드: 서버 /api/faction-turn 직접 호출
        │   └── 하드코딩 폴백: CaoStrategy/SunStrategy
        │
        ├── SimBattleAI (전투 전술 자동 선택)
        │   └── LLM에 전투 상황 → 전술 선택 요청
        │
        └── SimReporter (결과 수집)
            ├── 턴별 로그
            ├── 최종 등급/점수
            └── 통계 집계
```

### 3.3 GameController 대신 직접 엔진 조합

**이유**: `web/src/game-controller.ts`는 UI 콜백, DOM 의존성이 있음.
시뮬레이터는 `core/` 엔진 모듈만 직접 조합한다.

```typescript
// 기존 GameController가 하는 일을 HeadlessSimulator가 직접 수행
class HeadlessSimulator {
  private stateManager: GameStateManager;
  private battleEngine: BattleEngine;
  private actionExecutor: ActionExecutor;
  private eventSystem: EventSystem;
  private victoryJudge: VictoryJudge;
  private turnManager: TurnManager;
}
```

**단, 전투 결과 처리 로직**(`executeBattleTactic`의 영토 변경, 장수 귀환, 포로 처리 등)은
`game-controller.ts`에만 있으므로, **이 로직을 core로 추출**해야 한다.

## 4. 상세 설계

### 4.1 HeadlessSimulator

```typescript
// sim/headless-sim.ts

import { GameStateManager } from '../core/engine/game-state.js';
import { TurnManager } from '../core/engine/turn-manager.js';
import { ActionExecutor } from '../core/engine/action-executor.js';
import { BattleEngine } from '../core/engine/battle-engine.js';
import { EventSystem } from '../core/engine/event-system.js';
import { VictoryJudge } from '../core/engine/victory-judge.js';
import { createRedCliffsScenario, getScenarioEvents } from '../core/data/scenarios/red-cliffs.js';
import type { SimConfig, SimResult, TurnLog } from './sim-config.js';

export class HeadlessSimulator {
  private stateManager!: GameStateManager;
  private turnManager!: TurnManager;
  private actionExecutor!: ActionExecutor;
  private battleEngine!: BattleEngine;
  private eventSystem!: EventSystem;
  private victoryJudge!: VictoryJudge;

  private advisor: SimAdvisor;
  private battleAI: SimBattleAI;
  private turnLogs: TurnLog[] = [];

  constructor(private config: SimConfig) {
    this.advisor = new SimAdvisor(config);
    this.battleAI = new SimBattleAI(config);
  }

  async runGame(): Promise<SimResult> {
    const startTime = Date.now();

    // 1. 초기화 (RNG는 seed 기반 결정적)
    const rng = createSeededRng(this.config.seed);
    const scenario = createRedCliffsScenario(`sim-${this.config.gameId}`);
    this.stateManager = new GameStateManager(scenario);
    this.battleEngine = new BattleEngine(rng);
    this.actionExecutor = new ActionExecutor(this.stateManager, this.battleEngine, rng);
    this.eventSystem = new EventSystem(getScenarioEvents(), rng);
    this.victoryJudge = new VictoryJudge();
    this.turnManager = new TurnManager(
      this.stateManager, this.eventSystem, this.victoryJudge,
      this.battleEngine, rng, this.actionExecutor,
    );

    // Faction AI LLM 클라이언트 설정
    if (this.config.useLLMFactionAI) {
      this.turnManager.setLLMClient(this.createFactionLLMClient());
    }

    // 2. 게임 루프
    this.turnManager.startTurn();

    while (!this.stateManager.getState().gameOver) {
      const state = this.stateManager.getState();
      const turnLog: TurnLog = {
        turn: state.turn,
        phase: state.phase,
        actions: [],
        events: [],
        battles: [],
        aiActions: [],
      };

      // 2a. Player 턴 — 책사 조언 받고 행동 실행
      const advisorResult = await this.advisor.planTurn(state, this.config);
      for (const action of advisorResult.actions) {
        const result = this.actionExecutor.execute(action);
        turnLog.actions.push({
          action,
          result: { success: result.success, description: result.description },
        });

        // 전투 발생 시 처리
        if (result.battleTriggered) {
          const battleLog = await this.resolveBattle(result.battleTriggered);
          turnLog.battles.push(battleLog);
        }
      }

      // 2b. 턴 종료 (AI 세력 행동 + 이벤트)
      const endResult = await this.turnManager.endTurn();
      turnLog.events = endResult.events.map(e => e.description ?? e.eventId);
      turnLog.aiActions = endResult.stateChanges;

      // AI가 전투를 발생시킨 경우
      if (endResult.aiInitiatedBattle) {
        this.stateManager.setBattle(endResult.aiInitiatedBattle);
        const battleLog = await this.resolveBattle(endResult.aiInitiatedBattle);
        turnLog.battles.push(battleLog);
      }

      this.turnLogs.push(turnLog);

      // 게임 종료 체크
      if (endResult.gameOver) break;

      // 다음 턴 시작
      this.turnManager.startTurn();
    }

    // 3. 결과 수집
    const finalState = this.stateManager.getState();
    return {
      gameId: this.config.gameId,
      mode: this.config.mode,
      thinking: this.config.thinking,
      seed: this.config.seed,
      grade: finalState.result?.grade ?? 'F',
      title: finalState.result?.title ?? '알 수 없음',
      totalTurns: finalState.turn,
      duration: Date.now() - startTime,
      flags: { ...finalState.flags },
      turnLogs: this.turnLogs,
      finalState: {
        cities: finalState.cities.map(c => ({
          id: c.id, owner: c.owner,
          troops: c.troops.infantry + c.troops.cavalry + c.troops.navy,
        })),
        generals: finalState.generals.map(g => ({
          id: g.id, faction: g.faction, condition: g.condition, location: g.location,
        })),
      },
    };
  }

  /** 전투를 자동으로 해결한다 */
  private async resolveBattle(battle: BattleState): Promise<BattleLog> {
    const log: BattleLog = {
      location: battle.location,
      attacker: battle.attackers.faction,
      defender: battle.defenders.faction,
      turns: [],
      result: null,
    };

    while (!battle.isOver) {
      const tactic = await this.battleAI.selectTactic(battle, this.stateManager.getState());

      // executeBattleTactic 로직 (core에서 추출한 BattleResolver 사용)
      BattleResolver.executeTurn(battle, tactic, this.stateManager, this.battleEngine);

      log.turns.push({
        tacticUsed: tactic,
        attackerTroops: battle.attackers.troops,
        defenderTroops: battle.defenders.troops,
      });
    }

    log.result = battle.result;

    // 전투 후처리 (영토 변경, 장수 귀환 등)
    BattleResolver.processResult(battle, this.stateManager);

    return log;
  }
}
```

### 4.2 BattleResolver — core로 추출

**현재 문제**: `game-controller.ts`의 `executeBattleTactic()` 안에
전투 결과 처리 로직이 묶여 있음 (영토 변경, 장수 귀환, 포로, 병력 갱신).

**해결**: `core/engine/battle-resolver.ts`로 분리.

```typescript
// core/engine/battle-resolver.ts

/**
 * 전투 실행 + 결과 처리 유틸리티.
 * GameController와 HeadlessSimulator 모두 이 모듈을 사용한다.
 */
export class BattleResolver {

  /**
   * 전투 턴 1회 실행.
   * @param battle - 현재 전투 상태 (mutated)
   * @param tacticId - 플레이어(또는 시뮬레이터)가 선택한 전술
   * @param state - 현재 게임 상태
   * @param battleEngine - 전투 엔진
   * @param playerFaction - 플레이어 세력 ID
   */
  static executeTurn(
    battle: BattleState,
    tacticId: string,
    stateManager: GameStateManager,
    battleEngine: BattleEngine,
  ): void {
    const state = stateManager.getState();
    const generals = state.generals;
    const playerFaction = stateManager.getPlayerFaction().id;
    const playerIsAttacker = battle.attackers.faction === playerFaction;

    if (playerIsAttacker) {
      battleEngine.executeTactic(battle, tacticId, generals);
    } else {
      const aiTactic = battleEngine.selectAttackerTactic(battle);
      battleEngine.executeTactic(battle, aiTactic, generals, tacticId);
    }

    const endCheck = battleEngine.checkBattleEnd(battle);
    if (endCheck.isOver) {
      battle.isOver = true;
      battle.result = endCheck.result ?? null;
    }
  }

  /**
   * 전투 종료 후 후처리:
   * - 적벽 승리 플래그
   * - 전장 장수 귀환
   * - 도시 점령
   * - 패배 시 공격측 장수 귀환
   * - 포로 처리
   * - 도시 병력 비율 갱신
   * - 로그 기록
   */
  static processResult(
    battle: BattleState,
    stateManager: GameStateManager,
  ): void {
    // game-controller.ts의 기존 로직을 여기로 이동
    // (영토 변경, 장수 귀환, 포로, 병력 갱신, 로그 등)
    // ... 현재 game-controller.ts 104-219번 라인의 로직
  }
}
```

**리팩토링 순서**:
1. `BattleResolver` 클래스 생성 (core/engine/)
2. `game-controller.ts`의 전투 처리 로직을 `BattleResolver`로 이동
3. `game-controller.ts`는 `BattleResolver`를 호출하도록 변경
4. `HeadlessSimulator`도 동일한 `BattleResolver` 사용
5. 기존 테스트 통과 확인

### 4.3 SimAdvisor — 헤드리스 책사 클라이언트

```typescript
// sim/sim-advisor.ts

/**
 * 헤드리스 환경에서 책사(제갈량) LLM을 호출하여
 * 플레이어 행동을 자동으로 결정한다.
 *
 * 서버의 /api/chat 엔드포인트를 직접 호출 (fetch)
 * 또는 Ollama API를 직접 호출하여 서버 의존성 제거.
 */
export class SimAdvisor {
  constructor(private config: SimConfig) {}

  /**
   * Mode A: 브리핑 → 추천 액션 자동 실행
   * Mode B: 브리핑 → 토론(최대 3라운드) → 최종 액션 실행
   */
  async planTurn(state: GameState, config: SimConfig): Promise<{
    actions: GameAction[];
    chatLog: ChatMessage[];
  }> {
    // 1. state → AdvisorView 변환 (core/advisor/state-filter.ts)
    const advisorView = filterGameState(state);

    // 2. system prompt 생성 (core/advisor/prompts.ts)
    const systemPrompt = buildSystemPrompt(advisorView) + buildActionReference(state);

    // 3. 브리핑 요청 메시지 생성
    const briefingMsg = buildBriefingUserMessage(state.turn);
    const messages: ChatMessage[] = [{ role: 'user', content: briefingMsg }];

    // 4. LLM 호출 (collectStreamText로 전체 텍스트 수집)
    const response = await this.callLLM(systemPrompt, messages);
    messages.push({ role: 'assistant', content: response });

    // 5. 추천 액션 파싱
    const parsed = parseAdvisorResponse(response, buildRecommendationContext(state));
    let actions = parsed.actions
      .map(a => actionJSONToGameAction(a, buildRecommendationContext(state)))
      .filter((a): a is GameAction => a !== null)
      .slice(0, state.actionsRemaining);

    // 6. Mode B: 토론
    if (config.mode === 'B') {
      for (let round = 0; round < 3; round++) {
        const playerQuestion = await this.generatePlayerQuestion(state, parsed, round);
        if (!playerQuestion) break;  // 추가 토론 불필요

        messages.push({ role: 'user', content: playerQuestion });
        const reply = await this.callLLM(systemPrompt, messages);
        messages.push({ role: 'assistant', content: reply });

        // 갱신된 추천 재파싱
        const updated = parseAdvisorResponse(reply, buildRecommendationContext(state));
        if (updated.actions.length > 0) {
          actions = updated.actions
            .map(a => actionJSONToGameAction(a, buildRecommendationContext(state)))
            .filter((a): a is GameAction => a !== null)
            .slice(0, state.actionsRemaining);
        }
      }
    }

    return { actions, chatLog: messages };
  }

  /**
   * Mode B에서 Player AI가 책사에게 질문을 생성한다.
   * 별도 LLM 호출로 "유비 역할의 질문자"를 시뮬레이션.
   */
  private async generatePlayerQuestion(
    state: GameState,
    advisorResponse: AdvisorResponse,
    round: number,
  ): Promise<string | null> {
    const playerPrompt = `당신은 유비(劉備)다. 군사 제갈량이 이번 턴 전략을 브리핑했다.
현재 상황과 제갈량의 조언을 검토하고, 의문점이나 대안이 있으면 질문하라.
더 이상 토론할 것이 없으면 "동의합니다"라고만 답하라.
간결하게 1-2문장으로 답하라.

제갈량의 조언:
${advisorResponse.narrative}

추천 행동:
${advisorResponse.actions.map(a => `- ${a.description} (신뢰도 ${a.confidence}%)`).join('\n')}

토론 라운드: ${round + 1}/3`;

    const response = await this.callLLM(playerPrompt, [
      { role: 'user', content: '검토하고 의견을 말하라.' },
    ]);

    // "동의합니다"면 토론 종료
    if (response.includes('동의') && response.length < 30) {
      return null;
    }

    return response;
  }

  /**
   * LLM 호출 — 서버 경유 또는 직접 Ollama 호출
   */
  private async callLLM(system: string, messages: ChatMessage[]): Promise<string> {
    if (this.config.directOllama) {
      // Ollama API 직접 호출 (서버 불필요)
      return this.callOllamaDirect(system, messages);
    } else {
      // 서버 /api/chat 호출 → collectStreamText
      return this.callViaServer(system, messages);
    }
  }

  private async callOllamaDirect(system: string, messages: ChatMessage[]): Promise<string> {
    const ollamaHost = this.config.ollamaHost || 'http://localhost:11434';
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
        stream: false,
        options: this.config.thinking
          ? { num_predict: 16384 }  // thinking 모드 시 토큰 제한 증가
          : { num_predict: 4096 },
      }),
    });

    const data = await response.json() as { message: { content: string } };
    // thinking 블록 제거
    return stripThinking(data.message.content);
  }
}
```

### 4.4 SimBattleAI — 전투 전술 자동 선택

```typescript
// sim/sim-battle-ai.ts

/**
 * 전투에서 플레이어 측 전술을 자동 선택한다.
 *
 * 기본: 규칙 기반 (LLM 호출 불필요, 빠름)
 *  - 화공 가능하면 화공 (적벽 화공 시나리오 핵심)
 *  - 매복 설정되어 있으면 매복
 *  - 그 외 가장 높은 기대 대미지 전술 선택
 *
 * 옵션: LLM 기반 (config.battleAI === 'llm')
 *  - 전투 상황을 LLM에 보내서 전술 추천
 */
export class SimBattleAI {
  constructor(private config: SimConfig) {}

  async selectTactic(battle: BattleState, state: GameState): Promise<string> {
    const availableTactics = battle.availableTactics || [];

    // 규칙 기반 선택 (기본, 빠름)
    // 1. 화공 가능하면 화공 (적벽 핵심 전술)
    const fireAttack = availableTactics.find(t => t.id === 'fire_attack');
    if (fireAttack) return 'fire_attack';

    // 2. 화선 가능하면 화선
    const fireShips = availableTactics.find(t => t.id === 'fire_ships');
    if (fireShips) return 'fire_ships';

    // 3. 매복
    const ambush = availableTactics.find(t => t.id === 'ambush');
    if (ambush) return 'ambush';

    // 4. 위장퇴각 (지력 B 이상)
    const feigned = availableTactics.find(t => t.id === 'feigned_retreat');
    if (feigned) return 'feigned_retreat';

    // 5. 돌격 (무력 A 이상)
    const charge = availableTactics.find(t => t.id === 'charge');
    if (charge) return 'charge';

    // 6. 기본: 정면돌격
    return 'frontal_assault';
  }
}
```

### 4.5 SimConfig — 설정 타입

```typescript
// sim/sim-config.ts

export interface SimConfig {
  gameId: string;

  // 시뮬레이션 모드
  mode: 'A' | 'B';           // A=자동수락, B=숙의
  thinking: boolean;          // thinking 모드 ON/OFF

  // LLM 설정
  model: string;              // e.g. 'qwen3:7b'
  directOllama: boolean;      // true: Ollama 직접 호출, false: 서버 경유
  ollamaHost?: string;        // e.g. 'http://localhost:11434'

  // Faction AI
  useLLMFactionAI: boolean;   // true: LLM, false: 하드코딩 전략

  // 전투 AI
  battleAI: 'rule' | 'llm';   // 규칙 기반 or LLM 기반

  // RNG
  seed: number;               // 결정적 시뮬레이션용 시드

  // 로깅
  verbose: boolean;           // 상세 로그 출력
}

export interface SimResult {
  gameId: string;
  mode: 'A' | 'B';
  thinking: boolean;
  seed: number;
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
    fast: { winRate: number; avgGrade: number };
    think: { winRate: number; avgGrade: number };
  };
}
```

### 4.6 SimReporter — 결과 수집 + 통계

```typescript
// sim/sim-reporter.ts

export class SimReporter {
  /**
   * 배치 결과를 JSON 파일로 저장
   */
  static saveBatchResult(result: BatchResult, dir: string = 'sim/results'): string {
    const filename = `batch-${result.timestamp}.json`;
    const path = join(dir, filename);
    writeFileSync(path, JSON.stringify(result, null, 2));
    return path;
  }

  /**
   * 개별 게임 상세 로그 저장
   */
  static saveGameLog(result: SimResult, dir: string = 'sim/results'): void {
    const filename = `game-${result.gameId}.json`;
    writeFileSync(join(dir, filename), JSON.stringify(result, null, 2));
  }

  /**
   * 배치 결과에서 통계 산출
   */
  static computeStats(results: SimResult[]): BatchStats {
    const gradeDistribution: Record<string, number> = {};
    for (const r of results) {
      gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
    }

    const gradeToScore: Record<string, number> = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
    const avgGrade = results.reduce((sum, r) => sum + (gradeToScore[r.grade] ?? 0), 0) / results.length;

    const winRate = results.filter(r => r.flags['chibiVictory'] === true).length / results.length;
    const avgTurns = results.reduce((sum, r) => sum + r.totalTurns, 0) / results.length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    // 모드별 비교
    const modeA = results.filter(r => r.mode === 'A');
    const modeB = results.filter(r => r.mode === 'B');

    // 사고 모드별 비교
    const fast = results.filter(r => !r.thinking);
    const think = results.filter(r => r.thinking);

    return {
      gradeDistribution,
      winRate,
      avgTurns,
      avgDuration,
      modeComparison: {
        A: this.computeSubStats(modeA),
        B: this.computeSubStats(modeB),
      },
      thinkingComparison: {
        fast: this.computeSubStats(fast),
        think: this.computeSubStats(think),
      },
    };
  }

  /**
   * 콘솔에 통계 요약 출력
   */
  static printSummary(stats: BatchStats): void {
    console.log('\n══════════════════════════════════════');
    console.log('  AI 삼국지 시뮬레이션 결과 요약');
    console.log('══════════════════════════════════════\n');

    console.log('📊 등급 분포:');
    for (const [grade, count] of Object.entries(stats.gradeDistribution).sort()) {
      const bar = '█'.repeat(count);
      console.log(`  ${grade}: ${bar} (${count})`);
    }

    console.log(`\n🏆 적벽 승률: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`📈 평균 턴: ${stats.avgTurns.toFixed(1)}`);
    console.log(`⏱  평균 시간: ${(stats.avgDuration / 1000).toFixed(1)}s`);

    console.log('\n── 모드별 비교 ──');
    console.log(`  Mode A (자동수락): 승률 ${(stats.modeComparison.A.winRate * 100).toFixed(1)}%`);
    console.log(`  Mode B (숙의):     승률 ${(stats.modeComparison.B.winRate * 100).toFixed(1)}%`);

    console.log('\n── Thinking 비교 ──');
    console.log(`  Fast:    승률 ${(stats.thinkingComparison.fast.winRate * 100).toFixed(1)}%`);
    console.log(`  Think:   승률 ${(stats.thinkingComparison.think.winRate * 100).toFixed(1)}%`);
  }
}
```

### 4.7 run-batch.ts — CLI 진입점

```typescript
// sim/run-batch.ts

#!/usr/bin/env node

/**
 * 배치 시뮬레이션 실행 CLI
 *
 * 사용법:
 *   npx tsx sim/run-batch.ts                          # 기본 매트릭스 (60회)
 *   npx tsx sim/run-batch.ts --mode A --count 5       # Mode A 5회
 *   npx tsx sim/run-batch.ts --mode B --think --count 3  # Mode B + Think 3회
 *   npx tsx sim/run-batch.ts --quick                  # 빠른 테스트 (4회)
 */

import { HeadlessSimulator } from './headless-sim.js';
import { SimReporter } from './sim-reporter.js';
import type { SimConfig, BatchResult } from './sim-config.js';

function parseArgs(): {
  mode?: 'A' | 'B';
  think?: boolean;
  count?: number;
  quick?: boolean;
  model?: string;
  parallel?: number;
} {
  // CLI 인자 파싱
  const args = process.argv.slice(2);
  // ... 파싱 로직
}

function buildMatrix(opts: ReturnType<typeof parseArgs>): SimConfig[] {
  const configs: SimConfig[] = [];
  const baseConfig = {
    model: opts.model || 'qwen3:7b',
    directOllama: true,
    ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
    useLLMFactionAI: false,    // Phase 2에서는 하드코딩 전략 사용 (안정성)
    battleAI: 'rule' as const,
    verbose: false,
  };

  if (opts.quick) {
    // 빠른 테스트: 각 모드 1회씩
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
  const parallel = opts.parallel || 1;  // Ollama는 동시 1 권장

  console.log(`\n🎮 AI 삼국지 시뮬레이션 시작`);
  console.log(`  총 ${configs.length}회, 동시 실행 ${parallel}개\n`);

  const results: SimResult[] = [];

  // 순차 또는 병렬 실행
  for (let i = 0; i < configs.length; i += parallel) {
    const batch = configs.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map(async (config) => {
        console.log(`[${results.length + 1}/${configs.length}] ${config.gameId} 시작...`);
        const sim = new HeadlessSimulator(config);
        const result = await sim.runGame();
        console.log(`  → ${result.grade} (${result.title}) — ${result.totalTurns}턴, ${(result.duration / 1000).toFixed(1)}s`);
        return result;
      })
    );
    results.push(...batchResults);
  }

  // 결과 저장
  const stats = SimReporter.computeStats(results);
  const batchResult: BatchResult = {
    timestamp: new Date().toISOString(),
    model: configs[0].model,
    totalGames: results.length,
    results,
    stats,
  };

  const savedPath = SimReporter.saveBatchResult(batchResult);
  SimReporter.printSummary(stats);

  console.log(`\n💾 결과 저장: ${savedPath}`);
}

main().catch(console.error);
```

## 5. 결정적 RNG (Deterministic Random)

시뮬레이션 재현성을 위해 **seed 기반 RNG** 필요:

```typescript
// sim/seeded-rng.ts

/**
 * Mulberry32 — 빠르고 간단한 32비트 PRNG
 * 같은 seed → 항상 같은 난수열
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

**적용**: 모든 엔진 모듈이 이미 `rng: () => number` 파라미터를 받으므로,
`Math.random` 대신 `createSeededRng(seed)` 주입하면 결정적 실행.

**주의**: LLM 호출은 본질적으로 비결정적. RNG seed는 전투/이벤트 확률만 고정.
LLM 응답 변동은 통계적으로 충분한 반복 횟수(20~)로 흡수.

## 6. LLM 호출 경로 — 서버 vs 직접

### 옵션 A: 서버 경유 (`directOllama: false`)
```
HeadlessSimulator → fetch(/api/chat) → Hono 서버 → Ollama/LLM
```
- 장점: 기존 서버 코드 재사용, 설정 관리 통일
- 단점: 서버 프로세스 별도 실행 필요

### 옵션 B: 직접 Ollama 호출 (`directOllama: true`)  ← 권장
```
HeadlessSimulator → fetch(ollama:11434/api/chat) → Ollama
```
- 장점: 서버 불필요, 단일 프로세스, 디버깅 용이
- 단점: Ollama 전용 (다른 제공자는 서버 경유 필요)
- **Windows Lab은 Ollama만 사용하므로 이 옵션이 최적**

### 구현:
- `SimAdvisor`와 `HeadlessSimulator` 모두 `config.directOllama`로 분기
- Faction AI도 직접 호출 가능하도록 `DirectFactionLLMClient` 구현

```typescript
// sim/direct-faction-client.ts

/**
 * 서버 없이 Ollama를 직접 호출하는 FactionLLMClient
 */
export class DirectFactionLLMClient implements FactionLLMClient {
  constructor(private config: SimConfig) {}

  async requestFactionTurn(factionId: FactionId, gameState: GameState): Promise<FactionTurnJSON> {
    // 1. 상태 필터링
    const view = buildFactionStateView(gameState, factionId);

    // 2. 마일스톤 조회
    const msRegistry = new MilestoneRegistry();
    const pendingMs = msRegistry.getPendingMilestones(factionId, gameState);
    const activeRules = msRegistry.getActiveAdaptiveRules(factionId, gameState);

    // 3. 시스템 프롬프트
    const systemPrompt = factionId === '조조'
      ? buildCaoSystemPrompt(view, pendingMs, activeRules)
      : buildSunSystemPrompt(view, pendingMs, activeRules);

    // 4. Ollama 직접 호출
    const ollamaHost = this.config.ollamaHost || 'http://localhost:11434';
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: '이번 턴 행동을 결정하라.' },
        ],
        stream: false,
      }),
    });

    const data = await response.json() as { message: { content: string } };
    const text = stripThinking(data.message.content);

    // 5. 파싱
    const ctx = buildFactionContext(gameState, factionId);
    return parseFactionResponse(text, ctx);
  }
}
```

## 7. Faction AI 설정

Phase 2 시뮬레이션에서 Faction AI(조조/손권)는 **하드코딩 전략**을 기본으로 한다.

**이유**:
1. LLM Faction AI는 아직 안정화 중 (마일스톤 시스템 방금 적용)
2. 시뮬레이션 변수를 줄여야 Player AI 성능만 격리 측정 가능
3. 하드코딩 전략은 결정적 → seed + LLM 응답만 변수
4. Phase 3에서 LLM Faction AI 시뮬레이션 별도 진행

**옵션**: `config.useLLMFactionAI: true`로 설정하면 LLM Faction AI 사용 가능.

## 8. 실행 워크플로

### 개발 환경 (Mac)
```bash
# 1. 코드 수정 & 테스트
npm test

# 2. 빠른 시뮬레이션 테스트 (서버 불필요, 로컬 모델 사용)
npx tsx sim/run-batch.ts --quick --model qwen3:7b

# 3. 커밋 & 푸시
git add . && git commit -m "Phase 2 시뮬레이션 구현"
git push
```

### Windows Lab (대량 실행)
```bash
# 1. 코드 풀
git pull

# 2. 전체 매트릭스 실행 (60회, 약 2-4시간)
npx tsx sim/run-batch.ts

# 3. 또는 특정 모드만
npx tsx sim/run-batch.ts --mode A --count 20
npx tsx sim/run-batch.ts --mode B --think --count 10

# 4. 결과 확인
cat sim/results/batch-*.json | jq '.stats'

# 5. 결과 커밋 & 푸시
git add sim/results/ && git commit -m "시뮬레이션 결과: batch-xxx"
git push
```

### 결과 분석 (Mac)
```bash
git pull
# 결과 JSON을 분석하여 밸런스 튜닝 포인트 도출
```

## 9. 구현 순서

### Step 1: BattleResolver 추출 (리팩토링)
1. `core/engine/battle-resolver.ts` 생성
2. `game-controller.ts`의 전투 로직 이동
3. `game-controller.ts`가 `BattleResolver`를 호출하도록 변경
4. 기존 테스트 통과 확인

### Step 2: 기반 모듈 생성
1. `sim/` 디렉토리 생성
2. `sim/sim-config.ts` — 타입 정의
3. `sim/seeded-rng.ts` — 결정적 RNG

### Step 3: HeadlessSimulator 핵심
1. `sim/headless-sim.ts` — 메인 시뮬레이터
2. `sim/sim-battle-ai.ts` — 전투 전술 자동 선택
3. 하드코딩 전략으로만 테스트 (LLM 없이 게임 루프 검증)

### Step 4: LLM 연동
1. `sim/sim-advisor.ts` — Mode A 구현 (자동 수락)
2. `sim/direct-faction-client.ts` — Ollama 직접 호출
3. Ollama로 1회 시뮬레이션 E2E 테스트

### Step 5: Mode B + 배치 실행
1. `sim/sim-advisor.ts` — Mode B 구현 (숙의, Player AI)
2. `sim/sim-reporter.ts` — 결과 수집 + 통계
3. `sim/run-batch.ts` — CLI 진입점

### Step 6: 테스트 + 최적화
1. 유닛 테스트 (seeded-rng, reporter, config)
2. E2E: `--quick` 모드 (4회)로 전체 파이프라인 검증
3. 성능 최적화 (Ollama 응답 시간 측정, 타임아웃 설정)

## 10. package.json 스크립트 추가

```json
{
  "scripts": {
    "sim": "tsx sim/run-batch.ts",
    "sim:quick": "tsx sim/run-batch.ts --quick",
    "sim:a": "tsx sim/run-batch.ts --mode A",
    "sim:b": "tsx sim/run-batch.ts --mode B"
  }
}
```

## 11. 밸런스 목표 (Phase 3에서 튜닝)

시뮬레이션으로 검증할 목표치:

| 지표 | 목표 | 현재 추정 |
|------|------|----------|
| 적벽 승률 | 50-60% | 불명 |
| S 등급 비율 | 5-10% | 불명 |
| A 등급 비율 | 15-25% | 불명 |
| F 등급 비율 | 10-20% | 불명 |
| 평균 게임 시간 | 15-20턴 | 불명 |
| Mode B vs A 승률 차이 | B > A (5-15%p) | 불명 |
| Think vs Fast 승률 차이 | Think > Fast (5-10%p) | 불명 |

**Phase 3 밸런스 튜닝 대상**:
- 남군 적벽 패배 병력 감소율 (현재 50%)
- 조조 초기 병력 수
- 마일스톤 트리거 턴 수
- 식량 생산/소비 계수
- 전투 대미지 계수
- 적벽 화공 배율
