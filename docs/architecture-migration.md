# AI 삼국지: 아키텍처 마이그레이션 — MCP Apps 전환

**작성**: Luca (2026-02-13)
**확정 사항**: Option D — MCP Apps (MVP) + A2A (Phase 2)
**범위**: 기존 설계 문서 3개의 변경 사항 매핑

---

## 확정된 아키텍처

```
Phase 0-1: MCP Apps 단독
  Claude Desktop / ChatGPT
    └── AI 삼국지 MCP App (UI iframe + 게임 엔진 MCP Server)
        └── Claude가 직접 책사 역할 수행 (도구 호출 + 자연어 조언)
        
  + Ollama 독립 모드 (MCP 없이, 브라우저 앱 + 로컬 API)

Phase 2+: A2A 확장
  복수 책사를 A2A 에이전트로 연결
```

---

## 1. phase0-mvp-spec.md 변경 사항

### 게임 루프: 변경 큼

**기존:**
```
턴 시작 → 게임이 AI API 호출 → 책사 브리핑 표시 → 유저 행동 → 턴 종료
(게임이 능동적으로 AI를 호출)
```

**MCP Apps:**
```
턴 시작 → Claude가 get_turn_state 도구 호출 → Claude가 책사 브리핑 생성
→ 유저가 Claude에게 대화/명령 → Claude가 execute_action 도구 호출 → 턴 종료
(Claude가 능동적으로 게임 도구를 호출)
```

주체가 뒤집힌다. **게임이 AI를 호출**하는 게 아니라 **AI가 게임을 호출**한다.
이건 게임 루프의 제어권이 Claude 쪽에 있다는 뜻인데, 이걸 잘 다뤄야 해.

**제어권 설계:**
- 게임 엔진은 상태 머신만 관리 (순수 로직)
- Claude는 MCP Prompt Template으로 "매 턴 반드시 get_turn_state를 먼저 호출하라" 유도
- 유저 행동은 Claude를 통해 자연어로 전달 → Claude가 파싱 → execute_action 호출
- **또는** MCP App UI에서 직접 도구 호출 (버튼 클릭 → JSON-RPC → 서버)

```
두 가지 행동 경로 (공존):

경로 A: 자연어 (Claude 경유)
  유저: "강하에 징병 2000 해줘"
  → Claude: [execute_action {city:"강하", type:"conscript", amount:2000}]
  → UI 업데이트

경로 B: 직접 조작 (MCP App UI)
  유저: [도시 클릭 → 징병 버튼 → 2000 입력 → 실행]
  → UI에서 직접 MCP 도구 호출 (ui/tool/call JSON-RPC)
  → 결과를 Claude에게도 알림 → Claude가 코멘트
```

경로 B가 가능해야 게임다운 조작감이 나온다. MCP Apps의 양방향 통신이 이걸 지원함.

### 시나리오 데이터: 변경 없음
- 도시, 장수, 이벤트 트리거 데이터 구조는 프로토콜과 무관
- 그대로 유지

### CLI 작업 분배: 소폭 변경

| 기존 | MCP Apps 전환 후 |
|------|-----------------|
| Claude Code: 게임 엔진 + AI 연동 | Claude Code: 게임 엔진 + **MCP Server** + **MCP App UI** |
| Gemini: 리서치 + 테스트 | 동일 + **MCP Apps 호환 테스트** |
| Grok: 독립 리뷰 | 동일 + **UI iframe 제약 테스트** |
| Codex: 데이터 입력 | 동일 |

새로 추가되는 작업:
- MCP Server 구현 (도구 정의, Prompt Template)
- MCP App HTML/JS 개발 (iframe 내 게임 UI)
- MCP JSON-RPC 양방향 통신 구현
- 독립 모드 분기 (Ollama 유저용)

---

## 2. advisor-architecture.md 변경 사항

### Plan/Action/Battle 모드 분리: 개념 유지, 구현 변경

**기존:**
- Plan Mode: 게임이 AI API 호출 (TURN_BRIEFING task)
- Action Mode: 로컬 규칙 기반 (AI 호출 안 함)
- Battle Mode: 게임이 AI API 호출 (BATTLE_ADVICE task)

**MCP Apps:**
- Plan Mode: Claude가 get_turn_state 호출 → 자체 판단으로 브리핑 생성
- Action Mode: UI 직접 조작 + Claude 코멘트 (자연스러운 대화)
- Battle Mode: Claude가 get_battle_state 호출 → 전투 조언 생성

**핵심 차이:** 모드 전환을 게임이 제어하는 게 아니라, 게임 상태에 따라 Claude가 자연스럽게 전환. 이걸 유도하려면 Prompt Template 설계가 중요.

### Bootstrap 6레이어 → MCP Prompt Template + Instructions

