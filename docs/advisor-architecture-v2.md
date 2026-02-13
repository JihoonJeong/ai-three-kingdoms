# AI 삼국지: 책사 아키텍처 v2 — MCP Apps 기반

**작성**: Luca (2026-02-13)
**기반**: advisor-architecture v1 + Option D 확정 (MCP Apps)
**핵심 변경**: "게임이 AI를 호출" → "Claude가 게임 도구를 호출하면서 책사 역할 수행"

---

## 아키텍처 전환 요약

| 항목 | v1 (직접 API 호출) | v2 (MCP Apps) |
|------|-------------------|---------------|
| AI 호출 주체 | 게임 엔진 | Claude (MCP 클라이언트) |
| 책사 프롬프트 위치 | Bootstrap 6레이어 (게임이 조립) | MCP Prompt Template (서버가 제공) |
| 게임 상태 전달 | API 요청 body에 포함 | 도구 반환값으로 전달 |
| 지식 청크 | RAG 선택 → 컨텍스트 주입 | 도구 반환값에 포함 또는 MCP Resource |
| 모드 전환 | 게임이 task 타입으로 제어 | Claude가 게임 상태 보고 자연 전환 |
| 책사 대화 | 게임 내 채팅 패널 | Claude 대화창 자체 |
| 유저 행동 | 게임 UI만 | 자연어 + 게임 UI 양쪽 |

---

## §1. MCP Prompt Template: 책사 페르소나

MCP 서버가 제공하는 Prompt Template. Claude Desktop에서 게임 서버를 추가하면
유저가 이 프롬프트를 선택해서 대화를 시작할 수 있다.

### 프롬프트 구조

```typescript
server.prompt("red_cliffs_advisor", {
  name: "적벽대전 — 제갈량 책사",
  description: "AI 삼국지 적벽대전 시나리오. 제갈량으로서 유비를 보좌합니다.",
  arguments: [
    { name: "difficulty", description: "난이도", required: false }
  ]
});
```

### 프롬프트 본문

```
당신은 제갈량 공명(諸葛亮 孔明)이다. 유비 현덕의 군사(軍師)로서,
AI 삼국지 전략 게임에서 주공(유비=플레이어)을 보좌한다.

## 당신의 성격

차분하고 논리적이다. 감정에 휘둘리지 않고 전체 판세를 읽는다.
그러나 대의(大義)와 인의(仁義)에 대한 확고한 신념이 있어,
순수한 이익 계산만으로 판단하지 않는다.

말투는 정중하되 핵심을 먼저 말한다. 주공을 "주공" 또는 "사군"으로 칭한다.
위급할 때는 단도직입적으로, 여유 있을 때는 고사(故事)를 인용하며 설명한다.

반드시 자신의 의견을 말하되, 최종 결정은 항상 주공에게 맡긴다.
주공이 자신의 조언을 거부해도 수긍하고, 거부한 결과가 나쁘더라도
"보십시오"식의 비난은 하지 않는다.

## 당신의 능력 특성

- 전략/정치: 최상급. 큰 그림을 읽고 동맹 외교에 탁월.
- 군사: 상급. 정면 대결보다 기략(奇略)을 선호.
- 내정: 상급. 장기적 국력 증강을 중시.
- 약점: 과도한 신중함. 가끔 기회를 놓칠 수 있다.
  (이 약점은 조언에 자연스럽게 반영되어야 한다)

## 게임 진행 규칙

1. 매 턴 시작 시, 반드시 get_turn_state 도구를 호출하여 현재 상황을 파악하라.
2. 상황을 파악한 후, 주공에게 브리핑을 제공하라:
   - 가장 긴급한 위협 또는 기회
   - 이번 턴 권장 행동 2-3가지
   - 그 근거 (간결하게)
3. 주공이 행동을 결정하면, execute_action 도구로 실행하라.
4. 전투 발생 시 get_battle_state로 전황을 파악하고 전술을 조언하라.
5. 주공이 직접 게임 UI에서 행동할 수도 있다. UI에서 행동이 실행되면
   알림이 올 테니, 그에 대해 코멘트하라.

## 중요한 제약

- 게임 수치의 정확한 숫자를 알지 못한다. 도구가 제공하는 범주형 정보
  (예: "병력 충분", "군량 부족", "사기 높음")로 판단하라.
- 장수의 정확한 능력치를 알지 못한다. 범주 (S/A/B/C/D)로만 안다.
- 전투 결과를 100% 예측할 수 없다. 확률적으로 분석하라.
- 보이지 않는 적의 정보는 추측만 가능하다 (정찰 결과에 의존).

## 말투 예시

평시: "주공, 금번 턴의 요체는 강하의 방비 강화입니다. 조조의 선봉이
      당양을 지났다는 보고가 있으니, 서두르심이 좋겠습니다."

위급시: "주공, 급합니다. 적이 하구를 찌르고 있습니다.
        지금 즉시 병력을 돌리지 않으면 보급선이 끊깁니다."

승전 후: "천하의 대세가 움직이기 시작했습니다.
         허나 자만은 금물, 조조는 아직 건재합니다."

조언 거부 시: "주공의 뜻이 그러하시다면 따르겠습니다.
             다만 한 가지만 당부드리자면..."
```

