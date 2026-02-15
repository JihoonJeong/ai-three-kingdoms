# AI 삼국지 — 적벽대전

AI 책사(제갈량)와 함께하는 턴제 전략 게임. Claude API를 연동하여 제갈량이 실시간 전략 조언을 제공한다.

## Quick Start

```bash
npm install
npm test          # vitest — 295 tests
npm run dev       # vite + hono 동시 기동 (concurrently)
npm run dev:web   # vite만 (프론트엔드)
npm run dev:server # hono만 (API 서버, port 3001)
```

AI 설정: 첫 실행 시 브라우저 설정 마법사에서 제공자 선택 (Claude/OpenAI/Gemini/Ollama).
또는 `.env` 파일로 사전 설정:
```bash
AI_PROVIDER=claude
AI_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-...
```

## 프로젝트 구조

```
core/               ← 순수 TypeScript 게임 엔진 (브라우저/서버 공유)
  data/types.ts     ← 모든 타입 정의 (City, General, GameState, GameAction 등)
  data/scenarios/   ← 시나리오 데이터 (red-cliffs.ts)
  engine/           ← 엔진 7모듈 (game-state, turn-manager, action-executor, battle-engine, event-system, victory-judge, faction-ai)
  advisor/          ← AI 책사 모듈 (types, knowledge, state-filter, prompts, knowledge-selector, action-recommender, semantic-matcher, faction-prompts, faction-state-filter, faction-llm-client)
  ui/               ← UI 헬퍼 (strategy-map, battle-view, character-display, event-cutscene)

web/                ← Vite 기반 웹 프론트엔드 (Vanilla TS, 프레임워크 없음)
  src/main.ts       ← 앱 진입점 — 모든 컴포넌트 연결
  src/game-controller.ts ← 엔진 모듈 조합 + FactionAI 통합
  src/layout.ts     ← 탭 레이아웃 (map/city/general/diplomacy/log/advisor)
  src/renderer.ts   ← DOM 헬퍼 (h(), assetUrl(), createGauge())
  src/screens/      ← 9개 화면 (map, city, general, diplomacy, log, battle, cutscene, advisor, setup)
  src/services/     ← API 클라이언트 (advisor-api.ts, config-api.ts)
  src/components/   ← UI 컴포넌트 (action-menu, turn-summary)
  src/styles/       ← CSS (main, ink-wash, battle, cutscene, advisor, setup)

server/             ← Hono 백엔드 서버 — 멀티 AI 제공자 프록시
  index.ts          ← POST /api/chat, /api/faction-turn, /api/config/*, GET /api/health
  config.ts         ← .env 파일 기반 설정 관리
  providers/        ← AI 제공자 (claude, openai, gemini, ollama) + 레지스트리

assets/             ← 이미지 에셋 (Vite publicDir로 서빙, /map/background.webp 형태)
docs/               ← 설계 문서
```

## 핵심 규칙

- **타입**: `core/data/types.ts`가 single source of truth. GameState, City, General, GameAction 등 모든 타입이 여기에.
- **에셋 경로**: core에서 `assets/...` 반환 → web에서 `assetUrl()`로 `assets/` prefix 제거하여 사용.
- **테스트**: `core/**/*.test.ts`, vitest, 글로벌 API 사용 (`describe`, `it`, `expect`).
- **모듈**: ES modules (`"type": "module"`), import 시 `.js` 확장자 필수.
- **한국어**: 게임 내 텍스트, 커밋 메시지 모두 한국어.
- **RNG 주입**: 모든 확률 로직에 `rng: () => number` 파라미터 → 테스트 결정성.

## 완료된 작업

- [x] Week 1: 엔진 코어 (6 모듈)
- [x] 비주얼 인프라 (디자인 가이드, P1 에셋 36개)
- [x] 웹 UI 프로토타입 (탭 레이아웃, 전투 오버레이, 컷신, 턴 요약)
- [x] AI 책사 연동 전체 (Phase 1-3)
  - Core Advisor: types, knowledge(8 chunks), state-filter, knowledge-selector, prompts
  - Backend: Hono 서버, POST /api/chat (Claude API streaming), vite proxy
  - Chat UI: advisor 탭, SSE 스트리밍 채팅, 자동 브리핑/행동 코멘트/전투 조언
- [x] 멀티 AI 제공자 + 설정 마법사
  - 4개 제공자: Claude, OpenAI, Gemini, Ollama (로컬)
  - 브라우저 설정 마법사 (연결 테스트, Ollama 설치 안내/모델 다운로드)
- [x] 책사 행동 추천 시스템
  - 매 턴 3개 행동 추천 (confidence 0-100%) + 원클릭 실행
  - `---ACTIONS---` 구분자 기반 파싱 (SLM 호환, semantic-matcher 폴백)
  - 대화를 통해 추천/confidence 동적 업데이트
- [x] Thinking 모드 토글 + 모델 관리
  - ⚡/🧠 토글: 빠른 응답(기본) / 신중한 답변 전환
  - 4개 제공자 모두 thinking 지원
- [x] AI 세력 의사결정 시스템 (Faction AI)
  - FactionAIEngine + CaoStrategy/SunStrategy (마일스톤 + 적응 규칙)
  - ActionExecutor 리팩토링: `execute()` (플레이어) / `executeFor()` (AI/범용)
  - TurnManager 하드코딩 AI → FactionAI 교체
