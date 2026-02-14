// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 설정 마법사 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { h } from '../renderer.js';
import {
  getProviders,
  detectOllama,
  testConnection,
  saveConfig,
  pullOllamaModel,
  type ProviderInfo,
  type ModelInfo,
  type PullProgressEvent,
} from '../services/config-api.js';

type Step = 'welcome' | 'select' | 'configure';

/** Ollama에서 한국어 잘 되는 추천 모델 */
const RECOMMENDED_MODELS: Array<{ id: string; name: string; size: string; desc: string }> = [
  { id: 'exaone3.5:7.8b', name: 'EXAONE 3.5', size: '7.8B', desc: 'LG AI — 한국어 최강' },
  { id: 'qwen3:8b', name: 'Qwen 3', size: '8B', desc: 'Alibaba — 최신 세대, 다국어' },
  { id: 'qwen2.5:7b', name: 'Qwen 2.5', size: '7B', desc: 'Alibaba — 안정적 다국어' },
];

export class SetupScreen {
  private overlay: HTMLElement | null = null;
  private step: Step = 'welcome';
  private providers: ProviderInfo[] = [];
  private selectedProvider: ProviderInfo | null = null;
  private ollamaModels: ModelInfo[] = [];
  private ollamaAvailable = false;

  private onCompleteCb: (() => void) | null = null;
  private onSkipCb: (() => void) | null = null;

  onComplete(cb: () => void): void { this.onCompleteCb = cb; }
  onSkip(cb: () => void): void { this.onSkipCb = cb; }

  async render(container: HTMLElement): Promise<void> {
    this.overlay = h('div', { className: 'setup-overlay' });
    container.appendChild(this.overlay);

    // 제공자 목록 로드
    try {
      this.providers = await getProviders();
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

    wizard.appendChild(h('h1', {}, 'AI 삼국지'));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      'AI 책사(제갈량)와 함께하는 적벽대전 전략 게임'));

    wizard.appendChild(this.renderSteps());

    // Ollama 감지 영역
    const detect = h('div', { className: 'setup-detect' });
    const status = h('div', { className: 'setup-detect-status' });
    status.innerHTML = '<span class="setup-detect-spinner"></span>로컬 AI(Ollama) 감지 중...';
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
      this.ollamaModels = result.models;

