# Phase 1: 액션 JSON 전환 + Faction AI LLM화

**작성**: Buddy (2026-02-15)
**목표**: 텍스트 기반 액션 파싱 → JSON 기반으로 전환, Faction AI를 LLM 의사결정으로 교체
**완료 기준**: 브라우저에서 게임 플레이 시 제갈량은 XML 태그로 응답, 조조/손권은 LLM이 JSON으로 결정

---

## 배경

### 현재 문제
1. **파싱 불안정**: `---ACTIONS---` 구분자 + 4단계 폴백 파서가 SLM에서 자주 실패
2. **Faction AI 대본화**: CaoStrategy/SunStrategy가 하드코딩된 마일스톤+규칙 → 매 게임 동일한 전개
3. **단일 모델 미활용**: 이미 멀티 프로바이더(Claude/OpenAI/Gemini/Ollama) 인프라가 있지만 Faction AI는 코드 로직

### 설계 원칙
- **단일 모델**: 유저가 선택한 1개 모델이 제갈량 + 조조 + 손권 모두 담당
- **서사/액션 분리**: XML 태그(`<narrative>`, `<actions>`)로 구조화
- **Faction AI는 JSON만**: 유저에게 안 보여주므로 서사 불필요, 스트리밍 불필요
- **불변 제약 유지**: 시나리오 이벤트(연환진, 동남풍 등)는 event-system.ts가 강제 → 건드리지 않음

---

## Step 1.1: 액션 JSON 스키마

### 새 타입 정의 (`core/advisor/types.ts`에 추가)

```typescript
// ─── 액션 JSON 스키마 ────────────────────────────────

/** LLM이 출력하는 단일 액션 */
export interface ActionJSON {
  type: string;                    // conscript, develop, train, recruit, assign,
                                   // transfer, send_envoy, gift, threaten,
                                   // scout, fortify, march, ambush, pass
  params: Record<string, string>;  // 액션별 파라미터 (아래 상세)
  confidence: number;              // 0-100
  description: string;             // 한국어 설명 (제갈량용), Faction AI는 빈 문자열 가능
}

/** 제갈량 응답 파싱 결과 */
export interface AdvisorResponse {
  narrative: string;               // 서사 브리핑
  actions: ActionJSON[];           // 추천 액션 (최대 3개)
}

/** Faction AI 턴 계획 (LLM 출력) */
export interface FactionTurnJSON {
  actions: ActionJSON[];           // 이번 턴 행동 (최대 3개)
  message?: string;                // 정찰 보고용 메시지 (선택)
}
```

### ActionJSON.params 상세

| type | params 필드 | 예시 |
|------|-------------|------|
| conscript | `city`, `scale` (small/medium/large) | `{"city":"nanjun","scale":"large"}` |
| develop | `city`, `focus` (agriculture/commerce/defense) | `{"city":"hagu","focus":"agriculture"}` |
| train | `city` | `{"city":"gangha"}` |
| recruit | `city`, `general` | `{"city":"gangha","general":"weiyuan"}` |
| assign | `general`, `destination` | `{"general":"guanyu","destination":"hagu"}` |
| transfer | `from`, `to`, `transferType` (troops/food), `scale` (small/medium/large) | `{"from":"gangha","to":"hagu","transferType":"troops","scale":"medium"}` |
| send_envoy | `target` | `{"target":"손권"}` |
| gift | `target` | `{"target":"유비"}` |
| threaten | `target` | `{"target":"조조"}` |
| scout | `target` | `{"target":"chibi"}` |
| fortify | `city` | `{"city":"hagu"}` |
| march | `from`, `to`, `scale` (small/medium/main) | `{"from":"hagu","to":"chibi","scale":"medium"}` |
| ambush | `location`, `general` | `{"location":"chibi","general":"zhaoyun"}` |
| pass | (없음) | `{}` |

---

## Step 1.2: 프롬프트 리팩토링

### 1.2a: 제갈량 프롬프트 (`core/advisor/prompts.ts` 수정)

**변경 핵심**: `ACTION_FORMAT_INSTRUCTION` 교체

