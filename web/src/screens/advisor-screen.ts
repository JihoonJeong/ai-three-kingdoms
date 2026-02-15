// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 책사(제갈량) 채팅 화면
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { h, assetUrl } from '../renderer.js';
import { getCharacterAssetPath } from '../../../core/ui/types.js';
import { streamChat, checkHealth, type StreamChatOptions } from '../services/advisor-api.js';
import { checkConfig } from '../services/config-api.js';
import {
  buildBriefingUserMessage,
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
const SEPARATOR_REGEX = /-{2,}\s*actions?\s*-{2,}/i;

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
  private currentWrapper: HTMLElement | null = null;
  private currentExpression: AdvisorExpression = 'default';
  private serverAvailable: boolean | null = null;
  private aiEnabled = true;
  private modelName: string | null = null;
  private settingsClickCb: (() => void) | null = null;
  private executeActionCb: ((action: GameAction) => boolean) | null = null;

  private abortController: AbortController | null = null;
  private longResponsePromptShown = false;
  private thinkingTimer: ReturnType<typeof setInterval> | null = null;
  private thinkingStartTime = 0;
  private hasReceivedVisibleToken = false;
  private recommendations: ActionRecommendation[] = [];
  private executedIndices: Set<number> = new Set();
  private pendingActions: Array<{ description: string; success: boolean }> = [];
  private thinkMode = false;  // 신중한 답변 모드 (thinking)
  private thinkToggleEl: HTMLElement | null = null;

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

  /** 추천 행동 실행 콜백 (성공 시 true 반환) */
  onExecuteAction(cb: (action: GameAction) => boolean): void {
    this.executeActionCb = cb;
  }

  /** 제공자 변경 시 채팅 초기화 (modelName은 유지 — 호출 전에 setModelName으로 갱신) */
  resetForNewProvider(): void {
    this.chatHistory = [];
    this.displayMessages = [];
    this.serverAvailable = null;
    this.container = null;
    this.messagesEl = null;
    this.recommendPanel = null;
    this.recommendations = [];
    this.executedIndices.clear();
  }

  render(container: HTMLElement, state: GameState): void {
    this.currentState = state;

    // 이미 렌더링된 DOM이 컨테이너에 살아있으면 재생성하지 않음
    if (this.container === container && this.messagesEl && container.contains(this.messagesEl)) {
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

    // thinking 모드 토글
    this.thinkToggleEl = h('button', {
      className: `advisor-think-toggle${this.thinkMode ? ' active' : ''}`,
      title: this.thinkMode ? '신중한 답변 (느림)' : '빠른 응답',
    }) as HTMLElement;
    this.thinkToggleEl.innerHTML = this.thinkMode ? '🧠' : '⚡';
    this.thinkToggleEl.addEventListener('click', () => {
      this.thinkMode = !this.thinkMode;
      if (this.thinkToggleEl) {
        this.thinkToggleEl.innerHTML = this.thinkMode ? '🧠' : '⚡';
        this.thinkToggleEl.className = `advisor-think-toggle${this.thinkMode ? ' active' : ''}`;
        this.thinkToggleEl.title = this.thinkMode ? '신중한 답변 (느림)' : '빠른 응답';
      }
    });

    inputArea.appendChild(this.thinkToggleEl);
    inputArea.appendChild(this.inputEl);
    inputArea.appendChild(this.sendBtn);
    screen.appendChild(inputArea);

    container.appendChild(screen);

    // 기존 메시지 복원
    this.restoreMessages();

    // 스트리밍 중이면 현재 wrapper(초상화+버블) 전체를 새 DOM에 재배치
    if (this.isStreaming && this.currentWrapper && this.messagesEl) {
      this.messagesEl.appendChild(this.currentWrapper);
      this.scrollToBottom();
    }

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

  /** 턴 시작 시 자동 브리핑 (지난 턴 행동 결과 포함) */
  async requestTurnBriefing(state: GameState): Promise<void> {
    if (!this.aiEnabled) return;
    this.currentState = state;
    // 새 턴: 추천 초기화
    this.recommendations = [];
    this.executedIndices.clear();
    this.renderRecommendPanel();

    // 지난 턴 행동 결과를 브리핑에 포함
    const prevActions = this.pendingActions.length > 0 ? [...this.pendingActions] : undefined;
    this.pendingActions = [];

    const userMsg = buildBriefingUserMessage(state.turn, 'ko', prevActions);
    this.addSystemMessage(`── 턴 ${state.turn} 시작 ──`);
    await this.sendMessage(userMsg, true);
  }

  /** 행동 실행 결과를 큐에 저장 (다음 브리핑에서 일괄 코멘트) */
  queueActionResult(description: string, success: boolean, state: GameState): void {
    this.currentState = state;
    this.pendingActions.push({ description, success });
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
    this.currentWrapper = null;
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

  /** AI 응답에서 서사 부분만 추출 (XML 태그, JSON 배열, ---ACTIONS--- 제거) */
  private extractNarrative(text: string): { narrative: string; hasActions: boolean } {
    // 1차: <narrative> XML 태그가 있으면 그 안의 내용만 반환
    const narrativeTag = /<narrative>([\s\S]*?)<\/narrative>/i.exec(text);
    const actionsTag = /<actions>[\s\S]*?<\/actions>/i.test(text);
    if (narrativeTag) {
      return { narrative: narrativeTag[1].trim(), hasActions: actionsTag };
    }

    // 1-b: 스트리밍 중 <narrative> 열렸지만 닫히지 않은 경우
    const openNarrative = /<narrative>([\s\S]*)/i.exec(text);
    if (openNarrative) {
      // <actions> 이후 제거
      const content = openNarrative[1].replace(/<actions>[\s\S]*/i, '').trim();
      return { narrative: content, hasActions: /<actions>/i.test(text) };
    }

    // 2차: <actions> 태그만 있으면 (narrative 태그 없이) 태그 이전 텍스트 사용
    if (actionsTag) {
      const before = text.replace(/<actions>[\s\S]*?<\/actions>/i, '').trim();
      return { narrative: before, hasActions: true };
    }

    // 2-b: 스트리밍 중 <actions> 열렸지만 닫히지 않은 경우
    if (/<actions>/i.test(text)) {
      const before = text.replace(/<actions>[\s\S]*/i, '').trim();
      return { narrative: before, hasActions: true };
    }

    // 3차: ---ACTIONS--- 구분자
    const sepMatch = SEPARATOR_REGEX.exec(text);
    if (sepMatch) return { narrative: text.slice(0, sepMatch.index).trim(), hasActions: true };

    // 4차: 날 JSON 배열 (태그 없이 [{...}] 형태)
    const jsonMatch = /\[[\s\S]*?\{[\s\S]*?"type"[\s\S]*?\}[\s\S]*?\]/.exec(text);
    if (jsonMatch) {
      const before = text.slice(0, jsonMatch.index).trim();
      return { narrative: before || text.trim(), hasActions: true };
    }

    // 5차: 레거시 인라인 패턴
    const hasFallback = /\*{0,2}액션\*{0,2}\s*[:：]/.test(text)
      || /\*\*[a-z_]+\|[^*]+\*\*/.test(text)
      || /^\d+\.\s*\[?[a-z_]+\|/m.test(text);
    const cleaned = text.split('\n').filter(l => {
      const t = l.trim();
      return !/^\d+\.\s*\*{0,2}\[?[a-z_]+\|/.test(t)
        && !/\*{0,2}액션\*{0,2}\s*[:：]\s*[a-z_]+\|/.test(t);
    }).join('\n').trim();
    return { narrative: cleaned || text.trim(), hasActions: hasFallback };
  }

  /** AI 응답에서 추천을 파싱하여 패널 갱신 */
  private processRecommendations(fullText: string): void {
    if (!this.currentState) return;

    const ctx = this.buildRecommendationContext();
    const { recommendations } = parseRecommendations(fullText, ctx);

    // 디버그: AI 원본 ACTIONS 블록 vs 파싱 결과
    const sepMatch = /-{2,}\s*actions?\s*-{2,}/i.exec(fullText);
    if (sepMatch) {
      const actionBlock = fullText.slice(sepMatch.index).trim();
      console.log('[추천 디버그] AI 원본 ACTIONS:\n', actionBlock);
      console.log('[추천 디버그] 파싱 결과:', recommendations.length, '개',
        recommendations.map(r => `${r.description}(${r.confidence}%)`));
    } else {
      console.log('[추천 디버그] ---ACTIONS--- 구분자 없음. Fallback 파싱:', recommendations.length, '개');
    }

    if (recommendations.length > 0) {
      this.recommendations = recommendations;
      this.executedIndices.clear();
      this.renderRecommendPanel();
    } else if (this.recommendations.length > 0) {
      // 이전 추천 유지 — 로딩 상태 제거
      this.renderRecommendPanel();
    } else {
      // 추천 없음 — 패널 숨김 (로딩 상태 포함)
      if (this.recommendPanel) {
        this.recommendPanel.innerHTML = '';
        this.recommendPanel.style.display = 'none';
      }
    }
  }

  /** GameState에서 RecommendationContext 생성 */
  private buildRecommendationContext(): RecommendationContext {
    const state = this.currentState!;
    const playerFaction = '유비';

    // 정찰/진군 가능 지역: 모든 도시 ID + 전투장
    const allLocations = state.cities.map(c => c.id);
    if (!allLocations.includes('chibi')) allLocations.push('chibi');

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
      allLocations,
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

    let actionsDetected = false;

    await streamChat(messagesToSend, this.currentState, {
      onToken: (token) => {
        fullText += token;

        // 첫 visible 토큰 수신 → thinking 타이머 종료
        if (!this.hasReceivedVisibleToken) {
          this.hasReceivedVisibleToken = true;
          this.stopThinkingTimer();
        }

        // 스트리밍 중에는 액션 부분 제거 후 서사만 표시
        const { narrative, hasActions } = this.extractNarrative(fullText);
        this.updateBubbleContent(narrative, true);
        this.scrollToBottom();

        // 액션 감지 → 추천 패널 로딩 표시
        if (hasActions && !actionsDetected) {
          actionsDetected = true;
          this.showRecommendLoading();
        }

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
        this.currentWrapper = null;
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
        this.currentWrapper = null;
        this.abortController = null;
        this.longResponsePromptShown = false;
        this.updateSendButton();
      },
    }, this.abortController.signal, 'ko', { think: this.thinkMode });

    // abort로 종료된 경우 (onComplete 안 불림)
    if (this.isStreaming) {
      this.finalizeCurrentResponse(fullText);
    }
  }

  // ─── 추천 패널 ──────────────────────────────────────────

  /** 스트리밍 중 ---ACTIONS--- 감지 시 로딩 상태 표시 */
  private showRecommendLoading(): void {
    if (!this.recommendPanel) return;
    this.recommendPanel.innerHTML = '';
    this.recommendPanel.style.display = '';

    const title = h('div', { className: 'advisor-recommend-title' }, '제갈량의 추천');
    this.recommendPanel.appendChild(title);

    const loading = h('div', { className: 'advisor-recommend-loading' });
    loading.innerHTML = '<span class="advisor-thinking-dots"><span></span><span></span><span></span></span> <span>추천 행동 분석 중…</span>';
    this.recommendPanel.appendChild(loading);
  }

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
            if (rec.action && this.executeActionCb) {
              const success = this.executeActionCb(rec.action);
              if (success) {
                this.executedIndices.add(idx);
              }
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
    this.currentWrapper = wrapper;
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
    this.currentWrapper = null;
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
