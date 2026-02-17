// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 경험 추출기 — SimResult → GameExperience 변환
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// LLM 호출 없음 — 순수 규칙 기반으로 턴 로그를 분석하여 경험을 추출한다.

import type { SimResult, TurnLog } from '../sim-config.js';
import type {
  GameExperience,
  StrategyProfile,
  StrategyPhase,
  TurningPoint,
} from './experience-types.js';
import { calculateBProximity } from './b-proximity-score.js';

/** 배열에서 최빈값을 구한다 */
function mode(arr: string[]): string | undefined {
  if (arr.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = arr[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

export class ExperienceExtractor {
  /** 턴 로그를 분석하여 전략 프로파일을 생성 */
  static extractProfile(result: SimResult): StrategyProfile {
    return this.extractProfileFromLogs(result.turnLogs);
  }

  /** 게임 중간 분석용 — 부분 턴 로그에서 프로파일 추출 */
  static extractPartialProfile(turnLogs: TurnLog[]): StrategyProfile {
    return this.extractProfileFromLogs(turnLogs);
  }

  private static extractProfileFromLogs(turnLogs: TurnLog[]): StrategyProfile {
    const actionCounts: Record<string, number> = {};

    for (const turnLog of turnLogs) {
      for (const { action } of turnLog.actions) {
        // GameAction: { type: 'domestic'|..., action: 'develop'|... }
        const actionName = action.action;
        actionCounts[actionName] = (actionCounts[actionName] || 0) + 1;
      }
    }

    // transfer 패턴 분석
    const transfers = turnLogs.flatMap(t =>
      t.actions.filter(a => a.action.action === 'transfer')
    );
    const transferTargets = transfers
      .map(t => (t.action.params as Record<string, string>)?.to)
      .filter(Boolean);
    const concentrationTarget = mode(transferTargets);

    // 첫 march 턴 찾기
    const firstMarchLog = turnLogs.find(t =>
      t.actions.some(a => a.action.action === 'march')
    );

    // march 타겟 수집
    const marchTargets = this.extractMarchTargets(turnLogs);

    // 전략 단계 추출
    const phases = this.detectPhases(turnLogs);

    // 핵심 행동 추출
    const criticalActions = this.extractCriticalActions(turnLogs);

    return {
      actionCounts,
      phases,
      criticalActions,
      transferPattern: {
        totalTransfers: transfers.length,
        concentrationTarget,
        totalTroopsMoved: 0, // 정확한 계산은 행동 결과에서 불가
      },
      firstMarchTurn: firstMarchLog?.turn ?? null,
      marchTargets,
    };
  }

  /** 규칙 기반 교훈 추출 (LLM 불필요) */
  static extractLessons(result: SimResult, profile: StrategyProfile): string[] {
    const lessons: string[] = [];

    // 승리 패턴 교훈
    if (result.flags['chibiVictory']) {
      if (profile.transferPattern.totalTransfers >= 3) {
        lessons.push(
          `보급(transfer)으로 ${profile.transferPattern.concentrationTarget || '전진기지'}에 ` +
          `병력을 집중한 것이 적벽 승리의 핵심이었다.`
        );
      }
      if (profile.firstMarchTurn && profile.firstMarchTurn >= 10) {
        lessons.push(
          `내정과 훈련을 충분히 한 후 턴 ${profile.firstMarchTurn}에 진군하여 ` +
          `전투력이 높은 상태에서 교전한 것이 효과적이었다.`
        );
      }
    }

    // 패배 패턴 교훈
    if (!result.flags['chibiVictory']) {
      if (profile.transferPattern.totalTransfers === 0) {
        lessons.push(
          '보급(transfer)을 한 번도 사용하지 않아 병력이 분산되었다. ' +
          '인접 아군 도시 간 병력 집중(transfer)이 필수적이다.'
        );
      }
      if (!profile.firstMarchTurn) {
        lessons.push(
          '한 번도 진군(march)하지 않아 적벽 전투에 참여하지 못했다. ' +
          '턴 10~14 사이에 적벽으로 진군해야 한다.'
        );
      }
      if ((profile.actionCounts['develop'] || 0) > 8) {
        lessons.push(
          `개발(develop)에 ${profile.actionCounts['develop']}회를 사용하여 ` +
          `군사 준비 시간이 부족했다. 내정은 최소화하고 군비에 집중해야 한다.`
        );
      }
      if ((profile.actionCounts['send_envoy'] || 0) + (profile.actionCounts['gift'] || 0) > 5) {
        lessons.push(
          '외교에 과도한 행동을 소비했다. 동맹은 1~2회 사신으로 충분하며, ' +
          '나머지는 군사 준비에 투자해야 한다.'
        );
      }
    }

    // 공통 교훈
    if (profile.phases.length <= 1) {
      lessons.push(
        '한 가지 유형의 행동만 반복했다. ' +
        '초반 내정 → 중반 집결/훈련 → 후반 진군의 3단계 전략이 효과적이다.'
      );
    }

    return lessons.slice(0, 3);
  }

  /** 전환점 추출 */
  static extractTurningPoints(result: SimResult): TurningPoint[] {
    const points: TurningPoint[] = [];

    for (const tl of result.turnLogs) {
      // 전투 전환점
      for (const battle of tl.battles) {
        const won = battle.result?.winner === '유비';
        points.push({
          turn: tl.turn,
          type: 'battle',
          description: `${battle.location} ${won ? '승리' : '패배'}`,
          outcome: won ? 'positive' : 'negative',
        });
      }

      // 첫 march
      for (const { action, result: actionResult } of tl.actions) {
        if (action.action === 'march' && actionResult.success) {
          const params = action.params as Record<string, string>;
          points.push({
            turn: tl.turn,
            type: 'action',
            description: `${params.from} → ${params.to} 진군`,
            outcome: 'positive',
          });
          break; // 턴당 첫 march만
        }
      }

      // 동맹 관련 이벤트
      for (const event of tl.events) {
        if (event.includes('동맹') || event.includes('연합')) {
          points.push({
            turn: tl.turn,
            type: 'event',
            description: event,
            outcome: 'positive',
          });
        }
      }
    }

    return points;
  }

  /** SimResult → GameExperience 전체 변환 */
  static extract(result: SimResult, gameNumber: number): GameExperience {
    const profile = this.extractProfile(result);
    const lessons = this.extractLessons(result, profile);
    const turningPoints = this.extractTurningPoints(result);

    // 초기 유비 도시 (강하, 하구)
    const initialCities = ['gangha', 'hagu'];

    // B근접도 점수 계산
    const bProximity = calculateBProximity(result);

    return {
      gameId: result.gameId,
      gameNumber,
      grade: result.grade,
      chibiVictory: !!result.flags['chibiVictory'],
      totalTurns: result.totalTurns,
      citiesCaptured: result.finalState.cities
        .filter(c => c.owner === '유비' && !initialCities.includes(c.id))
        .map(c => c.id),
      allianceMaintained: true, // 외교 상태 추적은 finalState에 없음
      generalsLost: result.finalState.generals
        .filter(g => g.faction === '유비' && (g.condition === '사망' || g.condition === '포로'))
        .map(g => g.id),
      strategyProfile: profile,
      lessons,
      turningPoints,
      bProximityScore: bProximity.total,
      bProximityBreakdown: bProximity,
    };
  }

  /** march 타겟 도시 수집 */
  private static extractMarchTargets(turnLogs: TurnLog[]): string[] {
    const targets = new Set<string>();
    for (const tl of turnLogs) {
      for (const { action } of tl.actions) {
        if (action.action === 'march') {
          const to = (action.params as Record<string, string>)?.to;
          if (to) targets.add(to);
        }
      }
    }
    return [...targets];
  }

  /** 전략 단계 감지 — 연속 2턴 이상 같은 유형 주도 행동 */
  private static detectPhases(turnLogs: TurnLog[]): StrategyPhase[] {
    if (turnLogs.length === 0) return [];

    // 각 턴의 주도 행동 유형 파악
    const turnDominant: Array<{ turn: number; dominant: string }> = [];
    for (const tl of turnLogs) {
      const counts: Record<string, number> = {};
      for (const { action } of tl.actions) {
        const name = action.action;
        counts[name] = (counts[name] || 0) + 1;
      }
      // 행동이 없으면 skip
      if (Object.keys(counts).length === 0) continue;

      // 가장 많은 행동 유형
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      turnDominant.push({ turn: tl.turn, dominant });
    }

    if (turnDominant.length === 0) return [];

    // 행동 유형을 전략 카테고리로 매핑
    const categorize = (action: string): string => {
      if (['develop', 'conscript', 'recruit'].includes(action)) return 'domestic';
      if (['transfer', 'train'].includes(action)) return 'consolidation';
      if (['march', 'scout', 'fortify', 'ambush'].includes(action)) return 'military';
      if (['send_envoy', 'persuade', 'threaten', 'gift'].includes(action)) return 'diplomacy';
      return 'domestic';
    };

    // 연속 같은 카테고리를 하나의 phase로 합치기
    const phases: StrategyPhase[] = [];
    let current = {
      category: categorize(turnDominant[0].dominant),
      startTurn: turnDominant[0].turn,
      endTurn: turnDominant[0].turn,
      actions: new Set<string>([turnDominant[0].dominant]),
    };

    for (let i = 1; i < turnDominant.length; i++) {
      const cat = categorize(turnDominant[i].dominant);
      if (cat === current.category) {
        current.endTurn = turnDominant[i].turn;
        current.actions.add(turnDominant[i].dominant);
      } else {
        phases.push({
          name: current.category,
          startTurn: current.startTurn,
          endTurn: current.endTurn,
          dominantActions: [...current.actions],
        });
        current = {
          category: cat,
          startTurn: turnDominant[i].turn,
          endTurn: turnDominant[i].turn,
          actions: new Set<string>([turnDominant[i].dominant]),
        };
      }
    }
    // 마지막 phase
    phases.push({
      name: current.category,
      startTurn: current.startTurn,
      endTurn: current.endTurn,
      dominantActions: [...current.actions],
    });

    // 1턴짜리 phase는 인접 phase에 병합 (최소 2턴)
    return phases.filter(p => p.endTurn - p.startTurn >= 1 || phases.length <= 2);
  }

  /** 핵심 행동 추출 (march, 첫 transfer 등) */
  private static extractCriticalActions(turnLogs: TurnLog[]): StrategyProfile['criticalActions'] {
    const critical: StrategyProfile['criticalActions'] = [];
    let firstTransfer = true;
    let firstMarch = true;

    for (const tl of turnLogs) {
      for (const { action, result } of tl.actions) {
        if (!result.success) continue;

        if (action.action === 'transfer' && firstTransfer) {
          const params = action.params as Record<string, string>;
          critical.push({
            turn: tl.turn,
            action: 'transfer',
            description: `${params.from} → ${params.to} 보급 시작`,
            impact: 'important',
          });
          firstTransfer = false;
        }

        if (action.action === 'march' && firstMarch) {
          const params = action.params as Record<string, string>;
          critical.push({
            turn: tl.turn,
            action: 'march',
            description: `${params.from} → ${params.to} 진군`,
            impact: 'decisive',
          });
          firstMarch = false;
        }
      }
    }

    return critical;
  }
}
