// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 적벽대전 시나리오 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  City, Battlefield, General, Faction, ScenarioEvent,
  DiplomacyState, GameState, FactionId,
} from '../types.js';
import { ACTIONS_PER_TURN } from '../types.js';

// ─── 도시 (5개) ────────────────────────────────────────

const CITIES: City[] = [
  {
    id: 'gangha',
    name: '강하',
    owner: '유비',
    position: { x: 30, y: 50 },
    population: '중도시',
    development: { agriculture: 'B', commerce: 'C', defense: 'B' },
    troops: { infantry: 5000, cavalry: 1000, navy: 2000 },
    food: 8000,
    morale: 70,
    training: 60,
    adjacent: ['hagu', 'nanjun'],
    description: '장강 남안의 거점. 유비군의 본거지.',
    strategicNote: '수군 기지로 활용 가능. 하구와 함께 장강 방어선 형성.',
  },
  {
    id: 'hagu',
    name: '하구',
    owner: '유비',
    position: { x: 35, y: 45 },
    population: '소도시',
    development: { agriculture: 'C', commerce: 'C', defense: 'C' },
    troops: { infantry: 3000, cavalry: 500, navy: 1500 },
    food: 4000,
    morale: 60,
    training: 45,
    adjacent: ['gangha', 'chibi', 'sishang'],
    description: '장강 합류점의 작은 성. 적벽 전선의 전초기지.',
    strategicNote: '적벽으로의 진출 거점. 방비가 취약하므로 보강 필요.',
  },
  {
    id: 'sishang',
    name: '시상',
    owner: '손권',
    position: { x: 45, y: 55 },
    population: '중도시',
    development: { agriculture: 'B', commerce: 'B', defense: 'B' },
    troops: { infantry: 8000, cavalry: 2000, navy: 5000 },
    food: 12000,
    morale: 75,
    training: 70,
    adjacent: ['hagu', 'chibi'],
    description: '손권군의 전방 기지. 주유가 지휘.',
    strategicNote: '동맹군 주력 집결지. 손권과의 외교가 이곳의 협력을 결정.',
  },
  {
    id: 'nanjun',
    name: '남군',
    owner: '조조',
    position: { x: 25, y: 35 },
    population: '대도시',
    development: { agriculture: 'A', commerce: 'A', defense: 'A' },
    troops: { infantry: 15000, cavalry: 5000, navy: 3000 },
    food: 20000,
    morale: 80,
    training: 75,
    adjacent: ['gangha', 'jiangling'],
    description: '형주의 핵심 도시. 현재 조조가 장악.',
    strategicNote: '적벽 승리 후 최우선 점령 대상. 형주 지배의 관건.',
  },
  {
    id: 'jiangling',
    name: '장릉',
    owner: '조조',
    position: { x: 20, y: 25 },
    population: '중도시',
    development: { agriculture: 'B', commerce: 'B', defense: 'B' },
    troops: { infantry: 8000, cavalry: 3000, navy: 1000 },
    food: 10000,
    morale: 70,
    training: 65,
    adjacent: ['nanjun'],
    description: '형주 서부의 요충지.',
    strategicNote: '남군 점령 후 연쇄 점령 가능.',
  },
];

// ─── 전투 지역 (1개) ──────────────────────────────────

const BATTLEFIELDS: Battlefield[] = [
  {
    id: 'chibi',
    name: '적벽',
    position: { x: 40, y: 40 },
    terrain: '수상',
    description: '장강 위의 결전지. 화공에 유리한 지형.',
    adjacentCities: ['hagu', 'sishang'],
    special: '연환진 시 화공 효과 2배',
  },
];

// ─── 장수 (15명) ──────────────────────────────────────

