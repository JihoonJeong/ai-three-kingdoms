// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사(제갈량) 채팅 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { h, assetUrl } from '../renderer.js';
import { getCharacterAssetPath } from '../../../core/ui/types.js';
import { streamChat, checkHealth } from '../services/advisor-api.js';
import {
  buildBriefingUserMessage,
  buildActionCommentMessage,
  buildBattleAdviceMessage,
} from '../../../core/advisor/prompts.js';
import type { GameState } from '../../../core/data/types.js';
import type { ChatMessage, AdvisorExpression } from '../../../core/advisor/types.js';

const MAX_HISTORY = 20;

export class AdvisorScreen {
  private container: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private sendBtn: HTMLButtonElement | null = null;

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

  render(container: HTMLElement, state: GameState): void {
    this.currentState = state;

    // 이미 렌더링된 경우 재생성하지 않음 (채팅 히스토리 보존)
    if (this.container === container && this.messagesEl) {
      return;
    }

    this.container = container;
    container.innerHTML = '';

    const screen = h('div', { className: 'advisor-screen' });

    // Messages area
    this.messagesEl = h('div', { className: 'advisor-messages' });
    screen.appendChild(this.messagesEl);

    // Input area
    const inputArea = h('div', { className: 'advisor-input-area' });

    this.inputEl = h('input', {
      className: 'advisor-input',
      type: 'text',
      placeholder: '제갈량에게 질문하세요...',
    }) as HTMLInputElement;

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && !this.isStreaming) {
        this.handleSend();
      }
    });

    this.sendBtn = h('button', { className: 'advisor-send-btn' }, '전송') as HTMLButtonElement;
    this.sendBtn.addEventListener('click', () => this.handleSend());

    inputArea.appendChild(this.inputEl);
    inputArea.appendChild(this.sendBtn);
    screen.appendChild(inputArea);

    container.appendChild(screen);

    // 기존 메시지 복원
    this.restoreMessages();

    // 서버 상태 확인
    if (this.serverAvailable === null) {
      this.checkServer();
    }
  }

  updateState(state: GameState): void {
    this.currentState = state;
  }

  /** 턴 시작 시 자동 브리핑 */
  async requestTurnBriefing(state: GameState): Promise<void> {
    this.currentState = state;
    const userMsg = buildBriefingUserMessage(state.turn);
    this.addSystemMessage(`── 턴 ${state.turn} 시작 ──`);
    await this.sendMessage(userMsg, true);
  }

  /** 행동 실행 후 코멘트 */
  async notifyAction(description: string, success: boolean, state: GameState): Promise<void> {
    this.currentState = state;
    const userMsg = buildActionCommentMessage(description, success);
    await this.sendMessage(userMsg, true);
  }

  /** 전투 시작 시 조언 */
  async notifyBattle(location: string, state: GameState): Promise<void> {
    this.currentState = state;
    const userMsg = buildBattleAdviceMessage(location);
    await this.sendMessage(userMsg, true);
  }

  // ─── Private ──────────────────────────────────────────

  private async checkServer(): Promise<void> {
    try {
      const health = await checkHealth();
      this.serverAvailable = true;
      if (!health.hasApiKey) {
        this.addSystemMessage('⚠ API 키 미설정 — ANTHROPIC_API_KEY 환경변수를 설정하세요');
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

    // Claude에 보낼 메시지 (최근 MAX_HISTORY개)
    const messagesToSend = this.chatHistory.slice(-MAX_HISTORY);

    this.isStreaming = true;
    this.updateSendButton();

    // 스트리밍 응답 시작
    this.currentBubble = this.createAssistantBubble();
    let fullText = '';

    await streamChat(messagesToSend, this.currentState, {
      onToken: (token) => {
        fullText += token;
        this.updateBubbleContent(fullText, true);
        this.scrollToBottom();
      },
      onComplete: (text, expression) => {
        fullText = text;
        this.currentExpression = expression;
        this.updateBubbleContent(fullText, false);
        this.updatePortrait(expression);
        this.chatHistory.push({ role: 'assistant', content: fullText });
        this.displayMessages.push({ role: 'assistant', content: fullText });
        this.isStreaming = false;
        this.currentBubble = null;
        this.updateSendButton();
        this.scrollToBottom();
      },
      onError: (error) => {
        this.removeBubble();
        this.addErrorMessage(error);
        this.isStreaming = false;
        this.currentBubble = null;
        this.updateSendButton();
      },
    });
  }

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

    // Portrait
    const portrait = h('div', { className: 'advisor-portrait' });
    const img = h('img') as HTMLImageElement;
    img.src = assetUrl(getCharacterAssetPath('zhugeliang', 'thinking'));
    img.alt = '제갈량';
    img.onerror = () => {
      portrait.innerHTML = '';
      portrait.appendChild(h('div', { className: 'advisor-portrait-fallback' }, '亮'));
    };
    portrait.appendChild(img);
    wrapper.appendChild(portrait);

    // Bubble
    const bubble = h('div', { className: 'advisor-bubble' });
    const cursor = h('span', { className: 'advisor-cursor' });
    bubble.appendChild(cursor);
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
      this.sendBtn.disabled = this.isStreaming;
      this.sendBtn.textContent = this.isStreaming ? '응답 중...' : '전송';
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
        const portrait = h('div', { className: 'advisor-portrait' });
        const img = h('img') as HTMLImageElement;
        img.src = assetUrl(getCharacterAssetPath('zhugeliang', this.currentExpression));
        img.alt = '제갈량';
        img.onerror = () => {
          portrait.innerHTML = '';
          portrait.appendChild(h('div', { className: 'advisor-portrait-fallback' }, '亮'));
        };
        portrait.appendChild(img);
        wrapper.appendChild(portrait);

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
