import { h, assetUrl, typeText } from '../renderer.js';
import { EventCutscene } from '../../../core/ui/event-cutscene.js';

export class CutsceneScreen {
  private container: HTMLElement | null = null;
  private cutscene = new EventCutscene();
  private onComplete: (() => void) | null = null;
  private textEl: HTMLElement | null = null;

  onCutsceneComplete(cb: () => void): void { this.onComplete = cb; }

  start(container: HTMLElement, eventId: string): boolean {
    if (!EventCutscene.hasCutscene(eventId)) return false;
    this.container = container;
    container.innerHTML = '';

    const started = this.cutscene.start(eventId);
    if (!started) return false;

    this.renderCurrentStep();
    return true;
  }

  private renderCurrentStep(): void {
    if (!this.container) return;
    const state = this.cutscene.getState();
    if (!state) { this.finish(); return; }

    this.container.innerHTML = '';

    const screen = h('div', { className: 'cutscene-screen' });

    // Background
    const imgPath = this.cutscene.getCurrentImagePath();
    if (imgPath) {
      const bg = h('div', { className: 'cutscene-bg' });
      bg.style.backgroundImage = `url('${assetUrl(imgPath)}')`;
      screen.appendChild(bg);
    }

    // Skip button
    const skipBtn = h('button', { className: 'btn btn-sm cutscene-skip' }, '건너뛰기');
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cutscene.skip();
      this.finish();
    });
    screen.appendChild(skipBtn);

    // Dialog area
    const content = h('div', { className: 'cutscene-content' });
    const dialog = h('div', { className: 'cutscene-dialog' });

    // Character portrait
    const charPath = this.cutscene.getCurrentCharacterPath();
    if (charPath) {
      const portrait = h('div', { className: 'cutscene-portrait' });
      const img = h('img') as HTMLImageElement;
      img.src = assetUrl(charPath);
      img.alt = '';
      img.onerror = () => {
        portrait.style.cssText += 'background:#4a4e69;display:flex;align-items:center;justify-content:center;';
        portrait.innerHTML = '<span style="color:#f5f0e8;font-size:20px;">?</span>';
      };
      portrait.appendChild(img);
      dialog.appendChild(portrait);
    }

    // Text
    this.textEl = h('div', { className: 'cutscene-text' });
    dialog.appendChild(this.textEl);
    content.appendChild(dialog);
    screen.appendChild(content);

    // Hint
    screen.appendChild(h('div', { className: 'cutscene-hint' }, '클릭하여 계속'));

    // Click to advance
    screen.addEventListener('click', () => this.advance());

    this.container.appendChild(screen);

    // Type the text
    const text = this.cutscene.getCurrentText();
    typeText(this.textEl, text, 25);
  }

  private advance(): void {
    const wasTyping = this.cutscene.getState()?.isTyping ?? false;
    const hasNext = this.cutscene.advance();
    if (!hasNext) {
      this.finish();
    } else if (wasTyping && this.textEl) {
      // 타이핑 중 클릭 → 텍스트 즉시 완성 (재렌더 없음)
      this.textEl.textContent = this.cutscene.getCurrentText();
    } else {
      // 다음 스텝으로 진행
      this.renderCurrentStep();
    }
  }

  private finish(): void {
    this.onComplete?.();
  }

  isActive(): boolean {
    return this.cutscene.isActive();
  }
}
