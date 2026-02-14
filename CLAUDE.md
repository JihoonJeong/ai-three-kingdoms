# AI 삼국지 — 적벽대전

AI 책사(제갈량)와 함께하는 턴제 전략 게임. Claude API를 연동하여 제갈량이 실시간 전략 조언을 제공한다.

## Quick Start

```bash
npm install
npm test          # vitest — 200 tests
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
  data/types.ts     ← 모든 타입 정의 (City, General, GameState 등)
  data/scenarios/   ← 시나리오 데이터 (red-cliffs.ts)
  engine/           ← 엔진 모듈 6개 (game-state, turn-manager, action-executor, battle-engine, event-system, victory-judge)
  advisor/          ← AI 책사 모듈 (types, knowledge, state-filter, prompts, knowledge-selector, action-recommender)
  ui/               ← UI 헬퍼 (strategy-map, battle-view, character-display, event-cutscene)

web/                ← Vite 기반 웹 프론트엔드 (Vanilla TS, 프레임워크 없음)
  src/main.ts       ← 앱 진입점 — 모든 컴포넌트 연결
  src/game-controller.ts ← 엔진 6개 모듈 조합
  src/layout.ts     ← 탭 레이아웃 (map/city/general/diplomacy/log/advisor)
  src/renderer.ts   ← DOM 헬퍼 (h(), assetUrl(), createGauge())
  src/screens/      ← 9개 화면 (map, city, general, diplomacy, log, battle, cutscene, advisor, setup)
  src/services/     ← API 클라이언트 (advisor-api.ts, config-api.ts)
  src/components/   ← UI 컴포넌트 (action-menu, turn-summary)
  src/styles/       ← CSS (main, ink-wash, battle, cutscene, advisor, setup)

server/             ← Hono 백엔드 서버 — 멀티 AI 제공자 프록시
  index.ts          ← POST /api/chat, /api/config/*, GET /api/health
  config.ts         ← .env 파일 기반 설정 관리
  providers/        ← AI 제공자 (claude, openai, gemini, ollama) + 레지스트리

assets/             ← 이미지 에셋 (Vite publicDir로 서빙, /map/background.webp 형태)
docs/               ← 설계 문서
```

## 핵심 규칙

- **타입**: `core/data/types.ts`가 single source of truth. GameState, City, General 등 모든 타입이 여기에.
- **에셋 경로**: core에서 `assets/...` 반환 → web에서 `assetUrl()`로 `assets/` prefix 제거하여 사용.
- **테스트**: `core/**/*.test.ts`, vitest, 글로벌 API 사용 (`describe`, `it`, `expect`).
- **모듈**: ES modules (`"type": "module"`), import 시 `.js` 확장자 필수.
- **한국어**: 게임 내 텍스트, 커밋 메시지 모두 한국어.

## 완료된 작업

- [x] Week 1: 엔진 코어 (6 모듈, 142 tests)
- [x] 비주얼 인프라 (디자인 가이드, 에셋 19개)
- [x] 웹 UI 프로토타입 (탭 레이아웃, 전투 오버레이, 컷신, 턴 요약)
- [x] AI 책사 연동 전체 (Phase 1-3)
  - Core Advisor: types, knowledge(8 chunks), state-filter, knowledge-selector, prompts + 29 tests
  - Backend: Hono 서버, POST /api/chat (Claude API streaming), vite proxy
  - Chat UI: advisor 탭, SSE 스트리밍 채팅, 자동 브리핑/행동 코멘트/전투 조언
- [x] 멀티 AI 제공자 + 설정 마법사
  - 4개 제공자: Claude, OpenAI, Gemini, Ollama (로컬)
  - 브라우저 설정 마법사 (연결 테스트, Ollama 설치 안내/모델 다운로드)
  - .env 파일 또는 환경변수로 사전 설정 가능
- [x] 책사 행동 추천 시스템
  - 매 턴 3개 행동 추천 (confidence 0-100%) + 원클릭 실행
  - `---ACTIONS---` 구분자 기반 파싱 (SLM 호환, graceful fallback)
  - 대화를 통해 추천/confidence 동적 업데이트
- [x] Reasoning 모델 지원 + UX 개선
  - ThinkingFilter: `<think>`/`<thought>` 태그 실시간 스트리밍 필터링
  - 언어 강제 시스템 (GameLanguage: ko/en/zh/ja, 시스템 프롬프트 3중 강제)
  - 응답 대기 중 경과 시간 표시 ("공명이 생각 중입니다… (N초)")
  - 모델명 배지 (제갈량 초상 아래 현재 AI 모델 표시)
- [x] Thinking 모드 토글 + 모델 관리 개선
  - ⚡/🧠 토글: 빠른 응답(기본) / 신중한 답변 전환 (입력창 좌측)
  - 4개 제공자 모두 지원 (Ollama: think, Claude: extended thinking, OpenAI: reasoning_effort, Gemini: thinkingBudget)
  - 추론 모델 자동 필터링 (deep/reason/think/reflect → 설정 마법사에서 제외)
  - 추천 모델 추가 설치 버튼 + 설치 상태 표시
  - scout 파서 지역 ID 검증 (장수명 등 잘못된 파라미터 거부)
  - 실패 행동도 턴 행동 횟수 소모
  - 행동 결과 일괄 코멘트 (다음 턴 브리핑에 포함)

## 아키텍처 핵심

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
턴 시작 → 행동 3회 → 턴 종료 → 요약 모달 → (컷신) → 책사 탭 자동 전환 + 브리핑 → 다음 턴

### 행동 추천 흐름
```
턴 시작 → 책사 브리핑 (서사 3~5문장 + ---ACTIONS--- 블록)
  → parseRecommendations() → 추천 패널 3개 카드 표시
  → 채팅 토론 → 추천/confidence 갱신
  → 원클릭 실행 or 직접 행동 (실패해도 행동 소모)
  → 턴 종료 → 다음 브리핑에 행동 결과 일괄 포함
```

### Thinking 모드
- ⚡ 빠른 응답 (기본): thinking 비활성화, 즉시 답변
- 🧠 신중한 답변: thinking 활성화, 내부 사고 후 답변 (약 2배 소요)
- Ollama: `think` 파라미터, Claude: extended thinking, OpenAI: `reasoning_effort`, Gemini: `thinkingBudget`
- 추론 전용 모델 (exaone-deep 등)은 설정 마법사에서 자동 제외

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