      if (result.available && result.models.length > 0) {
        statusEl.textContent = `Ollama 감지됨 (${result.models.length}개 모델)`;
        statusEl.style.color = 'var(--color-success)';
      } else if (result.available) {
        statusEl.textContent = 'Ollama 실행 중 (설치된 모델 없음)';
        statusEl.style.color = 'var(--color-warn, #c8860a)';
      } else {
        statusEl.textContent = 'Ollama 미감지';
        statusEl.style.color = 'var(--color-charcoal)';
      }
    } catch {
      statusEl.textContent = 'Ollama 감지 실패';
      statusEl.style.color = 'var(--color-charcoal)';
    }

    // 버튼들
    const actions = h('div', { className: 'setup-actions' });
    actions.style.flexDirection = 'column';
    actions.style.alignItems = 'center';

    if (this.ollamaAvailable && this.ollamaModels.length > 0) {
      // Case 1: Ollama 있고 모델도 있음 → 바로 사용
      const ollamaBtn = h('button', { className: 'setup-btn setup-btn-primary' }, 'Ollama 사용 (로컬/무료)');
      ollamaBtn.style.width = '100%';
      ollamaBtn.addEventListener('click', () => {
        const ollamaInfo = this.providers.find(p => p.id === 'ollama');
        if (ollamaInfo) {
          this.selectedProvider = { ...ollamaInfo, defaultModels: this.ollamaModels };
          this.showConfigure();
        }
      });
      actions.appendChild(ollamaBtn);
    } else if (this.ollamaAvailable && this.ollamaModels.length === 0) {
      // Case 2: Ollama 있는데 모델 없음 → 모델 다운로드 안내
      const downloadBtn = h('button', { className: 'setup-btn setup-btn-primary' }, '추천 모델 다운로드');
      downloadBtn.style.width = '100%';
      downloadBtn.addEventListener('click', () => this.showModelDownload());
      actions.appendChild(downloadBtn);
    } else {
      // Case 3: Ollama 미설치 → 설치 안내
      this.appendInstallGuide(wizard);
    }

    const otherBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, '다른 AI 제공자 선택');
    otherBtn.style.width = '100%';
    otherBtn.addEventListener('click', () => this.showSelect());
    actions.appendChild(otherBtn);

    const skipBtn = h('button', { className: 'setup-btn-skip' }, 'AI 없이 시작');
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

    guide.appendChild(h('div', { className: 'setup-install-title' }, 'Ollama로 무료 로컬 AI 사용'));
    guide.appendChild(h('div', { className: 'setup-install-desc' },
      'Ollama를 설치하면 인터넷 없이, API 키 없이 AI 책사를 사용할 수 있습니다.'));

    const steps = h('div', { className: 'setup-install-steps' });

    const step1 = h('div', { className: 'setup-install-step' });
    step1.appendChild(h('span', { className: 'setup-install-num' }, '1'));
    const step1Content = h('div');
    step1Content.appendChild(h('div', { className: 'setup-install-step-title' }, 'Ollama 설치'));
    const link = h('a', {
      href: 'https://ollama.com/download',
      target: '_blank',
      className: 'setup-install-link',
    }, 'ollama.com/download');
    const linkDesc = h('div', { className: 'setup-install-step-desc' });
    linkDesc.append('공식 사이트에서 다운로드: ', link);
    step1Content.appendChild(linkDesc);
    step1.appendChild(step1Content);
    steps.appendChild(step1);

    const step2 = h('div', { className: 'setup-install-step' });
    step2.appendChild(h('span', { className: 'setup-install-num' }, '2'));
    const step2Content = h('div');
    step2Content.appendChild(h('div', { className: 'setup-install-step-title' }, 'Ollama 실행'));
    step2Content.appendChild(h('div', { className: 'setup-install-step-desc' },
      '설치 후 Ollama 앱을 실행하세요 (메뉴바에 아이콘 표시)'));
    step2.appendChild(step2Content);
    steps.appendChild(step2);

    const step3 = h('div', { className: 'setup-install-step' });
    step3.appendChild(h('span', { className: 'setup-install-num' }, '3'));
    const step3Content = h('div');
    step3Content.appendChild(h('div', { className: 'setup-install-step-title' }, '이 페이지 새로고침'));
    step3Content.appendChild(h('div', { className: 'setup-install-step-desc' },
      'Ollama 실행 후 이 페이지를 새로고침하면 자동 감지됩니다'));
    step3.appendChild(step3Content);
    steps.appendChild(step3);

    guide.appendChild(steps);

    // 재감지 버튼
    const retryBtn = h('button', { className: 'setup-btn setup-btn-secondary setup-retry-btn' }, 'Ollama 다시 감지');
    retryBtn.addEventListener('click', () => this.showWelcome());
    guide.appendChild(retryBtn);

    wizard.appendChild(guide);
  }

  // ─── 모델 다운로드 화면 ─────────────────────────────────

  private showModelDownload(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, '모델 다운로드'));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      'AI 책사에 사용할 모델을 선택하세요. M1/M2 Mac에서도 원활하게 동작합니다.'));

    const list = h('div', { className: 'setup-model-list' });

    for (const model of RECOMMENDED_MODELS) {
      const card = h('div', { className: 'setup-model-card' });

      const info = h('div', { className: 'setup-model-info' });
      info.appendChild(h('div', { className: 'setup-model-name' }, `${model.name} (${model.size})`));
      info.appendChild(h('div', { className: 'setup-model-desc' }, model.desc));
      card.appendChild(info);

      const downloadBtn = h('button', { className: 'setup-btn setup-btn-primary setup-download-btn' }, '다운로드');
      card.appendChild(downloadBtn);

      // 진행률 영역 (초기 숨김)
      const progress = h('div', { className: 'setup-model-progress' });
      progress.style.display = 'none';
      const progressBar = h('div', { className: 'setup-progress-bar' });
      const progressFill = h('div', { className: 'setup-progress-fill' });
      progressBar.appendChild(progressFill);
      progress.appendChild(progressBar);
      const progressText = h('div', { className: 'setup-progress-text' }, '준비 중...');
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
    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, '뒤로');
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
    progressText.textContent = '다운로드 시작...';

    const controller = new AbortController();

    // 취소 버튼 추가
    const cancelBtn = h('button', { className: 'setup-btn-cancel' }, '취소');
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
          progressText.textContent = '다운로드 완료!';
          cancelBtn.remove();

          // 완료 → Ollama 모델 목록 갱신 후 설정 화면으로
          card.classList.add('downloaded');
          const useBtn = h('button', { className: 'setup-btn setup-btn-primary setup-download-btn' }, '이 모델 사용');
          useBtn.addEventListener('click', async () => {
            // Ollama 모델 재감지
            const detect = await detectOllama();
            this.ollamaModels = detect.models;
            const ollamaInfo = this.providers.find(p => p.id === 'ollama');
            if (ollamaInfo) {
              this.selectedProvider = { ...ollamaInfo, defaultModels: this.ollamaModels };
              this.showConfigure();
            }
          });
          progress.appendChild(useBtn);
        } else if (event.type === 'error') {
          progressText.textContent = `오류: ${event.error}`;
          progressText.style.color = 'var(--color-fail)';
          cancelBtn.remove();
          downloadBtn.style.display = '';
        }
      }, controller.signal);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        progressText.textContent = '다운로드 취소됨';
        cancelBtn.remove();
        downloadBtn.style.display = '';
        progress.style.display = 'none';
        return;
      }
      progressText.textContent = '다운로드 실패';
      progressText.style.color = 'var(--color-fail)';
      cancelBtn.remove();
      downloadBtn.style.display = '';
    }
  }

  // ─── Step 2: 제공자 선택 ─────────────────────────────

  private showSelect(): void {
    this.step = 'select';
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const wizard = h('div', { className: 'setup-wizard' });

    wizard.appendChild(h('h1', {}, 'AI 제공자 선택'));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      '게임에서 사용할 AI 서비스를 선택하세요'));
    wizard.appendChild(this.renderSteps());

    // 제공자 카드 그리드
    const grid = h('div', { className: 'setup-providers' });

    for (const provider of this.providers) {
      const isOllama = provider.id === 'ollama';
      const disabled = isOllama && !this.ollamaAvailable;

      const card = h('div', {
        className: `setup-provider-card${disabled ? ' disabled' : ''}`,
      });

      card.appendChild(h('div', { className: 'setup-provider-name' }, provider.name));
      card.appendChild(h('div', { className: 'setup-provider-desc' }, provider.description));

      if (isOllama && this.ollamaAvailable) {
        card.appendChild(h('div', { className: 'setup-provider-badge' }, '감지됨'));
      }
      if (!provider.requiresApiKey) {
        card.appendChild(h('div', { className: 'setup-provider-badge' }, '무료'));
      }

      if (!disabled) {
        card.addEventListener('click', () => {
          if (isOllama) {
            this.selectedProvider = { ...provider, defaultModels: this.ollamaModels };
          } else {
            this.selectedProvider = provider;
          }
          this.showConfigure();
        });
      }

      grid.appendChild(card);
    }

    wizard.appendChild(grid);

    // 뒤로가기
    const actions = h('div', { className: 'setup-actions' });
    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, '뒤로');
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

    wizard.appendChild(h('h1', {}, `${provider.name} 설정`));
    wizard.appendChild(h('div', { className: 'setup-subtitle' },
      provider.requiresApiKey
        ? 'API 키와 모델을 설정하세요'
        : '사용할 모델을 선택하세요'));
    wizard.appendChild(this.renderSteps());

    const form = h('div', { className: 'setup-form' });

    // API 키 입력 (필요한 경우)
    let apiKeyInput: HTMLInputElement | null = null;
    if (provider.requiresApiKey) {
      const field = h('div', { className: 'setup-field' });
      field.appendChild(h('label', {}, 'API 키'));
      apiKeyInput = h('input', {
        type: 'password',
        placeholder: provider.id === 'claude' ? 'sk-ant-...' :
                     provider.id === 'openai' ? 'sk-...' : 'AI...',
      }) as HTMLInputElement;
      field.appendChild(apiKeyInput);

      const hintTexts: Record<string, string> = {
        claude: 'console.anthropic.com 에서 발급',
        openai: 'platform.openai.com 에서 발급',
        gemini: 'aistudio.google.com 에서 발급',
      };
      if (hintTexts[provider.id]) {
        field.appendChild(h('div', { className: 'setup-hint' }, hintTexts[provider.id]));
      }

      form.appendChild(field);
    }

    // 모델 선택
    const modelField = h('div', { className: 'setup-field' });
    modelField.appendChild(h('label', {}, '모델'));
    const modelSelect = h('select') as HTMLSelectElement;

    if (provider.defaultModels.length === 0) {
      const opt = h('option', { value: '' }, '(모델 없음)') as HTMLOptionElement;
      modelSelect.appendChild(opt);
    } else {
      for (const model of provider.defaultModels) {
        const opt = h('option', { value: model.id }) as HTMLOptionElement;
        opt.textContent = model.name;
        modelSelect.appendChild(opt);
      }
    }
    modelField.appendChild(modelSelect);
    form.appendChild(modelField);

    // 테스트 결과 영역
    const testResult = h('div', { className: 'setup-test-result' });
    testResult.style.display = 'none';
    form.appendChild(testResult);

    wizard.appendChild(form);

    // 버튼
    const actions = h('div', { className: 'setup-actions' });

    const backBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, '뒤로');
    backBtn.addEventListener('click', () => this.showSelect());
    actions.appendChild(backBtn);

    const testBtn = h('button', { className: 'setup-btn setup-btn-secondary' }, '연결 테스트');
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = '테스트 중...';
      testResult.style.display = 'block';
      testResult.className = 'setup-test-result';

      const isOllamaTest = provider.id === 'ollama';
      testResult.textContent = isOllamaTest
        ? '모델 로딩 중... (첫 실행 시 최대 30초)'
        : '연결 확인 중...';

      const config = {
        provider: provider.id,
        model: modelSelect.value,
        apiKey: apiKeyInput?.value,
      };

      try {
        const result = await testConnection(config);
        if (result.success) {
          testResult.className = 'setup-test-result success';
          testResult.textContent = '연결 성공!';
        } else {
          testResult.className = 'setup-test-result error';
          testResult.textContent = result.error || '연결 실패';
        }
      } catch {
        testResult.className = 'setup-test-result error';
        testResult.textContent = '서버 연결 실패';
      }

      testBtn.disabled = false;
      testBtn.textContent = '연결 테스트';
    });
    actions.appendChild(testBtn);

    const saveBtn = h('button', { className: 'setup-btn setup-btn-primary' }, '저장 후 시작');
    saveBtn.addEventListener('click', async () => {
      if (provider.requiresApiKey && !apiKeyInput?.value) {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = 'API 키를 입력하세요';
        return;
      }
      if (!modelSelect.value) {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = '모델을 선택하세요';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';

      const config = {
        provider: provider.id,
        model: modelSelect.value,
        apiKey: apiKeyInput?.value,
      };

      try {
        const result = await saveConfig(config);
        if (result.success) {
          this.remove();
          this.onCompleteCb?.();
        } else {
          testResult.style.display = 'block';
          testResult.className = 'setup-test-result error';
          testResult.textContent = result.error || '저장 실패';
          saveBtn.disabled = false;
          saveBtn.textContent = '저장 후 시작';
        }
      } catch {
        testResult.style.display = 'block';
        testResult.className = 'setup-test-result error';
        testResult.textContent = '서버 연결 실패';
        saveBtn.disabled = false;
        saveBtn.textContent = '저장 후 시작';
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
