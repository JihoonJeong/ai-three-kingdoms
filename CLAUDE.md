# AI 삼국지 — 적벽대전

AI 책사(제갈량)와 함께하는 턴제 전략 게임. Claude API를 연동하여 제갈량이 실시간 전략 조언을 제공한다.

## Quick Start

```bash
npm install
npm test          # vitest — 142 tests
npm run dev       # vite dev server (web UI)
```

## 프로젝트 구조

```
core/               ← 순수 TypeScript 게임 엔진 (브라우저/서버 공유)
  data/types.ts     ← 모든 타입 정의 (City, General, GameState 등)
  data/scenarios/   ← 시나리오 데이터 (red-cliffs.ts)
  engine/           ← 엔진 모듈 6개 (game-state, turn-manager, action-executor, battle-engine, event-system, victory-judge)
  advisor/          ← AI 책사 모듈 (types, knowledge, state-filter, prompts, knowledge-selector)
  ui/               ← UI 헬퍼 (strategy-map, battle-view, character-display, event-cutscene)

web/                ← Vite 기반 웹 프론트엔드 (Vanilla TS, 프레임워크 없음)
  src/main.ts       ← 앱 진입점 — 모든 컴포넌트 연결
  src/game-controller.ts ← 엔진 6개 모듈 조합
  src/layout.ts     ← 탭 레이아웃 (map/city/general/diplomacy/log)
  src/renderer.ts   ← DOM 헬퍼 (h(), assetUrl(), createGauge())
  src/screens/      ← 7개 화면 (map, city, general, diplomacy, log, battle, cutscene)
  src/components/   ← UI 컴포넌트 (action-menu, advisor-panel, turn-summary)
  src/styles/       ← CSS (main, ink-wash, battle, cutscene)

server/             ← 백엔드 서버 (Hono) — Claude API 프록시 [구현 예정]
assets/             ← 이미지 에셋 (Vite publicDir로 서빙, /map/background.webp 형태)
docs/               ← 설계 문서
```

## 핵심 규칙

- **타입**: `core/data/types.ts`가 single source of truth. GameState, City, General 등 모든 타입이 여기에.
- **에셋 경로**: core에서 `assets/...` 반환 → web에서 `assetUrl()`로 `assets/` prefix 제거하여 사용.
- **테스트**: `core/**/*.test.ts`, vitest, 글로벌 API 사용 (`describe`, `it`, `expect`).
- **모듈**: ES modules (`"type": "module"`), import 시 `.js` 확장자 필수.
- **한국어**: 게임 내 텍스트, 커밋 메시지 모두 한국어.

## 현재 진행 상황

### 완료
- [x] Week 1: 엔진 코어 (6 모듈, 142 tests)
- [x] 비주얼 인프라 (디자인 가이드, 에셋 19개)
- [x] 웹 UI 프로토타입 (탭 레이아웃, 전투 오버레이, 컷신, 턴 요약)
- [x] AI 책사 모듈 Phase 1 (types, knowledge, state-filter, prompts, knowledge-selector)

### 진행 중 — AI 책사(제갈량) 연동
계획 파일: `.claude/plans/warm-roaming-dusk.md`

**Phase 1: Core Advisor** ✅
- `core/advisor/types.ts` — AdvisorView, ChatMessage, ChatRequest 타입
- `core/advisor/knowledge.ts` — 적벽대전 배경지식 8 chunks
- `core/advisor/state-filter.ts` — GameState → AdvisorView (범주형 변환)
- `core/advisor/knowledge-selector.ts` — 상황별 지식 최대 3개 선택
- `core/advisor/prompts.ts` — 제갈량 페르소나 + system prompt 빌더
- **TODO**: state-filter.test.ts, knowledge-selector.test.ts, prompts.test.ts

**Phase 2: Backend Server** (미시작)
- `server/index.ts` — Hono, POST /api/chat, Claude API streaming
- deps: `@anthropic-ai/sdk`, `hono`, `@hono/node-server`
- `web/vite.config.ts`에 `/api` proxy 추가
- `package.json` scripts: `concurrently` 사용 dev:web + dev:server

**Phase 3: Chat UI** (미시작)
- `web/src/screens/advisor-screen.ts` — 채팅 화면
- `web/src/services/advisor-api.ts` — SSE 스트리밍 클라이언트
- `web/src/styles/advisor.css`
- `layout.ts`에 'advisor' 탭 추가
- `main.ts` 통합: 턴 브리핑, 행동 코멘트, 전투 조언, 자유 대화

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
턴 시작 → 행동 3회 → 턴 종료 → 요약 모달 → (컷신) → 제갈량 브리핑 → 다음 턴

## 코드 스타일

- Vanilla TypeScript, 프레임워크 없음
- DOM은 `h()` 헬퍼로 생성 (`renderer.ts`)
- CSS 변수 기반 수묵화 테마 (`--color-ink`, `--color-hanji`, `--color-liu/cao/sun`)
- 클래스 기반 컴포넌트 (Screen, Component 패턴)
- 콜백 패턴: `onXxx(cb)` 메서드로 이벤트 핸들링
