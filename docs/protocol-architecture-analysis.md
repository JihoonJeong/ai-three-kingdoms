# AI 삼국지: 프로토콜 아키텍처 분석

**작성**: Luca (2026-02-13)
**목적**: API 키 직접 입력 외의 AI 연동 경로 탐색. MCP, MCP Apps, A2A 프로토콜 분석.

---

## 핵심 발견: MCP Apps가 판을 바꿨다

2026년 1월 26일, MCP Apps Extension(SEP-1865)이 공식 출시되었다.
MCP 서버가 **인터랙티브 HTML UI를 AI 챗 클라이언트 내부에 렌더링**할 수 있게 됐다.

지원 클라이언트: Claude, Claude Desktop, ChatGPT, VS Code, Goose, Postman, MCPJam

이것은 우리 게임에 완전히 새로운 아키텍처 경로를 열어준다.

---

## 아키텍처 후보 비교

### Option A: 기존 설계 (독립 앱 + API 키)

```
┌─────────────────────┐      API 호출 (유저 키)
│  게임 앱 (브라우저)   │ ──────────────────────→ Claude API / OpenAI API
│  - 전략 맵           │ ←────────────────────── 
│  - 도시 관리         │      응답 (JSON)
│  - 전투 화면         │
│  - 책사 채팅 패널     │
└─────────────────────┘
```

- 장점: 완전한 UI 자유도, 독립 실행
- 단점: **유저가 API 키 발급 + 충전 필요** (높은 진입장벽)
- 비용: 종량제 (턴당 ~$0.01-0.05, 모델에 따라)

---

### Option B: MCP Apps — 게임이 MCP 서버가 된다 ⭐ NEW

```
┌──────────────────────────────────────────────┐
│  Claude Desktop / ChatGPT (MCP 클라이언트)     │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  AI 삼국지 MCP App (sandboxed iframe)  │  │
│  │  - 전략 맵 (Canvas/SVG)               │  │
│  │  - 도시 관리 UI                        │  │
│  │  - 전투 화면                           │  │
│  │  - 게임 상태 관리                      │  │
│  └───────────┬────────────────────────────┘  │
│              │ JSON-RPC (postMessage)         │
│              ↕                                │
│  ┌───────────────────┐                       │
│  │  MCP Server (로컬) │                       │
│  │  - 게임 엔진       │                       │
│  │  - 턴 관리         │── Sampling 요청 ──→ Claude LLM (유저 구독)
│  │  - 시나리오 데이터  │←── 책사 응답 ──────    (추가 비용 없음!)
│  │  - 세이브/로드      │                       │
│  └───────────────────┘                       │
└──────────────────────────────────────────────┘
```

**작동 원리:**
1. 유저가 MCP 서버(게임)를 로컬에 설치 (`npx ai-three-kingdoms --stdio`)
2. Claude Desktop MCP 설정에 추가
3. Claude에게 "삼국지 시작" → Claude가 게임 도구 호출
4. MCP App UI가 대화창 내부에 렌더링 (sandboxed iframe)
5. 게임이 책사 응답 필요 시 → **MCP Sampling으로 Claude에게 completion 요청**
6. Claude가 유저 구독으로 응답 생성 → **추가 API 비용 없음**

**장점:**
- 유저 추가 비용 없음 (기존 Claude Pro/Max 구독 활용)
- 인터랙티브 UI 가능 (HTML/JS, Canvas, React 모두 가능)
- 양방향 통신 (UI ↔ Host, Sampling으로 LLM 호출)
- Claude, ChatGPT, VS Code 등 멀티 플랫폼 지원
- 설치가 간단 (npx 한 줄)

**현재 제약:**
- ⚠️ MCP Sampling이 Claude Desktop에서 아직 미지원 (스펙은 확정, 구현 대기중)
- iframe sandbox 내 제약 (localStorage 불가 → 서버 측 상태 관리 필요)
- UI 크기가 대화창에 제한됨 (전체 화면 전략 맵은 어려울 수 있음)
- 클라이언트마다 MCP Apps 지원 수준 다름

**Sampling 미지원 우회 방안:**
- 방안 1: Sampling 지원 전까지 MCP Tool로 우회
  - 게임이 `get_advisor_response` 도구를 제공
  - Claude가 도구를 호출하면 게임 상태를 받아옴
  - Claude 자체가 책사 역할을 직접 수행 (시스템 프롬프트로 유도)
  - Sampling 없이도 작동 가능!
- 방안 2: Elicitation으로 유저 입력 수집
  - 전술 선택, 내정 명령 등을 구조화된 폼으로 받기

---

### Option C: A2A — 멀티 AI 에이전트 오케스트레이션

```
┌──────────────────────────────────────────────┐
│  게임 앱 (브라우저)                            │
│                                              │
│  ┌─────────────┐    A2A Protocol             │
│  │ Client Agent │ ←─────────────→ 제갈량 Agent │ (Claude)
│  │ (오케스트레이터)│ ←─────────────→ 사마의 Agent │ (GPT)
│  │             │ ←─────────────→ 방통 Agent   │ (Gemini)
│  └─────────────┘                             │
│                                              │
│  각 Agent는 Agent Card로 능력 공개:            │
│  {                                           │
│    "name": "제갈량",                          │
│    "skills": ["전략", "외교", "내정"],          │
│    "endpoint": "http://localhost:5001"        │
│  }                                           │
└──────────────────────────────────────────────┘
```

