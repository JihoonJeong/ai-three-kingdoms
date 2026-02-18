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
import { getTotalTroopsOfCity, LANGUAGE_NAMES } from '../../core/data/types.js';
import type { GameState, GameAction, BattleState, EventResult, GameResult, GameLanguage } from '../../core/data/types.js';
import type { FactionLLMClient } from '../../core/advisor/faction-llm-client.js';
import { setLanguage, t, getLanguage } from '../../core/i18n/index.js';

// ─── Config ───────────────────────────────────────────
// Google Forms — 결과 공유 엔드포인트
const RESULT_SHARE_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdlMNJM80ZIdznIq0M6Srq0rQboRM13tJnbyBj2sW1JCK_k0A/formResponse';
const RESULT_SHARE_FIELD = 'entry.108322068';

// ─── Bootstrap ─────────────────────────────────────────
const app = document.getElementById('app')!;

const playerFaction = '유비';

/** 디바이스 고유 ID (localStorage 기반, 재방문 시 동일) */
function getDeviceId(): string {
  const KEY = 'device_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── Language Select ──────────────────────────────────
function detectLanguage(): GameLanguage {
  const nav = navigator.language?.toLowerCase() ?? '';
  if (nav.startsWith('ko')) return 'ko';
  if (nav.startsWith('zh')) return 'zh';
  if (nav.startsWith('ja')) return 'ja';
  return 'en';
}

function showLanguageSelect(): Promise<GameLanguage> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'setup-overlay';

    const wizard = document.createElement('div');
    wizard.className = 'setup-wizard';
    wizard.style.textAlign = 'center';

    const globe = document.createElement('div');
    globe.style.cssText = 'font-size:48px;margin-bottom:var(--space-md);';
    globe.textContent = '🌏';
    wizard.appendChild(globe);

    const detected = detectLanguage();
    let selected: GameLanguage = detected;

    const langs: GameLanguage[] = ['ko', 'en', 'zh', 'ja'];
    const optionsWrap = document.createElement('div');
    optionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-xs);margin-bottom:var(--space-lg);max-width:300px;margin-left:auto;margin-right:auto;';

    const buttons: HTMLElement[] = [];
    for (const lang of langs) {
      const btn = document.createElement('div');
      btn.className = 'difficulty-option' + (lang === selected ? ' selected' : '');
      btn.style.cssText = 'cursor:pointer;text-align:center;padding:var(--space-sm) var(--space-md);';
      btn.innerHTML = `<strong>${LANGUAGE_NAMES[lang]}</strong>`;
      btn.addEventListener('click', () => {
        selected = lang;
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      buttons.push(btn);
      optionsWrap.appendChild(btn);
    }
    wizard.appendChild(optionsWrap);

    const okBtn = document.createElement('button');
    okBtn.className = 'setup-btn setup-btn-primary';
    okBtn.style.width = '100%';
    okBtn.style.maxWidth = '300px';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(selected);
    });
    wizard.appendChild(okBtn);

    overlay.appendChild(wizard);
    app.appendChild(overlay);
  });
}