현재 (`---ACTIONS---` 텍스트 형식):
```
---ACTIONS---
1. [conscript|gangha|medium] 75% 강하 징병
```

변경 후 (`<narrative>` + `<actions>` XML 태그):
```
<narrative>
주공, 지금 판세가 심상치 않소이다. 조조가 대군을 이끌고 남하하니...
</narrative>
<actions>
[
  {"type":"develop","params":{"city":"hagu","focus":"agriculture"},"confidence":85,"description":"하구 농업 개발"},
  {"type":"train","params":{"city":"gangha"},"confidence":75,"description":"강하 병사 훈련"},
  {"type":"send_envoy","params":{"target":"손권"},"confidence":90,"description":"손권에게 사신 파견"}
]
</actions>
```

**프롬프트 수정 사항:**
- `ACTION_FORMAT_INSTRUCTION` 상수를 새 XML 태그 기반 예시로 교체
- 예시를 1개만 제공 (SLM이 긴 프롬프트에 약하므로 간결하게)
- "절대 지켜야 할 규칙" → `<narrative>` 안에 서사, `<actions>` 안에 JSON 배열
- 기존 행동 ID 참조표(`buildActionReference`)는 그대로 유지
- 언어 리마인더도 그대로 유지

**나머지 유지**:
- `PERSONA`, `buildLanguageInstruction`, `formatCityView` 등 전부 유지
- `buildBriefingUserMessage`, `buildActionCommentMessage`, `buildBattleAdviceMessage` 유지
- `buildSystemPrompt` 함수 시그니처 유지, 내부 ACTION_FORMAT_INSTRUCTION 부분만 교체

### 1.2b: Faction AI 프롬프트 (`core/advisor/faction-prompts.ts` 신규)

**조조 system prompt 구조:**

```typescript
export function buildCaoSystemPrompt(view: FactionStateView): string {
  // 페르소나
  // - 조조 맹덕. 공격적, 과감, 자신감 있음. 약점은 오만
  // - 수전에 약하다는 것을 인지하지만 과소평가하는 경향

  // 전략 목표 (마일스톤 가이드 — 고정된 "목표"를 제시, 방법은 AI가 결정)
  // - preparation (턴 1-8): 남군 병력 증강, 장수 배치 최적화, 적벽 출진 준비
  // - battle (턴 9-13): 적벽에 주력 배치, 수군 함대 운용, 하구/강하 견제
  // - aftermath (턴 14+): 전과 확대 또는 방어 전환

  // 현재 상태 (조조 시점)
  // - 자기 도시 상태: 정확한 수치 (아군이니까)
  // - 유비/손권 정보: 제한적 (정찰 수준 — 범주형)

  // 제약 조건
  // - 연환진은 이벤트 시스템이 처리 → AI가 신경 쓸 필요 없음
  // - chibiVictory 플래그 시 공격 중단

  // 출력 형식
  // - <actions>[ActionJSON 배열]</actions> 만 출력
  // - 서사 불필요
}
```

**손권 system prompt 구조:**

```typescript
export function buildSunSystemPrompt(view: FactionStateView): string {
  // 페르소나
  // - 손권 중모. 신중하고 실리적. 동맹은 이익이 될 때 유지
  // - 주유의 자존심과 독립성을 존중

  // 전략 목표
  // - 동맹 상태: 유비와 협력하되 주도권 확보
  // - 비동맹 상태: 관망, 최소한의 행동

  // 현재 상태 (손권 시점)
  // - 자기 도시: 정확한 수치
  // - 유비/조조: 제한적 정보

  // 출력 형식
  // - <actions>[ActionJSON 배열]</actions> 만 출력
}
```

### Faction AI용 상태 필터 (`core/advisor/faction-state-filter.ts` 신규)

기존 `state-filter.ts`는 유비 시점. Faction AI용은 해당 세력 시점으로 필터링:

