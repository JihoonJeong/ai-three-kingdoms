import { h, assetUrl, typeText } from '../renderer.js';
import { getCharacterAssetPath } from '../../../core/ui/types.js';
import { resolveExpression } from '../../../core/ui/character-display.js';
import type { GameState } from '../../../core/data/types.js';
import { t } from '../../../core/i18n/index.js';

const BRIEFINGS: Record<string, string[]> = {
  preparation: [
    '주공, 아직 준비 시간이 있습니다. 내정을 강화하고 손권과의 동맹을 공고히 하십시오.',
    '조조의 대군이 다가오고 있습니다. 병력을 모으고 식량을 비축하십시오.',
    '적벽에서의 결전이 다가옵니다. 수군 훈련이 핵심입니다.',
  ],
  battle: [
    '전투가 임박했습니다. 화공의 기회를 놓치지 마십시오!',
    '바람의 방향을 살피십시오. 동남풍이 불 때가 최적의 기회입니다.',
  ],
  aftermath: [
    '승리 후에도 방심은 금물입니다. 형주의 안정이 우선입니다.',
  ],
};
// Note: BRIEFINGS values are used as t() keys at display time below

export class AdvisorPanel {
  private visible = false;

  show(container: HTMLElement, state: GameState): void {
    if (this.visible) return;
    this.visible = true;

    // Pick briefing
    const phase = state.phase ?? 'preparation';
    const pool = BRIEFINGS[phase] ?? BRIEFINGS.preparation;
    const text = t(pool[Math.floor(Math.random() * pool.length)]);

    // Determine expression
    const expression = resolveExpression('zhugeliang', {
      type: 'turn_start',
      severity: state.turn > 10 ? 'high' : 'low',
    });

    const panel = h('div', { className: 'advisor-panel' });

    // Portrait
    const portrait = h('div', { className: 'advisor-portrait' });
    const img = h('img') as HTMLImageElement;
    img.src = assetUrl(getCharacterAssetPath('zhugeliang', expression));
    img.alt = t('제갈량');
    img.onerror = () => {
      portrait.style.cssText += 'background:#2d6a4f;display:flex;align-items:center;justify-content:center;';
      portrait.innerHTML = `<span style="color:#f5f0e8;font-weight:700;">${t('공명')}</span>`;
    };
    portrait.appendChild(img);

    // Body
    const body = h('div', { className: 'advisor-body' });
    body.appendChild(h('div', { className: 'advisor-name' }, t('제갈량 (공명)')));
    const textEl = h('div', { className: 'advisor-text' });
    body.appendChild(textEl);

    // Close button
    const closeBtn = h('button', { className: 'btn btn-sm advisor-close' }, '✕');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.remove();
      this.visible = false;
    });

    panel.append(portrait, body, closeBtn);

    // Click panel to dismiss
    panel.addEventListener('click', () => {
      panel.remove();
      this.visible = false;
    });

    container.appendChild(panel);

    // Type text
    typeText(textEl, text, 30);

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (this.visible) {
        panel.remove();
        this.visible = false;
      }
    }, 8000);
  }

  isVisible(): boolean { return this.visible; }
}