**기존 6레이어:**
```
Layer 1: 성격 프롬프트
Layer 2: 시나리오 맥락
Layer 3: 규칙 요약
Layer 4: game_state (필터링됨)
Layer 5: 제약 사항
Layer 6: 첫 TASK
```

**MCP Apps 매핑:**

```
MCP Prompt Template "zhuge_liang_advisor":
  ├── 성격 + 시나리오 + 규칙 + 제약 (Layer 1-3, 5)
  │   → MCP Prompt의 정적 부분
  │   → Claude Desktop 설정에서 "이 프롬프트로 시작" 유도
  │
  └── game_state + TASK (Layer 4, 6)
      → get_turn_state 도구 결과로 동적 주입
      → 매 턴 자동 갱신
```

**또는 더 단순하게:**
Claude Desktop에서 게임 MCP 서버를 추가할 때, 서버가 제공하는 Prompt를 통해 책사 페르소나 전체를 설정. 유저가 "게임 시작"하면 Claude가 자동으로 해당 프롬프트를 로드.

### Knowledge Chunks (RAG): 재설계

**기존:** 10-15개 .txt 파일을 상황별로 선택해서 AI 컨텍스트에 주입
**MCP Apps:** MCP Resource로 변환

```typescript
// 지식 청크를 MCP Resource로 제공
server.resource("knowledge://diplomacy/sun-quan-alliance", {
  name: "손권 동맹 외교 지식",
  mimeType: "text/plain",
});

server.resource("knowledge://battle/fire-attack", {
  name: "화공 전술 지식",
  mimeType: "text/plain",
});

// Claude가 필요할 때 resource를 읽어감
// 또는 도구 결과에 관련 지식을 포함시킴
```

다만, Claude가 어떤 Resource를 언제 읽을지는 Claude의 판단에 의존.
더 확실한 방법: **get_turn_state 결과에 관련 지식 청크를 포함**시키는 것.

```typescript
// get_turn_state 도구가 반환하는 값
{
  turn: 5,
  phase: "preparation",
  cities: [...],
  generals: [...],
  threats: [...],
  // 상황별 지식 자동 포함
  relevant_knowledge: [
    "손권은 현재 조조에 대한 항전파와 항복파로 나뉘어 있다...",
    "노숙이 핵심 중재자이며, 주유가 군사적 자신감을 갖고 있다..."
  ]
}
```

이러면 기존 "상황별 knowledge chunk 선택 로직"을 게임 서버 측에 유지할 수 있어.

### 수치 비공개 정책: 유지

기존 설계의 "AI에게 범주형 전달, 정확한 수치는 비공개" 원칙은 그대로.
get_turn_state가 AI용 필터링된 뷰를 반환하면 됨.

### 로컬 코멘트/넛지: 변경

**기존:** Action Mode에서 규칙 기반 if/else로 로컬 코멘트
**MCP Apps:** UI iframe 내에서 자체 처리 가능

```
유저가 UI에서 "남군 공격" 선택 시:
  → UI 자체적으로 "병력이 부족합니다" 경고 표시 (로컬, AI 호출 없음)
  → 실행하면 결과를 Claude에게 알림
  → Claude가 "주공, 무리한 진격이었습니다..." 코멘트
```

UI의 로컬 로직과 Claude의 내러티브 코멘트가 자연스럽게 분리됨.

---

## 3. numerical-design.md 변경 사항

### 변경 거의 없음

전투 공식, 경영 수식, 밸런싱 수치는 프로토콜과 무관.
게임 엔진 내부 로직이므로 MCP Server 안에 그대로 구현.

유일한 변경: **계산 결과를 어떻게 표시하는가**
- 기존: 게임 UI가 직접 렌더링
- MCP Apps: iframe UI가 렌더링 (동일, 위치만 다름)
- Claude에게 보내는 결과: get_turn_state의 필터링된 뷰 (기존 설계 유지)

---

## 4. 새로 필요한 설계: 듀얼 모드 아키텍처