```typescript
export interface FactionStateView {
  turn: number;
  maxTurns: number;
  phase: GamePhase;
  season: string;

  // 자기 세력 (정확한 수치)
  ownCities: FactionCityView[];     // 실제 병력/식량 숫자 포함
  ownGenerals: FactionGeneralView[];

  // 적/타 세력 (제한적 정보)
  enemyIntel: FactionEnemyIntel[];  // 범주형 또는 정찰 수준

  // 외교 상태
  diplomacy: FactionDiplomacyView;

  // 게임 플래그 (자기 세력 관련만)
  relevantFlags: Record<string, unknown>;

  // 마일스톤 가이드 (phase별 목표)
  strategicGoals: string[];
}
```

**핵심**: Faction AI에게는 자기 세력 수치를 정확히 줌 (제갈량과 다름 — 제갈량은 범주형)

---

## Step 1.3: 파서 교체 (`core/advisor/action-recommender.ts` 리팩토링)

### 새 메인 파서

```typescript
export function parseAdvisorResponse(
  text: string,
  context: RecommendationContext,
): AdvisorResponse {
  // 1차: <narrative>...</narrative> + <actions>...</actions> 파싱
  const narrativeMatch = /<narrative>([\s\S]*?)<\/narrative>/i.exec(text);
  const actionsMatch = /<actions>([\s\S]*?)<\/actions>/i.exec(text);

  if (actionsMatch) {
    const narrative = narrativeMatch?.[1]?.trim() ?? extractNarrativeFallback(text);
    const actions = parseActionJSON(actionsMatch[1], context);
    return { narrative, actions };
  }

  // 2차 폴백: 태그 없이 JSON 배열만 있는 경우
  const jsonMatch = /\[[\s\S]*?\{[\s\S]*?"type"[\s\S]*?\}[\s\S]*?\]/.exec(text);
  if (jsonMatch) {
    const narrative = text.slice(0, jsonMatch.index).trim();
    const actions = parseActionJSON(jsonMatch[0], context);
    return { narrative, actions };
  }

  // 3차 폴백: 시맨틱 매처 (SLM 안전망 — 기존 유지)
  const semanticRecs = matchSemanticActions(text, context);
  return {
    narrative: text.trim(),
    actions: semanticRecs.map(r => ({
      type: r.action?.action ?? 'pass',
      params: (r.action as any)?.params ?? {},
      confidence: r.confidence,
      description: r.description,
    })),
  };
}
```

### Faction AI용 파서

```typescript
export function parseFactionResponse(
  text: string,
  context: RecommendationContext,
): FactionTurnJSON {
  const actionsMatch = /<actions>([\s\S]*?)<\/actions>/i.exec(text);
  if (actionsMatch) {
    return { actions: parseActionJSON(actionsMatch[1], context) };
  }

  // JSON 직접 파싱 시도
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return { actions: validateActions(parsed, context) };
    }
    if (parsed.actions) {
      return { actions: validateActions(parsed.actions, context) };
    }
  } catch { /* fall through */ }

  return { actions: [] };  // 파싱 실패 시 빈 배열 (해당 턴 행동 없음)
}
```

### 삭제 대상
- `parseFallbackFormat()` — 불필요
- `parseInlineFormat()` — 불필요
- `parseNumberedListFormat()` — 불필요
- `parseLine()` — 불필요
- `ACTION_ALIASES`, `SCALE_KO`, `FOCUS_KO` 등 — `parseActionJSON` 내부의 validate에서 최소한으로 유지

### 유지 대상
- `resolveCity()`, `resolveGeneral()`, `resolveFaction()` — JSON params 검증에 재활용
- `matchSemanticActions()` (semantic-matcher.ts) — 최후 폴백
- `RecommendationContext` 인터페이스 — 그대로

---

## Step 1.4: Faction AI 엔진 전환 (`core/engine/faction-ai.ts` 리팩토링)

### 구조 변경

```
현재:
  FactionAIEngine.processAll()
    → CaoStrategy.planTurn() — 하드코딩된 마일스톤 + 적응규칙
    → SunStrategy.planTurn() — 하드코딩된 조건문

변경 후:
  FactionAIEngine.processAll()
    → LLM 호출 (조조 프롬프트 + 상태) → JSON 파싱 → ActionJSON[]
    → LLM 호출 (손권 프롬프트 + 상태) → JSON 파싱 → ActionJSON[]
    → ActionJSON → GameAction 변환 → ActionExecutor.executeFor()
```

