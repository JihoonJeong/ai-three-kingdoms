import { h, assetUrl, createImg } from '../renderer.js';
import { t } from '../../../core/i18n/index.js';
import { getCharacterAssetPath } from '../../../core/ui/types.js';
import type { GameState, General, FactionId, Grade } from '../../../core/data/types.js';

const FACTION_COLORS: Record<string, string> = {
  '유비': '#2d6a4f',
  '조조': '#1b1b3a',
  '손권': '#c9184a',
};

const FACTION_BADGE: Record<string, string> = {
  '유비': 'badge-liu',
  '조조': 'badge-cao',
  '손권': 'badge-sun',
};

function abilityCell(label: string, grade: Grade): HTMLElement {
  const cell = h('div');
  cell.style.cssText = 'text-align:center;';
  cell.innerHTML = `<div style="font-size:11px;color:var(--color-charcoal)">${label}</div>`;
  cell.appendChild(h('span', { className: `grade grade-${grade}` }, grade));
  return cell;
}

export class GeneralScreen {
  private container: HTMLElement | null = null;
  private filterFaction: FactionId | 'all' = 'all';

  render(container: HTMLElement, state: GameState): void {
    this.container = container;
    container.innerHTML = '';

    // Filter bar
    const filterBar = h('div');
    filterBar.style.cssText = 'display:flex;gap:var(--space-sm);padding:var(--space-md);border-bottom:1px solid rgba(0,0,0,0.1);';

    for (const [value, label] of [['all', '전체'], ['유비', '유비군'], ['조조', '조조군'], ['손권', '손권군']] as [string, string][]) {
      const btn = h('button', {
        className: `btn btn-sm ${this.filterFaction === value ? 'btn-primary' : ''}`,
      }, t(label));
      btn.addEventListener('click', () => {
        this.filterFaction = value as FactionId | 'all';
        this.render(container, state);
      });
      filterBar.appendChild(btn);
    }
    container.appendChild(filterBar);

    // General cards
    const grid = h('div', { className: 'card-grid' });
    const generals = this.filterFaction === 'all'
      ? state.generals
      : state.generals.filter(g => g.faction === this.filterFaction);

    for (const gen of generals) {
      grid.appendChild(this.renderGeneralCard(gen, state));
    }
    container.appendChild(grid);
  }

  private renderGeneralCard(gen: General, state: GameState): HTMLElement {
    const card = h('div', { className: 'card' });
    const fColor = FACTION_COLORS[gen.faction] ?? '#6c757d';

    // Portrait
    const portraitWrap = h('div');
    portraitWrap.style.cssText = `width:100%;height:120px;overflow:hidden;margin-bottom:var(--space-sm);`;
    const img = h('img') as HTMLImageElement;
    img.src = assetUrl(getCharacterAssetPath(gen.id, 'default'));
    img.alt = gen.name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.onerror = () => {
      portraitWrap.innerHTML = '';
      const fallback = h('div');
      fallback.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${fColor};color:#f5f0e8;font-size:24px;font-weight:900;`;
      fallback.textContent = gen.name[0];
      portraitWrap.appendChild(fallback);
    };
    portraitWrap.appendChild(img);
    card.appendChild(portraitWrap);

    // Name + faction
    const nameRow = h('div');
    nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xs);';
    nameRow.append(
      h('strong', {}, `${t(gen.name)}`),
      h('span', { className: `badge ${FACTION_BADGE[gen.faction] ?? ''}` }, t(gen.faction)),
    );
    card.appendChild(nameRow);

    // Role + condition
    const metaRow = h('div');
    metaRow.style.cssText = 'font-size:12px;color:var(--color-charcoal);margin-bottom:var(--space-sm);';
    metaRow.textContent = `${t(gen.role)} · ${t(gen.courtesyName)} · ${t(gen.condition)}`;
    card.appendChild(metaRow);

    // Abilities
    const abilGrid = h('div');
    abilGrid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:2px;margin-bottom:var(--space-sm);';
    abilGrid.append(
      abilityCell(t('통솔'), gen.abilities.command),
      abilityCell(t('무력'), gen.abilities.martial),
      abilityCell(t('지력'), gen.abilities.intellect),
      abilityCell(t('정치'), gen.abilities.politics),
      abilityCell(t('매력'), gen.abilities.charisma),
    );
    card.appendChild(abilGrid);

    // Skills
    if (gen.skills.length > 0) {
      const skillRow = h('div');
      skillRow.style.cssText = 'font-size:11px;color:var(--color-charcoal);';
      skillRow.textContent = gen.skills.map(s => t(s)).join(', ');
      card.appendChild(skillRow);
    }

    // Location
    const loc = state.cities.find(c => c.id === gen.location);
    if (loc) {
      const locRow = h('div');
      locRow.style.cssText = 'font-size:11px;margin-top:var(--space-xs);color:var(--color-info);';
      locRow.textContent = `${t('주둔:')} ${t(loc.name)}`;
      card.appendChild(locRow);
    }

    return card;
  }

  update(state: GameState): void {
    if (this.container) this.render(this.container, state);
  }
}
