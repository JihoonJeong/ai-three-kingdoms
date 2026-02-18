// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 마일스톤 레지스트리 — "What은 고정, How는 LLM"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 시나리오별 필수 이벤트(마일스톤)와 적응 규칙을 선언적으로 관리.
// - 프롬프트 주입: LLM에게 "필수 목표"로 안내
// - 코드 안전장치: LLM 응답에 누락 시 enforceMilestones()가 강제 삽입

import type { GameState, GameAction, FactionId } from '../data/types.js';
import { getTotalTroopsOfCity } from '../data/types.js';
import { t, tf } from '../i18n/index.js';

// ─── 타입 정의 ─────────────────────────────────────────

export interface DeploymentSpec {
  generalId: string;
  destination: string;
}

export interface MilestoneResolution {
  actions: GameAction[];
  deployments: DeploymentSpec[];
  messages: string[];
}

export interface MilestoneDefinition {
  id: string;
  factionId: FactionId;
  turn: number;                  // 이 턴 이후 발동 가능
  flag: string;                  // 완료 시 설정할 플래그
  condition?: (state: Readonly<GameState>) => boolean;
  promptInstruction: string;     // LLM 프롬프트에 주입할 지시문
  // 정적 요구사항 (단순 마일스톤)
  actions?: GameAction[];
  deployments?: DeploymentSpec[];
  messages?: string[];
  // 동적 요구사항 (런타임 상태에 따라 결정)
  resolve?: (state: Readonly<GameState>) => MilestoneResolution;
  // 커스텀 중복 검사 (LLM이 이미 수행했는지 판정)
  isSatisfied?: (planActions: GameAction[], planDeployments: DeploymentSpec[]) => boolean;
}

export interface AdaptiveRuleDefinition {
  id: string;
  factionId: FactionId;
  priority: number;
  condition: (state: Readonly<GameState>) => boolean;
  flagsToSet: Record<string, unknown>;
  promptInstruction: string;
  actions?: GameAction[];
  deployments?: DeploymentSpec[];
  messages?: string[];
  resolve?: (state: Readonly<GameState>) => MilestoneResolution;
  isSatisfied?: (planActions: GameAction[], planDeployments: DeploymentSpec[]) => boolean;
}

// ─── 헬퍼 ──────────────────────────────────────────────

function playerHasAlliance(state: Readonly<GameState>): boolean {
  return state.diplomacy.relations.some(
    r => r.isAlliance && (r.factionA === '유비' || r.factionB === '유비'),
  );
}

function isFactionAlliedWithPlayer(state: Readonly<GameState>, factionId: FactionId): boolean {
  const playerFaction = state.factions.find(f => f.isPlayer);
  if (!playerFaction) return false;
  return state.diplomacy.relations.some(
    r => r.isAlliance &&
         ((r.factionA === playerFaction.id && r.factionB === factionId) ||
          (r.factionA === factionId && r.factionB === playerFaction.id)),
  );
}

// ─── 조조 마일스톤 ────────────────────────────────────