### FactionAIEngine 변경점

```typescript
export class FactionAIEngine {
  constructor(
    private stateManager: GameStateManager,
    private executor: ActionExecutor,
    private rng: () => number,
    private llmClient?: FactionLLMClient,  // 새 의존성 (선택적)
  ) {}

  async processAll(): Promise<{ changes: string[]; battle?: BattleState }> {
    // async로 변경 (LLM 호출이 비동기)
    // ...

    for (const faction of nonPlayerFactions) {
      let plan: AITurnPlan;

      if (this.llmClient) {
        // LLM 모드: 프롬프트 빌드 → API 호출 → JSON 파싱 → AITurnPlan 변환
        const view = buildFactionStateView(state, faction.id);
        const prompt = faction.id === '조조'
          ? buildCaoSystemPrompt(view)
          : buildSunSystemPrompt(view);
        const response = await this.llmClient.requestFactionTurn(prompt, view);
        plan = convertJSONToPlan(response, state, faction.id);
      } else {
        // 폴백: 기존 하드코딩 전략 (LLM 미설정 시)
        const strategy = STRATEGIES[faction.id];
        plan = strategy.planTurn(state, ctx, this.rng);
      }

      // 이하 기존 실행 로직 동일
    }
  }
}
```

### FactionLLMClient 인터페이스 (`core/advisor/faction-llm-client.ts` 신규)

```typescript
export interface FactionLLMClient {
  requestFactionTurn(systemPrompt: string, view: FactionStateView): Promise<FactionTurnJSON>;
}
```

서버 사이드 구현: `/api/faction-turn` 엔드포인트 또는 기존 `/api/chat` 에 mode 파라미터 추가

### 서버 변경 (`server/index.ts`)

```typescript
// 새 엔드포인트
app.post('/api/faction-turn', async (c) => {
  const { factionId, gameState, think } = await c.req.json();

  // 1. 상태 필터링 (해당 세력 시점)
  const view = buildFactionStateView(gameState, factionId);

  // 2. 프롬프트 빌드
  const systemPrompt = factionId === '조조'
    ? buildCaoSystemPrompt(view)
    : buildSunSystemPrompt(view);

  // 3. LLM 호출 (스트리밍 아님 — 전체 응답 대기)
  const fullText = await provider.completeChat(systemPrompt, [], config, { think });

  // 4. JSON 파싱
  const result = parseFactionResponse(fullText, buildFactionContext(gameState, factionId));

  return c.json(result);
});
```

**주의**: 프로바이더에 `completeChat()` (비스트리밍 버전) 추가 필요.
또는 기존 `streamChat()`을 써서 전체 텍스트를 모은 후 반환해도 됨.

### 기존 CaoStrategy/SunStrategy

- **삭제하지 않음** — `llmClient` 미설정 시 폴백으로 사용
- 향후 Phase 3에서 LLM이 안정적이면 deprecated 처리

---

## 마일스톤 가이드 (조조)

기존 마일스톤을 "목표"로 변환하여 조조 프롬프트에 주입:

| Phase | 목표 | 구체적 가이드 |
|-------|------|---------------|
| preparation (1-8) | 남군 병력 20,000 이상 확보 | 징병 권장, 장릉에서 장수 이동 가능 |
| preparation (5+) | 적벽 출진 준비 | 채모/장윤을 적벽에 배치할 시기 판단 |
| battle (9-13) | 적벽 주둔 + 하구/강하 견제 | 수군 도독 적벽 배치, 후방 교란 선택적 |
| aftermath (14+) | 전과 확대 또는 방어 | chibiVictory 시 공격 중단 |

**핵심**: "턴 3에 대규모 징병" 대신 "병력 20,000 확보 목표" → LLM이 시점과 규모를 자율 판단

### 마일스톤 가이드 (손권)