**A2A가 잘 맞는 부분:**
- 복수 책사 시스템 (Phase 2)에서 빛남
- 각 AI 에이전트가 독립적으로 작동, 내부 상태 비공개 (opacity)
- Agent Card로 능력 광고 → 자연스러운 "책사 선택" 메카닉
- Task 기반 비동기 작업 → 턴제 게임에 적합
- 다른 프레임워크/모델 간 표준 통신

**A2A가 안 맞는 부분:**
- API 비용 문제를 해결하지 못함 (각 에이전트가 결국 API 호출)
- 주로 서버-서버 통신용 (유저 구독 활용 경로 없음)
- 게임 + 에이전트 서버 모두 띄워야 함 (복잡도 증가)
- MVP에는 과도한 인프라

---

### Option D: 하이브리드 (MCP Apps + A2A) ⭐⭐ 추천

```
Phase 0-1: MCP Apps 단독
─────────────────────────
  Claude Desktop
    └── AI 삼국지 MCP App (UI + 게임 엔진)
        └── Claude가 직접 책사 역할 (Sampling 또는 Tool 우회)
        
Phase 2+: MCP Apps + A2A 확장
─────────────────────────────
  Claude Desktop
    └── AI 삼국지 MCP App (UI + 게임 엔진)
        ├── Claude 직접 책사 (기본, 무료)
        └── A2A로 외부 AI 에이전트 연결 (선택적)
            ├── GPT 기반 사마의 Agent
            ├── Gemini 기반 방통 Agent  
            └── Ollama 로컬 에이전트 (무료)
```

---

## MCP Apps 게임 아키텍처 상세

### 파일 구조

```
ai-three-kingdoms/
├── package.json
├── src/
│   ├── server.ts              # MCP Server (stdio/HTTP)
│   ├── engine/
│   │   ├── game-state.ts      # 게임 상태 관리
│   │   ├── turn-manager.ts    # 턴 루프
│   │   ├── battle.ts          # 전투 시스템
│   │   └── scenarios/
│   │       └── red-cliffs.ts  # 적벽대전 데이터
│   ├── advisor/
│   │   ├── prompts.ts         # 책사 시스템 프롬프트
│   │   ├── state-filter.ts    # game_state → advisor view 변환
│   │   └── knowledge/         # RAG 지식 청크
│   └── ui/
│       ├── strategy-map.html  # 전략 맵 MCP App
│       ├── city-manage.html   # 도시 관리 MCP App
│       ├── battle-view.html   # 전투 화면 MCP App
│       └── shared/
│           ├── styles.css
│           └── bridge.js      # MCP JSON-RPC 통신 헬퍼
```

### MCP 도구 설계

```typescript
// 게임이 MCP 서버로서 제공하는 도구들

// 1. 게임 시작/로드
@tool("start_game")
// → 시나리오 선택, 게임 초기화, UI 렌더링 시작

// 2. 턴 상태 조회 (Claude가 책사로서 호출)
@tool("get_turn_state")
// → 현재 턴 정보, 도시 상태, 장수 목록, 위협 분석
// → Claude가 이걸 보고 책사 브리핑 생성

// 3. 행동 실행
@tool("execute_action")
// → 내정/외교/군사 명령 실행
// → 결과를 UI에 반영

// 4. 전투 명령
@tool("battle_command")
// → 진형/전술 선택, 전투 턴 진행

// 5. 턴 종료
@tool("end_turn")
// → 이벤트 처리, 상태 갱신, 다음 턴 준비
```

### 핵심 흐름: Sampling 없이도 작동하는 구조

```
유저: "삼국지 시작해줘"

Claude: [start_game 도구 호출]
  → MCP App UI 렌더링 (전략 맵)
  → 게임 초기화

Claude: [get_turn_state 도구 호출]
  → 턴 1 상태 수신
  
Claude: (시스템 프롬프트에 의해 책사 역할 수행)
  "주공, 건안 13년 가을입니다. 조조가 남하하고 있으나
   아직 강하와 하구의 방비가 미흡합니다. 먼저 손권과의
   동맹을 서두르시는 것이 급선무입니다."

유저: "손권에게 사자를 보내라"

Claude: [execute_action 도구 호출: {type: "diplomacy", target: "손권", action: "alliance"}]
  → UI 업데이트 (외교 결과 표시)

Claude: "손권이 호의적으로 답했습니다. 동맹 성사 확률이 높아졌습니다.
        다음으로 강하의 병력을 증강하시겠습니까?"
```

**이 구조의 핵심 통찰:**
- Sampling이 없어도, Claude 자체가 도구를 호출하면서 동시에 책사 역할을 수행
- 시스템 프롬프트 + 게임 상태(도구 결과)만으로 고품질 책사 조언 가능
- MCP App UI가 비주얼을 담당하고, Claude가 내러티브를 담당
- 유저 입장에서는 "Claude와 대화하면서 게임하는" 자연스러운 경험