const CAO_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'cao_m_conscript1',
    factionId: '조조',
    turn: 3,
    flag: 'cao_m_conscript1',
    promptInstruction: '남군에서 대규모 징집을 실시하라 (conscript, city: nanjun, scale: large)',
    actions: [{ type: 'domestic', action: 'conscript', params: { city: 'nanjun', scale: 'large' } }],
    messages: [t('조조: 남군에서 대규모 징집이 이루어지고 있습니다')],
    isSatisfied: (actions) => actions.some(
      a => a.action === 'conscript' && 'city' in a.params && a.params.city === 'nanjun',
    ),
  },
  {
    id: 'cao_m_caoren',
    factionId: '조조',
    turn: 5,
    flag: 'cao_m_caoren',
    promptInstruction: '조인(caoren)을 남군으로 이동시켜라 (assign, general: caoren, destination: nanjun)',
    resolve: (state) => {
      const caoren = state.generals.find(
        g => g.id === 'caoren' && g.faction === '조조',
      );
      if (caoren && caoren.location === 'jiangling') {
        return {
          actions: [{ type: 'domestic', action: 'assign', params: { general: 'caoren', destination: 'nanjun' } }],
          deployments: [],
          messages: [t('정찰 보고: 조인 장군이 장릉에서 남군으로 이동했습니다')],
        };
      }
      return { actions: [], deployments: [], messages: [] };
    },
    isSatisfied: (actions) => actions.some(
      a => a.action === 'assign' && 'general' in a.params && a.params.general === 'caoren',
    ),
  },
  {
    id: 'cao_m_conscript2',
    factionId: '조조',
    turn: 6,
    flag: 'cao_m_conscript2',
    promptInstruction: '남군 병력을 보충하라 (conscript, city: nanjun, scale: medium)',
    actions: [{ type: 'domestic', action: 'conscript', params: { city: 'nanjun', scale: 'medium' } }],
    messages: [t('정찰 보고: 조조군이 강하 방면으로 병력을 이동시키고 있습니다')],
    isSatisfied: (actions) => actions.some(
      a => a.action === 'conscript' && 'city' in a.params && a.params.city === 'nanjun',
    ),
  },
  {
    id: 'cao_m_march_south',
    factionId: '조조',
    turn: 8,
    flag: 'cao_m_march_south',
    promptInstruction: '수군을 이끌고 남하를 준비하라',
    // 메시지만 — 행동 없음
    messages: [t('정찰 보고: 조조의 대군이 수군을 이끌고 장강을 따라 남하하고 있습니다!')],
  },
  {
    id: 'cao_chibi_deployed',
    factionId: '조조',
    turn: 9,
    flag: 'cao_chibi_deployed',
    promptInstruction: '채모(caimao)·장윤(zhangyun)을 적벽(chibi)에 배치하라 (assign)',
    resolve: (state) => {
      const deployments: DeploymentSpec[] = [];
      for (const id of ['caimao', 'zhangyun']) {
        const g = state.generals.find(
          gen => gen.id === id && gen.faction === '조조' && gen.condition === '양호',
        );
        if (g) {
          deployments.push({ generalId: id, destination: 'chibi' });
        }
      }
      return {
        actions: [],
        deployments,
        messages: [t('정찰 보고: 조조의 수군 도독 채모·장윤이 대함대를 이끌고 적벽에 진출했습니다!')],
      };
    },
    isSatisfied: (_actions, deployments) => deployments.some(
      d => d.destination === 'chibi' && (d.generalId === 'caimao' || d.generalId === 'zhangyun'),
    ),
  },
  {
    id: 'cao_chibi_reinforced',
    factionId: '조조',
    turn: 10,
    flag: 'cao_chibi_reinforced',
    condition: (state) => !!state.flags['cao_chibi_deployed'],
    promptInstruction: '추가 장수를 적벽(chibi)에 배치하라 (assign)',
    resolve: (state) => {
      const reinforcement = state.generals.find(
        g => g.faction === '조조' && g.location !== 'chibi' &&
             g.condition === '양호' && g.id !== 'caocao',
      );
      if (!reinforcement) return { actions: [], deployments: [], messages: [] };
      return {
        actions: [],
        deployments: [{ generalId: reinforcement.id, destination: 'chibi' }],
        messages: [tf('정찰 보고: {name}이(가) 적벽으로 합류했습니다. 조조군이 증강되고 있습니다!', { name: reinforcement.name })],
      };
    },
    isSatisfied: (_actions, deployments) => deployments.some(
      d => d.destination === 'chibi',
    ),
  },
];

// ─── 조조 적응 규칙 ──────────────────────────────────

