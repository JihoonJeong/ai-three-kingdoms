# AI 삼국지: Phase 0 MVP 스펙 v2 — MCP Apps 기반

**작성**: Luca (2026-02-13)
**아키텍처**: Option D 확정 — MCP Apps (MVP) + A2A (Phase 2)
**관련 문서**: advisor-architecture-v2.md, numerical-design.md (변경 없음), protocol-architecture-analysis.md

---

## MVP 정의

### 검증 질문 (변경 없음)
**"AI 책사와 전략을 짜는 게 재밌는가?"**

### MVP 범위

| 항목 | 범위 |
|------|------|
| 시나리오 | 적벽대전 1개 |
| 도시 | 5개 (강하, 하구, 시상, 남군, 장릉) |
| 장수 | 15명 (아군 8 + 적군 5 + 동맹 2) |
| 턴 수 | 15~20턴, 30분~1시간 |
| AI 책사 | Claude 직접 수행 (MCP 모드) / 선택 엔진 (독립 모드) |
| 배포 모드 | MCP Apps (1순위) + 독립 앱 (Ollama용) |

---

## 게임 루프 v2

### MCP 모드 루프

```
유저: "삼국지 시작해줘" (또는 MCP Prompt Template 선택)
  │
  ▼
Claude: start_game 호출 → MCP App UI 렌더링
  │
  ▼
┌─── 턴 반복 ──────────────────────────────────────────┐
│                                                       │
│  1. Claude: get_turn_state 호출                        │
│     → 상황 파악 + 지식 청크 수신                        │
│                                                       │
│  2. Claude: 브리핑 생성 (자연어)                        │
│     "주공, 이번 턴의 핵심은..."                         │
│                                                       │
│  3. 유저 행동 (반복, 행동 횟수 소진까지)                 │
│     ├─ 경로 A: Claude에게 자연어 → Claude가 도구 호출   │
│     └─ 경로 B: UI에서 직접 조작 → Claude에 알림         │
│                                                       │
│  4. 전투 발생 시                                       │
│     ├─ Claude: get_battle_state 호출 → 전술 조언       │
│     ├─ 유저: 전술 선택 (자연어 또는 UI)                 │
│     ├─ Claude: battle_command 호출                     │
│     └─ 반복 (2~4 전투 턴)                              │
│                                                       │
│  5. 유저: "턴 마쳐" 또는 UI [턴 종료] 클릭              │
│     → Claude: end_turn 호출                            │
│     → 이벤트 발생 → Claude 분석/코멘트                  │
│                                                       │
└───────────────────────────────────────────────────────┘
  │
  ▼
게임 종료 (승리/패배/시간 초과)
  → Claude: 결과 총평 생성
  → 리포트 내보내기 (선택적)
```

### 독립 모드 루프