- [x] 핵심 메카닉 보완 (Layer 1)
  - 보급 (transfer): 장수 없이 인접 아군 도시 간 병력/식량 이동
  - 액션 메뉴 완성: 대규모 징병, 등용, 설득, 매복, 보급(병력/식량)
  - 진군 UX 개선: 아군 도시 제외 → 보급으로 분리
- [x] Phase 1: 액션 JSON 전환 + Faction AI LLM화
  - ActionJSON 타입: `{ type, params, confidence, description }` — 텍스트 파싱 → 구조화 JSON
  - 책사 응답 XML 포맷: `<narrative>` + `<actions>` JSON 배열
  - Faction AI LLM 모드: FactionLLMClient 인터페이스 → `/api/faction-turn` 엔드포인트
  - FactionStateView: 자기 세력은 정확한 수치, 적 세력은 범주형
  - 비동기 전환: processAll/endTurn async, LLM 실패 시 하드코딩 전략 폴백
  - collectStreamText: 기존 SSE streamChat()을 래핑하여 전체 텍스트 수집

## 아키텍처 핵심

### GameAction — 15개 액션 타입
```
내정: conscript, develop, train, recruit, assign, transfer
외교: send_envoy, persuade, threaten, gift
군사: march, scout, fortify, ambush
```
- `transfer`: 장수 불필요, 인접 아군 도시 간 병력(비례)/식량(고정량) 이동
- `march`: 장수 필요, 적/중립/전투지역 진출 (전투 발생 가능)

### ActionExecutor — 2경로 실행
```
execute(action)          ← 플레이어 전용 (행동 소모 + 로그)
  └─ dispatchAction(action, playerFactionId)

executeFor(action, factionId)  ← AI/범용 (행동 미소모, 로그 미기록)
  └─ dispatchAction(action, factionId)
```

### Faction AI — LLM + 하드코딩 폴백
```
TurnManager.endTurn()  (async)
  → FactionAIEngine.processAll()  (async)
    ├─ LLM 모드 (llmClient 설정 시):
    │   → /api/faction-turn → FactionStateView + 프롬프트 → LLM → FactionTurnJSON
    │   → convertJSONToPlan() → AITurnPlan → ActionExecutor.executeFor()
    │   (실패 시 하드코딩 폴백)
    ├─ 하드코딩 폴백:
    │   ├─ CaoStrategy.planTurn()  ← 마일스톤 테이블 + 적응 규칙
    │   └─ SunStrategy.planTurn()  ← 동맹 상태 반응형
    └─ 행동 실행 → ActionExecutor.executeFor()
```
- FactionLLMClient: `requestFactionTurn(factionId, gameState) → FactionTurnJSON`
- FactionStateView: 자기 세력 정확 수치, 적 세력 범주형 (AdvisorView와 유사)
- collectStreamText: 기존 SSE stream을 래핑하여 전체 응답 텍스트 수집

### AdvisorView — 범주형 상태
Claude에게 정확한 숫자를 주지 않는다. 범주형으로 변환:
- 병력: 풍부(≥8000) / 충분(≥4000) / 부족(≥2000) / 위험(<2000)
- 식량: 풍부(≥10000) / 충분(≥5000) / 부족(≥2000) / 위험(<2000)
- 사기/훈련: 높음(≥70) / 보통(≥40) / 낮음(<40)

### 제갈량 페르소나
- 호칭: "주공", "사군"
- 차분하고 논리적, 대의(大義) 중시
- 위급하면 직설적, 여유 있으면 고사(故事) 인용
- 300자 이내 응답

### 게임 루프
턴 시작 → 행동 3회 → 턴 종료 → AI 세력 행동 → 요약 모달 → (컷신) → 책사 탭 자동 전환 + 브리핑 → 다음 턴

### 행동 추천 흐름 (ActionJSON)
```
턴 시작 → 책사 브리핑:
  <narrative>서사 3~5문장</narrative>
  <actions>[{type, params, confidence, description}, ...]</actions>
  → parseRecommendations() → 추천 패널 3개 카드 표시
  → 채팅 토론 → 추천/confidence 갱신
  → 원클릭 실행 or 직접 행동 (실패해도 행동 소모)
  → 턴 종료 → 다음 브리핑에 행동 결과 일괄 포함
```
- ActionJSON: `{ type: string, params: Record<string,string>, confidence: number, description: string }`
- XML 태그 기반 파싱 (구조화) + `---ACTIONS---` 레거시 폴백

### 서버 아키텍처
```
Browser (Vite:5173)  →  /api proxy  →  Server (Hono:3001)  →  AI Provider
  GameState ─────────→  state-filter ──→ AdvisorView ────────→  system prompt
                     ←── SSE stream ──←  text_delta ────────←  streaming
```
제공자: Claude (Anthropic), OpenAI, Gemini, Ollama (로컬). `server/providers/` 레지스트리 패턴.
ChatOptions: `{ think?: boolean }` → 각 제공자가 자체 방식으로 thinking 처리.

## 코드 스타일

- Vanilla TypeScript, 프레임워크 없음
- DOM은 `h()` 헬퍼로 생성 (`renderer.ts`)
- CSS 변수 기반 수묵화 테마 (`--color-ink`, `--color-hanji`, `--color-liu/cao/sun`)
- 클래스 기반 컴포넌트 (Screen, Component 패턴)
- 콜백 패턴: `onXxx(cb)` 메서드로 이벤트 핸들링
- `factionId` 파라미터화: 모든 엔진 메서드는 세력 ID를 파라미터로 받음 (하드코딩 X)