const CAO_ADAPTIVE_RULES: AdaptiveRuleDefinition[] = [
  // 100: 유비-손권 동맹 감지 → 적벽 배치 가속 (Turn 9→7)
  {
    id: 'cao_alliance_accel',
    factionId: '조조',
    priority: 100,
    condition: (state) =>
      playerHasAlliance(state) && state.turn >= 7 && !state.flags['cao_chibi_deployed'],
    flagsToSet: { cao_chibi_deployed: true },
    promptInstruction: '동맹 체결에 대응하여 채모·장윤을 즉시 적벽에 배치하라',
    resolve: (state) => {
      const deployments: DeploymentSpec[] = [];
      for (const id of ['caimao', 'zhangyun']) {
        const g = state.generals.find(
          gen => gen.id === id && gen.faction === '조조' && gen.condition === '양호',
        );
        if (g) deployments.push({ generalId: id, destination: 'chibi' });
      }
      return {
        actions: [],
        deployments,
        messages: [t('정찰 보고: 동맹 체결에 반응하여 조조가 적벽 배치를 가속하고 있습니다!')],
      };
    },
    isSatisfied: (_actions, deployments) => deployments.some(
      d => d.destination === 'chibi',
    ),
  },
  // 90: 적벽 대치 압박 메시지 (Turn 11-12)
  {
    id: 'cao_chain_warning',
    factionId: '조조',
    priority: 90,
    condition: (state) =>
      !!state.flags['cao_chibi_deployed'] && !state.flags['chibiVictory'] &&
      state.turn >= 11 && state.turn <= 12,
    flagsToSet: {},
    promptInstruction: '적벽에서 연환진 배치를 유지하라',
    messages: [t('정찰 보고: 적벽의 조조 수군이 연환진을 펼치고 있습니다. 적벽으로의 진군을 서두르십시오!')],
  },
  // 80: 강하 견제 공격 (Turn 14+, 4턴 쿨다운)
  {
    id: 'cao_rear_attack',
    factionId: '조조',
    priority: 80,
    condition: (state) => {
      if (!state.flags['cao_chibi_deployed'] || state.turn < 14 || !!state.flags['chibiVictory']) {
        return false;
      }
      const lastAttack = state.flags['cao_last_attack_turn'] as number | undefined;
      return !lastAttack || state.turn - lastAttack >= 4;
    },
    flagsToSet: {}, // cao_last_attack_turn은 resolve에서 동적으로 결정
    promptInstruction: '후방 견제를 위해 남군에서 강하로 진군하라 (march, from: nanjun, to: gangha)',
    resolve: (state) => {
      const nanjunGenerals = state.generals.filter(
        g => g.faction === '조조' && g.location === 'nanjun' &&
             g.condition === '양호' && g.id !== 'caocao',
      );
      if (nanjunGenerals.length === 0) return { actions: [], deployments: [], messages: [] };
      return {
        actions: [{
          type: 'military', action: 'march',
          params: {
            from: 'nanjun', to: 'gangha',
            generals: nanjunGenerals.slice(0, 2).map(g => g.id),
            troopsScale: 'small' as const,
          },
        }],
        deployments: [],
        messages: [t('조조군이 후방 견제를 위해 강하를 공격합니다! 적벽 결전을 서두르십시오!')],
      };
    },
    isSatisfied: (actions) => actions.some(a => a.action === 'march'),
  },
  // 70: 남군 병력 < 15000 시 보충 징집
  {
    id: 'cao_replenish_high',
    factionId: '조조',
    priority: 70,
    condition: (state) => {
      const nanjun = state.cities.find(c => c.id === 'nanjun');
      return !!nanjun && nanjun.owner === '조조' &&
             getTotalTroopsOfCity(nanjun) < 15000 && nanjun.food >= 800;
    },
    flagsToSet: {},
    promptInstruction: '남군 병력이 부족하다. 징집하라 (conscript, city: nanjun, scale: medium)',
    actions: [{ type: 'domestic', action: 'conscript', params: { city: 'nanjun', scale: 'medium' } }],
    isSatisfied: (actions) => actions.some(a => a.action === 'conscript'),
  },
  // 60: 하구 병력 부족 시 기회 공격
  {
    id: 'cao_exploit_hagu',
    factionId: '조조',
    priority: 60,
    condition: (state) => {
      const hagu = state.cities.find(c => c.id === 'hagu');
      return state.turn >= 10 && !!hagu && hagu.owner === '유비' &&
             getTotalTroopsOfCity(hagu) < 3000 &&
             !!state.flags['cao_chibi_deployed'] && !state.flags['chibiVictory'];
    },
    flagsToSet: {}, // cao_last_attack_turn은 resolve에서 동적
    promptInstruction: '하구의 허점을 공격하라 (march, from: nanjun, to: gangha)',
    resolve: (state) => {
      const nanjunGenerals = state.generals.filter(
        g => g.faction === '조조' && g.location === 'nanjun' &&
             g.condition === '양호' && g.id !== 'caocao',
      );
      if (nanjunGenerals.length === 0) return { actions: [], deployments: [], messages: [] };
      return {
        actions: [{
          type: 'military', action: 'march',
          params: {
            from: 'nanjun', to: 'gangha',
            generals: nanjunGenerals.slice(0, 2).map(g => g.id),
            troopsScale: 'small' as const,
          },
        }],
        deployments: [],
        messages: [t('정찰 보고: 조조군이 하구의 빈 틈을 노리고 강하를 공격합니다!')],
      };
    },
    isSatisfied: (actions) => actions.some(a => a.action === 'march'),
  },
  // 50: 남군 병력 < 12000 && food > 3000 시 소규모 징집
  {
    id: 'cao_replenish_low',
    factionId: '조조',
    priority: 50,
    condition: (state) => {
      const nanjun = state.cities.find(c => c.id === 'nanjun');
      return !!nanjun && nanjun.owner === '조조' &&
             getTotalTroopsOfCity(nanjun) < 12000 && nanjun.food > 3000;
    },
    flagsToSet: {},
    promptInstruction: '남군에서 소규모 징집을 하라 (conscript, city: nanjun, scale: small)',
    actions: [{ type: 'domestic', action: 'conscript', params: { city: 'nanjun', scale: 'small' } }],
    isSatisfied: (actions) => actions.some(a => a.action === 'conscript'),
  },
];

