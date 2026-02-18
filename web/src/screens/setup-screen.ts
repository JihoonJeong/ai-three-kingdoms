// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정 마법사 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { h } from '../renderer.js';
import {
  checkConfig,
  getProviders,
  detectOllama,
  testConnection,
  saveConfig,
  pullOllamaModel,
  type ProviderInfo,
  type ModelInfo,
  type PullProgressEvent,
} from '../services/config-api.js';

/** 추론(thinking) 모델 필터링 — 게임 UX에 부적합 (너무 느림) */
const THINKING_MODEL_RE = /deep|reason|think|reflect/i;
function filterUsableModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter(m => !THINKING_MODEL_RE.test(m.id));
}
import type { GameLanguage } from '../../../core/data/types.js';
import { t } from '../../../core/i18n/index.js';

type Step = 'welcome' | 'select' | 'configure';

interface RecommendedModel {
  id: string;
  name: string;
  size: string;
  desc: string;
}

/** 언어별 Ollama 추천 모델 */
const RECOMMENDED_MODELS_BY_LANG: Record<GameLanguage, RecommendedModel[]> = {
  ko: [
    { id: 'exaone3.5:7.8b', name: 'EXAONE 3.5', size: '7.8B', desc: 'LG AI — 한국어 최강' },
    { id: 'qwen3:8b', name: 'Qwen 3', size: '8B', desc: 'Alibaba — 최신 세대, 한국어 우수' },
    { id: 'solar-pro', name: 'Solar Pro', size: '10.7B', desc: 'Upstage — 한국어 특화 (16GB RAM 권장)' },
  ],
  en: [
    { id: 'llama3.1:8b', name: 'Llama 3.1', size: '8B', desc: 'Meta — Best open-source for English' },
    { id: 'gemma3:12b', name: 'Gemma 3', size: '12B', desc: 'Google — High-quality English' },
    { id: 'mistral:7b', name: 'Mistral', size: '7B', desc: 'Mistral AI — Fast and accurate' },
  ],
  zh: [
    { id: 'qwen3:8b', name: 'Qwen 3', size: '8B', desc: 'Alibaba — 中文最强' },
    { id: 'qwen2.5:7b', name: 'Qwen 2.5', size: '7B', desc: 'Alibaba — 稳定中文' },
    { id: 'glm4:9b', name: 'GLM-4', size: '9B', desc: 'Zhipu AI — 中文优化' },
  ],
  ja: [
    { id: 'qwen3:8b', name: 'Qwen 3', size: '8B', desc: 'Alibaba — 日本語対応、最新世代' },
    { id: 'gemma3:12b', name: 'Gemma 3', size: '12B', desc: 'Google — 日本語品質が高い' },
    { id: 'llama3.1:8b', name: 'Llama 3.1', size: '8B', desc: 'Meta — 多言語対応' },
  ],
};

/** 모델별 비용 정보 (제공자+모델 조합) */
interface ModelOption {
  providerId: string;
  modelId: string;
  displayName: string;
  cost: string;
  costLabel: string;
  description: string;
}