| Phase | 목표 | 구체적 가이드 |
|-------|------|---------------|
| preparation | 동맹 시 협력 강화, 비동맹 시 관망 | 훈련, 식량 비축 |
| battle | 동맹 시 주유 적벽 파견 | 적벽에 조조 배치 확인 후 파견 시기 판단 |
| aftermath | 전후 이익 확보 | 형주 주도권 확보 시도 가능 |

---

## 테스트 계획

### 단위 테스트 수정/추가

1. **action-recommender.test.ts** — XML 태그 파싱 테스트
   - `<narrative>서사</narrative><actions>[JSON]</actions>` 정상 파싱
   - `<actions>` 태그만 있는 경우 (Faction AI)
   - 태그 깨진 경우 → 시맨틱 매처 폴백
   - JSON 내 잘못된 필드 → 무시 (graceful)

2. **faction-ai.test.ts** — LLM 모드 테스트
   - Mock LLM 클라이언트로 JSON 응답 → 올바른 GameAction 변환 확인
   - LLM 미설정 시 기존 하드코딩 전략 폴백 확인
   - JSON 파싱 실패 시 빈 행동 (게임 크래시 방지)

3. **faction-prompts.test.ts** (신규)
   - 조조/손권 프롬프트가 올바른 구조 포함하는지
   - 상태 필터가 해당 세력 시점인지

### 통합 테스트

- 브라우저에서 전체 게임 플레이 (수동)
- Ollama + Qwen3 7B로 20턴 완주 확인

---

## 파일 변경 요약

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `core/advisor/types.ts` | 수정 | ActionJSON, AdvisorResponse, FactionTurnJSON 타입 추가 |
| `core/advisor/prompts.ts` | 수정 | ACTION_FORMAT_INSTRUCTION → XML 태그 기반으로 교체 |
| `core/advisor/faction-prompts.ts` | **신규** | 조조/손권 system prompt 빌더 |
| `core/advisor/faction-state-filter.ts` | **신규** | Faction AI용 상태 필터 (해당 세력 시점) |
| `core/advisor/action-recommender.ts` | **대폭 수정** | 4단계 폴백 → XML/JSON 파서 + 시맨틱 폴백만 |
| `core/advisor/faction-llm-client.ts` | **신규** | FactionLLMClient 인터페이스 |
| `core/engine/faction-ai.ts` | 수정 | LLM 모드 추가, 기존 전략은 폴백으로 보존 |
| `server/index.ts` | 수정 | `/api/faction-turn` 엔드포인트 추가 |
| `server/providers/types.ts` | 수정 | completeChat 메서드 추가 (또는 streamChat 래핑) |
| `web/src/services/advisor-api.ts` | 수정 | 응답 파싱 로직 XML 태그 대응 |
| `web/src/game-controller.ts` | 수정 | Faction AI 호출을 async + /api/faction-turn 경유로 변경 |

---

## 구현 순서 (Cody 작업 순서)

1. `core/advisor/types.ts` — 새 타입 추가
2. `core/advisor/action-recommender.ts` — 새 파서 구현 + 테스트
3. `core/advisor/prompts.ts` — XML 태그 프롬프트로 교체
4. `core/advisor/faction-state-filter.ts` — Faction 상태 필터 구현
5. `core/advisor/faction-prompts.ts` — 조조/손권 프롬프트 구현
6. `core/advisor/faction-llm-client.ts` — 인터페이스 정의
7. `server/index.ts` + `server/providers/` — /api/faction-turn 엔드포인트
8. `core/engine/faction-ai.ts` — LLM 모드 통합
9. `web/src/` — 프론트엔드 응답 처리 수정
10. 전체 테스트 확인 (`npm test`)

---

## 참고: Phase 2 예고

Phase 1 완료 후 → **headless 시뮬레이션 시스템** 구축
- GUI 없이 CLI로 N회 자동 플레이
- Win Lab (Qwen3 7B + 4070Ti)에서 밸런스 테스트
- 모드 A(맹종) + 모드 B(숙의) + Fast/Thinking 조합
