// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MilestoneCoach — 마일스톤 기반 전략 코칭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// MidGameReflector를 확장. 턴 10 고정 → 마일스톤 트리거.
// 각 마일스톤에서 1~2문장 조언을 user message에 주입.

import type { GameState } from '../../core/data/types.js';

export class MilestoneCoach {
  private fired = new Set<string>();

  /** 시스템 프롬프트에 추가할 게임 시작 코칭 (1문장) */
  getStartCoaching(): string {
    return '최종 목표: 적벽 승리 후 남군(nanjun)을 점령해야 B등급 이상이다. 적벽만 이기면 C등급에 그친다.';
  }

  /** 매 턴 호출. 마일스톤 조건 충족 시 조언 반환 → user message 앞에 주입. */
  check(state: GameState): string | null {
    const messages: string[] = [];

    // 마일스톤 b) chibiVictory 감지
    if (state.flags['chibiVictory'] && !this.fired.has('chibi')) {
      this.fired.add('chibi');
      messages.push(
        '[전환점] 적벽 승리! 이제 남군 점령이 목표다. ' +
        '하구(hagu)에서 남군(nanjun)으로는 직접 갈 수 없다 — 비인접 도시다. ' +
        '강하(gangha)→남군(nanjun) 경로만 가능하다. ' +
        '먼저 하구에서 강하로 병력을 보급(transfer, from: hagu, to: gangha)한 후, ' +
        '강하에서 남군으로 진군(march, from: gangha, to: nanjun)하라. ' +
        '⚠️ 절대 유비(liubei)를 진군에 포함시키지 마라. 유비가 전사하면 즉시 F등급이다. 관우(guanyu)나 장비(zhangfei)만 보내라.',
      );
    }

    // 마일스톤 c) gangha 병력 >= 2000 (적벽 승리 후에만)
    if (state.flags['chibiVictory'] && !this.fired.has('gangha_ready')) {
      const gangha = state.cities.find(c => c.id === 'gangha');
      if (gangha) {
        const troops = gangha.troops.infantry + gangha.troops.cavalry + gangha.troops.navy;
        if (troops >= 2000) {
          this.fired.add('gangha_ready');
          messages.push(
            '[작전 준비 완료] 강하에 병력이 충분하다. ' +
            '지금 남군으로 진군하라(march, from: gangha, to: nanjun). ' +
            '장수는 관우(guanyu) 또는 장비(zhangfei)를 보내라. ' +
            '유비(liubei)는 절대 보내지 마라 — 전사하면 즉시 F등급이다.',
          );
        }
      }
    }

    // 마일스톤 d) 턴 4 이후 + 식량 충분 + 징병 미실행 시
    if (state.turn >= 4 && !this.fired.has('conscript_hint')) {
      const playerCities = state.cities.filter(c => c.owner === '유비');
      const totalFood = playerCities.reduce((sum, c) => sum + c.food, 0);
      const hasConscripted = state.actionLog.some(
        log => log.action.action === 'conscript'
      );

      if (totalFood >= 1000 && !hasConscripted) {
        this.fired.add('conscript_hint');
        messages.push(
          '식량이 충분하다. 징병(conscript)으로 병력을 늘려라. 병력이 많을수록 남군 점령 확률이 높다.',
        );
      }
    }

    if (messages.length === 0) return null;
    return messages.join('\n');
  }
}