async function boot(): Promise<void> {
  // 1. 언어 선택 (첫 번째 단계)
  const lang = await showLanguageSelect();
  setLanguage(lang);

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

  const difficulty = await showDifficultySelect();
  const { coaching } = await showOpeningSequence();
  startGame(aiEnabled, modelName, difficulty, coaching);
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
      ollama: t('Ollama (로컬)'),
    };

    const sourceLabel = source === 'env-file' ? t('.env 파일') : t('환경변수');
    const providerName = PROVIDER_NAMES[provider] || provider;

    const wizard = document.createElement('div');
    wizard.className = 'setup-wizard';
    wizard.innerHTML = `
      <h1>${t('AI 삼국지')}</h1>
      <div class="setup-subtitle">${t('기존 AI 설정이 감지되었습니다')}</div>
      <div class="setup-form" style="text-align:center; margin-bottom:var(--space-lg)">
        <div style="background:rgba(0,0,0,0.04); border-radius:12px; padding:var(--space-md); margin-bottom:var(--space-sm)">
          <div style="font-size:13px; color:var(--color-charcoal); margin-bottom:var(--space-xs)">${t('출처:')} ${sourceLabel}</div>
          <div style="font-size:18px; font-weight:700; color:var(--color-ink)">${providerName}</div>
          <div style="font-size:13px; color:var(--color-charcoal); margin-top:var(--space-xs)">${model}</div>
        </div>
        <div class="setup-test-result success">${t('연결 확인 완료')}</div>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'setup-actions';
    actions.style.flexDirection = 'column';

    const useBtn = document.createElement('button');
    useBtn.className = 'setup-btn setup-btn-primary';
    useBtn.style.width = '100%';
    useBtn.textContent = t('이 설정으로 시작');
    useBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    const changeBtn = document.createElement('button');
    changeBtn.className = 'setup-btn setup-btn-secondary';
    changeBtn.style.width = '100%';
    changeBtn.textContent = t('다른 AI 제공자 선택');
    changeBtn.addEventListener('click', () => {
      overlay.remove();
      showSetupWizard().then(resolve);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'setup-btn-skip';
    skipBtn.textContent = t('AI 없이 시작');
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
    setup.setLanguage(getLanguage());
    setup.onComplete(() => resolve(true));
    setup.onSkip(() => resolve(false));
    setup.render(app);
  });
}

// ─── Difficulty Select ─────────────────────────────────
function getDifficultyOptions() {
  return [
    { id: 'easy',   label: t('쉬움'),   desc: t('적 병력 30% 감소, 아군 식량 50% 증가') },
    { id: 'medium', label: t('약간 쉬움'), desc: t('적 병력 20% 감소, 아군 식량 35% 증가') },
    { id: 'normal', label: t('보통'),   desc: t('적 병력 15% 감소, 아군 식량 25% 증가'), recommended: true as const },
    { id: 'hard',   label: t('어려움'), desc: t('시나리오 기본값, 손권 지원 강화') },
    { id: 'expert', label: t('매우 어려움'), desc: t('적 병력 20% 증가') },
  ];
}

function showDifficultySelect(): Promise<string> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'setup-overlay';

    const wizard = document.createElement('div');
    wizard.className = 'setup-wizard';

    const title = document.createElement('h1');
    title.textContent = t('AI 삼국지');
    wizard.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'setup-subtitle';
    subtitle.textContent = t('난이도 선택');
    wizard.appendChild(subtitle);

    let selected = 'normal';

    const optionsWrap = document.createElement('div');
    optionsWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-xs);margin-bottom:var(--space-lg);';

    for (const opt of getDifficultyOptions()) {
      const card = document.createElement('div');
      card.className = 'difficulty-option' + (opt.id === selected ? ' selected' : '');
      card.dataset.id = opt.id;
      card.innerHTML = `
        <div class="difficulty-option-header">
          <strong>${opt.label}</strong>
          ${'recommended' in opt ? `<span class="difficulty-recommended">${t('추천')}</span>` : ''}
        </div>
        <div class="difficulty-option-desc">${opt.desc}</div>
      `;
      card.addEventListener('click', () => {
        selected = opt.id;
        optionsWrap.querySelectorAll('.difficulty-option').forEach(el => el.classList.remove('selected'));
        card.classList.add('selected');
      });
      optionsWrap.appendChild(card);
    }
    wizard.appendChild(optionsWrap);

    const startBtn = document.createElement('button');
    startBtn.className = 'setup-btn setup-btn-primary';
    startBtn.style.width = '100%';
    startBtn.textContent = t('게임 시작');
    startBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(selected);
    });
    wizard.appendChild(startBtn);

    overlay.appendChild(wizard);
    app.appendChild(overlay);
  });
}

// ─── Opening Sequence ──────────────────────────────────
const OPENING_SEEN_KEY = 'opening_seen';

function showOpeningSequence(): Promise<{ coaching: boolean }> {
  // "다시 보지 않기" 체크된 경우 스킵
  if (localStorage.getItem(OPENING_SEEN_KEY)) {
    return Promise.resolve({ coaching: true });
  }

  return new Promise((resolve) => {
    let currentPage = 0;
    let coaching = true;
    const totalPages = 4;

    const overlay = document.createElement('div');
    overlay.className = 'setup-overlay';

    const wizard = document.createElement('div');
    wizard.className = 'setup-wizard';

    // 인디케이터
    const indicators = document.createElement('div');
    indicators.className = 'opening-indicators';
    for (let i = 0; i < totalPages; i++) {
      const dot = document.createElement('div');
      dot.className = 'opening-dot' + (i === 0 ? ' active' : '');
      indicators.appendChild(dot);
    }
    wizard.appendChild(indicators);

    // 본문 영역
    const body = document.createElement('div');
    body.className = 'opening-body';
    wizard.appendChild(body);

    // 하단 영역 (버튼 + 체크박스)
    const footer = document.createElement('div');
    footer.style.textAlign = 'center';
    wizard.appendChild(footer);

    function updateIndicators(): void {
      const dots = indicators.querySelectorAll('.opening-dot');
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentPage);
      });
    }

    function renderPage(): void {
      body.innerHTML = '';
      footer.innerHTML = '';

      if (currentPage === 0) {
        // 화면 1 — 프로젝트 소개
        const title = document.createElement('h2');
        title.textContent = t('AI 삼국지: 적벽대전');
        body.appendChild(title);

        const desc = document.createElement('p');
        desc.textContent = t('이 게임은 대규모 언어모델(LLM)의 전략적 의사결정 능력을 탐구하는 연구 프로젝트입니다.');
        body.appendChild(desc);

        const credit = document.createElement('div');
        credit.className = 'opening-credit';
        credit.textContent = t('설계: JJ | 구현: Claude Code');
        body.appendChild(credit);

        const btn = document.createElement('button');
        btn.className = 'setup-btn setup-btn-primary';
        btn.style.width = '100%';
        btn.style.maxWidth = '300px';
        btn.textContent = t('다음');
        btn.addEventListener('click', () => { currentPage++; updateIndicators(); renderPage(); });
        footer.appendChild(btn);

      } else if (currentPage === 1) {
        // 화면 2 — 연구 맥락
        const p1 = document.createElement('p');
        p1.textContent = t('AI 책사 제갈량이 전략을 제안하고, 당신이 최종 결정을 내립니다.');
        body.appendChild(p1);

        const p2 = document.createElement('p');
        p2.textContent = t('같은 상황에서 AI가 어떤 판단을 내리는지 관찰해 보세요.');
        body.appendChild(p2);

        const btn = document.createElement('button');
        btn.className = 'setup-btn setup-btn-primary';
        btn.style.width = '100%';
        btn.style.maxWidth = '300px';
        btn.textContent = t('다음');
        btn.addEventListener('click', () => { currentPage++; updateIndicators(); renderPage(); });
        footer.appendChild(btn);

      } else if (currentPage === 2) {
        // 화면 3 — 플레이 가이드 + 코칭 토글
        const p1 = document.createElement('p');
        p1.textContent = t('매 턴 3가지 행동을 선택하세요. 제갈량의 추천을 참고하거나 무시할 수 있습니다.');
        body.appendChild(p1);

        const p2 = document.createElement('p');
        p2.textContent = t('20턴 안에 적벽대전 승리 + 남군 점령이 목표입니다.');
        body.appendChild(p2);

        // 토글 행
        const toggleRow = document.createElement('div');
        toggleRow.className = 'opening-toggle-row';

        const label = document.createElement('span');
        label.className = 'opening-toggle-label';
        label.textContent = t('전략 길잡이');
        toggleRow.appendChild(label);

        const toggle = document.createElement('label');
        toggle.className = 'opening-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = coaching;
        checkbox.addEventListener('change', () => {
          coaching = checkbox.checked;
          descEl.textContent = coaching
            ? t('핵심 전환점에서 방향을 안내합니다')
            : t('스스로 판단하여 플레이합니다');
        });
        const track = document.createElement('span');
        track.className = 'opening-toggle-track';
        const thumb = document.createElement('span');
        thumb.className = 'opening-toggle-thumb';
        toggle.append(checkbox, track, thumb);
        toggleRow.appendChild(toggle);

        const descEl = document.createElement('span');
        descEl.className = 'opening-toggle-desc';
        descEl.textContent = coaching
          ? t('핵심 전환점에서 방향을 안내합니다')
          : t('스스로 판단하여 플레이합니다');
        toggleRow.appendChild(descEl);

        body.appendChild(toggleRow);

        const btn = document.createElement('button');
        btn.className = 'setup-btn setup-btn-primary';
        btn.style.width = '100%';
        btn.style.maxWidth = '300px';
        btn.textContent = t('다음');
        btn.addEventListener('click', () => { currentPage++; updateIndicators(); renderPage(); });
        footer.appendChild(btn);

      } else if (currentPage === 3) {
        // 화면 4 — 시작 화면
        const quote = document.createElement('div');
        quote.className = 'opening-quote';
        quote.textContent = t('무릇 전쟁이란, 승리할 수 있는 조건을 먼저 만들고 싸우는 것이다.');
        body.appendChild(quote);

        const author = document.createElement('div');
        author.className = 'opening-quote-author';
        author.textContent = t('— 제갈량');
        body.appendChild(author);

        const btn = document.createElement('button');
        btn.className = 'setup-btn setup-btn-primary';
        btn.style.width = '100%';
        btn.style.maxWidth = '300px';
        btn.textContent = t('시작');
        btn.addEventListener('click', () => {
          if (skipCheck.checked) {
            localStorage.setItem(OPENING_SEEN_KEY, '1');
          }
          overlay.remove();
          resolve({ coaching });
        });
        footer.appendChild(btn);

        // "다시 보지 않기" 체크박스
        const skipLabel = document.createElement('label');
        skipLabel.className = 'opening-skip-check';
        const skipCheck = document.createElement('input');
        skipCheck.type = 'checkbox';
        skipLabel.appendChild(skipCheck);
        skipLabel.appendChild(document.createTextNode(t('다시 보지 않기')));
        footer.appendChild(skipLabel);
      }

      updateIndicators();
    }

    renderPage();
    overlay.appendChild(wizard);
    app.appendChild(overlay);
  });
}

function startGame(aiEnabled: boolean, modelName?: string | null, difficulty: string = 'normal', coaching: boolean = true): void {
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
  advisorScreen.setCoaching(coaching);

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
      showToast(t(result.description), result.success);
      logScreen.addEntry(controller.getState().turn, t(result.description), 'action');

      if (result.battleTriggered) {
        startBattle(result.battleTriggered);
      }

      // 행동 결과를 큐에 저장 (다음 턴 브리핑에서 일괄 코멘트)
      advisorScreen.queueActionResult(result.description, result.success, controller.getState());

      updateUI();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('알 수 없는 오류');
      console.error('[executeAction] 오류:', err);
      showToast(`${t('행동 실행 오류')}: ${msg}`, false);
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
      logScreen.addEntry(controller.getState().turn, `[${t('이벤트')}] ${t(evt.description)}`, 'event');
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

  function buildResultId(result: GameResult): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const lang = getLanguage();
    const model = (modelName || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '');
    const device = getDeviceId();
    return `${lang}_${model}_${result.grade}_${result.stats.totalTurns}T_${date}-${time}_${device}`;
  }

  function buildGameResultData(result: GameResult) {
    const state = controller.getState();
    const resultId = buildResultId(result);
    return {
      id: resultId,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      language: getLanguage(),
      deviceId: getDeviceId(),
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
      <h1 style="color:var(--color-gold);font-size:32px;margin-bottom:var(--space-sm)">${t(result.title)}</h1>
      <div style="font-size:48px;margin-bottom:var(--space-sm);font-family:var(--font-data)">${result.grade}</div>
      <p style="margin-bottom:var(--space-lg);line-height:1.6">${t(result.description)}</p>
    `;

    // ── 상세 전과 ──
    const statsSection = document.createElement('div');
    statsSection.style.cssText = 'text-align:left;border-top:1px solid rgba(0,0,0,0.1);padding-top:var(--space-md);margin-bottom:var(--space-lg);';
    statsSection.innerHTML = `
      <div style="font-weight:700;margin-bottom:var(--space-sm);text-align:center">${t('전과')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xs) var(--space-lg);font-size:14px;font-family:var(--font-data)">
        <span>${t('전투 승리')}</span><span style="text-align:right"><strong>${result.stats.battlesWon}${t('회')}</strong></span>
        <span>${t('도시 점령')}</span><span style="text-align:right"><strong>${result.stats.citiesCaptured}/3</strong></span>
        <span>${t('적장 포로')}</span><span style="text-align:right"><strong>${result.stats.generalsCaptured}${t('명')}</strong></span>
        <span>${t('적군 격파')}</span><span style="text-align:right"><strong>${result.stats.enemiesDefeated.toLocaleString()}${t('명')}</strong></span>
        <span>${t('소요 턴')}</span><span style="text-align:right"><strong>${result.stats.totalTurns}${t('턴')}</strong></span>
        <span>${t('최대 병력')}</span><span style="text-align:right"><strong>${result.stats.maxTroops.toLocaleString()}${t('명')}</strong></span>
      </div>
    `;
    panel.appendChild(statsSection);

    // ── 공유 섹션 ──
    const shareSection = document.createElement('div');
    shareSection.style.cssText = 'border-top:1px solid rgba(0,0,0,0.1);padding-top:var(--space-md);margin-bottom:var(--space-lg);';
    shareSection.innerHTML = `
      <div style="font-size:14px;font-weight:700;color:var(--color-ink);margin-bottom:var(--space-xs);text-align:center">
        ${t('AI는 얼마나 좋은 책사일까요?')}
      </div>
      <div style="font-size:12px;color:var(--color-charcoal);margin-bottom:var(--space-sm);text-align:center;line-height:1.5">
        ${t('당신의 플레이 결과가 AI 의사결정 연구에 활용됩니다.')}
        ${t('개인정보는 수집되지 않습니다.')}
      </div>
    `;

    const shareBtnWrap = document.createElement('div');
    shareBtnWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:var(--space-sm);';

    if (RESULT_SHARE_URL) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'btn btn-secondary';
      shareBtn.style.width = '100%';
      shareBtn.style.maxWidth = '300px';
      shareBtn.textContent = t('결과 공유');
      shareBtn.addEventListener('click', async () => {
        shareBtn.disabled = true;
        shareBtn.textContent = t('공유 중...');
        try {
          const data = buildGameResultData(result);
          const { actionLog, finalState, ...summary } = data;

          // 청크 분할: 5턴 단위로 actionLog를 나눠 전송 (Google Forms 필드 크기 제한 대응)
          const TURNS_PER_CHUNK = 5;
          const logChunks: typeof actionLog[] = [];
          for (let i = 0; i < actionLog.length; i += TURNS_PER_CHUNK) {
            logChunks.push(actionLog.slice(i, i + TURNS_PER_CHUNK));
          }
          const totalParts = 1 + logChunks.length; // part 0 = summary+finalState, part 1..N = actionLog 청크

          const submitPart = async (payload: object) => {
            const fd = new URLSearchParams();
            fd.append(RESULT_SHARE_FIELD, JSON.stringify(payload));
            await fetch(RESULT_SHARE_URL, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: fd.toString(),
            });
          };

          // Part 0: 요약 + finalState
          await submitPart({ id: data.id, part: 0, totalParts, ...summary, finalState });
          // Part 1..N: actionLog 청크 (순차 전송)
          for (let i = 0; i < logChunks.length; i++) {
            await submitPart({ id: data.id, part: i + 1, totalParts, actionLog: logChunks[i] });
          }

          shareBtn.textContent = t('공유 완료!');
          shareBtn.style.color = 'var(--color-success)';
          shareBtn.style.borderColor = 'var(--color-success)';
        } catch {
          shareBtn.textContent = t('공유 실패 — 다시 시도');
          shareBtn.style.color = 'var(--color-fail)';
          shareBtn.style.borderColor = 'var(--color-fail)';
          shareBtn.disabled = false;
        }
      });
      shareBtnWrap.appendChild(shareBtn);
    }

    // 파일 다운로드 (보조 링크)
    const dlLink = document.createElement('button');
    dlLink.className = 'setup-btn-skip';
    dlLink.textContent = t('파일로 저장');
    dlLink.addEventListener('click', () => downloadGameLog(result));
    shareBtnWrap.appendChild(dlLink);

    shareSection.appendChild(shareBtnWrap);
    panel.appendChild(shareSection);

    // ── 메인 버튼 ──
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:var(--space-sm);justify-content:center;';

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn btn-primary';
    restartBtn.textContent = t('다시 시작');
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
    a.download = `${data.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── 설정 재진입 (책사 화면에서) ────────────────────────
  advisorScreen.onSettingsClick(() => {
    const setup = new SetupScreen();
    setup.setLanguage(getLanguage());
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
  const turnInfo = controller.startGame(difficulty);
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