```
유저: 브라우저에서 localhost 접속
  │
  ▼
게임 UI: 시나리오 선택 + AI 엔진 선택 (Ollama/API 키)
  │
  ▼
┌─── 턴 반복 ──────────────────────────────────────────┐
│                                                       │
│  1. 게임 엔진: state-filter → advisor view 생성        │
│  2. 게임 → AI API: Bootstrap 프롬프트 + state → 브리핑  │
│  3. 책사 패널에 브리핑 표시                              │
│  4. 유저: UI에서 행동 (+ 채팅으로 질문 가능)             │
│  5. 전투: UI 전투 화면 + AI 조언 호출                   │
│  6. 턴 종료: 이벤트 처리 + AI 반응                      │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 핵심 차이

| 항목 | MCP 모드 | 독립 모드 |
|------|----------|----------|
| AI 호출 주체 | Claude (도구 호출) | 게임 엔진 (API 직접 호출) |
| 책사 대화 | Claude 대화창 | 게임 내 채팅 패널 |
| 유저 입력 | 자연어 + UI | UI + 채팅 |
| 추가 비용 | 없음 (구독 활용) | Ollama 무료 / API 종량제 |
| UI 위치 | Claude 대화창 내 iframe | 전체 화면 브라우저 |
| AI 엔진 선택 | Claude 고정 (MVP) | Ollama/Claude/GPT 선택 |

### 게임 엔진은 동일

양쪽 모드에서 `core/engine/`의 로직은 100% 동일:
- 턴 관리, 상태 머신
- 전투 계산 (numerical-design.md 그대로)
- 이벤트 트리거
- 세이브/로드

---

## 행동 시스템

### 턴당 행동 횟수

MVP: **턴당 3회 행동** (내정/외교/군사 혼합 가능)

- 단순화를 위해 카테고리별 제한 없이 총량 제한
- "징병 1회 + 외교 1회 + 정찰 1회" 또는 "징병 3회" 모두 가능
- 전투는 행동 횟수와 별도 (진군 명령이 행동 1회 소모, 전투 자체는 자동 진행)

### 행동 목록

**내정 (domestic)**

| 행동 | 파라미터 | 효과 |
|------|----------|------|
| conscript (징병) | city, scale(소/중/대) | 병력↑, 민심↓, 군량 소모 |
| develop (개발) | city, focus(농업/상업/방어) | 해당 분야↑, 시간 소요 |
| train (훈련) | city | 부대 전투력↑ |
| recruit (등용) | city, target_general | 장수 영입 시도 |
| assign (배치) | general, destination | 장수 이동 |

**외교 (diplomacy)**

| 행동 | 파라미터 | 효과 |
|------|----------|------|
| send_envoy (사절) | target, purpose | 관계 변화, 동맹 진전 |
| persuade (설득) | target_general, method | 적장 회유 시도 |
| threaten (위협) | target | 관계 악화, 일시 억제 |
| gift (선물) | target, amount | 관계 개선, 자원 소모 |

**군사 (military)**

| 행동 | 파라미터 | 효과 |
|------|----------|------|
| march (진군) | from, to, generals, troops_scale | 부대 이동, 전투 발생 가능 |
| scout (정찰) | target_city | 적 정보 갱신 |
| fortify (방비) | city | 방어력↑ |
| ambush (매복) | location, general | 적 진군 경로에 매복 설치 |

---

## 전투 시스템 (변경 없음, UI 위치만 변경)

### 전투 흐름

```
진군 명령 → 적과 조우 → 전투 돌입
  │
  ▼
전투 턴 반복 (2~4턴):
  1. 상황 표시 (get_battle_state)
     - 양군 병력/사기/진형
     - 지형/날씨
     - 가용 전술
  
  2. 책사 조언
     MCP: Claude가 자연어로 조언
     독립: 게임이 AI API 호출 → 채팅 패널에 표시
  
  3. 전술 선택
     MCP: 유저가 자연어 또는 UI에서 선택
     독립: UI에서 선택
  
  4. 결과 계산 (numerical-design.md 공식)
  
  5. 전투 종료 판정
     → 한쪽 병력 30% 이하 또는 사기 붕괴 → 패배/퇴각
     → 최대 전투 턴 초과 → 대치/퇴각
  │
  ▼
전투 종료: 승/패/퇴각
  → 포로, 전리품, 장수 부상/사망 처리
  → 영토 변경 (있으면)
