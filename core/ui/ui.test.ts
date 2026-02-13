import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterDisplay, resolveExpression } from './character-display.js';
import { StrategyMap } from './strategy-map.js';
import { BattleView } from './battle-view.js';
import { EventCutscene } from './event-cutscene.js';
import { BattleEngine } from '../engine/battle-engine.js';
import { GameStateManager } from '../engine/game-state.js';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import { getCharacterAssetPath, getEventAssetPath, getBattleBgPath } from './types.js';

describe('UI Types — 에셋 경로 헬퍼', () => {
  it('캐릭터 에셋 경로를 생성한다', () => {
    expect(getCharacterAssetPath('guanyu', 'angry'))
      .toBe('assets/characters/guanyu/angry.webp');
  });

  it('이벤트 에셋 경로를 생성한다', () => {
    expect(getEventAssetPath('fire-attack'))
      .toBe('assets/events/fire-attack.webp');
  });

  it('전투 배경 경로를 지형별로 반환한다', () => {
    expect(getBattleBgPath('수상')).toBe('assets/battle/bg-water.webp');
    expect(getBattleBgPath('평야')).toBe('assets/battle/bg-plains.webp');
  });
});

describe('CharacterDisplay', () => {
  let display: CharacterDisplay;

  beforeEach(() => {
    display = new CharacterDisplay('guanyu', 'left');
  });

  it('기본 상태로 생성된다', () => {
    const state = display.getState();
    expect(state.generalId).toBe('guanyu');
    expect(state.expression).toBe('default');
    expect(state.isSpeaking).toBe(false);
    expect(state.isDimmed).toBe(false);
    expect(state.position).toBe('left');
  });

  it('표정을 수동 전환한다', () => {
    display.setExpression('angry');
    expect(display.getState().expression).toBe('angry');
  });

  it('상황에 따라 자동 표정을 결정한다', () => {
    display.setExpressionFromContext({ type: 'battle_win' });
    expect(display.getState().expression).toBe('majestic'); // 관우의 긍정 표정

    display.setExpressionFromContext({ type: 'battle_lose' });
    expect(display.getState().expression).toBe('angry'); // 관우의 부정 표정
  });

  it('발언 상태를 설정한다', () => {
    display.setSpeaking(true);
    expect(display.getState().isSpeaking).toBe(true);
  });

  it('에셋 경로를 반환한다', () => {
    display.setExpression('angry');
    expect(display.getAssetPath()).toBe('assets/characters/guanyu/angry.webp');
  });

  it('장수 상태에 따른 CSS 필터를 반환한다', () => {
    expect(display.getConditionFilter('양호')).toBe('none');
    expect(display.getConditionFilter('부상')).toContain('sepia');
    expect(display.getConditionFilter('사망')).toContain('grayscale');
  });
});

describe('resolveExpression', () => {
  it('제갈량 — 전투 승리 시 미소', () => {
    expect(resolveExpression('zhugeliang', { type: 'battle_win' })).toBe('smile');
  });

  it('제갈량 — 경고 시 경고 표정', () => {
    expect(resolveExpression('zhugeliang', { type: 'advisor_warning' })).toBe('warning');
  });

  it('조조 — 위협 시 오만', () => {
    expect(resolveExpression('caocao', { type: 'threat' })).toBe('arrogant');
  });

  it('알 수 없는 장수는 default', () => {
    expect(resolveExpression('unknown', { type: 'battle_win' })).toBe('default');
  });
});

describe('StrategyMap', () => {
  let map: StrategyMap;
  let stateManager: GameStateManager;

  beforeEach(() => {
    map = new StrategyMap();
    stateManager = new GameStateManager(createRedCliffsScenario('test'));
  });

  it('게임 상태에서 마커를 생성한다', () => {
    map.updateFromGameState(stateManager.getState());
    const state = map.getState();
    expect(state.markers.length).toBeGreaterThanOrEqual(5); // 5도시 + 1전장
  });

  it('도시 마커에 올바른 세력이 표시된다', () => {
    map.updateFromGameState(stateManager.getState());
    const gangha = map.getState().markers.find(m => m.id === 'gangha');
    expect(gangha?.faction).toBe('유비');

    const nanjun = map.getState().markers.find(m => m.id === 'nanjun');
    expect(nanjun?.faction).toBe('조조');
  });

  it('마커를 선택한다', () => {
    map.updateFromGameState(stateManager.getState());
    map.selectMarker('gangha');
    const gangha = map.getState().markers.find(m => m.id === 'gangha');
    expect(gangha?.state).toBe('selected');
  });

  it('군대 이동을 추가한다', () => {
    map.addMovement('gangha', 'hagu', '유비');
    expect(map.getState().movements).toHaveLength(1);
    expect(map.getState().movements[0].faction).toBe('유비');
  });

  it('계절 오버레이 경로를 반환한다', () => {
    map.updateFromGameState(stateManager.getState());
    expect(map.getSeasonOverlayPath()).toContain('autumn');
  });

  it('세력 색상을 반환한다', () => {
    expect(map.getFactionColor('유비')).toBe('#2d6a4f');
    expect(map.getFactionColor(null)).toBe('#6c757d');
  });
});