### 핵심 설계 포인트

**왜 프롬프트에 도구 호출 규칙을 넣는가:**
Claude는 MCP 도구를 "가용한 기능"으로 인식하지만, 언제 호출할지는 스스로 판단한다.
"매 턴 반드시 get_turn_state를 먼저 호출하라"는 지시가 없으면,
유저 질문에 바로 대답하려다 게임 상태 없이 환각 조언을 할 수 있다.

**왜 수치를 범주형으로 제한하는가 (v1 계승):**
Claude에게 "병력 12,847"이라고 주면 Claude가 정밀 계산을 시도하다 틀릴 수 있다.
"병력 충분 (1만 이상)" 같은 범주를 주면 Claude는 전략적 판단에 집중한다.
정확한 숫자는 게임 UI가 보여준다.

---

## §2. MCP 도구 설계

### 도구 목록

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 게임 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool("start_game")
// 새 게임 시작. 시나리오 선택, 난이도 설정.
// 반환: 초기 게임 상태 + MCP App UI 렌더링 트리거
input: { scenario: "red_cliffs", difficulty?: "normal" | "hard" }
output: { game_id, initial_state: AdvisorView, message: "게임이 시작되었습니다" }

@tool("save_game")
input: { slot_name: string }
output: { success: boolean, saved_at: timestamp }

@tool("load_game")
input: { slot_name: string }
output: { state: AdvisorView, message: string }

@tool("list_saves")
output: { saves: Array<{name, date, turn, scenario}> }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 턴 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool("get_turn_state")
// 현재 턴의 전체 상황. 책사가 매 턴 반드시 호출해야 하는 핵심 도구.
// 내부에서 state-filter를 거쳐 범주형 AdvisorView를 반환.
input: {} // 파라미터 없음
output: {
  turn: number,
  max_turns: number,
  phase: "preparation" | "battle" | "aftermath",
  season: string,
  
  // 아군 상태 (범주형)
  our_cities: Array<{
    name: string,
    troops_level: "풍부" | "충분" | "부족" | "위험",
    food_level: "풍부" | "충분" | "부족" | "위험",
    development: "높음" | "보통" | "낮음",
    defense: "견고" | "보통" | "취약",
    stationed_generals: Array<{name, role, ability_grade: "S"|"A"|"B"|"C"|"D"}>
  }>,
  
  // 동맹 상태
  allies: Array<{
    name: string,
    relation: "긴밀" | "우호" | "중립" | "냉담" | "적대",
    recent_events: string[]
  }>,
  
  // 적 정보 (정찰 수준에 따라 제한)
  enemy_intel: {
    reliability: "확실" | "대략적" | "불확실" | "정보없음",
    known_movements: string[],
    estimated_total_troops: "압도적" | "우세" | "비슷" | "열세",
    key_generals_spotted: string[]
  },
  
  // 이번 턴 핵심 사안
  urgent_matters: string[],     // 예: ["조조 선봉 당양 통과", "군량 3턴 분 남음"]
  opportunities: string[],      // 예: ["손권 사절단 도착", "동남풍 예보"]
  
  // 상황별 지식 (자동 선택됨)
  context_knowledge: string[],  // 관련 역사/전술 지식 청크
  
  // 지난 턴 결과 (있으면)
  last_turn_results: string[]   // 예: ["강하 징병 완료: 병력 증가", "노숙 설득 성공"]
}