```

### 전술 목록 (MVP)

| 전술 | 조건 | 효과 |
|------|------|------|
| 정면돌격 | 없음 | 높은 피해 교환, 사기전 |
| 화공 | 적 밀집 + 풍향 유리 | 대규모 피해, 실패 시 역효과 |
| 매복 | 사전 매복 배치 | 기습 피해 + 혼란 |
| 수성 | 방어 시 | 피해 감소, 시간 벌기 |
| 위장퇴각 | 지략 높은 장수 | 적 유인 후 반격 |
| 돌격 | 무력 높은 장수 | 적장 일기토 유도 |
| 화선 | 수상전 + 인화물 | 적 함선 소각 |

---

## 적벽대전 시나리오 데이터

### 도시 (5개)

```typescript
const CITIES: City[] = [
  {
    id: "gangha",
    name: "강하",
    owner: "유비",
    position: { x: 30, y: 50 },  // 맵 좌표 (%)
    population: "중도시",
    development: { agriculture: "B", commerce: "C", defense: "B" },
    troops: { infantry: 5000, cavalry: 1000, navy: 2000 },
    food: 8000,
    adjacent: ["hagu", "nanjun"],
    description: "장강 남안의 거점. 유비군의 본거지.",
    strategic_note: "수군 기지로 활용 가능. 하구와 함께 장강 방어선 형성."
  },
  {
    id: "hagu",
    name: "하구",
    owner: "유비",
    position: { x: 35, y: 45 },
    population: "소도시",
    development: { agriculture: "C", commerce: "C", defense: "C" },
    troops: { infantry: 3000, cavalry: 500, navy: 1500 },
    food: 4000,
    adjacent: ["gangha", "chibi", "sishang"],
    description: "장강 합류점의 작은 성. 적벽 전선의 전초기지.",
    strategic_note: "적벽으로의 진출 거점. 방비가 취약하므로 보강 필요."
  },
  {
    id: "sishang",
    name: "시상",
    owner: "손권",
    position: { x: 45, y: 55 },
    population: "중도시",
    development: { agriculture: "B", commerce: "B", defense: "B" },
    troops: { infantry: 8000, cavalry: 2000, navy: 5000 },
    food: 12000,
    adjacent: ["hagu", "chibi"],
    description: "손권군의 전방 기지. 주유가 지휘.",
    strategic_note: "동맹군 주력 집결지. 손권과의 외교가 이곳의 협력을 결정."
  },
  {
    id: "nanjun",
    name: "남군",
    owner: "조조",
    position: { x: 25, y: 35 },
    population: "대도시",
    development: { agriculture: "A", commerce: "A", defense: "A" },
    troops: { infantry: 15000, cavalry: 5000, navy: 3000 },
    food: 20000,
    adjacent: ["gangha", "jiangling"],
    description: "형주의 핵심 도시. 현재 조조가 장악.",
    strategic_note: "적벽 승리 후 최우선 점령 대상. 형주 지배의 관건."
  },
  {
    id: "jiangling",
    name: "장릉",
    owner: "조조",
    position: { x: 20, y: 25 },
    population: "중도시",
    development: { agriculture: "B", commerce: "B", defense: "B" },
    troops: { infantry: 8000, cavalry: 3000, navy: 1000 },
    food: 10000,
    adjacent: ["nanjun"],
    description: "형주 서부의 요충지.",
    strategic_note: "남군 점령 후 연쇄 점령 가능."
  }
];

