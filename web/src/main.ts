import './styles/main.css';
import './styles/ink-wash.css';
import './styles/battle.css';
import './styles/cutscene.css';
import './styles/advisor.css';

import { GameController } from './game-controller.js';
import { Layout, type TabId } from './layout.js';
import { MapScreen } from './screens/map-screen.js';
import { CityScreen } from './screens/city-screen.js';
import { GeneralScreen } from './screens/general-screen.js';
import { DiplomacyScreen } from './screens/diplomacy-screen.js';
import { LogScreen } from './screens/log-screen.js';
import { BattleScreen } from './screens/battle-screen.js';
import { CutsceneScreen } from './screens/cutscene-screen.js';
import { AdvisorScreen } from './screens/advisor-screen.js';
import { ActionMenu } from './components/action-menu.js';
import { TurnSummary } from './components/turn-summary.js';
import type { GameState, GameAction, ActionResult, BattleState, EventResult, GameResult } from '../../core/data/types.js';

// ─── Bootstrap ─────────────────────────────────────────
const app = document.getElementById('app')!;
const controller = new GameController();
const layout = new Layout(app);

const playerFaction = '유비';

// ─── Screens ───────────────────────────────────────────
const mapScreen = new MapScreen();
const cityScreen = new CityScreen();
const generalScreen = new GeneralScreen();
const diplomacyScreen = new DiplomacyScreen();
const logScreen = new LogScreen();
const battleScreen = new BattleScreen();
const cutsceneScreen = new CutsceneScreen();
const advisorScreen = new AdvisorScreen();

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
  const result = controller.executeAction(action);
  showToast(result.description, result.success);
  logScreen.addEntry(controller.getState().turn, result.description, 'action');

  if (result.battleTriggered) {
    startBattle(result.battleTriggered);
  }

  // 책사에게 행동 결과 알림
  advisorScreen.notifyAction(result.description, result.success, controller.getState());

  updateUI();
}

// Wire action callbacks
actionMenu.onAction(executeAction);

cityScreen.onExecuteAction((action) => {
  executeAction(action as GameAction);
});

diplomacyScreen.onExecuteAction((action) => {
  executeAction(action as GameAction);
});

// ─── Turn End ──────────────────────────────────────────
let pendingCutsceneEvents: EventResult[] = [];

actionMenu.onEndTurn(() => {
  const completedTurn = controller.getState().turn;

  // 스냅샷: 턴 종료 전 상태 저장
  turnSummary.captureBeforeState(controller.getState());

  const result = controller.endTurn();

  // 이벤트 로그 기록
  for (const evt of result.events) {
    logScreen.addEntry(controller.getState().turn, `[이벤트] ${evt.description}`, 'event');
  }

  if (result.gameOver && result.result) {
    showGameOver(result.result);
    updateUI();
    return;
  }

  // 컷신 대기열에 저장
  pendingCutsceneEvents = result.events;

  // 턴 요약 화면 표시
  turnSummary.show(controller.getState(), result, completedTurn);
});

// 턴 요약 닫힌 후 → 컷신(있으면) → 책사 브리핑
turnSummary.onDismiss(() => {
  // 컷신이 있으면 먼저 표시
  if (pendingCutsceneEvents.length > 0) {
    processCutscenes(pendingCutsceneEvents);
    pendingCutsceneEvents = [];
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
  battleScreen.render(layout.getOverlayArea(), battle, controller.getState().generals);

  // 책사에게 전투 발생 알림
  advisorScreen.notifyBattle(battle.location, controller.getState());
}

battleScreen.onExecuteTactic((tacticId) => {
  const result = controller.executeBattleTactic(tacticId);
  if (result) {
    if (result.isOver) {
      battleScreen.showResult(result, playerFaction);
    } else {
      battleScreen.update(result, controller.getState().generals);
    }
  }
});

battleScreen.onRetreatClick(() => {
  layout.hideOverlay();
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
    <button class="btn btn-primary" onclick="location.reload()">다시 시작</button>
  `;
  overlay.appendChild(panel);
}

// ─── Start Game ────────────────────────────────────────
const turnInfo = controller.startGame();
updateUI();

// Show opening cutscene
const state = controller.getState();
if (state.completedEvents.length === 0) {
  // Try opening cutscene
  layout.showOverlay();
  const started = cutsceneScreen.start(layout.getOverlayArea(), 'opening');
  if (!started) {
    layout.hideOverlay();
  }
}

console.log('AI 삼국지 — 적벽대전 시작!', turnInfo);
