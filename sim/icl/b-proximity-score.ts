// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// B근접도 점수 — 0~100 연속 척도
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// A~F 등급보다 세밀한 평가. C등급 내에서도 "남군 진군을 시도한 C"와
// "적벽만 이긴 C"의 품질 차이를 포착한다.

import type { SimResult, TurnLog } from '../sim-config.js';

export interface BProximityBreakdown {
  chibiVictory: number;       // 0 or 30  — 적벽 승리 (필수 조건)
  troopConcentration: number; // 0~25     — 강하(gangha)에 모은 최대 병력
  marchAttempt: number;       // 0~15     — 남군 진군 시도 여부 + 병력 규모
  postChibiTransfer: number;  // 0~15     — 적벽 후 올바른 방향(hagu→gangha) 보급
  conscriptEffort: number;    // 0~10     — 징병(conscript) 활용도
  foodManagement: number;     // 0~5      — 식량 관리 (탈영 최소화)
  total: number;              // 0~100
}

/**
 * 적벽 후 특정 도시에 집결된 최대 병력 추정.
 *
 * 정밀한 턴별 스냅샷이 없으므로, transfer/conscript 성공 횟수로 추정한다.
 * - gangha 기본 병력(8000) + hagu→gangha transfer 성공 시 누적
 * - conscript 성공 시 추가 병력 추정
 */
export function estimateMaxTroopsAtCity(
  turnLogs: TurnLog[],
  cityId: string,
  afterChibi: boolean,
): number {
  let chibiOccurred = false;
  let estimatedTroops = 0;

  // 적벽 전 해당 도시의 기본 병력은 finalState에서 참고할 수 없으므로
  // transfer 성공 횟수 × 추정치로 계산
  const TRANSFER_ESTIMATE = 1500; // 평균 transfer 이동량 추정
  const CONSCRIPT_ESTIMATE = 1000; // 평균 conscript 획득량 추정

  for (const log of turnLogs) {
    if (log.events.some(e => e.includes('적벽') || e.includes('chibi'))) {
      chibiOccurred = true;
    }
    if (afterChibi && !chibiOccurred) continue;

    for (const { action, result } of log.actions) {
      if (!result.success) continue;

      const params = action.params as Record<string, string> | undefined;

      // transfer 성공: to가 cityId
      if (action.action === 'transfer' && params?.to === cityId) {
        // description에서 병력 수 파싱 시도
        const match = result.description.match(/(\d+)명/);
        estimatedTroops += match ? parseInt(match[1], 10) : TRANSFER_ESTIMATE;
      }

      // conscript 성공: city가 cityId
      if (action.action === 'conscript' && params?.city === cityId) {
        const match = result.description.match(/(\d+)명/);
        estimatedTroops += match ? parseInt(match[1], 10) : CONSCRIPT_ESTIMATE;
      }
    }
  }

  return estimatedTroops;
}

/** 남군 진군 시도 목록 (시도한 턴 + 투입 병력) */
export function getNanjunMarchAttempts(
  result: SimResult,
): Array<{ turn: number; troops: number }> {
  const attempts: Array<{ turn: number; troops: number }> = [];

  for (const log of result.turnLogs) {
    for (const { action, result: actionResult } of log.actions) {
      const params = action.params as Record<string, string> | undefined;
      if (action.action === 'march' && params?.to === 'nanjun') {
        const troopsMatch = actionResult.description.match(/(\d+)명/);
        const troops = troopsMatch ? parseInt(troopsMatch[1], 10) : 0;
        attempts.push({ turn: log.turn, troops });
      }
    }
  }

  return attempts;
}

/** 적벽 후 특정 방향 보급 횟수 */
export function getPostChibiTransfers(
  result: SimResult,
  from: string,
  to: string,
): number {
  let chibiOccurred = false;
  let count = 0;

  for (const log of result.turnLogs) {
    if (log.events.some(e => e.includes('적벽') || e.includes('chibi'))) {
      chibiOccurred = true;
    }
    if (!chibiOccurred) continue;

    for (const { action, result: actionResult } of log.actions) {
      const params = action.params as Record<string, string> | undefined;
      if (
        action.action === 'transfer' &&
        params?.from === from &&
        params?.to === to &&
        actionResult.success
      ) {
        count++;
      }
    }
  }

  return count;
}

/** 특정 액션 타입의 총 성공 횟수 */
export function countActions(result: SimResult, actionType: string): number {
  let count = 0;
  for (const log of result.turnLogs) {
    for (const { action, result: actionResult } of log.actions) {
      if (action.action === actionType && actionResult.success) count++;
    }
  }
  return count;
}

/** 탈영 이벤트 횟수 (식량 부족으로 인한) */
export function countDesertionEvents(result: SimResult): number {
  let count = 0;
  for (const log of result.turnLogs) {
    for (const event of log.events) {
      if (event.includes('탈영') || event.includes('이탈')) count++;
    }
  }
  return count;
}

/** B근접도 점수 계산 */
export function calculateBProximity(result: SimResult): BProximityBreakdown {
  const breakdown: BProximityBreakdown = {
    chibiVictory: 0,
    troopConcentration: 0,
    marchAttempt: 0,
    postChibiTransfer: 0,
    conscriptEffort: 0,
    foodManagement: 0,
    total: 0,
  };

  // (1) 적벽 승리: 30점 (B의 필수 조건)
  if (result.flags['chibiVictory']) {
    breakdown.chibiVictory = 30;
  }

  // (2) 병력 집중도: 0~25점
  // 강하(gangha)에 도달한 최대 병력 추적 (적벽 후)
  const maxGanghaTroops = estimateMaxTroopsAtCity(result.turnLogs, 'gangha', true);
  // 8000명 이상이면 만점, 선형 비례
  breakdown.troopConcentration = Math.min(25, Math.floor((maxGanghaTroops / 8000) * 25));

  // (3) 남군 진군 시도: 0~15점
  const nanjunMarches = getNanjunMarchAttempts(result);
  if (nanjunMarches.length > 0) {
    const bestMarchTroops = Math.max(...nanjunMarches.map(m => m.troops));
    // 진군 시도 자체에 5점, 병력 규모에 따라 최대 10점 추가
    breakdown.marchAttempt = 5 + Math.min(10, Math.floor((bestMarchTroops / 8000) * 10));
  }

  // (4) 적벽 후 올바른 보급: 0~15점
  // hagu→gangha 보급 횟수 (적벽 후)
  const correctTransfers = getPostChibiTransfers(result, 'hagu', 'gangha');
  // 3회 이상이면 만점
  breakdown.postChibiTransfer = Math.min(15, correctTransfers * 5);

  // (5) 징병 활용: 0~10점
  const conscriptCount = countActions(result, 'conscript');
  // 5회 이상이면 만점
  breakdown.conscriptEffort = Math.min(10, conscriptCount * 2);

  // (6) 식량 관리: 0~5점
  // 탈영 이벤트 횟수 (적을수록 좋음)
  const desertions = countDesertionEvents(result);
  // 0회면 5점, 5회 이상이면 0점
  breakdown.foodManagement = Math.max(0, 5 - desertions);

  breakdown.total = breakdown.chibiVictory + breakdown.troopConcentration
    + breakdown.marchAttempt + breakdown.postChibiTransfer
    + breakdown.conscriptEffort + breakdown.foodManagement;

  return breakdown;
}
