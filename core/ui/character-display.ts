// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 캐릭터 표시 컴포넌트
// 장수 초상화 + 표정 전환 + 연출 로직
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { General, GeneralCondition } from '../data/types.js';
import type {
  Expression, ExpressionContext, CharacterDisplayState,
} from './types.js';
import { getCharacterAssetPath } from './types.js';

// ─── 장수별 표정 매핑 테이블 ─────────────────────────

/** 각 장수가 지원하는 표정 목록 (파일명 기준) */
const EXPRESSION_MAP: Record<string, Record<string, Expression>> = {
  liubei:      { default: 'default', expr1: 'worried', expr2: 'determined', expr3: 'smile' },
  guanyu:      { default: 'default', expr1: 'angry', expr2: 'majestic', expr3: 'smile' },
  zhangfei:    { default: 'default', expr1: 'angry', expr2: 'roar', expr3: 'laugh' },
  zhaozilong:  { default: 'default', expr1: 'determined', expr2: 'smile', expr3: 'combat' },
  zhugeliang:  { default: 'default', expr1: 'thinking', expr2: 'smile', expr3: 'warning' },
  huangzhong:  { default: 'default', expr1: 'battle-cry', expr2: 'proud', expr3: 'determined' },
  weiyuan:     { default: 'default', expr1: 'rage', expr2: 'sinister-smile', expr3: 'defiant' },
  jianyong:    { default: 'default', expr1: 'smile', expr2: 'worried', expr3: 'thinking' },
  caocao:      { default: 'default', expr1: 'angry', expr2: 'laugh', expr3: 'scheming' },
  xiahouyuan:  { default: 'default', expr1: 'charging', expr2: 'confident', expr3: 'fierce' },
  caoren:      { default: 'default', expr1: 'defiant', expr2: 'commanding', expr3: 'stoic' },
  caimao:      { default: 'default', expr1: 'nervous', expr2: 'scheming', expr3: 'pleading' },
  zhangyun:    { default: 'default', expr1: 'panicked', expr2: 'obedient', expr3: 'fearful' },
  sunquan:     { default: 'default', expr1: 'determined', expr2: 'commanding', expr3: 'worried' },
  zhouyu:      { default: 'default', expr1: 'angry', expr2: 'confident', expr3: 'thinking' },
};

// ─── 상황별 자동 표정 결정 ───────────────────────────

/** 상황(context)에 따라 적절한 표정을 자동 선택한다. */
export function resolveExpression(generalId: string, context: ExpressionContext): Expression {
  const map = EXPRESSION_MAP[generalId];
  if (!map) return 'default';

  switch (context.type) {
    case 'battle':
      return map.expr1 ?? 'default';  // 전투 표정 (분노/돌격/결의)

    case 'battle_win':
    case 'diplomacy_success':
      return map.expr2 ?? 'default';  // 긍정 표정

    case 'battle_lose':
    case 'ally_danger':
    case 'diplomacy_fail':
      return map.expr1 ?? 'default';  // 부정 표정 (분노/걱정)

    case 'threat':
    case 'advisor_warning':
      return map.expr3 ?? 'default';  // 경계/경고 표정

    case 'event':
      return context.severity === 'high' ? (map.expr1 ?? 'default') : 'default';

    case 'turn_start':
    case 'idle':
    default:
      return 'default';
  }
}

// ─── CharacterDisplay 클래스 ─────────────────────────

export class CharacterDisplay {
  private state: CharacterDisplayState;

  constructor(generalId: string, position: 'left' | 'right' | 'center' = 'center') {
    this.state = {
      generalId,
      expression: 'default',
      isSpeaking: false,
      isDimmed: false,
      position,
    };
  }

  /** 현재 표시 상태를 반환한다. */
  getState(): Readonly<CharacterDisplayState> {
    return this.state;
  }

  /** 표정을 전환한다. */
  setExpression(expression: Expression): void {
    this.state.expression = expression;
  }

  /** 상황에 따라 자동으로 표정을 결정하고 전환한다. */
  setExpressionFromContext(context: ExpressionContext): void {
    this.state.expression = resolveExpression(this.state.generalId, context);
  }

  /** 발언 중 상태 (발광 효과). */
  setSpeaking(speaking: boolean): void {
    this.state.isSpeaking = speaking;
  }

  /** 비활성 상태 (어둡게 처리). */
  setDimmed(dimmed: boolean): void {
    this.state.isDimmed = dimmed;
  }

  /** 현재 표정에 해당하는 에셋 경로를 반환한다. */
  getAssetPath(): string {
    return getCharacterAssetPath(this.state.generalId, this.state.expression);
  }

  /** 장수 상태(부상/피로)에 따른 시각 효과를 결정한다. */
  getConditionFilter(condition: GeneralCondition): string {
    switch (condition) {
      case '피로': return 'brightness(0.8) saturate(0.7)';
      case '부상': return 'brightness(0.7) saturate(0.5) sepia(0.3)';
      case '포로': return 'grayscale(0.8) brightness(0.5)';
      case '사망': return 'grayscale(1.0) brightness(0.3)';
      case '양호':
      default: return 'none';
    }
  }
}