const RECOMMENDED_OPTIONS: ModelOption[] = [
  { providerId: 'ollama', modelId: '', displayName: 'Ollama (로컬)', cost: '무료', costLabel: '🆓', description: 'GPU 필요, qwen3:8b 추천' },
  { providerId: 'gemini', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', cost: '~$0.01', costLabel: '💰', description: '가장 빠르고 저렴' },
  { providerId: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', cost: '~$0.02', costLabel: '💰', description: 'OpenAI 경량 모델' },
];

const ADVANCED_OPTIONS: ModelOption[] = [
  { providerId: 'gemini', modelId: 'gemini-3-flash-preview', displayName: 'Gemini 3 Flash', cost: '~$0.07', costLabel: '💰', description: 'Google 최신 모델' },
  { providerId: 'claude', modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', cost: '~$0.12', costLabel: '💰', description: 'Anthropic 경량 모델' },
  { providerId: 'openai', modelId: 'o4-mini', displayName: 'o4-mini', cost: '~$0.33', costLabel: '💰', description: '추론 토큰 과금' },
  { providerId: 'claude', modelId: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', cost: '~$0.36', costLabel: '💰', description: 'Anthropic 고품질 모델' },
];

export class SetupScreen {
  private overlay: HTMLElement | null = null;
  private step: Step = 'welcome';
  private providers: ProviderInfo[] = [];
  private selectedProvider: ProviderInfo | null = null;
  private preferredModelId: string | null = null;
  private ollamaModels: ModelInfo[] = [];
  private ollamaAvailable = false;
  private language: GameLanguage = 'ko';
  private savedProvider: string | null = null;
  private savedHasApiKey = false;

  private onCompleteCb: (() => void) | null = null;
  private onSkipCb: (() => void) | null = null;

  /** 게임 언어 설정 — 추천 모델 목록에 반영 */
  setLanguage(lang: GameLanguage): void { this.language = lang; }

  onComplete(cb: () => void): void { this.onCompleteCb = cb; }
  onSkip(cb: () => void): void { this.onSkipCb = cb; }

  async render(container: HTMLElement): Promise<void> {
    this.overlay = h('div', { className: 'setup-overlay' });
    container.appendChild(this.overlay);

    // 제공자 목록 + 기존 설정 로드
    try {
      const [providers, config] = await Promise.all([getProviders(), checkConfig()]);
      this.providers = providers;
      this.savedProvider = config.provider;
      this.savedHasApiKey = config.hasApiKey;
    } catch {
      this.providers = [];
    }

    this.showWelcome();
  }

  /** 마법사 제거 */
  remove(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  // ─── Step 1: 환영 + Ollama 감지 ──────────────────────

  private showWelcome(): void {
    this.step = 'welcome';
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, t('AI 삼국지')));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      t('AI 책사(제갈량)와 함께하는 적벽대전 전략 게임')));

    wizard.appendChild(this.renderSteps());

    // Ollama 감지 영역
    const detect = h('div', { className: 'setup-detect' });
    const status = h('div', { className: 'setup-detect-status' });
    status.innerHTML = `<span class="setup-detect-spinner"></span>${t('로컬 AI(Ollama) 감지 중...')}`;
    detect.appendChild(status);
    wizard.appendChild(detect);

    this.overlay.appendChild(wizard);

    // 비동기 감지
    this.detectOllamaAsync(status, wizard);
  }

  private async detectOllamaAsync(statusEl: HTMLElement, wizard: HTMLElement): Promise<void> {
    try {
      const result = await detectOllama();
      this.ollamaAvailable = result.available;
      this.ollamaModels = filterUsableModels(result.models);
      const excluded = result.models.length - this.ollamaModels.length;

      if (result.available && this.ollamaModels.length > 0) {
        const suffix = excluded > 0 ? ` (${t('추론 모델')} ${excluded}${t('개 제외')})` : '';
        statusEl.textContent = `${t('Ollama 감지됨')} (${this.ollamaModels.length}${t('개 모델')})${suffix}`;
        statusEl.style.color = 'var(--color-success)';
      } else if (result.available) {
        statusEl.textContent = t('Ollama 실행 중 (설치된 모델 없음)');
        statusEl.style.color = 'var(--color-warn, #c8860a)';
      } else {
        statusEl.textContent = t('Ollama 미감지');
        statusEl.style.color = 'var(--color-charcoal)';
      }
    } catch {
      statusEl.textContent = t('Ollama 감지 실패');
      statusEl.style.color = 'var(--color-charcoal)';
    }

    // 버튼들
    const actions = h('div', { className: 'setup-actions' });
    actions.style.flexDirection = 'column';
    actions.style.alignItems = 'center';

    if (this.ollamaAvailable && this.ollamaModels.length > 0) {
      // Case 1: Ollama 있고 모델도 있음 → 바로 사용
      const ollamaBtn = h('button', { className: 'setup-btn setup-btn-primary' }, t('Ollama 사용 (로컬/무료)'));
      ollamaBtn.style.width = '100%';
      ollamaBtn.addEventListener('click', () => {
        const ollamaInfo = this.providers.find(p => p.id === 'ollama');
        if (ollamaInfo) {
          this.selectedProvider = { ...ollamaInfo, defaultModels: this.ollamaModels };
          this.showConfigure();
        }
      });
      actions.appendChild(ollamaBtn);

      // 추가 모델 설치 버튼
      const addModelBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('추천 모델 추가 설치'));
      addModelBtn.style.width = '100%';
      addModelBtn.addEventListener('click', () => this.showModelDownload());
      actions.appendChild(addModelBtn);
    } else if (this.ollamaAvailable && this.ollamaModels.length === 0) {
      // Case 2: Ollama 있는데 사용 가능 모델 없음 → 모델 다운로드 안내
      const downloadBtn = h('button', { className: 'setup-btn setup-btn-primary' }, t('추천 모델 다운로드'));
      downloadBtn.style.width = '100%';
      downloadBtn.addEventListener('click', () => this.showModelDownload());
      actions.appendChild(downloadBtn);
    } else {
      // Case 3: Ollama 미설치 → 설치 안내
      this.appendInstallGuide(wizard);
    }

    const otherBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('다른 AI 제공자 선택'));
    otherBtn.style.width = '100%';
    otherBtn.addEventListener('click', () => this.showSelect());
    actions.appendChild(otherBtn);

    const skipBtn = h('button', { className: 'setup-btn-skip' }, t('AI 없이 시작'));
    skipBtn.addEventListener('click', () => {
      this.remove();
      this.onSkipCb?.();
    });
    actions.appendChild(skipBtn);

    wizard.appendChild(actions);
  }

  // ─── Ollama 설치 안내 ──────────────────────────────────

  private appendInstallGuide(wizard: HTMLElement): void {
    const guide = h('div', { className: 'setup-install-guide' });

    guide.appendChild(h('div', { className: 'setup-install-title' }, t('Ollama로 무료 로컬 AI 사용')));
    guide.appendChild(h('div', { className: 'setup-install-desc' },
      t('Ollama를 설치하면 인터넷 없이, API 키 없이 AI 책사를 사용할 수 있습니다.')));

    const steps = h('div', { className: 'setup-install-steps' });

    const step1 = h('div', { className: 'setup-install-step' });
    step1.appendChild(h('span', { className: 'setup-install-num' }, '1'));
    const step1Content = h('div');
    step1Content.appendChild(h('div', { className: 'setup-install-step-title' }, t('Ollama 설치')));
    const link = h('a', {
      href: 'https://ollama.com/download',
      target: '_blank',
      className: 'setup-install-link',
    }, 'ollama.com/download');
    const linkDesc = h('div', { className: 'setup-install-step-desc' });
    linkDesc.append(t('공식 사이트에서 다운로드: '), link);
    step1Content.appendChild(linkDesc);
    step1.appendChild(step1Content);
    steps.appendChild(step1);

    const step2 = h('div', { className: 'setup-install-step' });
    step2.appendChild(h('span', { className: 'setup-install-num' }, '2'));
    const step2Content = h('div');
    step2Content.appendChild(h('div', { className: 'setup-install-step-title' }, t('Ollama 실행')));
    step2Content.appendChild(h('div', { className: 'setup-install-step-desc' },
      t('설치 후 Ollama 앱을 실행하세요 (메뉴바에 아이콘 표시)')));
    step2.appendChild(step2Content);
    steps.appendChild(step2);

    const step3 = h('div', { className: 'setup-install-step' });
    step3.appendChild(h('span', { className: 'setup-install-num' }, '3'));
    const step3Content = h('div');
    step3Content.appendChild(h('div', { className: 'setup-install-step-title' }, t('이 페이지 새로고침')));
    step3Content.appendChild(h('div', { className: 'setup-install-step-desc' },
      t('Ollama 실행 후 이 페이지를 새로고침하면 자동 감지됩니다')));
    step3.appendChild(step3Content);
    steps.appendChild(step3);

    guide.appendChild(steps);

    // 재감지 버튼
    const retryBtn = h('button', { className: 'setup-btn setup-btn-secondary setup-retry-btn' }, t('Ollama 다시 감지'));
    retryBtn.addEventListener('click', () => this.showWelcome());
    guide.appendChild(retryBtn);

    wizard.appendChild(guide);
  }

  // ─── 모델 다운로드 화면 ─────────────────────────────────

  private showModelDownload(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, t('모델 다운로드')));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      t('AI 책사에 사용할 모델을 선택하세요. M1/M2 Mac에서도 원활하게 동작합니다.')));

    const list = h('div', { className: 'setup-model-list' });

    // 이미 설치된 모델 ID 목록 (thinking 모델 포함, 원본 기준)
    const installedIds = new Set(this.ollamaModels.map(m => m.id));

    for (const model of RECOMMENDED_MODELS_BY_LANG[this.language]) {
      const alreadyInstalled = installedIds.has(model.id);
      const card = h('div', { className: `setup-model-card${alreadyInstalled ? ' downloaded' : ''}` });

      const info = h('div', { className: 'setup-model-info' });
      info.appendChild(h('div', { className: 'setup-model-name' }, `${model.name} (${model.size})`));
      info.appendChild(h('div', { className: 'setup-model-desc' }, model.desc));
      card.appendChild(info);

      if (alreadyInstalled) {
        // 이미 설치됨 → 설치 완료 표시
        const badge = h('div', { className: 'setup-model-installed' }, t('설치됨'));
        card.appendChild(badge);
      }

      const downloadBtn = h('button', { className: 'setup-btn setup-btn-primary setup-download-btn' },
        alreadyInstalled ? t('재설치') : t('다운로드'));
      if (alreadyInstalled) downloadBtn.style.display = 'none';
      card.appendChild(downloadBtn);

      // 진행률 영역 (초기 숨김)
      const progress = h('div', { className: 'setup-model-progress' });
      progress.style.display = 'none';
      const progressBar = h('div', { className: 'setup-progress-bar' });
      const progressFill = h('div', { className: 'setup-progress-fill' });
      progressBar.appendChild(progressFill);
      progress.appendChild(progressBar);
      const progressText = h('div', { className: 'setup-progress-text' }, t('준비 중...'));
      progress.appendChild(progressText);
      card.appendChild(progress);

      downloadBtn.addEventListener('click', () => {
        this.startModelDownload(model.id, downloadBtn, progress, progressFill, progressText, card);
      });

      list.appendChild(card);
    }

    wizard.appendChild(list);

    // 하단 버튼
    const actions = h('div', { className: 'setup-actions' });
    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('뒤로'));
    backBtn.addEventListener('click', () => this.showWelcome());
    actions.appendChild(backBtn);
    wizard.appendChild(actions);

    this.overlay.appendChild(wizard);
  }

  private async startModelDownload(
    modelId: string,
    downloadBtn: HTMLElement,
    progress: HTMLElement,
    progressFill: HTMLElement,
    progressText: HTMLElement,
    card: HTMLElement,
  ): Promise<void> {
    downloadBtn.style.display = 'none';
    progress.style.display = 'block';
    progressText.textContent = t('다운로드 시작...');

    const controller = new AbortController();

    // 취소 버튼 추가
    const cancelBtn = h('button', { className: 'setup-btn-cancel' }, t('취소'));
    cancelBtn.addEventListener('click', () => controller.abort());
    progress.appendChild(cancelBtn);

    try {
      await pullOllamaModel(modelId, (event: PullProgressEvent) => {
        if (event.type === 'progress') {
          const status = event.status || '';
          if (event.total && event.total > 0 && event.completed !== undefined) {
            const pct = Math.round((event.completed / event.total) * 100);
            progressFill.style.width = `${pct}%`;
            const sizeMB = Math.round(event.total / 1024 / 1024);
            const downloadedMB = Math.round(event.completed / 1024 / 1024);
            progressText.textContent = `${status} — ${downloadedMB}/${sizeMB} MB (${pct}%)`;
          } else {
            progressText.textContent = status;
          }
        } else if (event.type === 'done') {
          progressFill.style.width = '100%';
          progressText.textContent = t('다운로드 완료!');
          cancelBtn.remove();

          // 완료 → Ollama 모델 목록 갱신 후 설정 화면으로
          card.classList.add('downloaded');
          const useBtn = h('button', { className: 'setup-btn setup-btn-primary setup-download-btn' }, t('이 모델 사용'));
          useBtn.addEventListener('click', async () => {
            // Ollama 모델 재감지 (추론 모델 제외)
            const detect = await detectOllama();
            this.ollamaModels = filterUsableModels(detect.models);
            const ollamaInfo = this.providers.find(p => p.id === 'ollama');
            if (ollamaInfo) {
              this.selectedProvider = { ...ollamaInfo, defaultModels: this.ollamaModels };
              this.showConfigure();
            }
          });
          progress.appendChild(useBtn);
        } else if (event.type === 'error') {
          progressText.textContent = `${t('오류')}: ${event.error}`;
          progressText.style.color = 'var(--color-fail)';
          cancelBtn.remove();
          downloadBtn.style.display = '';
        }
      }, controller.signal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        progressText.textContent = t('다운로드 취소됨');
        cancelBtn.remove();
        downloadBtn.style.display = '';
        progress.style.display = 'none';
        return;
      }
      progressText.textContent = t('다운로드 실패');
      progressText.style.color = 'var(--color-fail)';
      cancelBtn.remove();
      downloadBtn.style.display = '';
    }
  }

  // ─── Step 2: 제공자 선택 (비용 안내 + 추천/고급) ─────

  private selectModelOption(opt: ModelOption): void {
    const provider = this.providers.find(p => p.id === opt.providerId);
    if (!provider) return;

    if (opt.providerId === 'ollama') {
      this.selectedProvider = { ...provider, defaultModels: this.ollamaModels };
      this.preferredModelId = null;
    } else {
      this.selectedProvider = provider;
      this.preferredModelId = opt.modelId;
    }
    this.showConfigure();
  }

  private renderModelCard(opt: ModelOption): HTMLElement {
    const isOllama = opt.providerId === 'ollama';
    const disabled = isOllama && !this.ollamaAvailable;

    const card = h('div', {
      className: `setup-provider-card${disabled ? ' disabled' : ''}`,
    });

    const nameRow = h('div', { className: 'setup-provider-name' });
    nameRow.textContent = `${opt.costLabel} ${t(opt.displayName)}`;
    card.appendChild(nameRow);

    const costBadge = h('div', { className: 'setup-provider-badge' }, t(opt.cost));
    card.appendChild(costBadge);

    card.appendChild(h('div', { className: 'setup-provider-desc' }, t(opt.description)));

    if (isOllama && this.ollamaAvailable) {
      card.appendChild(h('div', { className: 'setup-provider-badge' }, t('감지됨')));
    }

    if (!disabled) {
      card.addEventListener('click', () => this.selectModelOption(opt));
    }

    return card;
  }

  private showSelect(): void {
    this.step = 'select';
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, t('AI 제공자 선택')));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      t('게임에서 사용할 AI 서비스를 선택하세요')));
    wizard.appendChild(this.renderSteps());

    // ── 추천 섹션 ──
    wizard.appendChild(h('div', { className: 'setup-section-label' }, t('추천 (저비용)')));
    const recGrid = h('div', { className: 'setup-providers' });
    for (const opt of RECOMMENDED_OPTIONS) {
      recGrid.appendChild(this.renderModelCard(opt));
    }
    wizard.appendChild(recGrid);

    // ── 고급 섹션 ──
    wizard.appendChild(h('div', { className: 'setup-section-label' }, t('다른 모델')));
    const advGrid = h('div', { className: 'setup-providers' });
    for (const opt of ADVANCED_OPTIONS) {
      advGrid.appendChild(this.renderModelCard(opt));
    }
    wizard.appendChild(advGrid);

    // ── 비용 경고 ──
    const warning = h('div', { className: 'setup-cost-warning' });
    warning.textContent = t('API 사용 시 각 제공자에 의해 비용이 청구됩니다. 위 금액은 20턴 1게임 기준 추정치이며 실제와 다를 수 있습니다. Ollama는 로컬 실행으로 API 비용이 발생하지 않습니다.');
    wizard.appendChild(warning);

    // 뒤로가기
    const actions = h('div', { className: 'setup-actions' });
    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('뒤로'));
    backBtn.addEventListener('click', () => this.showWelcome());
    actions.appendChild(backBtn);
    wizard.appendChild(actions);

    this.overlay.appendChild(wizard);
  }

  // ─── Step 3: 설정 (API 키 + 모델 + 테스트) ──────────

  private showConfigure(): void {
    this.step = 'configure';
    if (!this.overlay || !this.selectedProvider) return;
    this.overlay.innerHTML = '';

    const provider = this.selectedProvider;
    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, `${provider.name} ${t('설정')}`));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      provider.requiresApiKey
        ? t('API 키와 모델을 설정하세요')
        : t('사용할 모델을 선택하세요')));
    wizard.appendChild(this.renderSteps());

    const form = h('div', { className: 'setup-form' });

    // API 키 입력 (필요한 경우)
    let apiKeyInput: HTMLInputElement | null = null;
    const hasSavedKey = this.savedHasApiKey && this.savedProvider === provider.id;
    if (provider.requiresApiKey) {
      const field = h('div', { className: 'setup-field' });
      field.appendChild(h('label', {}, t('API 키')));
      apiKeyInput = h('input', {
        type: 'password',
        placeholder: hasSavedKey
          ? t('저장된 키 사용 중 (변경하려면 새 키 입력)')
          : provider.id === 'claude' ? 'sk-ant-...'
          : provider.id === 'openai' ? 'sk-...' : 'AI...',
      }) as HTMLInputElement;
      field.appendChild(apiKeyInput);

      const keyGuide: Record<string, { url: string; siteName: string; steps: string[] }> = {
        claude: {
          url: 'https://console.anthropic.com/settings/keys',
          siteName: 'Anthropic Console',
          steps: [t('위 링크에서 회원가입/로그인'), t('Create Key 클릭'), t('생성된 키를 복사하여 붙여넣기')],
        },
        openai: {
          url: 'https://platform.openai.com/api-keys',
          siteName: 'OpenAI Platform',
          steps: [t('위 링크에서 회원가입/로그인'), t('Create new secret key 클릭'), t('생성된 키를 복사하여 붙여넣기')],
        },
        gemini: {
          url: 'https://aistudio.google.com/apikey',
          siteName: 'Google AI Studio',
          steps: [t('위 링크에서 Google 계정 로그인'), t('Create API Key 클릭'), t('생성된 키를 복사하여 붙여넣기')],
        },
      };
      const guide = keyGuide[provider.id];
      if (guide) {
        const hintBox = h('div', { className: 'setup-api-guide' });

        const link = h('a', {
          href: guide.url,
          target: '_blank',
          className: 'setup-api-guide-link',
        }, `${guide.siteName}${t('에서 API 키 발급')}`);
        hintBox.appendChild(link);

        const stepList = h('ol', { className: 'setup-api-guide-steps' });
        for (const step of guide.steps) {
          stepList.appendChild(h('li', {}, step));
        }
        hintBox.appendChild(stepList);

        field.appendChild(hintBox);
      }

      form.appendChild(field);
    }

    // 모델 선택
    const modelField = h('div', { className: 'setup-field' });
    modelField.appendChild(h('label', {}, t('모델')));
    const modelSelect = h('select') as HTMLSelectElement;

    if (provider.defaultModels.length === 0) {
      const opt = h('option', { value: '' }, t('(모델 없음)')) as HTMLOptionElement;
      modelSelect.appendChild(opt);
    } else {
      for (const model of provider.defaultModels) {
        const opt = h('option', { value: model.id }) as HTMLOptionElement;
        opt.textContent = model.name;
        if (this.preferredModelId && model.id === this.preferredModelId) {
          opt.selected = true;
        }
        modelSelect.appendChild(opt);
      }
    }
    // 선호 모델 사용 후 초기화
    this.preferredModelId = null;
    modelField.appendChild(modelSelect);
    form.appendChild(modelField);

    // 테스트 결과 영역
    const testResult = h('div', { className: 'setup-test-result' });
    testResult.style.display = 'none';
    form.appendChild(testResult);

    wizard.appendChild(form);

    // 버튼
    const actions = h('div', { className: 'setup-actions' });

    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('뒤로'));
    backBtn.addEventListener('click', () => this.showSelect());
    actions.appendChild(backBtn);

    const testBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, t('연결 테스트'));
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = t('테스트 중...');
      testResult.style.display = 'block';
      testResult.className = 'setup-test-result';

      const isOllamaTest = provider.id === 'ollama';
      testResult.textContent = isOllamaTest
        ? t('모델 로딩 중... (첫 실행 시 최대 30초)')
        : t('연결 확인 중...');

      const config = {
        provider: provider.id,
        model: modelSelect.value,
        apiKey: apiKeyInput?.value || undefined,
      };

      try {
        const result = await testConnection(config);
        if (result.success) {
          testResult.className = 'setup-test-result success';
          testResult.textContent = t('연결 성공!');
        } else {
          testResult.className = 'setup-test-result error';
          testResult.textContent = result.error || t('연결 실패');
        }
      } catch {
        testResult.className = 'setup-test-result error';
        testResult.textContent = t('서버 연결 실패');
      }

      testBtn.disabled = false;
      testBtn.textContent = t('연결 테스트');
    });
    actions.appendChild(testBtn);

    const saveBtn = h('button', { className: 'setup-btn setup-btn-primary' }, t('저장 후 시작'));
    saveBtn.addEventListener('click', async () => {
      if (provider.requiresApiKey && !apiKeyInput?.value && !hasSavedKey) {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = t('API 키를 입력하세요');
        return;
      }
      if (!modelSelect.value) {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = t('모델을 선택하세요');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = t('저장 중...');

      const config = {
        provider: provider.id,
        model: modelSelect.value,
        apiKey: apiKeyInput?.value || undefined,
      };

      try {
        const result = await saveConfig(config);
        if (result.success) {
          this.remove();
          this.onCompleteCb?.();
        } else {
          testResult.style.display = 'block';
          testResult.className = 'setup-test-result error';
          testResult.textContent = result.error || t('저장 실패');
          saveBtn.disabled = false;
          saveBtn.textContent = t('저장 후 시작');
        }
      } catch {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = t('서버 연결 실패');
        saveBtn.disabled = false;
        saveBtn.textContent = t('저장 후 시작');
      }
    });
    actions.appendChild(saveBtn);

    wizard.appendChild(actions);

    this.overlay.appendChild(wizard);
  }

  // ─── 단계 표시 ────────────────────────────────────────

  private renderSteps(): HTMLElement {
    const steps = h('div', { className: 'setup-steps' });
    const stepList: Step[] = ['welcome', 'select', 'configure'];
    const currentIdx = stepList.indexOf(this.step);

    for (let i = 0; i < stepList.length; i++) {
      const dot = h('div', { className: 'setup-step-dot' });
      if (i === currentIdx) dot.classList.add('active');
      else if (i < currentIdx) dot.classList.add('done');
      steps.appendChild(dot);
    }

    return steps;
  }
}
