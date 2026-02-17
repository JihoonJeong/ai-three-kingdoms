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
  const gameStartTime = Date.now();

  function buildGameResultData(result: GameResult) {
    const state = controller.getState();
    return {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      provider: '', // 서버에서 채워짐
      model: modelName || '',
      totalTurns: result.stats.totalTurns,
      duration: Date.now() - gameStartTime,
      outcome: result.grade === 'F' ? 'defeat' as const : 'victory' as const,
      grade: result.grade,
      flags: {
        chibiVictory: !!state.flags['chibiVictory'],
        nanjunCaptured: state.cities.find(c => c.id === 'nanjun')?.owner === '유비' || false,
        allianceFormed: !!state.flags['allianceFormed'] || state.diplomacy.relations.some(
          r => ((r.factionA === '유비' && r.factionB === '손권') || (r.factionA === '손권' && r.factionB === '유비')) && r.isAlliance
        ),
        liuBeiAlive: state.generals.find(g => g.id === 'liubei')?.condition === '양호' || false,
      },
      result,
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
      },
      actionLog: state.actionLog,
    };
  }

  function showGameOver(result: GameResult): void {
    layout.showOverlay();
    const overlay = layout.getOverlayArea();
    overlay.innerHTML = '';
    overlay.style.cssText += 'display:flex;align-items:center;justify-content:center;overflow-y:auto;';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = 'max-width:520px;text-align:center;padding:var(--space-xl);';

    // 등급 + 제목 + 설명
    panel.innerHTML = `
      <h1 style="color:var(--color-gold);font-size:32px;margin-bottom:var(--space-sm)">${result.title}</h1>
      <div style="font-size:48px;margin-bottom:var(--space-sm);font-family:var(--font-data)">${result.grade}</div>
      <p style="margin-bottom:var(--space-lg);line-height:1.6">${result.description}</p>
    `;

    // ── 상세 전과 ──
    const statsSection = document.createElement('div');
    statsSection.style.cssText = 'text-align:left;border-top:1px solid rgba(0,0,0,0.1);padding-top:var(--space-md);margin-bottom:var(--space-lg);';
    statsSection.innerHTML = `
      <div style="font-weight:700;margin-bottom:var(--space-sm);text-align:center">전과</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xs) var(--space-lg);font-size:14px;font-family:var(--font-data)">
        <span>전투 승리</span><span style="text-align:right"><strong>${result.stats.battlesWon}회</strong></span>
        <span>도시 점령</span><span style="text-align:right"><strong>${result.stats.citiesCaptured}/3</strong></span>
        <span>적장 포로</span><span style="text-align:right"><strong>${result.stats.generalsCaptured}명</strong></span>
        <span>적군 격파</span><span style="text-align:right"><strong>${result.stats.enemiesDefeated.toLocaleString()}명</strong></span>
        <span>소요 턴</span><span style="text-align:right"><strong>${result.stats.totalTurns}턴</strong></span>
        <span>최대 병력</span><span style="text-align:right"><strong>${result.stats.maxTroops.toLocaleString()}명</strong></span>
      </div>
    `;
    panel.appendChild(statsSection);

    // ── 공유 섹션 ──
    const shareSection = document.createElement('div');
    shareSection.style.cssText = 'border-top:1px solid rgba(0,0,0,0.1);padding-top:var(--space-md);margin-bottom:var(--space-lg);';
    shareSection.innerHTML = `
      <div style="font-size:13px;color:var(--color-charcoal);margin-bottom:var(--space-sm);text-align:center">
        연구에 도움을 주세요! 익명화된 게임 결과를 공유합니다.
      </div>
    `;

    const shareBtnWrap = document.createElement('div');
    shareBtnWrap.style.cssText = 'display:flex;gap:var(--space-sm);justify-content:center;';

    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn btn-secondary';
    dlBtn.textContent = '결과 파일 다운로드';
    dlBtn.addEventListener('click', () => downloadGameLog(result));

    const mailBtn = document.createElement('button');
    mailBtn.className = 'btn btn-secondary';
    mailBtn.textContent = '이메일로 전송';
    mailBtn.addEventListener('click', () => {
      const subject = encodeURIComponent(`AI 삼국지 결과 — ${result.grade}등급 ${result.stats.totalTurns}턴`);
      const body = encodeURIComponent(
        `AI 삼국지 게임 결과를 공유합니다.\n\n` +
        `등급: ${result.grade}\n턴: ${result.stats.totalTurns}\n전투 승: ${result.stats.battlesWon}\n` +
        `도시 점령: ${result.stats.citiesCaptured}\n적군 격파: ${result.stats.enemiesDefeated}\n\n` +
        `(결과 JSON 파일을 다운로드 후 이메일에 첨부해 주세요)`
      );
      window.open(`mailto:?subject=${subject}&body=${body}`);
    });

    shareBtnWrap.append(dlBtn, mailBtn);
    shareSection.appendChild(shareBtnWrap);
    panel.appendChild(shareSection);

    // ── 메인 버튼 ──
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:var(--space-sm);justify-content:center;';

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn btn-primary';
    restartBtn.textContent = '다시 시작';
    restartBtn.addEventListener('click', () => location.reload());

    btnWrap.append(restartBtn);
    panel.appendChild(btnWrap);
    overlay.appendChild(panel);

    // ── 자동 저장 (fire-and-forget) ──
    const data = buildGameResultData(result);
    fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => { /* 저장 실패해도 무시 */ });
  }

  function downloadGameLog(result: GameResult): void {
    const data = buildGameResultData(result);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const state = controller.getState();
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
