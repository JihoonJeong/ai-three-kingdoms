// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사(제갈량) 채팅 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { h, assetUrl } from '../renderer.js';
import { getCharacterAssetPath } from '../../../core/ui/types.js';
import { streamChat, checkHealth } from '../services/advisor-api.js';
import { checkConfig } from '../services/config-api.js';
import {
  buildBriefingUserMessage,
  buildActionCommentMessage,
  buildBattleAdviceMessage,
} from '../../../core/advisor/prompts.js';
import {
  parseRecommendations,
  type ActionRecommendation,
  type RecommendationContext,
} from '../../../core/advisor/action-recommender.js';
import type { GameState, GameAction } from '../../../core/data/types.js';
import type { ChatMessage, AdvisorExpression } from '../../../core/advisor/types.js';

const MAX_HISTORY = 20;
const LONG_RESPONSE_THRESHOLD = 300;
const ACTION_SEPARATOR = '---ACTIONS---';

export class AdvisorScreen {
  private container: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;
  private recommendPanel: HTMLElement | null = null;

  private chatHistory: ChatMessage[] = [];
  private displayMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }> = [];
  private currentState: GameState | null = null;
  private isStreaming = false;
  private currentBubble: HTMLElement | null = null;
  private currentExpression: AdvisorExpression = 'default';
  private serverAvailable: boolean | null = null;
  private aiEnabled = true;
  private modelName: string | null = null;
  private settingsClickCb: (() => void) | null = null;
  private executeActionCb: ((action: GameAction) => void) | null = null;

  private abortController: AbortController | null = null;
  private longResponsePromptShown = false;
  private thinkingTimer: ReturnType<typeof setInterval> | null = null;
  private thinkingStartTime = 0;
  private hasReceivedVisibleToken = false;
  private recommendations: ActionRecommendation[] = [];
  private executedIndices: Set<number> = new Set();

  /** AI 활성화 상태 설정 */
  setAiEnabled(enabled: boolean): void {
    this.aiEnabled = enabled;
  }

  /** 모델명 설정 */
  setModelName(name: string): void {
    this.modelName = name;
  }

  /** 설정 버튼 클릭 콜백 */
  onSettingsClick(cb: () => void): void {
    this.settingsClickCb = cb;
  }

  /** 추천 행동 실행 콜백 */
  onExecuteAction(cb: (action: GameAction) => void): void {
    this.executeActionCb = cb;
  }

  /** 제공자 변경 시 채팅 초기화 */
  resetForNewProvider(): void {
    this.chatHistory = [];
    this.displayMessages = [];
    this.serverAvailable = null;
    this.modelName = null;
    this.container = null;
    this.messagesEl = null;
    this.recommendPanel = null;
    this.recommendations = [];
    this.executedIndices.clear();
  }

  render(container: HTMLElement, state: GameState): void {
    this.currentState = state;

    // 이미 렌더링된 경우 재생성하지 않음 (채팅 히스토리 보존)
    if (this.container === container && this.messagesEl) {
      return;
    }

    this.container = container;
    container.innerHTML = '';

    const screen = h('div', { className: 'advisor-screen' });
    screen.style.position = 'relative';

    // 설정 버튼
    const settingsBtn = h('button', { className: 'advisor-settings-btn' });
    settingsBtn.innerHTML = '&#9881;';  // gear icon
    settingsBtn.title = 'AI 설정';
    settingsBtn.addEventListener('click', () => this.settingsClickCb?.());
    screen.appendChild(settingsBtn);

    // AI 미연결 모드
    if (!this.aiEnabled) {
      const banner = h('div', { className: 'advisor-offline-banner' });
      banner.innerHTML = `
        <p>AI 책사가 연결되지 않았습니다.</p>
        <p>설정에서 AI 제공자를 구성하면<br>제갈량의 전략 조언을 받을 수 있습니다.</p>
      `;
      const configBtn = h('button', {}, 'AI 설정하기');
      configBtn.addEventListener('click', () => this.settingsClickCb?.());
      banner.appendChild(configBtn);
      screen.appendChild(banner);
      container.appendChild(screen);
      return;
    }

    // Messages area
    this.messagesEl = h('div', { className: 'advisor-messages' });
    screen.appendChild(this.messagesEl);

    // Recommendation panel (추천 패널)
    this.recommendPanel = h('div', { className: 'advisor-recommend' });
    this.recommendPanel.style.display = 'none';
    screen.appendChild(this.recommendPanel);

    // Input area
    const inputArea = h('div', { className: 'advisor-input-area' });

    this.inputEl = h('input', {
      className: 'advisor-input',
      type: 'text',
      placeholder: '제갈량에게 질문하세요...',
    }) as HTMLInputElement;

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        if (this.isStreaming) {
          this.stopStreaming();
        } else {
          this.handleSend();
        }
      }
    });

    this.sendBtn = h('button', { className: 'advisor-send-btn' }, '전송') as HTMLButtonElement;
    this.sendBtn.addEventListener('click', () => {
      if (this.isStreaming) {
        this.stopStreaming();
      } else {
        this.handleSend();
      }
    });

    inputArea.appendChild(this.inputEl);
    inputArea.appendChild(this.sendBtn);
    screen.appendChild(inputArea);

    container.appendChild(screen);

    // 기존 메시지 복원
    this.restoreMessages();

    // 추천 패널 복원
    if (this.recommendations.length > 0) {
      this.renderRecommendPanel();
    }

    // 서버 상태 확인
    if (this.serverAvailable === null) {
      this.checkServer();
    }
  }

  updateState(state: GameState): void {
    this.currentState = state;
    this.updateRecommendButtons();
  }

  /** 턴 시작 시 자동 브리핑 */
  async requestTurnBriefing(state: GameState): Promise<void> {
    if (!this.aiEnabled) return;
    this.currentState = state;
    // 새 턴: 추천 초기화
    this.recommendations = [];
    this.executedIndices.clear();
    this.renderRecommendPanel();
    const userMsg = buildBriefingUserMessage(state.turn);
    this.addSystemMessage(`── 턴 ${state.turn} 시작 ──`);
    await this.sendMessage(userMsg, true);
  }

  /** 행동 실행 후 코멘트 */
  async notifyAction(description: string, success: boolean, state: GameState): Promise<void> {
    if (!this.aiEnabled) return;
    this.currentState = state;
    const userMsg = buildActionCommentMessage(description, success);
    await this.sendMessage(userMsg, true);
  }

  /** 전투 시작 시 조언 */
  async notifyBattle(location: string, state: GameState): Promise<void> {
    if (!this.aiEnabled) return;
    this.currentState = state;
    const userMsg = buildBattleAdviceMessage(location);
    await this.sendMessage(userMsg, true);
  }

  // ─── Private ──────────────────────────────────────────

  /** 스트리밍 중단 */
  private stopStreaming(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /** 중단 후 현재까지 받은 텍스트로 마무리 */
  private finalizeCurrentResponse(fullText: string): void {
    this.stopThinkingTimer();
    if (fullText.trim()) {
      const { narrative } = this.extractNarrative(fullText);
      this.updateBubbleContent(narrative, false);
      this.updatePortrait(this.inferLocalExpression(narrative));
      this.chatHistory.push({ role: 'assistant', content: fullText });
      this.displayMessages.push({ role: 'assistant', content: narrative });
      // 중단 시에도 추천 파싱 시도
      this.processRecommendations(fullText);
    } else {
      this.removeBubble();
    }

    this.removeLongResponsePrompt();
    this.isStreaming = false;
    this.currentBubble = null;
    this.longResponsePromptShown = false;
    this.updateSendButton();
    this.scrollToBottom();
  }

  private inferLocalExpression(text: string): AdvisorExpression {
    if (/급|위험|경고|주의|위태|긴급/.test(text)) return 'warning';
    if (/심각|패배|위기|절체절명/.test(text)) return 'serious';
    if (/승리|축하|훌륭|탁월|좋은/.test(text)) return 'smile';
    if (/고려|생각|분석|판단|살펴/.test(text)) return 'thinking';
    return 'default';
  }

  /** AI 응답에서 서사 부분만 추출 (---ACTIONS--- 이후 제거) */
  private extractNarrative(text: string): { narrative: string } {
    const idx = text.indexOf(ACTION_SEPARATOR);
    if (idx === -1) return { narrative: text.trim() };
    return { narrative: text.slice(0, idx).trim() };
  }

  /** AI 응답에서 추천을 파싱하여 패널 갱신 */
  private processRecommendations(fullText: string): void {
    if (!this.currentState) return;

    const ctx = this.buildRecommendationContext();
    const { recommendations } = parseRecommendations(fullText, ctx);

    if (recommendations.length > 0) {
      this.recommendations = recommendations;
      this.executedIndices.clear();
      this.renderRecommendPanel();
    }
    // recommendations가 비어있으면 이전 추천 유지
  }

  /** GameState에서 RecommendationContext 생성 */
  private buildRecommendationContext(): RecommendationContext {
    const state = this.currentState!;
    const playerFaction = '유비';

    return {
      playerCities: state.cities
        .filter(c => c.owner === playerFaction)
        .map(c => ({ id: c.id, name: c.name })),
      playerGenerals: state.generals
        .filter(g => g.faction === playerFaction)
        .map(g => ({ id: g.id, name: g.name, location: g.location })),
      factions: state.factions
        .filter(f => f.id !== playerFaction)
        .map(f => f.id),
    };
  }

  private async checkServer(): Promise<void> {
    try {
      const health = await checkHealth();
      this.serverAvailable = true;

      // 모델명 가져오기
      try {
        const config = await checkConfig();
        this.modelName = config.model;
      } catch { /* ignore */ }

      if (!health.hasApiKey) {
        this.addSystemMessage('⚠ AI 제공자 미설정 — ⚙ 버튼을 눌러 설정하세요');
      } else {
        this.addSystemMessage('제갈량 공명이 대기 중입니다. 무엇이든 물어보십시오.');
      }
    } catch {
      this.serverAvailable = false;
      this.addSystemMessage('⚠ 서버 연결 불가 — npm run dev 로 서버를 시작하세요');
    }
  }

  private handleSend(): void {
    if (this.isStreaming || !this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.sendMessage(text, false);
  }

  private async sendMessage(text: string, isAutomatic: boolean): Promise<void> {
    if (this.isStreaming || !this.currentState) return;

    // 자동 메시지가 아닌 경우 유저 메시지로 표시
    if (!isAutomatic) {
      this.addUserMessage(text);
    }

    // 히스토리에 추가
    this.chatHistory.push({ role: 'user', content: text });

    // 보낼 메시지 (최근 MAX_HISTORY개)
    const messagesToSend = this.chatHistory.slice(-MAX_HISTORY);

    this.isStreaming = true;
    this.longResponsePromptShown = false;
    this.hasReceivedVisibleToken = false;
    this.abortController = new AbortController();
    this.updateSendButton();

    // 스트리밍 응답 시작
    this.currentBubble = this.createAssistantBubble();
    this.startThinkingTimer();
    let fullText = '';

    await streamChat(messagesToSend, this.currentState, {
      onToken: (token) => {
        fullText += token;

        // 첫 visible 토큰 수신 → thinking 타이머 종료
        if (!this.hasReceivedVisibleToken) {
          this.hasReceivedVisibleToken = true;
          this.stopThinkingTimer();
        }

        // 스트리밍 중에는 ---ACTIONS--- 이전까지만 표시
        const { narrative } = this.extractNarrative(fullText);
        this.updateBubbleContent(narrative, true);
        this.scrollToBottom();

        // 300자 초과 시 "충분합니다" 프롬프트 표시 (서사 기준)
        if (!this.longResponsePromptShown && narrative.length > LONG_RESPONSE_THRESHOLD) {
          this.longResponsePromptShown = true;
          this.showLongResponsePrompt();
        }
      },
      onComplete: (text, expression) => {
        this.stopThinkingTimer();
        fullText = text;
        this.currentExpression = expression;
        const { narrative } = this.extractNarrative(fullText);
        this.updateBubbleContent(narrative, false);
        this.updatePortrait(expression);
        this.chatHistory.push({ role: 'assistant', content: fullText });
        this.displayMessages.push({ role: 'assistant', content: narrative });
        this.removeLongResponsePrompt();
        this.isStreaming = false;
        this.currentBubble = null;
        this.abortController = null;
        this.longResponsePromptShown = false;
        this.updateSendButton();
        this.scrollToBottom();

        // 추천 파싱 + 패널 갱신
        this.processRecommendations(fullText);
      },
      onError: (error) => {
        this.stopThinkingTimer();
        this.removeBubble();
        this.removeLongResponsePrompt();
        this.addErrorMessage(error);
        this.isStreaming = false;
        this.currentBubble = null;
        this.abortController = null;
        this.longResponsePromptShown = false;
        this.updateSendButton();
      },
    }, this.abortController.signal);

    // abort로 종료된 경우 (onComplete 안 불림)
    if (this.isStreaming) {
      this.finalizeCurrentResponse(fullText);
    }
  }

  // ─── 추천 패널 ──────────────────────────────────────────

  private renderRecommendPanel(): void {
    if (!this.recommendPanel) return;

    this.recommendPanel.innerHTML = '';

    if (this.recommendations.length === 0) {
      this.recommendPanel.style.display = 'none';
      return;
    }

    this.recommendPanel.style.display = '';

    const title = h('div', { className: 'advisor-recommend-title' }, '제갈량의 추천');
    this.recommendPanel.appendChild(title);

    const actionsRemaining = this.currentState?.actionsRemaining ?? 0;

    this.recommendations.forEach((rec, idx) => {
      const card = h('div', { className: 'advisor-recommend-card' });
      const isPass = rec.action === null;
      const isExecuted = this.executedIndices.has(idx);

      if (isPass) card.classList.add('pass');
      if (isExecuted) card.classList.add('done');

      // 번호
      const num = h('span', { className: 'advisor-recommend-num' }, `${idx + 1}`);
      card.appendChild(num);

      // 설명 + confidence
      const info = h('div', { className: 'advisor-recommend-info' });
      info.appendChild(h('div', { className: 'advisor-recommend-desc' }, rec.description));

      const confBar = h('div', { className: 'advisor-recommend-confidence' });
      const confFill = h('div', { className: 'advisor-recommend-conf-fill' });
      confFill.style.width = `${rec.confidence}%`;
      confBar.appendChild(confFill);
      const confLabel = h('span', { className: 'advisor-recommend-conf-label' }, `${rec.confidence}%`);
      confBar.appendChild(confLabel);
      info.appendChild(confBar);

      card.appendChild(info);

      // 실행 버튼
      if (!isPass) {
        const btn = h('button', { className: 'advisor-recommend-btn' }) as HTMLButtonElement;
        if (isExecuted) {
          btn.textContent = '완료';
          btn.disabled = true;
        } else if (actionsRemaining <= 0) {
          btn.textContent = '실행';
          btn.disabled = true;
        } else {
          btn.textContent = '실행';
          btn.addEventListener('click', () => {
            if (rec.action) {
              this.executedIndices.add(idx);
              this.executeActionCb?.(rec.action);
              this.renderRecommendPanel();
            }
          });
        }
        card.appendChild(btn);
      } else {
        const label = h('span', { className: 'advisor-recommend-pass-label' }, '행동 안 함');
        card.appendChild(label);
      }

      this.recommendPanel!.appendChild(card);
    });
  }

  /** actionsRemaining 변경 시 버튼 상태 갱신 */
  private updateRecommendButtons(): void {
    if (!this.recommendPanel || this.recommendations.length === 0) return;
    this.renderRecommendPanel();
  }

  // ─── Thinking 타이머 ─────────────────────────────────

  private startThinkingTimer(): void {
    this.thinkingStartTime = Date.now();
    this.thinkingTimer = setInterval(() => {
      if (!this.currentBubble || this.hasReceivedVisibleToken) {
        this.stopThinkingTimer();
        return;
      }
      const elapsed = Math.floor((Date.now() - this.thinkingStartTime) / 1000);
      const thinkingEl = this.currentBubble.querySelector('.advisor-thinking-inline');
      if (thinkingEl) {
        const textEl = thinkingEl.querySelector('.advisor-thinking-text');
        if (textEl) {
          textEl.textContent = `공명이 생각 중입니다… (${elapsed}초)`;
        }
      }
    }, 1000);
  }

  private stopThinkingTimer(): void {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
    }
  }

  // ─── 긴 응답 프롬프트 ─────────────────────────────────

  private showLongResponsePrompt(): void {
    if (!this.messagesEl) return;

    const prompt = h('div', { className: 'advisor-long-prompt' });

    const stopBtn = h('button', { className: 'advisor-long-btn stop' }, '충분합니다');
    stopBtn.addEventListener('click', () => {
      this.stopStreaming();
    });

    const continueBtn = h('button', { className: 'advisor-long-btn continue' }, '계속');
    continueBtn.addEventListener('click', () => {
      this.removeLongResponsePrompt();
    });

    prompt.appendChild(stopBtn);
    prompt.appendChild(continueBtn);
    this.messagesEl.appendChild(prompt);
    this.scrollToBottom();
  }

  private removeLongResponsePrompt(): void {
    if (!this.messagesEl) return;
    const prompt = this.messagesEl.querySelector('.advisor-long-prompt');
    if (prompt) prompt.remove();
  }

  // ─── 메시지 관리 ──────────────────────────────────────

  private addSystemMessage(text: string): void {
    this.displayMessages.push({ role: 'system', content: text });
    if (!this.messagesEl) return;
    const el = h('div', { className: 'advisor-msg-system' }, text);
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
  }

  private addUserMessage(text: string): void {
    this.displayMessages.push({ role: 'user', content: text });
    if (!this.messagesEl) return;
    const el = h('div', { className: 'advisor-msg-user' }, text);
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
  }

  private addErrorMessage(text: string): void {
    if (!this.messagesEl) return;
    const el = h('div', { className: 'advisor-error' }, text);
    this.messagesEl.appendChild(el);
    this.scrollToBottom();
  }

  private createAssistantBubble(): HTMLElement {
    if (!this.messagesEl) return h('div');

    const wrapper = h('div', { className: 'advisor-msg-assistant' });

    // Portrait + 모델 배지
    const portraitWrap = h('div', { className: 'advisor-portrait-wrap' });
    const portrait = h('div', { className: 'advisor-portrait' });
    const img = h('img') as HTMLImageElement;
    img.src = assetUrl(getCharacterAssetPath('zhugeliang', 'thinking'));
    img.alt = '제갈량';
    img.onerror = () => {
      portrait.innerHTML = '';
      portrait.appendChild(h('div', { className: 'advisor-portrait-fallback' }, '亮'));
    };
    portrait.appendChild(img);
    portraitWrap.appendChild(portrait);
    if (this.modelName) {
      const badge = h('div', { className: 'advisor-model-badge', title: this.modelName }, this.modelName);
      portraitWrap.appendChild(badge);
    }
    wrapper.appendChild(portraitWrap);

    // Bubble — 첫 토큰 전까지 "생각 중" 표시
    const bubble = h('div', { className: 'advisor-bubble' });
    const thinking = h('div', { className: 'advisor-thinking-inline' });
    thinking.innerHTML = '<span class="advisor-thinking-dots"><span></span><span></span><span></span></span> <span class="advisor-thinking-text">공명이 생각 중입니다…</span>';
    bubble.appendChild(thinking);
    wrapper.appendChild(bubble);

    this.messagesEl.appendChild(wrapper);
    return bubble;
  }

  private updateBubbleContent(text: string, streaming: boolean): void {
    if (!this.currentBubble) return;

    // 간단한 마크다운 렌더링 (줄바꿈 → <p>)
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    let html = paragraphs
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');

    if (streaming) {
      html += '<span class="advisor-cursor"></span>';
    }

    this.currentBubble.innerHTML = html;
  }

  private updatePortrait(expression: AdvisorExpression): void {
    if (!this.messagesEl) return;
    const lastMsg = this.messagesEl.querySelector('.advisor-msg-assistant:last-child');
    if (!lastMsg) return;
    const img = lastMsg.querySelector('.advisor-portrait img') as HTMLImageElement | null;
    if (img) {
      img.src = assetUrl(getCharacterAssetPath('zhugeliang', expression));
    }
  }

  private removeBubble(): void {
    if (!this.currentBubble || !this.messagesEl) return;
    const wrapper = this.currentBubble.parentElement;
    if (wrapper) wrapper.remove();
    this.currentBubble = null;
  }

  private updateSendButton(): void {
    if (this.sendBtn) {
      this.sendBtn.disabled = false;
      if (this.isStreaming) {
        this.sendBtn.textContent = '중단';
        this.sendBtn.className = 'advisor-send-btn streaming';
      } else {
        this.sendBtn.textContent = '전송';
        this.sendBtn.className = 'advisor-send-btn';
      }
    }
  }

  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private restoreMessages(): void {
    if (!this.messagesEl) return;
    for (const msg of this.displayMessages) {
      if (msg.role === 'system') {
        this.messagesEl.appendChild(
          h('div', { className: 'advisor-msg-system' }, msg.content),
        );
      } else if (msg.role === 'user') {
        this.messagesEl.appendChild(
          h('div', { className: 'advisor-msg-user' }, msg.content),
        );
      } else {
        const wrapper = h('div', { className: 'advisor-msg-assistant' });
        const portraitWrap = h('div', { className: 'advisor-portrait-wrap' });
        const portrait = h('div', { className: 'advisor-portrait' });
        const img = h('img') as HTMLImageElement;
        img.src = assetUrl(getCharacterAssetPath('zhugeliang', this.currentExpression));
        img.alt = '제갈량';
        img.onerror = () => {
          portrait.innerHTML = '';
          portrait.appendChild(h('div', { className: 'advisor-portrait-fallback' }, '亮'));
        };
        portrait.appendChild(img);
        portraitWrap.appendChild(portrait);
        if (this.modelName) {
          portraitWrap.appendChild(h('div', { className: 'advisor-model-badge', title: this.modelName }, this.modelName));
        }
        wrapper.appendChild(portraitWrap);

        const bubble = h('div', { className: 'advisor-bubble' });
        const paragraphs = msg.content.split('\n\n').filter(p => p.trim());
        bubble.innerHTML = paragraphs
          .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
          .join('');
        wrapper.appendChild(bubble);

        this.messagesEl.appendChild(wrapper);
      }
    }
    this.scrollToBottom();
  }
}