const GENERALS: General[] = [
  // ━━━ 아군 (유비 진영) 8명 ━━━
  {
    id: 'liubei',
    name: '유비',
    courtesyName: '현덕',
    faction: '유비',
    role: '군주',
    abilities: { command: 'B', martial: 'C', intellect: 'B', politics: 'A', charisma: 'S' },
    skills: ['인덕', '의병'],
    loyalty: '절대',
    location: 'gangha',
    condition: '양호',
    historicalNote: '한실 종친. 인의로 사람을 모으나 근거지가 불안정.',
  },
  {
    id: 'guanyu',
    name: '관우',
    courtesyName: '운장',
    faction: '유비',
    role: '무장',
    abilities: { command: 'A', martial: 'S', intellect: 'B', politics: 'C', charisma: 'A' },
    skills: ['위풍', '수전', '돌격'],
    loyalty: '절대',
    location: 'gangha',
    condition: '양호',
    historicalNote: '만인지적. 의리의 화신. 수전에도 능함.',
  },
  {
    id: 'zhangfei',
    name: '장비',
    courtesyName: '익덕',
    faction: '유비',
    role: '무장',
    abilities: { command: 'B', martial: 'S', intellect: 'D', politics: 'D', charisma: 'B' },
    skills: ['위풍', '돌격', '일기토'],
    loyalty: '절대',
    location: 'gangha',
    condition: '양호',
    historicalNote: '맹장. 적진을 두려움에 떨게 하나 병사 다루기가 거침.',
  },
  {
    id: 'zhaoyun',
    name: '조자룡',
    courtesyName: '자룡',
    faction: '유비',
    role: '무장',
    abilities: { command: 'A', martial: 'A', intellect: 'B', politics: 'C', charisma: 'A' },
    skills: ['돌격', '호위', '기병'],
    loyalty: '절대',
    location: 'gangha',
    condition: '양호',
    historicalNote: '담력과 지략을 겸비한 명장. 장판파에서 아두를 구출.',
  },
  {
    id: 'zhugeliang',
    name: '제갈량',
    courtesyName: '공명',
    faction: '유비',
    role: '책사',
    abilities: { command: 'A', martial: 'D', intellect: 'S', politics: 'S', charisma: 'A' },
    skills: ['화공', '기략', '외교', '내정'],
    loyalty: '절대',
    location: 'gangha',
    condition: '양호',
    historicalNote: '와룡. 천하삼분지계의 주창자. 이 게임에서는 AI 책사로 구현.',
  },
  {
    id: 'huangzhong',
    name: '황충',
    courtesyName: '한승',
    faction: '유비',
    role: '무장',
    abilities: { command: 'B', martial: 'A', intellect: 'C', politics: 'D', charisma: 'C' },
    skills: ['궁술', '돌격'],
    loyalty: '높음',
    location: 'gangha',
    condition: '양호',
    historicalNote: '노장. 궁술이 뛰어나고 용맹하나 나이가 많다.',
  },
  {
    id: 'weiyuan',
    name: '위연',
    courtesyName: '문장',
    faction: '유비',
    role: '무장',
    abilities: { command: 'B', martial: 'A', intellect: 'C', politics: 'D', charisma: 'C' },
    skills: ['돌격', '기습'],
    loyalty: '보통',
    location: 'hagu',
    condition: '양호',
    historicalNote: '용맹하나 반골의 상이 있다는 평. 야심이 있으나 능력도 있음.',
  },
  {
    id: 'jianshou',
    name: '간옹',
    courtesyName: '헌화',
    faction: '유비',
    role: '문관',
    abilities: { command: 'D', martial: 'D', intellect: 'B', politics: 'A', charisma: 'B' },
    skills: ['외교', '내정'],
    loyalty: '높음',
    location: 'gangha',
    condition: '양호',
    historicalNote: '유비의 오랜 참모. 외교와 내정에 능함.',
  },

  // ━━━ 적군 (조조 진영) 5명 ━━━
  {
    id: 'caocao',
    name: '조조',
    courtesyName: '맹덕',
    faction: '조조',
    role: '군주',
    abilities: { command: 'S', martial: 'A', intellect: 'S', politics: 'S', charisma: 'A' },
    skills: ['기략', '위풍', '내정'],
    loyalty: '절대',
    location: 'nanjun',
    condition: '양호',
    historicalNote: '난세의 간웅. 문무를 겸비하나 오만함이 약점.',
  },
  {
    id: 'xiahouyuan',
    name: '하후연',
    courtesyName: '묘재',
    faction: '조조',
    role: '무장',
    abilities: { command: 'A', martial: 'A', intellect: 'C', politics: 'D', charisma: 'B' },
    skills: ['기병', '돌격', '속전'],
    loyalty: '절대',
    location: 'nanjun',
    condition: '양호',
    historicalNote: '조조의 친족 장수. 기습과 속전속결에 능함.',
  },
  {
    id: 'caoren',
    name: '조인',
    courtesyName: '자효',
    faction: '조조',
    role: '무장',
    abilities: { command: 'A', martial: 'B', intellect: 'B', politics: 'C', charisma: 'B' },
    skills: ['수성', '기병'],
    loyalty: '절대',
    location: 'jiangling',
    condition: '양호',
    historicalNote: '조조의 사촌. 수성전의 달인.',
  },
  {
    id: 'caimao',
    name: '채모',
    courtesyName: '덕규',
    faction: '조조',
    role: '무장',
    abilities: { command: 'B', martial: 'C', intellect: 'C', politics: 'C', charisma: 'C' },
    skills: ['수전'],
    loyalty: '보통',
    location: 'nanjun',
    condition: '양호',
    historicalNote: '형주 항복파. 조조 수군도독. 제거하면 적 수군 약화.',
  },
  {
    id: 'zhangyun',
    name: '장윤',
    courtesyName: '—',
    faction: '조조',
    role: '무장',
    abilities: { command: 'B', martial: 'C', intellect: 'C', politics: 'D', charisma: 'C' },
    skills: ['수전'],
    loyalty: '보통',
    location: 'nanjun',
    condition: '양호',
    historicalNote: '채모와 함께 조조 수군 지휘. 수전 경험자.',
  },

  // ━━━ 동맹 (손권 진영) 2명 ━━━
  {
    id: 'sunquan',
    name: '손권',
    courtesyName: '중모',
    faction: '손권',
    role: '군주',
    abilities: { command: 'B', martial: 'C', intellect: 'A', politics: 'A', charisma: 'A' },
    skills: ['외교', '인재등용'],
    loyalty: '절대',
    location: 'sishang',
    condition: '양호',
    historicalNote: '강동의 주인. 항전/항복 사이에서 결단을 내려야 하는 위치.',
  },
  {
    id: 'zhouyu',
    name: '주유',
    courtesyName: '공근',
    faction: '손권',
    role: '책사/무장',
    abilities: { command: 'S', martial: 'B', intellect: 'A', politics: 'B', charisma: 'A' },
    skills: ['화공', '수전', '기략'],
    loyalty: '절대',
    location: 'sishang',
    condition: '양호',
    historicalNote: '오군의 대도독. 적벽의 실질적 지휘관. 자존심이 강함.',
  },
];