// 전투 지역 (도시가 아닌 전장)
const BATTLEFIELDS = [
  {
    id: "chibi",
    name: "적벽",
    position: { x: 40, y: 40 },
    terrain: "수상",
    description: "장강 위의 결전지. 화공에 유리한 지형.",
    adjacent_cities: ["hagu", "sishang"],
    special: "연환진 시 화공 효과 2배"
  }
];
```

### 장수 (15명)

```typescript
const GENERALS: General[] = [
  // ━━━ 아군 (유비 진영) 8명 ━━━
  {
    id: "liubei", name: "유비", courtesy: "현덕",
    faction: "유비", role: "군주",
    abilities: { command: "B", martial: "C", intellect: "B", politics: "A", charisma: "S" },
    skills: ["인덕", "의병"],
    loyalty: "—",
    location: "강하",
    historical_note: "한실 종친. 인의로 사람을 모으나 근거지가 불안정."
  },
  {
    id: "guanyu", name: "관우", courtesy: "운장",
    faction: "유비", role: "무장",
    abilities: { command: "A", martial: "S", intellect: "B", politics: "C", charisma: "A" },
    skills: ["위풍", "수전", "돌격"],
    loyalty: "절대",
    location: "강하",
    historical_note: "만인지적. 의리의 화신. 수전에도 능함."
  },
  {
    id: "zhangfei", name: "장비", courtesy: "익덕",
    faction: "유비", role: "무장",
    abilities: { command: "B", martial: "S", intellect: "D", politics: "D", charisma: "B" },
    skills: ["위풍", "돌격", "일기토"],
    loyalty: "절대",
    location: "강하",
    historical_note: "맹장. 적진을 두려움에 떨게 하나 병사 다루기가 거침."
  },
  {
    id: "zhaoyun", name: "조자룡", courtesy: "자룡",
    faction: "유비", role: "무장",
    abilities: { command: "A", martial: "A", intellect: "B", politics: "C", charisma: "A" },
    skills: ["돌격", "호위", "기병"],
    loyalty: "절대",
    location: "강하",
    historical_note: "담력과 지략을 겸비한 명장. 장판파에서 아두를 구출."
  },
  {
    id: "zhugeliang", name: "제갈량", courtesy: "공명",
    faction: "유비", role: "책사",
    abilities: { command: "A", martial: "D", intellect: "S", politics: "S", charisma: "A" },
    skills: ["화공", "기략", "외교", "내정"],
    loyalty: "절대",
    location: "강하",
    historical_note: "와룡. 천하삼분지계의 주창자. 이 게임에서는 AI 책사로 구현."
  },
  {
    id: "huangzhong", name: "황충", courtesy: "한승",
    faction: "유비", role: "무장",
    abilities: { command: "B", martial: "A", intellect: "C", politics: "D", charisma: "C" },
    skills: ["궁술", "돌격"],
    loyalty: "높음",
    location: "강하",
    historical_note: "노장. 궁술이 뛰어나고 용맹하나 나이가 많다."
  },
  {
    id: "weiyuan", name: "위연", courtesy: "문장",
    faction: "유비", role: "무장",
    abilities: { command: "B", martial: "A", intellect: "C", politics: "D", charisma: "C" },
    skills: ["돌격", "기습"],
    loyalty: "보통",
    location: "하구",
    historical_note: "용맹하나 반골의 상이 있다는 평. 야심이 있으나 능력도 있음."
  },
  {
    id: "jianshou", name: "간옹", courtesy: "헌화",
    faction: "유비", role: "문관",
    abilities: { command: "D", martial: "D", intellect: "B", politics: "A", charisma: "B" },
    skills: ["외교", "내정"],
    loyalty: "높음",
    location: "강하",
    historical_note: "유비의 오랜 참모. 외교와 내정에 능함."
  },

  // ━━━ 적군 (조조 진영) 5명 ━━━
  {
    id: "caocao", name: "조조", courtesy: "맹덕",
    faction: "조조", role: "군주",
    abilities: { command: "S", martial: "A", intellect: "S", politics: "S", charisma: "A" },
    skills: ["기략", "위풍", "내정"],
    loyalty: "—",
    location: "남군",
    historical_note: "난세의 간웅. 문무를 겸비하나 오만함이 약점."
  },
  {
    id: "xiahouyuan", name: "하후연", courtesy: "묘재",
    faction: "조조", role: "무장",
    abilities: { command: "A", martial: "A", intellect: "C", politics: "D", charisma: "B" },
    skills: ["기병", "돌격", "속전"],
    loyalty: "절대",
    location: "남군",
    historical_note: "조조의 친족 장수. 기습과 속전속결에 능함."
  },
  {
    id: "caoren", name: "조인", courtesy: "자효",
    faction: "조조", role: "무장",
    abilities: { command: "A", martial: "B", intellect: "B", politics: "C", charisma: "B" },
    skills: ["수성", "기병"],
    loyalty: "절대",
    location: "장릉",
    historical_note: "조조의 사촌. 수성전의 달인."
  },
  {
    id: "caimao", name: "채모", courtesy: "덕규",
    faction: "조조", role: "무장",
    abilities: { command: "B", martial: "C", intellect: "C", politics: "C", charisma: "C" },
    skills: ["수전"],
    loyalty: "보통",
    location: "남군",
    historical_note: "형주 항복파. 조조 수군도독. 제거하면 적 수군 약화."
  },
  {
    id: "zhangyun", name: "장윤", courtesy: "—",
    faction: "조조", role: "무장",
    abilities: { command: "B", martial: "C", intellect: "C", politics: "D", charisma: "C" },
    skills: ["수전"],
    loyalty: "보통",
    location: "남군",
    historical_note: "채모와 함께 조조 수군 지휘. 수전 경험자."
  },

  // ━━━ 동맹 (손권 진영) 2명 (게임에서 직접 조작 불가) ━━━
  {
    id: "sunquan", name: "손권", courtesy: "중모",
    faction: "손권", role: "군주",
    abilities: { command: "B", martial: "C", intellect: "A", politics: "A", charisma: "A" },
    skills: ["외교", "인재등용"],
    loyalty: "—",
    location: "시상",
    historical_note: "강동의 주인. 항전/항복 사이에서 결단을 내려야 하는 위치."
  },
  {
    id: "zhouyu", name: "주유", courtesy: "공근",
    faction: "손권", role: "책사/무장",
    abilities: { command: "S", martial: "B", intellect: "A", politics: "B", charisma: "A" },
    skills: ["화공", "수전", "기략"],
    loyalty: "절대",
    location: "시상",
    historical_note: "오군의 대도독. 적벽의 실질적 지휘관. 자존심이 강함."
  }
];
```

### 이벤트 트리거

```typescript
interface GameEvent {
  id: string;
  trigger: EventTrigger;
  description: string;
  effects: EventEffect[];
  advisor_knowledge?: string;  // 이벤트 발생 시 추가 지식 청크
}