@tool("end_turn")
// 턴 종료. 이벤트 처리 후 결과 반환.
input: {}
output: {
  events: Array<{type, description, impact}>,
  // 예: [{type:"enemy_move", description:"조조 본대 오림 도착", impact:"위협 증가"}]
  state_changes: string[],
  next_turn_preview: string  // "다음 턴은 건안 13년 겨울 2월입니다"
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 행동 실행
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool("execute_action")
// 내정/외교/군사 행동 실행.
input: {
  type: "domestic" | "diplomacy" | "military",
  action: string,  // 행동 종류
  params: object   // 행동별 파라미터
}
// 내정 예시:
//   {type:"domestic", action:"conscript", params:{city:"강하", amount:"대규모"}}
//   {type:"domestic", action:"develop", params:{city:"하구", focus:"defense"}}
//   {type:"domestic", action:"train", params:{city:"강하"}}
//   {type:"domestic", action:"recruit", params:{city:"강하", target_general:"황충"}}
//
// 외교 예시:
//   {type:"diplomacy", action:"send_envoy", params:{target:"손권", purpose:"alliance"}}
//   {type:"diplomacy", action:"persuade", params:{target_general:"장합", method:"의리"}}
//
// 군사 예시:
//   {type:"military", action:"march", params:{from:"강하", to:"적벽", generals:["관우","장비"], troops:"주력"}}
//   {type:"military", action:"scout", params:{target:"오림"}}
//   {type:"military", action:"fortify", params:{city:"하구"}}

output: {
  success: boolean,
  result_description: string,   // "강하에서 대규모 징병을 실시했습니다. 병력이 '충분'에서 '풍부'로."
  side_effects: string[],       // "민심이 소폭 하락했습니다"
  remaining_actions: number     // 이번 턴 남은 행동 횟수
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전투
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool("get_battle_state")
// 전투 진행 중 현황 조회.
input: { battle_id: string }
output: {
  battle_turn: number,
  max_battle_turns: number,
  location: string,
  terrain: string,             // "수상", "평야", "산지" 등
  weather: string,             // "맑음", "안개", "동남풍" 등
  
  our_forces: {
    total_strength: "우세" | "대등" | "열세" | "크게 열세",
    formation: string | null,
    generals: Array<{name, role, condition: "양호"|"피로"|"부상"}>,
    morale: "높음" | "보통" | "낮음"
  },
  
  enemy_forces: {
    estimated_strength: "우세" | "대등" | "열세",
    formation: string | null,
    visible_generals: string[],
    observed_weakness: string[]  // "연환진으로 기동력 저하", "장졸 수토불복"
  },
  
  available_tactics: Array<{
    id: string,
    name: string,
    description: string,
    risk: "낮음" | "보통" | "높음",
    requirements: string | null   // "동남풍 필요", "매복 병력 필요" 등
  }>,
  
  recent_events: string[],
  context_knowledge: string[]    // 전투 관련 지식 청크
}

@tool("battle_command")
// 전투 명령 실행.
input: {
  battle_id: string,
  tactic: string,              // available_tactics의 id
  target?: string,             // 공격 대상 (장수 또는 부대)
  supporting_general?: string  // 전술 실행 장수
}
output: {
  result: "성공" | "부분성공" | "실패" | "역효과",
  description: string,         // "화공이 적 수군을 휩쓸었습니다!"
  casualties: { ours: string, enemy: string },
  battle_over: boolean,
  outcome?: {
    winner: string,
    captured_generals: string[],
    spoils: string[],
    territory_change: string | null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 정보 조회 (보조)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tool("get_general_info")
// 특정 장수 상세 정보.
input: { name: string }
output: {
  name: string,
  courtesy_name: string,       // 자(字)
  role: string,                // "무장", "문관", "책사" 등
  abilities: {
    command: "S"|"A"|"B"|"C"|"D",
    martial: "S"|"A"|"B"|"C"|"D",
    intellect: "S"|"A"|"B"|"C"|"D",
    politics: "S"|"A"|"B"|"C"|"D",
    charisma: "S"|"A"|"B"|"C"|"D"
  },
  special_skills: string[],    // "화공", "수전", "돌격" 등
  loyalty: "절대" | "높음" | "보통" | "불안",
  condition: "양호" | "피로" | "부상" | "포로",
  location: string,
  historical_note: string      // 짧은 역사적 배경
}

@tool("get_city_detail")
// 특정 도시 상세 정보.
input: { name: string }
output: {
  name: string,
  owner: string,
  population_level: "대도시" | "중도시" | "소도시",
  development: { agriculture: "S"|"A"|"B"|"C", commerce: "S"|"A"|"B"|"C", defense: "S"|"A"|"B"|"C" },
  troops_detail: { infantry: string, cavalry: string, navy: string },
  food_reserves: "풍부" | "충분" | "부족" | "위험",
  stationed_generals: string[],
  adjacent_cities: string[],
  strategic_note: string       // "장강 북안의 요충지, 수군 기지로 적합"
}
```

### 도구 설계 원칙

**1. 범주형 출력 일관성**
모든 도구가 수치가 아닌 범주를 반환한다. Claude가 "병력이 12,847입니다"가 아니라
"병력이 충분합니다"라고 말하게 함으로써, 책사 조언의 자연스러움을 유지한다.
정확한 숫자는 MCP App UI에서 플레이어에게 직접 보여준다.

**2. context_knowledge 자동 포함**
get_turn_state와 get_battle_state가 상황에 맞는 지식 청크를 자동으로 포함한다.
Claude가 별도로 리소스를 검색할 필요 없이, 도구 결과만 읽으면 된다.

```typescript
// 서버 내부 로직 (Claude에게는 보이지 않음)
function selectKnowledge(state: GameState): string[] {
  const chunks: string[] = [];
  
  if (state.phase === "preparation" && state.allies.some(a => a.name === "손권")) {
    chunks.push(KNOWLEDGE.sunquan_diplomacy);
  }
  if (state.enemy_intel.known_movements.some(m => m.includes("연환진"))) {
    chunks.push(KNOWLEDGE.fire_attack_tactics);
  }
  if (state.season === "겨울" && state.turn >= 10) {
    chunks.push(KNOWLEDGE.southeast_wind);
  }
  // ... 상황별 규칙
  
  return chunks.slice(0, 3); // 최대 3개, 컨텍스트 절약
}
```

**3. UI 알림 연동**
유저가 MCP App UI에서 직접 행동하면, 그 결과가 Claude에게도 전달되어야 한다.
이건 MCP Apps의 양방향 통신으로 구현:

```
유저가 UI에서 "강하 징병" 실행
  → UI가 MCP Server에 execute_action 호출 (JSON-RPC)
  → 서버가 실행 후 결과 반환
  → UI 업데이트
  → 동시에 Claude 대화에 시스템 메시지 삽입:
    "[게임] 강하에서 징병을 실시했습니다. 병력: 충분 → 풍부. 민심 소폭 하락."
  → Claude가 이를 보고 코멘트:
    "주공, 징병은 적절한 판단입니다. 다만 민심 하락이 누적되면
     내부 반란의 우려가 있으니, 다음 턴에 선정을 베푸시는 것이 좋겠습니다."
```

---

## §3. 모드 전환: 자연 흐름 설계

### v1의 명시적 모드 전환 vs v2의 자연 전환

v1에서는 게임이 "지금은 Plan Mode", "지금은 Battle Mode"를 명시적으로 제어했다.
v2에서는 **게임 상태가 모드를 암시하고, Claude가 자연스럽게 전환**한다.

```
게임 상태 → Claude의 자연 전환:

get_turn_state 결과에 battle 없음
  → Claude: 평시 브리핑 모드 (내정/외교/군사 조언)

execute_action {type:"military", action:"march"} 후 전투 발생
  → 서버가 자동으로 battle_id를 반환
  → Claude: "전투가 벌어졌습니다! 상황을 살피겠습니다."
  → Claude: get_battle_state 호출 → 전투 조언 모드

battle_command 후 battle_over: true
  → Claude: "승리했습니다! 전리품을 회수하고 다음 수를 생각하겠습니다."
  → Claude: get_turn_state 호출 → 평시 브리핑 모드로 복귀

end_turn 후 이벤트 발생
  → 서버가 이벤트 설명 반환
  → Claude: 이벤트 분석 + 대응 제안 (이벤트 반응 모드)
```

### 프롬프트로 전환 유도

프롬프트에 명시적 전환 규칙을 넣지 않는다. 대신:

```
## 행동 지침

- 전투가 발생하면 즉시 get_battle_state를 호출하고 전술을 조언하라.
- 전투가 끝나면 get_turn_state로 전체 상황을 재점검하라.
- 예상치 못한 이벤트가 발생하면 즉각 분석하고 대응을 제안하라.
- 주공이 "턴을 마치겠다"고 하면 end_turn을 호출하라.
```

이렇게 하면 Claude가 상황에 따라 자연스럽게 역할을 전환하면서도,
플레이어가 "전투 중인데 내정 이야기 하고 싶어"라고 하면 유연하게 대응 가능.

---

## §4. 유저 행동 이중 경로 상세

### 경로 A: 자연어 (Claude 경유)

```
유저: "손권에게 화친 사절을 보내면서, 조조의 약점을 강조해줘"

Claude: (판단)
  → 이건 외교 행동이다
  → execute_action 호출:
    {type:"diplomacy", action:"send_envoy", 
     params:{target:"손권", purpose:"alliance", emphasis:"enemy_weakness"}}

서버: (실행)
  → 외교 성공률 계산 (내부 수치 기반)
  → 결과 반환: {success:true, result_description:"노숙이 호의적으로 응대..."}

Claude: "주공, 사절이 돌아왔습니다. 노숙이 매우 호의적으로 응대했다 합니다.
        특히 조조 수군의 약점을 강조한 것이 주효했습니다.
        동맹이 한 발짝 가까워졌습니다."
```

**장점:** 자연스러운 대화, 세밀한 의도 전달, 책사 반응 즉시
**단점:** 명확한 파라미터 변환이 어려울 수 있음 (Claude 해석 의존)

### 경로 B: UI 직접 조작

```
유저: [게임 UI에서 외교 탭 → 손권 → 사절 파견 → 실행]

MCP App UI → MCP Server: execute_action 직접 호출

서버: (실행, 동일한 로직)
  → 결과 반환 → UI 업데이트

동시에 Claude에게 알림:
  "[시스템] 주공이 손권에게 사절을 파견했습니다. 결과: 노숙이 호의적 응대."

Claude: "좋은 판단이십니다, 주공. 다만 동맹을 확실히 하려면
        주유도 설득해야 합니다. 주유는 자존심이 강하니
        조조의 위협을 정면으로 제시하는 것이 좋겠습니다."
```

**장점:** 빠른 조작, 명확한 파라미터, 게임다운 조작감
**단점:** Claude의 사전 조언 없이 행동 → 사후 코멘트만 가능

### 양쪽 공존이 핵심

대부분의 플레이어는 **상황에 따라 양쪽을 섞어 쓸 것이다:**
- 복잡한 판단이 필요한 외교/전략: Claude와 대화 (경로 A)
- 반복적인 내정/단순 명령: UI에서 직접 (경로 B)
- 전투 중: UI로 전술 선택 + Claude 조언 동시 참조

---

## §5. 지식 관리 시스템

### v1에서의 변환

v1의 10-15개 .txt 파일 → 서버 내부 상수 + 도구 반환값 포함

```typescript
// knowledge/index.ts

export const KNOWLEDGE = {
  // 외교 관련
  sunquan_diplomacy: `
    손권(孫權)은 현재 항전파(주유, 황개)와 항복파(장소, 장굉)로 나뉘어 있다.
    핵심 중재자는 노숙(魯肅)이며, 그를 통해 접근하는 것이 가장 효과적이다.
    주유는 군사적 자신감이 있으나 자존심이 강해 직접 도움을 청하면 반발할 수 있다.
    손권 자신은 아버지와 형의 유업을 지키려는 의지가 강하다.
    "아버지와 형이 이룬 강동의 기업"을 강조하면 항전 의지를 자극할 수 있다.
  `,
  
  // 전투 관련
  fire_attack_tactics: `
    화공(火攻)은 적이 밀집 진형(특히 연환진)을 취했을 때 극대 효과를 발휘한다.
    필수 조건: (1) 바람 방향이 적을 향할 것, (2) 인화물 준비, (3) 내응자 확보.
    적벽 일대에서 동남풍은 겨울에 드물지만, 기상 변화의 가능성은 존재한다.
    연환진은 배를 쇠사슬로 연결하여 안정성을 높이지만,
    한 척에 불이 붙으면 전체로 번질 수 있는 치명적 약점이 있다.
  `,
  
  southeast_wind: `
    건안 13년 겨울, 장강 유역의 기후는 대체로 북서풍이 분다.
    그러나 간헐적으로 동남풍이 불 수 있으며, 이는 기상 변동에 의한 것이다.
    화공을 계획한다면 동남풍의 시기를 포착하는 것이 관건이다.
    정찰을 통해 풍향 변화를 미리 감지할 수 있다.
  `,
  
  cao_cao_navy_weakness: `
    조조의 수군은 대부분 북방 출신으로 수전에 익숙하지 않다.
    장졸들의 수토불복(水土不服)으로 질병이 번지고 있다는 보고가 있다.
    이를 보완하기 위해 채모(蔡瑁)와 장윤(張允)을 수군도독으로 임명했으나,
    이들을 제거하면 조조 수군의 전투력은 크게 약화된다.
  `,
  
  jingzhou_politics: `
    형주(荊州)는 유표 사후 정치적으로 불안정하다.
    유종이 항복했으나 형주 내 호족들의 향배는 갈리고 있다.
    적벽에서 조조가 패하면 형주 4군(장사, 계양, 영릵, 무릉)은
    빠르게 장악 가능하다. 각 군의 태수들은 대세를 따를 가능성이 높다.
  `,
  
  retreat_strategy: `
    전투에서 불리할 때는 무리한 교전보다 전략적 후퇴가 유효하다.
    장강의 지리를 이용해 도하 지점을 확보해두면 안전한 퇴로를 마련할 수 있다.
    유비군은 병력이 적으므로, 정면 대결보다 기습과 화공 등 비대칭 전략이 유리하다.
  `
};
```

### 지식 선택 로직

```typescript
// advisor/knowledge-selector.ts

function selectKnowledge(state: GameState): string[] {
  const selected: string[] = [];
  
  // Phase 기반
  if (state.phase === "preparation") {
    if (hasAllyInteraction(state, "손권")) selected.push(KNOWLEDGE.sunquan_diplomacy);
    if (state.turn <= 3) selected.push(KNOWLEDGE.jingzhou_politics);
  }
  
  // 전투 상황 기반
  if (state.activeBattle) {
    const battle = state.activeBattle;
    if (battle.enemyFormation === "연환진") selected.push(KNOWLEDGE.fire_attack_tactics);
    if (battle.weather.includes("풍")) selected.push(KNOWLEDGE.southeast_wind);
    if (battle.ourStrength === "열세") selected.push(KNOWLEDGE.retreat_strategy);
  }
  
  // 적 정보 기반
  if (state.enemy_intel.known_movements.some(m => m.includes("수군"))) {
    selected.push(KNOWLEDGE.cao_cao_navy_weakness);
  }
  
  // 최대 3개로 제한 (컨텍스트 절약)
  return selected.slice(0, 3);
}
```

---

## §6. UI → Claude 알림 메커니즘

유저가 UI에서 직접 행동했을 때, Claude에게 알리는 방법.

### MCP Apps의 양방향 통신 활용

```javascript
// MCP App UI 측 (iframe 내)

async function onPlayerAction(action) {
  // 1. MCP Server에서 행동 실행
  const result = await mcpBridge.callTool("execute_action", action);
  
  // 2. UI 업데이트
  updateGameUI(result);
  
  // 3. Claude에게 결과 알림 (ui/message를 통해)
  await mcpBridge.sendMessage({
    role: "user",
    parts: [{
      text: `[게임 알림] ${result.result_description}` +
            (result.side_effects.length > 0 
              ? ` 부수 효과: ${result.side_effects.join(', ')}` 
              : '') +
            ` (남은 행동: ${result.remaining_actions})`
    }]
  });
}
```

Claude는 이 알림을 받으면 자연스럽게 코멘트한다.
프롬프트에 이미 "UI에서 행동이 실행되면 알림이 올 테니, 그에 대해 코멘트하라"는 지시가 있으므로.

### 알림 포맷 표준

```
[게임 알림] {행동 결과 설명}. {부수 효과}. (남은 행동: N)
```

예시:
- `[게임 알림] 강하에서 대규모 징병을 실시했습니다. 병력: 충분→풍부. 민심 소폭 하락. (남은 행동: 2)`
- `[게임 알림] 관우를 하구에 배치했습니다. (남은 행동: 1)`
- `[게임 알림] 적벽으로 진군을 시작합니다. 전투가 발생합니다!`

---

## §7. 독립 모드(Ollama)와의 코드 공유

### 공유 레이어

```
core/engine/     → 100% 공유 (게임 로직)
core/advisor/    → 프롬프트 텍스트, 지식 청크, state-filter 모두 공유
core/ui-components/ → Canvas/SVG 렌더링 컴포넌트 공유
```

### 분기 레이어

```
MCP 모드:
  → MCP Server가 도구/리소스/프롬프트 제공
  → Claude가 도구 호출로 게임 진행
  → UI는 MCP App iframe

독립 모드:
  → 웹 서버가 게임 UI 직접 서빙
  → 게임이 Ollama/API를 직접 호출하여 책사 응답 생성
  → 기존 v1 아키텍처와 유사 (Bootstrap 6레이어 그대로 사용)
```

핵심: **core/advisor/prompts.ts의 프롬프트 텍스트가 양쪽에서 재사용됨.**
MCP 모드에서는 Prompt Template으로, 독립 모드에서는 시스템 프롬프트로.

---

## §8. 확인 사항 (이전 v1에서 이관 + 신규)

### v1에서 확정된 사항 (그대로 유지)

1. ✅ Plan↔Action 전환: 허용, 단 실행한 행동은 되돌릴 수 없음
2. ✅ 수치 공개: 플레이어 UI에 정확한 숫자 표시, AI에게는 범주형
3. ✅ AI 교체: 턴 사이에만 (MCP Apps에서는 Sampling 지원 후에나 관련)
4. ✅ 튜토리얼: MVP는 첫 턴만
5. ✅ Action Mode AI 호출: 로컬 규칙 기반 → v2에서는 UI 자체 처리 + Claude 사후 코멘트

### 신규 확인 필요 사항

6. **Claude 사전/사후 조언 비율**
   경로 B(UI 직접 조작) 시 Claude는 사후 코멘트만 가능.
   이게 괜찮은가? 아니면 "실행 전 Claude에게 먼저 물어보시겠습니까?" 같은
   확인 단계를 UI에 넣을까?
   → Luca 제안: 넣지 않는다. 물어보고 싶으면 유저가 자연어로 물어보면 된다.
   자유도를 최대화하고, 조언 수용/거부가 자연스럽게 데이터로 남게 한다.

7. **턴 종료 주체**
   누가 end_turn을 호출하는가?
   → Luca 제안: 양쪽 모두 가능. 유저가 Claude에게 "턴 마쳐" 또는 UI에서 [턴 종료] 버튼.
   단, 남은 행동이 있으면 확인 경고.

8. **게임 시작 흐름**
   유저가 Claude Desktop에서 어떻게 게임을 시작하는가?
   → Luca 제안: MCP Prompt Template을 선택하면 Claude가 자동으로 start_game 호출.
   또는 유저가 "삼국지 시작해줘"라고 말하면 Claude가 판단하여 시작.

---

## 다음 단계

이 문서(advisor-architecture v2)가 확정되면:

1. **phase0-mvp-spec v2** — 게임 루프 재설계 + 듀얼 모드 구조
2. **MCP 도구 스키마 확정** — TypeScript 인터페이스로 정밀 정의
3. **프롬프트 테스트** — Claude에게 프롬프트 + 가상 도구 결과를 주고
   책사 응답 품질 검증 (MCP 없이도 가능)
4. **UI 프로토타입** — iframe 내 전략 맵 POC
5. Claude Code 핸드오프 패키지
