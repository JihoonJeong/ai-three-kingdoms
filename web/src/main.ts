import './styles/main.css';
import './styles/ink-wash.css';
import './styles/battle.css';
import './styles/cutscene.css';
import './styles/advisor.css';
import './styles/setup.css';

import { GameController } from './game-controller.js';
import { Layout } from './layout.js';
import { MapScreen } from './screens/map-screen.js';
import { CityScreen } from './screens/city-screen.js';
import { GeneralScreen } from './screens/general-screen.js';
import { DiplomacyScreen } from './screens/diplomacy-screen.js';
import { LogScreen } from './screens/log-screen.js';
import { BattleScreen } from './screens/battle-screen.js';
import { CutsceneScreen } from './screens/cutscene-screen.js';
import { AdvisorScreen } from './screens/advisor-screen.js';
import { SetupScreen } from './screens/setup-screen.js';
import { ActionMenu } from './components/action-menu.js';
import { TurnSummary } from './components/turn-summary.js';
import { checkConfig, testConnection } from './services/config-api.js';
import { requestFactionTurn } from './services/advisor-api.js';
import { getTotalTroopsOfCity } from '../../core/data/types.js';
import type { GameState, GameAction, BattleState, EventResult, GameResult } from '../../core/data/types.js';
import type { FactionLLMClient } from '../../core/advisor/faction-llm-client.js';

// ─── Bootstrap ─────────────────────────────────────────
const app = document.getElementById('app')!;

const playerFaction = '유비';

async function boot(): Promise<void> {
  let aiEnabled = false;
  let modelName: string | null = null;

  try {
    const config = await checkConfig();
    modelName = config.model;
    if (config.configured) {
      // 기존 설정 발견 → 연결 테스트 후 확인
      aiEnabled = await confirmExistingConfig(config);
    } else {
      // 미설정 → 설정 마법사 표시
      aiEnabled = await showSetupWizard();
    }

    // 마법사에서 모델을 변경했을 수 있으므로 최신 설정 반영
    if (aiEnabled) {
      try {
        const updated = await checkConfig();
        if (updated.model) modelName = updated.model;
      } catch { /* ignore */ }
    }
  } catch {
    // 서버 연결 실패 → AI 없이 시작
    aiEnabled = false;
  }

  startGame(aiEnabled, modelName);
}

/** 추론(thinking) 모델 감지 — 게임에 부적합 (너무 느림) */
const THINKING_MODEL_RE = /deep|reason|think|reflect/i;

/** 기존 설정 발견 시: 연결 테스트 → 사용 여부 확인 */
async function confirmExistingConfig(config: {
  provider: string | null;
  model: string | null;
  source: string;
}): Promise<boolean> {
  if (!config.provider || !config.model) return false;

  // thinking 모델이면 마법사로 안내 (게임에 부적합)
  if (THINKING_MODEL_RE.test(config.model)) {
    return showSetupWizard();
  }

  // 연결 테스트
  const test = await testConnection({
    provider: config.provider,
    model: config.model,
  });

  if (test.success) {
    // 연결 성공 → 사용 확인 화면
    return showExistingConfigPrompt(config.provider, config.model, config.source);
  } else {
    // 연결 실패 → 마법사로 안내
    return showSetupWizard();
  }
}