const EVENTS: GameEvent[] = [
  // ━━━ Phase A: 전쟁 준비 ━━━
  {
    id: "cao_advance",
    trigger: { type: "turn", turn: 2 },
    description: "조조의 선봉이 당양을 통과했다는 보고가 들어왔습니다.",
    effects: [
      { type: "enemy_intel_update", data: { reliability: "대략적" } },
      { type: "urgency_increase" }
    ]
  },
  {
    id: "lusu_visit",
    trigger: { type: "turn", turn: 3, condition: "alliance_not_started" },
    description: "노숙이 자발적으로 유비 진영을 방문합니다. 동맹 논의의 기회.",
    effects: [
      { type: "diplomacy_opportunity", target: "손권", bonus: 20 }
    ],
    advisor_knowledge: "sunquan_diplomacy"
  },
  {
    id: "plague_in_cao_army",
    trigger: { type: "turn", turn: 5 },
    description: "조조 진영에 수토불복으로 전염병이 돌고 있다는 첩보.",
    effects: [
      { type: "enemy_debuff", target: "조조", stat: "morale", amount: -15 },
      { type: "enemy_intel_update", data: { weakness: "질병" } }
    ],
    advisor_knowledge: "cao_cao_navy_weakness"
  },
  {
    id: "chain_formation",
    trigger: { type: "turn", turn: 7, condition: "caimao_alive" },
    description: "조조가 채모의 건의를 받아 연환진을 펼쳤습니다.",
    effects: [
      { type: "enemy_formation", formation: "연환진" },
      { type: "unlock_tactic", tactic: "화공", bonus_multiplier: 2.0 }
    ],
    advisor_knowledge: "fire_attack_tactics"
  },
  
  // ━━━ Phase B: 적벽 결전 ━━━
  {
    id: "southeast_wind",
    trigger: { type: "turn_range", min: 10, max: 14, probability: 0.7 },
    description: "동남풍이 불기 시작합니다!",
    effects: [
      { type: "weather_change", weather: "동남풍" },
      { type: "tactic_bonus", tactic: "화공", bonus: 50 }
    ],
    advisor_knowledge: "southeast_wind"
  },
  {
    id: "huang_gai_defection",
    trigger: { type: "condition", condition: "alliance_strong_and_turn>=8" },
    description: "황개가 거짓 투항 계책을 제안해왔습니다.",
    effects: [
      { type: "special_tactic_available", tactic: "거짓투항_화공" }
    ]
  },
  
  // ━━━ Phase C: 후속전 ━━━
  {
    id: "jingzhou_surrender",
    trigger: { type: "condition", condition: "chibi_victory" },
    description: "적벽 대승 소식에 형주 4군의 태수들이 동요합니다.",
    effects: [
      { type: "diplomacy_opportunity", target: "형주4군", bonus: 50 }
    ],
    advisor_knowledge: "jingzhou_politics"
  },
  {
    id: "cao_cao_retreat",
    trigger: { type: "condition", condition: "chibi_victory" },
    description: "조조가 화용도를 통해 퇴각하고 있습니다!",
    effects: [
      { type: "pursuit_opportunity", target: "조조", location: "화용도" }
    ]
  }
];
```

---

## Phase 진행 구조

### Phase A: 전쟁 준비 (턴 1~8)

**목표:** 내정 강화, 손권 동맹 체결, 정보 수집
**가용 행동:** 내정 전부, 외교 전부, 군사(정찰/방비/배치)
**핵심 이벤트:** 노숙 방문, 조조 남하, 전염병 보고, 연환진

**승리 조건 진행:**
- 손권 동맹 체결 → Phase B 진입 가능
- 동맹 실패 → 독자 항전 (난이도 급상승) 또는 항복 (게임 오버)

### Phase B: 적벽 결전 (턴 9~13)

**목표:** 적벽에서 조조 수군 격파
**가용 행동:** 군사 중심, 외교(동맹군 협조)
**핵심 이벤트:** 동남풍, 황개 거짓투항, 적벽 전투

**전투 흐름:**
1. 유비-손권 연합군 적벽 집결
2. 수상전 전개
3. 화공 기회 포착 (동남풍 + 연환진)
4. 결전

**승리 조건:** 조조 수군 주력 격파
**패배 조건:** 아군 주력 궤멸 또는 동맹 와해

### Phase C: 후속전 (턴 14~20)

**목표:** 형주 확보, 세력 기반 마련
**가용 행동:** 전부 (영토 확장 국면)
**핵심 이벤트:** 형주 항복, 조조 퇴각, 영토 분배

**승리 판정 (게임 종료 시):**

| 등급 | 조건 |
|------|------|
| S | 적벽 승리 + 남군·장릉 점령 + 손권 동맹 유지 + 장수 무손실 |
| A | 적벽 승리 + 남군 점령 + 손권 동맹 유지 |
| B | 적벽 승리 + 형주 일부 확보 |
| C | 적벽 승리 (영토 미확보) |
| D | 적벽 패배, 유비 생존 |
| F | 유비 사망 또는 항복 |

---

## MCP App UI 설계

### 레이아웃 (iframe 내, 세로형)

```
┌────────────────────────────────────┐
│ 적벽대전 — 턴 5/20  건안13년 가을   │
│ Phase A: 전쟁 준비                  │
├────────────────────────────────────┤
│ [맵] [도시] [장수] [외교] [기록]    │ ← 탭
├────────────────────────────────────┤
│                                    │
│   ┌─────────────────────────┐     │
│   │                         │     │
│   │     전략 맵 (Canvas)    │     │
│   │                         │     │
│   │  ● 강하    ● 하구       │     │
│   │       ▲ 적벽            │     │
│   │  ◆ 시상                 │     │
│   │       ■ 남군  ■ 장릉    │     │
│   │                         │     │
│   └─────────────────────────┘     │
│                                    │
│  ● 아군  ◆ 동맹  ■ 적군           │
│                                    │
├────────────────────────────────────┤
│ 병력: 12,500  군량: 8,000          │
│ 남은 행동: 3/3                     │
│                                    │
│ [내정▼] [외교▼] [군사▼] [턴 종료]  │
└────────────────────────────────────┘