```
ai-three-kingdoms/
├── core/                          # 공유 코어 (프로토콜 무관)
│   ├── engine/
│   │   ├── game-state.ts          # 상태 관리
│   │   ├── turn-manager.ts        # 턴 로직
│   │   ├── battle.ts              # 전투 계산
│   │   ├── economy.ts             # 경영 계산
│   │   └── scenarios/
│   │       └── red-cliffs.ts
│   ├── advisor/
│   │   ├── prompts.ts             # 책사 프롬프트 텍스트
│   │   ├── state-filter.ts        # state → advisor view
│   │   └── knowledge/             # 지식 청크 텍스트
│   └── ui-components/             # 공유 UI 컴포넌트 (HTML/JS)
│       ├── strategy-map.js
│       ├── city-panel.js
│       └── battle-view.js
│
├── mcp-mode/                      # MCP Apps 모드
│   ├── server.ts                  # MCP Server (도구 + Resource + Prompt)
│   ├── app-views/                 # MCP App HTML (iframe용)
│   │   ├── game-app.html          # 메인 게임 뷰
│   │   └── battle-app.html        # 전투 뷰
│   └── bridge.ts                  # UI ↔ MCP Server 통신
│
├── standalone-mode/               # 독립 앱 모드 (Ollama/API 키)
│   ├── app.ts                     # 웹 서버 (localhost)
│   ├── ai-client.ts               # AI API 직접 호출 (Ollama/Claude/GPT)
│   └── index.html                 # 전체 화면 게임 UI
│
└── shared/
    ├── types.ts                   # 공유 타입 정의
    └── save-manager.ts            # 세이브/로드 (파일시스템)
```

**핵심 원칙:**
- `core/`는 순수 로직, 어떤 모드에서든 동일하게 작동
- `ui-components/`는 웹 컴포넌트로, iframe과 전체 화면 모두에서 재사용
- AI 연동만 모드별로 다름 (MCP vs 직접 API)

---

## 5. MCP App UI 제약과 대응

### 화면 크기

MCP App iframe은 대화창 너비에 제한됨.
기존의 "전략 맵 + 책사 패널 양쪽 분할" 레이아웃은 불가.

**대응: 탭 기반 단일 패널**
```
┌────────────────────────────────┐
│ [맵] [도시] [장수] [외교]      │  ← 탭 네비게이션
├────────────────────────────────┤
│                                │
│   전략 맵 (Canvas)             │
│   ● 강하  ● 하구               │
│   ▲ 적벽  ■ 오림               │
│                                │
│   [확대] [축소] [전체보기]      │
│                                │
├────────────────────────────────┤
│ 턴 12/20 | 병력 15,000 | 군량 8,000 │
│ [내정] [외교] [군사] [턴 종료]  │
└────────────────────────────────┘

책사 대화는 Claude 대화창 자체에서 이루어짐!
→ 별도 책사 패널이 필요 없다
→ 오히려 UI가 깔끔해짐
```

**이건 실은 장점이다:**
기존 설계에서 "책사 채팅 패널"은 게임 UI 안의 하위 요소였는데,
MCP Apps에서는 Claude 대화창 = 책사 채팅이므로, 게임 UI는 순수하게 게임에만 집중.

### 상태 저장

```typescript
// MCP Server에서 로컬 파일시스템 사용
import { readFileSync, writeFileSync } from 'fs';

const SAVE_DIR = path.join(os.homedir(), '.ai-three-kingdoms/saves');

@tool("save_game")
async function saveGame(slotName: string) {
  const state = engine.getFullState();
  writeFileSync(path.join(SAVE_DIR, `${slotName}.json`), JSON.stringify(state));
  return { success: true, slot: slotName };
}

@tool("load_game")
async function loadGame(slotName: string) {
  const data = readFileSync(path.join(SAVE_DIR, `${slotName}.json`), 'utf-8');
  engine.loadState(JSON.parse(data));
  return engine.getAdvisorView(); // 로드 후 상태 반환
}
```

### 개발/테스트 환경

```
개발 시:
  1. standalone-mode로 개발 (브라우저에서 바로 테스트)
  2. core/ 로직 완성 후 mcp-mode/ 래퍼 작성
  3. MCP Inspector로 도구/리소스 테스트
  4. ext-apps basic-host로 UI 테스트
  5. 최종 Claude Desktop 통합 테스트
```

이 순서면 Claude Desktop 없이도 대부분의 개발이 가능하고,
마지막에 MCP 래퍼만 씌우면 됨.

---

## 6. 기존 설계 문서 처리 방안

| 문서 | 상태 | 처리 |
|------|------|------|
| phase0-mvp-spec.md | 게임 루프 재설계 필요 | v2로 업데이트 |
| numerical-design.md | 거의 변경 없음 | 그대로 유지 |
| advisor-architecture.md | 대폭 재설계 필요 | v2로 재작성 |
| **protocol-architecture-analysis.md** | 신규 (오늘) | 참조 문서로 유지 |
| **architecture-migration.md** (이 문서) | 신규 (오늘) | 전환 가이드 |

---

## 다음 단계 제안

1. **advisor-architecture v2** 작성 — MCP Prompt Template + Tool 기반 재설계
2. **phase0-mvp-spec v2** 작성 — MCP Apps 게임 루프 + 듀얼 모드 구조
3. **MCP 도구 목록 확정** — 게임이 제공할 도구/리소스/프롬프트 상세 스펙
4. **UI 프로토타입** — iframe 내 전략 맵 POC (Canvas/SVG)
5. Claude Code 핸드오프 패키지 준비
