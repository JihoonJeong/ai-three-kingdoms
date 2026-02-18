// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이벤트 컷신 컴포넌트
// 스토리 이벤트 연출 시퀀스 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { Expression, CutsceneStep, CutsceneState } from './types.js';
import { getEventAssetPath, getCharacterAssetPath } from './types.js';
import { t } from '../i18n/index.js';

// ─── 이벤트별 컷신 데이터 ────────────────────────────

const EVENT_CUTSCENES: Record<string, CutsceneStep[]> = {
  opening: [
    {
      imageKey: 'opening',
      text: '건안 13년 가을, 조조의 80만 대군이 남하한다. 형주를 잃고 쫓기는 유비에게 남은 것은 제갈량의 지략뿐...',
      characterId: 'zhugeliang',
      characterExpression: 'thinking',
      duration: 5000,
    },
  ],

  cao_advance: [
    {
      imageKey: 'opening',
      text: '조조군이 장강을 따라 진군을 시작했습니다. 적의 선봉대가 이미 시야에 들어왔습니다.',
      characterId: 'zhugeliang',
      characterExpression: 'warning',
      duration: 4000,
    },
  ],

  lusu_visit: [
    {
      imageKey: 'alliance',
      text: '손권의 사신 노숙이 찾아왔습니다. "오후(吳侯)께서 유 황숙과 대사를 의논하고자 하십니다."',
      characterId: 'jianyong',
      characterExpression: 'smile',
      duration: 4000,
    },
  ],

  plague_in_cao_army: [
    {
      imageKey: 'opening',
      text: '북방 출신 조조군에 역병이 퍼지고 있습니다. 수전에 익숙하지 않은 병사들의 사기가 떨어지고 있습니다.',
      characterId: 'zhugeliang',
      characterExpression: 'smile',
      duration: 4000,
    },
  ],

  chain_formation: [
    {
      imageKey: 'chain-formation',
      text: '채모의 건의로 조조가 전함을 쇠사슬로 연결했습니다. 배 위에서도 평지처럼 걸을 수 있게 되었지만...',
      characterId: 'zhugeliang',
      characterExpression: 'smile',
      duration: 5000,
    },
    {
      imageKey: 'chain-formation',
      text: '"연환진... 이것이야말로 하늘이 내린 기회입니다." 제갈량의 눈이 빛난다.',
      characterId: 'zhugeliang',
      characterExpression: 'smile',
      duration: 4000,
    },
  ],

  southeast_wind: [
    {
      imageKey: 'southeast-wind',
      text: '제갈량이 칠성단에 올라 기도를 시작합니다. 겨울임에도 불구하고 동남풍이 불기 시작합니다!',
      characterId: 'zhugeliang',
      characterExpression: 'default',
      duration: 5000,
    },
    {
      imageKey: 'southeast-wind',
      text: '"하늘이 도왔습니다! 동남풍이 불고 있습니다. 지금이 화공의 때입니다!"',
      characterId: 'zhugeliang',
      characterExpression: 'warning',
      duration: 4000,
    },
  ],

  chibi_fire: [
    {
      imageKey: 'fire-attack',
      text: '황개의 화선이 조조 수군으로 돌진합니다! 쇠사슬로 묶인 함대에 불이 옮겨붙으며 장강이 불바다가 됩니다!',
      characterId: 'zhugeliang',
      characterExpression: 'default',
      duration: 6000,
    },
  ],

  jingzhou_surrender: [
    {
      imageKey: 'fire-attack',
      text: '적벽 대승 이후, 형주 일대의 성들이 하나둘 항복하기 시작합니다.',
      characterId: 'liubei',
      characterExpression: 'smile',
      duration: 4000,
    },
  ],

  cao_cao_retreat: [
    {
      imageKey: 'retreat',
      text: '조조가 화용도를 통해 퇴각합니다. 80만 대군은 간데없고, 패잔병만이 북으로 향합니다.',
      characterId: 'guanyu',
      characterExpression: 'majestic',
      duration: 5000,
    },
  ],

  victory_ending: [
    {
      imageKey: 'victory',
      text: '적벽의 불길이 역사를 바꿨습니다. 유비는 마침내 자신의 거점을 확보하고, 삼국의 기틀을 놓았습니다.',
      characterId: 'liubei',
      characterExpression: 'determined',
      duration: 6000,
    },
  ],

  defeat_ending: [
    {
      imageKey: 'defeat',
      text: '유비의 꿈은 이곳에서 끝이 났습니다. 하지만 역사는 계속됩니다...',
      characterId: 'liubei',
      characterExpression: 'worried',
      duration: 5000,
    },
  ],
};

// ─── EventCutscene 클래스 ────────────────────────────

export class EventCutscene {
  private state: CutsceneState | null = null;

  /** 이벤트 ID로 컷신을 시작한다. */
  start(eventId: string): boolean {
    const steps = EVENT_CUTSCENES[eventId];
    if (!steps || steps.length === 0) return false;

    this.state = {
      eventId,
      steps,
      currentStep: 0,
      isTyping: true,
      isSkippable: true,
    };
    return true;
  }

  /** 다음 스텝으로 진행한다. 끝나면 false 반환. */
  advance(): boolean {
    if (!this.state) return false;

    if (this.state.isTyping) {
      // 타이핑 중이면 타이핑 완료 처리
      this.state.isTyping = false;
      return true;
    }

    // 다음 스텝으로
    this.state.currentStep++;
    if (this.state.currentStep >= this.state.steps.length) {
      this.state = null;
      return false; // 컷신 종료
    }

    this.state.isTyping = true;
    return true;
  }

  /** 컷신을 즉시 스킵한다. */
  skip(): void {
    this.state = null;
  }

  /** 현재 컷신이 진행 중인지. */
  isActive(): boolean {
    return this.state !== null;
  }

  /** 현재 상태를 반환한다. */
  getState(): Readonly<CutsceneState> | null {
    return this.state;
  }

  /** 현재 스텝의 이벤트 일러스트 경로. */
  getCurrentImagePath(): string | null {
    if (!this.state) return null;
    const step = this.state.steps[this.state.currentStep];
    return getEventAssetPath(step.imageKey);
  }

  /** 현재 스텝의 캐릭터 초상화 경로. */
  getCurrentCharacterPath(): string | null {
    if (!this.state) return null;
    const step = this.state.steps[this.state.currentStep];
    if (!step.characterId) return null;
    return getCharacterAssetPath(step.characterId, step.characterExpression ?? 'default');
  }

  /** 현재 텍스트. */
  getCurrentText(): string {
    if (!this.state) return '';
    return t(this.state.steps[this.state.currentStep].text);
  }

  /** 현재 스텝의 자동 진행 시간 (ms). */
  getCurrentDuration(): number {
    if (!this.state) return 0;
    return this.state.steps[this.state.currentStep].duration;
  }

  /** 특정 이벤트에 컷신 데이터가 있는지 확인한다. */
  static hasCutscene(eventId: string): boolean {
    return eventId in EVENT_CUTSCENES;
  }
}