(책사 대화는 이 UI 바깥, Claude 대화창에서)
```

### 탭별 화면

**맵 탭:** 전략 맵 + 도시 마커 + 군대 이동선 + 간략 상태 바
**도시 탭:** 선택한 도시 상세 (인구, 개발, 병력, 주둔 장수) + 행동 버튼
**장수 탭:** 장수 목록 (능력치, 위치, 상태) + 배치/등용 버튼
**외교 탭:** 세력 관계도 + 외교 행동 버튼
**기록 탭:** 턴별 행동 로그 + 이벤트 기록

### 전투 화면 (전투 시 자동 전환)

```
┌────────────────────────────────────┐
│ ⚔️ 적벽 전투 — 전투 턴 2/4         │
├────────────────────────────────────┤
│                                    │
│  아군          vs        적군      │
│  ━━━━━━━━━━          ━━━━━━━━━━   │
│  병력: 충분            병력: 우세   │
│  사기: 높음            사기: 보통   │
│  진형: 학익진          진형: 연환진 │
│                                    │
│  [관우] [장비] [조자룡]             │
│         vs                         │
│  [하후연] [채모] [장윤]             │
│                                    │
├────────────────────────────────────┤
│ 날씨: 동남풍 🌬️                    │
│ 지형: 수상                         │
│                                    │
│ 가용 전술:                         │
│  [🔥 화공] [⚔️ 돌격] [🛡️ 수성]    │
│  [🏹 화선] [🚩 위장퇴각]           │
│                                    │
│            [실행]                   │
└────────────────────────────────────┘
```

---

## 듀얼 모드 코드 구조

```
ai-three-kingdoms/
│
├── package.json
├── tsconfig.json
│
├── core/                              # 공유 코어 (모드 무관)
│   ├── engine/
│   │   ├── game-state.ts              # GameState 타입 + 관리
│   │   ├── turn-manager.ts            # 턴 진행 로직
│   │   ├── action-executor.ts         # 행동 실행 (내정/외교/군사)
│   │   ├── battle-engine.ts           # 전투 계산
│   │   ├── event-system.ts            # 이벤트 트리거 + 처리
│   │   └── victory-judge.ts           # 승리 조건 판정
│   │
│   ├── data/
│   │   ├── scenarios/
│   │   │   └── red-cliffs.ts          # 적벽대전 (도시, 장수, 이벤트)
│   │   └── types.ts                   # 공유 타입 정의
│   │
│   ├── advisor/
│   │   ├── prompts.ts                 # 책사 프롬프트 텍스트
│   │   ├── state-filter.ts            # GameState → AdvisorView 변환
│   │   ├── knowledge.ts               # 지식 청크 (상수)
│   │   └── knowledge-selector.ts      # 상황별 지식 선택 로직
│   │
│   ├── ui/                            # 공유 UI 컴포넌트
│   │   ├── strategy-map.ts            # Canvas 전략 맵
│   │   ├── city-panel.ts              # 도시 관리 패널
│   │   ├── battle-view.ts             # 전투 화면
│   │   ├── general-list.ts            # 장수 목록
│   │   └── styles.css                 # 공유 스타일 (수묵화 톤)
│   │
│   └── save/
│       └── save-manager.ts            # 세이브/로드 (파일시스템)
│
├── mcp-mode/                          # MCP Apps 모드
│   ├── server.ts                      # MCP Server 진입점
│   ├── tools/
│   │   ├── game-tools.ts              # start/save/load/list_saves
│   │   ├── turn-tools.ts              # get_turn_state/end_turn
│   │   ├── action-tools.ts            # execute_action
│   │   ├── battle-tools.ts            # get_battle_state/battle_command
│   │   └── info-tools.ts             # get_general_info/get_city_detail
│   ├── prompts/
│   │   └── advisor-prompt.ts          # MCP Prompt Template 정의
│   ├── resources/
│   │   └── knowledge-resources.ts     # MCP Resource (선택적)
│   └── apps/
│       ├── game-app.html              # 메인 게임 UI (MCP App)
│       ├── battle-app.html            # 전투 UI (MCP App)
│       └── bridge.js                  # MCP JSON-RPC 통신 헬퍼
│
├── standalone-mode/                   # 독립 앱 모드
│   ├── server.ts                      # Express/로컬 웹 서버
│   ├── ai-client.ts                   # AI API 클라이언트 (Ollama/Claude/GPT)
│   ├── advisor-bootstrap.ts           # v1 Bootstrap 6레이어 조립
│   ├── public/
│   │   ├── index.html                 # 전체 화면 게임 UI
│   │   ├── app.js                     # 프론트엔드 로직
│   │   └── chat-panel.js              # 책사 채팅 패널
│   └── config/
│       └── ai-config.ts               # AI 엔진 설정 (키, 모델 등)
│
└── scripts/
    ├── dev.sh                         # 개발 서버 시작 (독립 모드)
    ├── build-mcp.sh                   # MCP 서버 빌드
    └── test/
        ├── engine-test.ts             # 엔진 단위 테스트
        ├── balance-test.ts            # 밸런스 시뮬레이션
        └── advisor-test.ts            # 프롬프트 품질 테스트