/** "기존 설정을 사용하시겠습니까?" 확인 화면 */
function showExistingConfigPrompt(
  provider: string,
  model: string,
  source: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'setup-overlay';

    const PROVIDER_NAMES: Record<string, string> = {
      claude: 'Claude (Anthropic)',
      openai: 'OpenAI',
      gemini: 'Google Gemini',
      ollama: 'Ollama (로컬)',
    };

    const sourceLabel = source === 'env-file' ? '.env 파일' : '환경변수';
    const providerName = PROVIDER_NAMES[provider] || provider;

    const wizard = document.createElement('div');
    wizard.className = 'setup-wizard';
    wizard.innerHTML = `
      <h1>AI 삼국지</h1>
      <div class="setup-subtitle">기존 AI 설정이 감지되었습니다</div>
      <div class="setup-form" style="text-align:center; margin-bottom:var(--space-lg)">
        <div style="background:rgba(0,0,0,0.04); border-radius:12px; padding:var(--space-md); margin-bottom:var(--space-sm)">
          <div style="font-size:13px; color:var(--color-charcoal); margin-bottom:var(--space-xs)">출처: ${sourceLabel}</div>
          <div style="font-size:18px; font-weight:700; color:var(--color-ink)">${providerName}</div>
          <div style="font-size:13px; color:var(--color-charcoal); margin-top:var(--space-xs)">${model}</div>
        </div>
        <div class="setup-test-result success">연결 확인 완료</div>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'setup-actions';
    actions.style.flexDirection = 'column';

    const useBtn = document.createElement('button');
    useBtn.className = 'setup-btn setup-btn-primary';
    useBtn.style.width = '100%';
    useBtn.textContent = '이 설정으로 시작';
    useBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    const changeBtn = document.createElement('button');
    changeBtn.className = 'setup-btn setup-btn-secondary';
    changeBtn.style.width = '100%';
    changeBtn.textContent = '다른 AI 제공자 선택';
    changeBtn.addEventListener('click', () => {
      overlay.remove();
      showSetupWizard().then(resolve);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'setup-btn-skip';
    skipBtn.textContent = 'AI 없이 시작';
    skipBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    actions.append(useBtn, changeBtn, skipBtn);
    wizard.appendChild(actions);
    overlay.appendChild(wizard);
    app.appendChild(overlay);
  });
}

function showSetupWizard(): Promise<boolean> {
  return new Promise((resolve) => {
    const setup = new SetupScreen();
    setup.onComplete(() => resolve(true));
    setup.onSkip(() => resolve(false));
    setup.render(app);
  });
}

function startGame(aiEnabled: boolean, modelName?: string | null): void {
  // 앱 영역 초기화 (마법사 제거 후)
  app.innerHTML = '';

  const controller = new GameController();

  // 하이브리드 Faction AI: LLM 자율 행동 + 마일스톤 안전장치
  if (aiEnabled) {
    const llmClient: FactionLLMClient = {
      requestFactionTurn: (factionId, gameState) =>
        requestFactionTurn(factionId, gameState),
    };
    controller.setLLMClient(llmClient);
  }

  const layout = new Layout(app);

  // ─── Screens ───────────────────────────────────────────
  const mapScreen = new MapScreen();
  const cityScreen = new CityScreen();
  const generalScreen = new GeneralScreen();
  const diplomacyScreen = new DiplomacyScreen();
  const logScreen = new LogScreen();
  const battleScreen = new BattleScreen();
  const cutsceneScreen = new CutsceneScreen();
  const advisorScreen = new AdvisorScreen();

  advisorScreen.setAiEnabled(aiEnabled);
  if (modelName) advisorScreen.setModelName(modelName);

  const turnSummary = new TurnSummary();

  cityScreen.setPlayerFaction(playerFaction);
  diplomacyScreen.setPlayerFaction(playerFaction);

  // ─── Action Menu ───────────────────────────────────────
  const actionMenu = new ActionMenu(layout.getFooterActions());
  actionMenu.setPlayerFaction(playerFaction);

  // ─── Screen Rendering ──────────────────────────────────
  function renderCurrentTab(state: GameState): void {
    const content = layout.getContentArea();
    switch (layout.getActiveTab()) {
      case 'map':       mapScreen.render(content, state); break;
      case 'city':      cityScreen.render(content, state); break;
      case 'general':   generalScreen.render(content, state); break;
      case 'diplomacy': diplomacyScreen.render(content, state); break;
      case 'log':       logScreen.render(content, state); break;
      case 'advisor':   advisorScreen.render(content, state); break;
    }
  }

  layout.onTabChange(() => {
    renderCurrentTab(controller.getState());
  });

  // ─── Map → City navigation ─────────────────────────────
  mapScreen.onCitySelect((cityId) => {
    cityScreen.selectCity(cityId);
    layout.setActiveTab('city');
    renderCurrentTab(controller.getState());
  });

  // ─── Action Execution ──────────────────────────────────
  function executeAction(action: GameAction): void {
    try {
      const result = controller.executeAction(action);
      console.log('[executeAction]', action.action, result.success, result.description);
      showToast(result.description, result.success);
      logScreen.addEntry(controller.getState().turn, result.description, 'action');

      if (result.battleTriggered) {
        startBattle(result.battleTriggered);
      }

      // 행동 결과를 큐에 저장 (다음 턴 브리핑에서 일괄 코멘트)
      advisorScreen.queueActionResult(result.description, result.success, controller.getState());

      updateUI();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.error('[executeAction] 오류:', err);
      showToast(`행동 실행 오류: ${msg}`, false);
    }
  }

  // Wire action callbacks
  actionMenu.onAction(executeAction);

  cityScreen.onExecuteAction((action) => {
    executeAction(action as GameAction);
  });

  diplomacyScreen.onExecuteAction((action) => {
    executeAction(action as GameAction);
  });

  // 책사 추천 행동 실행
  advisorScreen.onExecuteAction((action) => {
    const before = controller.getState().actionsRemaining;
    executeAction(action);
    return controller.getState().actionsRemaining < before;
  });

  // ─── Turn End ──────────────────────────────────────────
  let pendingCutsceneEvents: EventResult[] = [];
  let pendingAIBattle = false;

  actionMenu.onEndTurn(async () => {
    const completedTurn = controller.getState().turn;

    // 스냅샷: 턴 종료 전 상태 저장
    turnSummary.captureBeforeState(controller.getState());

    // 턴 종료 버튼 비활성화 (LLM 호출 대기)
    actionMenu.setEnabled(false);

    const result = await controller.endTurn();

    actionMenu.setEnabled(true);

    // 이벤트 로그 기록
    for (const evt of result.events) {
      logScreen.addEntry(controller.getState().turn, `[이벤트] ${evt.description}`, 'event');
    }

    if (result.gameOver && result.result) {
      showGameOver(result.result);
      updateUI();
      return;
    }

    // AI 전투 대기열
    if (result.aiInitiatedBattle) {
      pendingAIBattle = true;
    }

    // 컷신 대기열에 저장
    pendingCutsceneEvents = result.events;

    // 턴 요약 화면 표시
    turnSummary.show(controller.getState(), result, completedTurn);
  });

  // 턴 요약 닫힌 후 → 컷신(있으면) → AI 전투(있으면) → 책사 브리핑
  turnSummary.onDismiss(() => {
    // 1. 컷신이 있으면 먼저 표시
    if (pendingCutsceneEvents.length > 0) {
      processCutscenes(pendingCutsceneEvents);
      pendingCutsceneEvents = [];
    }

    // 2. AI 전투 처리
    if (pendingAIBattle) {
      pendingAIBattle = false;
      const battle = controller.getActiveBattle();
      if (battle) {
        startBattle(battle);
        return; // 책사 브리핑은 전투 후
      }
    }

    if (!cutsceneScreen.isActive()) {
      // 책사 탭으로 전환하고 자동 브리핑 요청
      layout.setActiveTab('advisor');
      renderCurrentTab(controller.getState());
      advisorScreen.requestTurnBriefing(controller.getState());
    }

    updateUI();
  });

  // ─── Battle ────────────────────────────────────────────
  function startBattle(battle: BattleState): void {
    layout.showOverlay();
    const state = controller.getState();
    const locCity = state.cities.find(c => c.id === battle.location);
    const locBf = state.battlefields.find(b => b.id === battle.location);
    const locationName = locCity?.name ?? locBf?.name ?? battle.location;
    battleScreen.render(layout.getOverlayArea(), battle, state.generals, playerFaction, locationName);

    // 책사에게 전투 발생 알림
    advisorScreen.notifyBattle(battle.location, state);
  }

  battleScreen.onExecuteTactic((tacticId) => {
    const result = controller.executeBattleTactic(tacticId);
    if (result) {
      if (result.isOver) {
        battleScreen.showResult(result, playerFaction);
      } else {
        battleScreen.showTurnResult(result, controller.getState().generals);
      }
    }
  });

  battleScreen.onRetreatClick(() => {
    layout.hideOverlay();

    // AI 전투 종료 후 다음 턴 시작이 필요한 경우
    const state = controller.getState();
    if (!state.activeBattle && state.actionsRemaining === 0) {
      controller.startNextTurn();
      // 책사 브리핑 요청
      layout.setActiveTab('advisor');
      renderCurrentTab(controller.getState());
      advisorScreen.requestTurnBriefing(controller.getState());
    }

    updateUI();
  });

  // ─── Cutscenes ─────────────────────────────────────────
  function processCutscenes(events: EventResult[]): void {
    for (const evt of events) {
      layout.showOverlay();
      const started = cutsceneScreen.start(layout.getOverlayArea(), evt.eventId);
      if (started) break; // Show one cutscene at a time
      layout.hideOverlay();
    }
  }

  cutsceneScreen.onCutsceneComplete(() => {
    layout.hideOverlay();

    // 컷신 종료 후 책사 브리핑
    layout.setActiveTab('advisor');
    renderCurrentTab(controller.getState());
    advisorScreen.requestTurnBriefing(controller.getState());

    updateUI();
  });

  // ─── UI Update ─────────────────────────────────────────
  function updateUI(): void {
    const state = controller.getState();
    layout.updateHeader(state.turn, state.maxTurns, state.season, state.actionsRemaining);
    layout.updateFooter(state, playerFaction);
    actionMenu.update(state);
    advisorScreen.updateState(state);
    renderCurrentTab(state);
  }

  // ─── Toast ─────────────────────────────────────────────
  function showToast(message: string, success: boolean): void {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderColor = success ? 'var(--color-success)' : 'var(--color-fail)';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // ─── Game Over ─────────────────────────────────────────
  function showGameOver(result: GameResult): void {
    layout.showOverlay();
    const overlay = layout.getOverlayArea();
    overlay.innerHTML = '';
    overlay.style.cssText += 'display:flex;align-items:center;justify-content:center;';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = 'max-width:500px;text-align:center;';
    panel.innerHTML = `
      <h1 style="color:var(--color-gold);font-size:32px;margin-bottom:var(--space-md)">${result.title}</h1>
      <p style="margin-bottom:var(--space-md)">${result.description}</p>
      <div style="display:flex;gap:var(--space-lg);justify-content:center;margin-bottom:var(--space-md);font-family:var(--font-data)">
        <span>등급: <strong>${result.grade}</strong></span>
        <span>턴: ${result.stats.totalTurns}</span>
        <span>전투 승: ${result.stats.battlesWon}</span>
      </div>
    `;

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:var(--space-sm);justify-content:center;';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-secondary';
    saveBtn.textContent = '기록 저장';
    saveBtn.addEventListener('click', () => downloadGameLog(result));

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn btn-primary';
    restartBtn.textContent = '다시 시작';
    restartBtn.addEventListener('click', () => location.reload());

    btnWrap.append(saveBtn, restartBtn);
    panel.appendChild(btnWrap);
    overlay.appendChild(panel);
  }

  function downloadGameLog(result: GameResult): void {
    const state = controller.getState();
    const log = {
      version: 1,
      exportedAt: new Date().toISOString(),
      result,
      summary: {
        turns: state.turn,
        grade: result.grade,
        battlesWon: result.stats.battlesWon,
        battlesLost: result.stats.battlesLost,
      },
      finalState: {
        cities: state.cities.map(c => ({
          id: c.id, name: c.name, owner: c.owner,
          troops: getTotalTroopsOfCity(c), food: c.food,
          morale: c.morale, training: c.training,
        })),
        generals: state.generals.map(g => ({
          id: g.id, name: g.name, faction: g.faction,
          location: g.location, condition: g.condition,
        })),
        diplomacy: state.diplomacy,
        flags: state.flags,
      },
      actionLog: state.actionLog,
      eventLog: logScreen.getEntries(),
    };

    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `삼국지-${result.grade}-턴${state.turn}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── 설정 재진입 (책사 화면에서) ────────────────────────
  advisorScreen.onSettingsClick(() => {
    const setup = new SetupScreen();
    setup.onComplete(async () => {
      advisorScreen.setAiEnabled(true);
      // 새 설정에서 모델명 갱신
      try {
        const newConfig = await checkConfig();
        if (newConfig.model) advisorScreen.setModelName(newConfig.model);
      } catch { /* ignore */ }
      const content = layout.getContentArea();
      advisorScreen.resetForNewProvider();
      advisorScreen.render(content, controller.getState());
    });
    setup.onSkip(() => {
      // 마법사 취소 시 변경 없음
    });
    setup.render(document.body);
  });

  // ─── Start Game ────────────────────────────────────────
  const turnInfo = controller.startGame();
  updateUI();

  // Show opening cutscene
  const state = controller.getState();
  if (state.completedEvents.length === 0) {
    layout.showOverlay();
    const started = cutsceneScreen.start(layout.getOverlayArea(), 'opening');
    if (!started) {
      layout.hideOverlay();
    }
  }

  console.log('AI 삼국지 — 적벽대전 시작!', turnInfo);
}

// ─── Boot ──────────────────────────────────────────────
boot();
