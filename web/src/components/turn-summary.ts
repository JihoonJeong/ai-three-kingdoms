import { h } from '../renderer.js';
import { t } from '../../../core/i18n/index.js';
import type { GameState, TurnEndResult, City } from '../../../core/data/types.js';

interface CitySnapshot {
  id: string;
  name: string;
  owner: string | null;
  food: number;
  troops: number;
  morale: number;
  training: number;
}

function snapshotCities(state: GameState): CitySnapshot[] {
  return state.cities.map(c => ({
    id: c.id,
    name: c.name,
    owner: c.owner,
    food: c.food,
    troops: c.troops.infantry + c.troops.cavalry + c.troops.navy,
    morale: c.morale,
    training: c.training,
  }));
}

function diffLabel(before: number, after: number): string {
  const d = after - before;
  if (d === 0) return '';
  return d > 0 ? `+${d.toLocaleString()}` : d.toLocaleString();
}

function diffColor(before: number, after: number): string {
  if (after > before) return 'var(--color-success)';
  if (after < before) return 'var(--color-fail)';
  return 'var(--color-charcoal)';
}

export class TurnSummary {
  private beforeSnapshot: CitySnapshot[] = [];
  private onDismissCb: (() => void) | null = null;

  onDismiss(cb: () => void): void { this.onDismissCb = cb; }

  /** 턴 종료 전에 호출 — 현재 상태 스냅샷 저장 */
  captureBeforeState(state: GameState): void {
    this.beforeSnapshot = snapshotCities(state);
  }

  /** 턴 종료 후에 호출 — 비교 화면 표시 */
  show(afterState: GameState, turnResult: TurnEndResult, completedTurn: number): void {
    const afterSnapshot = snapshotCities(afterState);

    const backdrop = h('div', { className: 'modal-backdrop' });
    backdrop.style.zIndex = '250';

    const modal = h('div', { className: 'modal turn-summary' });
    modal.style.cssText = 'max-width:600px;width:90%;max-height:80vh;overflow-y:auto;';

    // ─── Title ───
    const title = h('div', { className: 'turn-summary-title' });
    title.innerHTML = `<span class="turn-number">${t('턴')} ${completedTurn}</span> ${t('종료 보고')}`;
    modal.appendChild(title);

    // ─── Events ───
    if (turnResult.events.length > 0) {
      const evtSection = this.createSection(t('발생한 사건'), 'var(--color-warn)');
      for (const evt of turnResult.events) {
        const row = h('div', { className: 'turn-summary-event' });
        row.innerHTML = `<strong>${evt.eventId}</strong>: ${t(evt.description)}`;
        if (evt.appliedEffects.length > 0) {
          const fx = h('div', { className: 'turn-summary-effects' });
          fx.textContent = evt.appliedEffects.map(e => t(e)).join(' / ');
          row.appendChild(fx);
        }
        evtSection.appendChild(row);
      }
      modal.appendChild(evtSection);
    }

    // ─── Player City Changes ───
    const playerCities = afterSnapshot.filter(c => c.owner === '유비');
    if (playerCities.length > 0) {
      const citySection = this.createSection(t('아군 도시 변동'), 'var(--color-liu)');
      for (const after of playerCities) {
        const before = this.beforeSnapshot.find(b => b.id === after.id);
        if (!before) continue;

        const row = h('div', { className: 'turn-summary-city' });
        const header = h('div', { className: 'turn-summary-city-name' }, t(after.name));
        row.appendChild(header);

        const stats = h('div', { className: 'turn-summary-stats' });
        stats.appendChild(this.statChip(t('식량'), before.food, after.food));
        stats.appendChild(this.statChip(t('병력'), before.troops, after.troops));
        stats.appendChild(this.statChip(t('사기'), before.morale, after.morale));
        stats.appendChild(this.statChip(t('훈련'), before.training, after.training));
        row.appendChild(stats);
        citySection.appendChild(row);
      }
      modal.appendChild(citySection);
    }

    // ─── Enemy Activity ───
    const enemySection = this.createSection(t('적군 동태'), 'var(--color-cao)');
    const caoCities = afterSnapshot.filter(c => c.owner === '조조');
    let enemyChanges = false;
    for (const after of caoCities) {
      const before = this.beforeSnapshot.find(b => b.id === after.id);
      if (!before) continue;
      if (before.food === after.food && before.training === after.training) continue;
      enemyChanges = true;
      const row = h('div', { className: 'turn-summary-enemy-row' });
      const parts: string[] = [];
      if (after.food !== before.food) parts.push(t('군량 확보 중'));
      if (after.training > before.training) parts.push(`${t('훈련 강화')} (+${after.training - before.training})`);
      row.textContent = `${t(after.name)}: ${parts.join(', ')}`;
      enemySection.appendChild(row);
    }
    if (!enemyChanges) {
      enemySection.appendChild(h('div', { className: 'turn-summary-quiet' }, t('특이 동향 없음')));
    }
    modal.appendChild(enemySection);

    // ─── Alliance Status ───
    const sunCities = afterSnapshot.filter(c => c.owner === '손권');
    if (sunCities.length > 0) {
      const allySection = this.createSection(t('동맹군 (손권)'), 'var(--color-sun)');
      for (const after of sunCities) {
        const before = this.beforeSnapshot.find(b => b.id === after.id);
        if (!before) continue;
        const parts: string[] = [];
        if (after.training > before.training) parts.push(`${t('훈련 강화')} (+${after.training - before.training})`);
        if (parts.length > 0) {
          allySection.appendChild(h('div', {}, `${t(after.name)}: ${parts.join(', ')}`));
        } else {
          allySection.appendChild(h('div', { className: 'turn-summary-quiet' }, `${t(after.name)}: ${t('관망 중')}`));
        }
      }
      modal.appendChild(allySection);
    }

    // ─── State Changes (engine) ───
    if (turnResult.stateChanges.length > 0) {
      const changeSection = this.createSection(t('경고'), 'var(--color-fail)');
      for (const change of turnResult.stateChanges) {
        const row = h('div', { className: 'turn-summary-warning' });
        row.textContent = t(change);
        changeSection.appendChild(row);
      }
      modal.appendChild(changeSection);
    }

    // ─── Next Turn Preview ───
    const preview = h('div', { className: 'turn-summary-preview' });
    preview.textContent = t(turnResult.nextTurnPreview);
    modal.appendChild(preview);

    // ─── Dismiss Button ───
    const footer = h('div', { className: 'turn-summary-footer' });
    const btn = h('button', { className: 'btn btn-primary' }, t('다음 턴 시작'));
    btn.addEventListener('click', () => {
      backdrop.remove();
      this.onDismissCb?.();
    });
    footer.appendChild(btn);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  private createSection(title: string, color: string): HTMLElement {
    const section = h('div', { className: 'turn-summary-section' });
    const header = h('div', { className: 'turn-summary-section-title' });
    header.style.borderLeftColor = color;
    header.textContent = title;
    section.appendChild(header);
    return section;
  }

  private statChip(label: string, before: number, after: number): HTMLElement {
    const chip = h('div', { className: 'turn-summary-chip' });
    const diff = diffLabel(before, after);
    const color = diffColor(before, after);

    chip.innerHTML = `<span class="chip-label">${label}</span>
      <span class="chip-value">${after.toLocaleString()}</span>`;
    if (diff) {
      chip.innerHTML += `<span class="chip-diff" style="color:${color}">${diff}</span>`;
    }
    return chip;
  }
}