---

## Sampling이 지원되면 달라지는 점

현재: Claude 자체가 책사 (시스템 프롬프트 기반)
미래: 게임 서버가 독립적으로 Sampling 요청 → 더 정밀한 제어

```
현재 (Sampling 미지원):
  Claude = 대화 상대 + 책사 (하나의 컨텍스트)
  → 장점: 자연스러운 대화 흐름
  → 단점: 책사 프롬프트 = Claude 시스템 프롬프트에 의존

미래 (Sampling 지원):
  Claude = 대화 상대
  게임 서버 → Sampling → Claude = 책사 (별도 컨텍스트)
  → 장점: 책사 프롬프트를 게임이 완전 제어, AI 엔진 교체 가능
  → 단점: 이중 호출로 응답 시간 증가 가능
```

**실용적 결론:** Sampling 없이도 MVP는 충분히 작동한다.
오히려 "Claude와 대화하면서 전략을 짜는" 경험이 더 자연스러울 수 있다.

---

## A2A의 진짜 쓸모: Phase 2 복수 책사 + 개발 과정

### 게임 내: 복수 AI 책사 (Phase 2)

```
A2A Agent Card 예시:

{
  "name": "제갈량",
  "description": "신중하고 정치외교에 특화된 전략가",
  "url": "http://localhost:5001",
  "skills": [
    {"id": "strategy", "name": "전략 분석"},
    {"id": "diplomacy", "name": "외교 조언"},
    {"id": "governance", "name": "내정 제안"}
  ],
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain", "application/json"]
}
```

- 유저가 복수 책사를 두고 각각에게 의견을 구하는 시나리오
- 제갈량(Claude)과 방통(GPT)이 같은 전장을 보고 다른 조언을 하는 경험
- 이때 A2A가 에이전트 간 통신을 표준화

### 게임 개발: 멀티 CLI 오케스트레이션

기존 설계의 Claude Code / Gemini CLI / Grok CLI 협업에도 A2A가 적용 가능:
- 각 CLI가 Agent Card를 발행
- 오케스트레이터가 A2A로 작업 위임
- Task 상태 추적으로 진행률 모니터링

---

## 프로토콜 성숙도 비교

| 항목 | MCP (2025-11-25) | MCP Apps (SEP-1865) | A2A (v0.3) |
|------|-------------------|--------------------|----|
| 스펙 상태 | 안정 (AAIF 산하) | 공식 출시 (2026.1.26) | 안정 (Linux Foundation) |
| 클라이언트 지원 | 광범위 | Claude, ChatGPT, VS Code, Goose | 주로 Google Cloud 생태계 |
| Sampling | 스펙 확정, 클라이언트 구현 대기 | N/A (MCP 기능) | N/A |
| UI 지원 | MCP Apps로 해결 | HTML/JS iframe | 없음 (텍스트/파일/스트림) |
| 우리 MVP 적합도 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ (Phase 2) |

---

## JJ 결정 필요 사항

### 1. 아키텍처 방향
- **Option A**: 독립 앱 + API 키 (기존 설계)
- **Option D**: MCP Apps (MVP) + A2A 확장 (Phase 2) ← Luca 추천
- **양쪽 다**: 독립 앱도 유지하되, MCP Apps를 1순위 배포 경로로

### 2. MVP에서 Claude = 책사 역할 허용?
- MCP Apps 구조에서는 Claude 자체가 도구를 호출하면서 책사 역할도 수행
- "AI 엔진 선택" 기능은 Sampling 지원 후 또는 Phase 2에서
- MVP는 Claude 전용으로 가도 되는가?

### 3. 독립 앱 모드 유지 여부
- MCP Apps와 별도로, API 키 입력 방식의 독립 실행 모드도 유지할까?
- (MCP Apps 미지원 환경/ChatGPT 유저 대비)

### 4. A2A 도입 시점
- Phase 2 (복수 책사)?
- 아니면 개발 과정(멀티 CLI)에서 먼저 실험?

---

## Luca 최종 제안: 단계적 접근

```
Phase 0 (MVP):
  MCP Apps + Claude 직접 책사
  = 비용 없음, 설치 간단, 비주얼 있음
  + Ollama 로컬 모드 (MCP 없이 독립 앱으로)

Phase 1:
  Sampling 지원 시 → 책사 프롬프트 완전 제어
  + 독립 앱 모드 추가 (API 키 방식)
  + ChatGPT MCP Apps 지원 확인

Phase 2:
  A2A로 복수 책사
  + 다양한 AI 엔진 × 캐릭터 조합
  + AI Ludens 데이터 수집 본격화
```

이 접근의 핵심: **유저가 돈을 안 써도 최고의 경험을 할 수 있다.**
Claude Pro($20/월) 또는 ChatGPT Plus($20/월) 구독만 있으면
추가 API 비용 없이 AI 책사와 삼국지를 즐길 수 있다.
