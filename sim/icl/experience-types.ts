// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICL 경험 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 게임 한 판에서 추출한 경험 */
export interface GameExperience {
  gameId: string;
  gameNumber: number;        // 순차 학습에서의 게임 순서
  grade: string;             // S/A/B/C/D/F
  chibiVictory: boolean;

  // 핵심 지표
  totalTurns: number;
  citiesCaptured: string[];
  allianceMaintained: boolean;
  generalsLost: string[];

  // 전략 요약 (자동 추출)
  strategyProfile: StrategyProfile;

  // 교훈 (규칙 기반 생성, 최대 3개)
  lessons: string[];

  // 핵심 전환점
  turningPoints: TurningPoint[];

  /** B근접도 점수 (0~100). C등급 내에서도 품질을 구분 */
  bProximityScore?: number;

  /** B근접도 세부 항목 */
  bProximityBreakdown?: {
    chibiVictory: number;
    troopConcentration: number;
    marchAttempt: number;
    postChibiTransfer: number;
    conscriptEffort: number;
    foodManagement: number;
    total: number;
  };
}

/** 전략 프로파일: 행동 패턴 분석 */
export interface StrategyProfile {
  // 행동 유형별 횟수
  actionCounts: Record<string, number>;

  // 전략 단계 전환
  phases: StrategyPhase[];

  // 핵심 행동 시퀀스 (승리 시 중요)
  criticalActions: Array<{
    turn: number;
    action: string;
    description: string;
    impact: 'decisive' | 'important' | 'minor';
  }>;

  // 보급(transfer) 패턴
  transferPattern: {
    totalTransfers: number;
    concentrationTarget?: string;  // 병력 집중 도시
    totalTroopsMoved: number;
  };

  // 진군(march) 타이밍
  firstMarchTurn: number | null;
  marchTargets: string[];
}

/** 전략 단계 */
export interface StrategyPhase {
  name: string;           // 'domestic' | 'consolidation' | 'military' | 'expansion'
  startTurn: number;
  endTurn: number;
  dominantActions: string[];
}

/** 전환점: 게임 결과에 결정적 영향을 준 이벤트/행동 */
export interface TurningPoint {
  turn: number;
  type: 'action' | 'event' | 'battle' | 'missed_opportunity';
  description: string;
  outcome: 'positive' | 'negative';
}

/** 경험 저장소 설정 */
export interface ExperienceStoreConfig {
  maxExperiences: number;     // 최대 저장 경험 수 (기본 20)
  selectionStrategy: 'recent' | 'best' | 'diverse' | 'balanced';
  promptBudget: number;       // Soft Shell에 할당할 최대 토큰 수 (기본 800)
}