```

---

## CLI 작업 분배 v2

### Claude Code (오케스트레이터 + 핵심 코딩)

**1순위 (MVP 크리티컬):**
- `core/engine/` 전체 — 게임 상태 머신, 턴 관리, 행동 실행, 전투 계산
- `mcp-mode/server.ts` + `tools/` — MCP 서버, 도구 정의
- `mcp-mode/prompts/` — 책사 Prompt Template
- `core/advisor/` — 프롬프트, state-filter, knowledge
- 전체 통합 + 테스트

**2순위:**
- `standalone-mode/` — 독립 모드 래퍼
- `mcp-mode/apps/` — MCP App HTML (UI)

### Gemini CLI (리서치 + 검증)

- 장수 능력치 역사 고증 + 밸런싱 검증
- 시나리오 이벤트 역사적 정확성 리뷰
- MCP Apps 호환성 테스트 (Claude Desktop, VS Code 등)
- 전투 밸런스 시뮬레이션 (1000판 자동 시뮬)
- 코드 리뷰 (보안, 성능)

### Grok CLI (독립 리뷰 + 대안)

- 게임 플레이 시뮬레이션 (AI가 실제로 플레이해서 밸런스 문제 발견)
- iframe UI 제약 테스트 (다양한 화면 크기, 브라우저)
- 엣지 케이스: "유저가 매 턴 아무것도 안 하면?", "행동을 모두 징병에 쓰면?"
- 독립 모드 UX 검증

### Codex CLI (보조 구현)

- `core/data/scenarios/red-cliffs.ts` — 장수 15명 데이터 입력
- `core/advisor/knowledge.ts` — 지식 청크 텍스트 작성
- `core/ui/styles.css` — 수묵화 톤 CSS
- 이벤트 텍스트 작성 (한국어 + 고풍 문체)

---

## 개발 순서

```
Week 1: 엔진 코어
  ├── Day 1-2: game-state + turn-manager + types
  ├── Day 3-4: action-executor + battle-engine
  └── Day 5: event-system + victory-judge + 단위 테스트