// ─── 손권 마일스톤 ────────────────────────────────────

const SUN_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'sun_chibi_support',
    factionId: '손권',
    turn: 10,
    flag: 'sun_chibi_support',
    condition: (state) =>
      isFactionAlliedWithPlayer(state, '손권') && !!state.flags['cao_chibi_deployed'],
    promptInstruction: '주유(zhouyu)를 적벽(chibi)에 파견하라 (assign)',
    resolve: (state) => {
      const zhouyu = state.generals.find(
        g => g.id === 'zhouyu' && g.faction === '손권' && g.condition === '양호',
      );
      if (!zhouyu) return { actions: [], deployments: [], messages: [] };
      return {
        actions: [],
        deployments: [{ generalId: 'zhouyu', destination: 'chibi' }],
        messages: [t('손권: "주유 도독이 적벽 방면으로 출진합니다!"')],
      };
    },
    isSatisfied: (_actions, deployments) => deployments.some(
      d => d.generalId === 'zhouyu' && d.destination === 'chibi',
    ),
  },
];

// ─── 손권 적응 규칙 ──────────────────────────────────

const SUN_ADAPTIVE_RULES: AdaptiveRuleDefinition[] = [
  // 80: 동맹 시 식량 지원
  {
    id: 'sun_food_gift',
    factionId: '손권',
    priority: 80,
    condition: (state) => {
      if (!isFactionAlliedWithPlayer(state, '손권') || state.turn < 6) return false;
      const hagu = state.cities.find(c => c.id === 'hagu');
      if (!hagu || hagu.owner !== '유비' || hagu.food >= 6000) return false;
      // 손권 자신의 식량이 충분할 때만 지원 (난이도별 임계값)
      const sunFood = state.cities
        .filter(c => c.owner === '손권')
        .reduce((sum, c) => sum + c.food, 0);
      const floor = typeof state.flags['sunQuanSupportFloor'] === 'number'
        ? state.flags['sunQuanSupportFloor'] as number : 5000;
      return sunFood >= floor;
    },
    flagsToSet: {},
    promptInstruction: '동맹 지원으로 유비에게 군량을 보내라 (gift, target: 유비, amount: 1000)',
    actions: [{ type: 'diplomacy', action: 'gift', params: { target: '유비', amount: 1000 } }],
    messages: [t('손권: 동맹 지원으로 군량을 보냈습니다')],
    isSatisfied: (actions) => actions.some(a => a.action === 'gift'),
  },
  // 40: 동맹 시 시상 훈련
  {
    id: 'sun_train',
    factionId: '손권',
    priority: 40,
    condition: (state) => {
      if (!isFactionAlliedWithPlayer(state, '손권')) return false;
      const sishang = state.cities.find(c => c.id === 'sishang');
      return !!sishang && sishang.training < 70;
    },
    flagsToSet: {},
    promptInstruction: '시상(sishang) 병력을 훈련시켜라 (train, city: sishang)',
    actions: [{ type: 'domestic', action: 'train', params: { city: 'sishang' } }],
    isSatisfied: (actions) => actions.some(
      a => a.action === 'train' && 'city' in a.params && a.params.city === 'sishang',
    ),
  },
];

// ─── 전체 데이터 ──────────────────────────────────────

const ALL_MILESTONES: MilestoneDefinition[] = [...CAO_MILESTONES, ...SUN_MILESTONES];
const ALL_ADAPTIVE_RULES: AdaptiveRuleDefinition[] = [...CAO_ADAPTIVE_RULES, ...SUN_ADAPTIVE_RULES];

// ─── MilestoneRegistry ──────────────────────────────

export class MilestoneRegistry {
  /** 해당 세력의 미완료 + 조건 충족 마일스톤 반환 */
  getPendingMilestones(
    factionId: FactionId,
    state: Readonly<GameState>,
  ): MilestoneDefinition[] {
    return ALL_MILESTONES.filter(m => {
      if (m.factionId !== factionId) return false;
      if (state.turn < m.turn) return false;
      if (state.flags[m.flag]) return false;
      if (m.condition && !m.condition(state)) return false;
      return true;
    });
  }

  /** 해당 세력의 조건 충족 적응 규칙 반환 (priority 내림차순) */
  getActiveAdaptiveRules(
    factionId: FactionId,
    state: Readonly<GameState>,
  ): AdaptiveRuleDefinition[] {
    return ALL_ADAPTIVE_RULES
      .filter(r => r.factionId === factionId && r.condition(state))
      .sort((a, b) => b.priority - a.priority);
  }
}