describe('BattleView', () => {
  let view: BattleView;

  beforeEach(() => {
    const engine = new BattleEngine(() => 0.5);
    const battle = engine.initBattle({
      location: 'chibi', terrain: '수상', weather: '동남풍',
      attackerFaction: '유비', attackerGenerals: ['guanyu'],
      attackerTroops: 5000,
      defenderFaction: '조조', defenderGenerals: ['xiahouyuan'],
      defenderTroops: 8000,
      defenderFormation: '연환진',
    });
    view = new BattleView(battle);
  });

  it('전투 배경 경로를 반환한다', () => {
    expect(view.getBackgroundPath()).toContain('bg-water');
  });

  it('동남풍 이펙트를 표시해야 한다', () => {
    expect(view.shouldShowWindEffect()).toBe(true);
  });

  it('HP 퍼센트를 계산한다', () => {
    expect(view.getTroopPercentage('attacker')).toBe(100);
    expect(view.getTroopPercentage('defender')).toBe(100);
  });

  it('전술 카드 목록을 반환한다', () => {
    const cards = view.getTacticCards();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].assetPath).toContain('tactic-cards');
  });

  it('전술 선택이 동작한다', () => {
    view.selectTactic('fire_attack');
    const cards = view.getTacticCards();
    const selected = cards.find(c => c.tactic.id === 'fire_attack');
    expect(selected?.isSelected).toBe(true);
  });

  it('전술 애니메이션 상태가 변경된다', () => {
    view.playTacticAnimation('fire_attack');
    expect(view.getState().isAnimating).toBe(true);
    expect(view.getState().activeEffect).toBe('fire');

    view.finishAnimation();
    expect(view.getState().isAnimating).toBe(false);
  });
});

describe('EventCutscene', () => {
  let cutscene: EventCutscene;

  beforeEach(() => {
    cutscene = new EventCutscene();
  });

  it('컷신을 시작한다', () => {
    const started = cutscene.start('chain_formation');
    expect(started).toBe(true);
    expect(cutscene.isActive()).toBe(true);
  });

  it('존재하지 않는 이벤트는 시작 실패', () => {
    const started = cutscene.start('nonexistent');
    expect(started).toBe(false);
    expect(cutscene.isActive()).toBe(false);
  });

  it('텍스트와 이미지 경로를 반환한다', () => {
    cutscene.start('chain_formation');
    expect(cutscene.getCurrentText()).toContain('채모');
    expect(cutscene.getCurrentImagePath()).toContain('chain-formation');
    expect(cutscene.getCurrentCharacterPath()).toContain('zhugeliang');
  });

  it('advance로 스텝을 진행한다', () => {
    cutscene.start('chain_formation'); // 2스텝 컷신
    // 첫 advance: 타이핑 완료
    expect(cutscene.advance()).toBe(true);
    // 두번째 advance: 다음 스텝
    expect(cutscene.advance()).toBe(true);
    expect(cutscene.getCurrentText()).toContain('제갈량');
    // 타이핑 완료
    cutscene.advance();
    // 마지막 advance: 종료
    expect(cutscene.advance()).toBe(false);
    expect(cutscene.isActive()).toBe(false);
  });

  it('skip으로 즉시 종료한다', () => {
    cutscene.start('opening');
    cutscene.skip();
    expect(cutscene.isActive()).toBe(false);
  });

  it('hasCutscene으로 컷신 존재 여부를 확인한다', () => {
    expect(EventCutscene.hasCutscene('chain_formation')).toBe(true);
    expect(EventCutscene.hasCutscene('nonexistent')).toBe(false);
  });
});
