import { h } from '../renderer.js';
import type { GameState } from '../../../core/data/types.js';

export class LogScreen {
  private container: HTMLElement | null = null;
  private eventLog: Array<{ turn: number; text: string; type: 'action' | 'event' | 'battle' | 'system' }> = [];

  addEntry(turn: number, text: string, type: 'action' | 'event' | 'battle' | 'system' = 'system'): void {
    this.eventLog.push({ turn, text, type });
  }

  getEntries(): Array<{ turn: number; text: string; type: string }> {
    return [...this.eventLog];
  }

  render(container: HTMLElement, state: GameState): void {
    this.container = container;
    container.innerHTML = '';

    const wrap = h('div');
    wrap.style.padding = 'var(--space-md)';

    wrap.appendChild(h('div', { className: 'panel-header' }, '행동 · 이벤트 기록'));

    // Action log from game state
    const panel = h('div', { className: 'panel' });
    panel.style.maxHeight = '70vh';
    panel.style.overflowY = 'auto';

    // Merge game log + our event log
    const allEntries: Array<{ turn: number; text: string; type: string }> = [];

    for (const entry of state.actionLog) {
      const actionDesc = `[행동] ${entry.action.type}/${(entry.action as Record<string, unknown>).action} → ${entry.result.description}`;
      allEntries.push({ turn: entry.turn, text: actionDesc, type: 'action' });
    }

    for (const entry of this.eventLog) {
      allEntries.push(entry);
    }

    // Sort by turn descending
    allEntries.sort((a, b) => b.turn - a.turn);

    if (allEntries.length === 0) {
      panel.appendChild(h('div', { className: 'stat-row' }, '아직 기록이 없습니다.'));
    }

    let lastTurn = -1;
    for (const entry of allEntries) {
      if (entry.turn !== lastTurn) {
        const divider = h('div', { className: 'ink-divider' });
        const turnLabel = h('div');
        turnLabel.style.cssText = 'font-size:12px;font-weight:700;color:var(--color-gold);padding:var(--space-xs) 0;';
        turnLabel.textContent = `── 턴 ${entry.turn} ──`;
        panel.append(divider, turnLabel);
        lastTurn = entry.turn;
      }

      const row = h('div');
      row.style.cssText = 'font-size:13px;padding:2px 0;';

      const colorMap: Record<string, string> = {
        action: 'var(--color-info)',
        event: 'var(--color-warn)',
        battle: 'var(--color-cinnabar)',
        system: 'var(--color-charcoal)',
      };
      row.style.color = colorMap[entry.type] ?? 'inherit';
      row.textContent = entry.text;
      panel.appendChild(row);
    }

    wrap.appendChild(panel);
    container.appendChild(wrap);
  }

  update(state: GameState): void {
    if (this.container) this.render(this.container, state);
  }
}