// ─── 세력 ──────────────────────────────────────────────

const FACTIONS: Faction[] = [
  { id: '유비', name: '유비군', leader: 'liubei', isPlayer: true },
  { id: '조조', name: '조조군', leader: 'caocao', isPlayer: false },
  { id: '손권', name: '손권군', leader: 'sunquan', isPlayer: false },
];

// ─── 외교 초기 상태 ────────────────────────────────────

const INITIAL_DIPLOMACY: DiplomacyState = {
  relations: [
    {
      factionA: '유비',
      factionB: '손권',
      relation: '중립',
      value: 45,
      isAlliance: false,
      events: ['유비가 조조에게 쫓겨 남하 중'],
    },
    {
      factionA: '유비',
      factionB: '조조',
      relation: '적대',
      value: 10,
      isAlliance: false,
      events: ['조조가 유비를 추격 중'],
    },
    {
      factionA: '손권',
      factionB: '조조',
      relation: '냉담',
      value: 30,
      isAlliance: false,
      events: ['조조가 항복을 요구하는 서신을 보냄'],
    },
  ],
};

// ─── 이벤트 ────────────────────────────────────────────

const EVENTS: ScenarioEvent[] = [
  // Phase A: 전쟁 준비
  {
    id: 'cao_advance',
    trigger: { type: 'turn', turn: 2 },
    description: '조조의 선봉이 당양을 통과했다는 보고가 들어왔습니다.',
    effects: [
      { type: 'enemy_intel_update', data: { reliability: '대략적' } },
      { type: 'urgency_increase' },
    ],
  },
  {
    id: 'lusu_visit',
    trigger: { type: 'turn', turn: 3, condition: 'alliance_not_started' },
    description: '노숙이 자발적으로 유비 진영을 방문합니다. 동맹 논의의 기회.',
    effects: [
      { type: 'diplomacy_opportunity', target: '손권', bonus: 20 },
    ],
    advisorKnowledge: 'sunquan_diplomacy',
  },
  {
    id: 'plague_in_cao_army',
    trigger: { type: 'turn', turn: 5 },
    description: '조조 진영에 수토불복으로 전염병이 돌고 있다는 첩보.',
    effects: [
      { type: 'enemy_debuff', target: '조조', stat: 'morale', amount: -15 },
      { type: 'enemy_intel_update', data: { weakness: '질병' } },
    ],
    advisorKnowledge: 'cao_cao_navy_weakness',
  },
  {
    id: 'chain_formation',
    trigger: { type: 'turn', turn: 7, condition: 'caimao_alive' },
    description: '조조가 채모의 건의를 받아 연환진을 펼쳤습니다.',
    effects: [
      { type: 'enemy_formation', formation: '연환진' },
      { type: 'unlock_tactic', tactic: '화공', bonusMultiplier: 2.0 },
    ],
    advisorKnowledge: 'fire_attack_tactics',
  },

  // Phase B: 적벽 결전
  {
    id: 'southeast_wind',
    trigger: { type: 'turn_range', min: 10, max: 14, probability: 0.7 },
    description: '동남풍이 불기 시작합니다!',
    effects: [
      { type: 'weather_change', weather: '동남풍' },
      { type: 'tactic_bonus', tactic: '화공', bonus: 50 },
    ],
    advisorKnowledge: 'southeast_wind',
  },
  {
    id: 'huang_gai_defection',
    trigger: { type: 'condition', condition: 'alliance_strong_and_turn>=8' },
    description: '황개가 거짓 투항 계책을 제안해왔습니다.',
    effects: [
      { type: 'special_tactic_available', tactic: '거짓투항_화공' },
    ],
  },

  // Phase C: 후속전
  {
    id: 'jingzhou_surrender',
    trigger: { type: 'condition', condition: 'chibi_victory' },
    description: '적벽 대승 소식에 형주 4군의 태수들이 동요합니다.',
    effects: [
      { type: 'diplomacy_opportunity', target: '형주4군', bonus: 50 },
    ],
    advisorKnowledge: 'jingzhou_politics',
  },
  {
    id: 'cao_cao_retreat',
    trigger: { type: 'condition', condition: 'chibi_victory' },
    description: '조조가 화용도를 통해 퇴각하고 있습니다!',
    effects: [
      { type: 'pursuit_opportunity', target: '조조', location: '화용도' },
    ],
  },
];

// ─── 시나리오 생성 함수 ────────────────────────────────

export function createRedCliffsScenario(gameId?: string): GameState {
  return {
    gameId: gameId ?? `red-cliffs-${Date.now()}`,
    scenarioId: 'red_cliffs',
    turn: 1,
    maxTurns: 20,
    phase: 'preparation',
    season: '건안 13년 가을',
    cities: structuredClone(CITIES),
    battlefields: structuredClone(BATTLEFIELDS),
    generals: structuredClone(GENERALS),
    factions: structuredClone(FACTIONS),
    diplomacy: structuredClone(INITIAL_DIPLOMACY),
    activeBattle: null,
    completedEvents: [],
    actionLog: [],
    actionsRemaining: ACTIONS_PER_TURN,
    flags: {},
    gameOver: false,
    result: null,
  };
}

export function getScenarioEvents(): ScenarioEvent[] {
  return structuredClone(EVENTS);
}

export { CITIES, BATTLEFIELDS, GENERALS, FACTIONS, EVENTS };