Week 2: AI 연동 + MCP
  ├── Day 1-2: state-filter + knowledge + prompts
  ├── Day 3-4: MCP server + tools 정의
  └── Day 5: Prompt Template 테스트 (Claude에 직접)

Week 3: UI + 통합
  ├── Day 1-2: 전략 맵 (Canvas) + 기본 UI
  ├── Day 3: MCP App 래핑 (iframe 통신)
  ├── Day 4: 독립 모드 래퍼
  └── Day 5: 통합 테스트 + 밸런싱

Week 4: 폴리싱 + 배포
  ├── Day 1-2: 비주얼 (수묵화 톤, 애니메이션)
  ├── Day 3: 세이브/로드 + 리포트 내보내기
  ├── Day 4: README + 설치 가이드
  └── Day 5: npm publish + 테스트 플레이
```

---

## 배포

### MCP 모드 설치

```bash
# 유저가 실행할 명령
npx ai-three-kingdoms --stdio

# Claude Desktop MCP 설정에 추가
# claude_desktop_config.json:
{
  "mcpServers": {
    "ai-three-kingdoms": {
      "command": "npx",
      "args": ["-y", "ai-three-kingdoms", "--stdio"]
    }
  }
}
```

### 독립 모드 설치

```bash
npx ai-three-kingdoms --standalone
# → localhost:3000 에서 게임 실행
# → AI 설정: Ollama (기본) 또는 API 키 입력
```

---

## 설계 문서 현황

| 문서 | 버전 | 상태 |
|------|------|------|
| phase0-mvp-spec | **v2 (이 문서)** | ✅ 완료 |
| advisor-architecture | **v2** | ✅ 완료 |
| numerical-design | v1 (변경 없음) | ✅ 유지 |
| protocol-architecture-analysis | v1 | ✅ 참조 문서 |
| architecture-migration | v1 | ✅ 전환 가이드 |

**Claude Code 핸드오프 패키지 = 위 5개 문서 세트**
