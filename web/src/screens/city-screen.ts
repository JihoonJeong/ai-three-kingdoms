import { h, createGauge } from '../renderer.js';
import { t } from '../../../core/i18n/index.js';
import type { GameState, City, General, Grade } from '../../../core/data/types.js';

function gradeEl(grade: Grade): HTMLElement {
  return h('span', { className: `grade grade-${grade}` }, grade);
}

function factionClass(owner: string | null): string {
  if (owner === '유비') return 'faction-liu';
  if (owner === '조조') return 'faction-cao';
  if (owner === '손권') return 'faction-sun';
  return '';
}

export class CityScreen {
  private container: HTMLElement | null = null;
  private selectedCityId: string | null = null;
  private playerFaction = '유비';
  private onAction: ((action: { type: string; action: string; params: Record<string, unknown> }) => void) | null = null;

  setPlayerFaction(f: string): void { this.playerFaction = f; }
  selectCity(id: string): void { this.selectedCityId = id; }
  onExecuteAction(cb: (action: { type: string; action: string; params: Record<string, unknown> }) => void): void {
    this.onAction = cb;
  }

  render(container: HTMLElement, state: GameState): void {
    this.container = container;
    container.innerHTML = '';

    if (!this.selectedCityId) {
      this.selectedCityId = state.cities.find(c => c.owner === this.playerFaction)?.id ?? state.cities[0]?.id ?? null;
    }

    const layout = h('div', { className: 'sidebar-layout' });

    // Sidebar: city list
    const sidebar = h('div');
    sidebar.style.cssText = 'background:rgba(0,0,0,0.03);border-right:1px solid rgba(0,0,0,0.1);overflow-y:auto;';

    for (const city of state.cities) {
      const item = h('div', {
        className: `list-item ${factionClass(city.owner)} ${city.id === this.selectedCityId ? 'active' : ''}`,
      });
      item.innerHTML = `<div style="font-weight:700">${t(city.name)}</div>
        <div style="font-size:12px;color:var(--color-charcoal)">${city.owner ? t(city.owner) : t('공백지')} · ${t(city.population)}</div>`;
      item.addEventListener('click', () => {
        this.selectedCityId = city.id;
        this.render(container, state);
      });
      sidebar.appendChild(item);
    }

    // Detail panel
    const detail = h('div');
    detail.style.cssText = 'padding:var(--space-md);overflow-y:auto;';

    const city = state.cities.find(c => c.id === this.selectedCityId);
    if (city) {
      detail.appendChild(this.renderCityDetail(city, state));
    }

    layout.append(sidebar, detail);
    container.appendChild(layout);
  }

  private renderCityDetail(city: City, state: GameState): HTMLElement {
    const wrap = h('div');

    // City header
    const header = h('div', { className: 'panel-header' }, `${t(city.name)} (${t(city.population)})`);
    const ownerBadge = h('span', {
      className: `badge badge-${city.owner === '유비' ? 'liu' : city.owner === '조조' ? 'cao' : 'sun'}`,
    }, city.owner ? t(city.owner) : t('공백'));
    header.append(' ', ownerBadge);
    wrap.appendChild(header);

    // Description (정적 설명 + 현재 소유자 동적 표시)
    const desc = h('p');
    desc.style.cssText = 'font-size:13px;color:var(--color-charcoal);margin:var(--space-sm) 0;';
    const ownerNote = city.owner
      ? ` ${t('현재')} ${t(city.owner)}${t('이/가 장악')}.`
      : ` ${t('주인 없는 땅')}.`;
    desc.textContent = t(city.description) + ownerNote;
    wrap.appendChild(desc);

    // Development
    const devPanel = h('div', { className: 'panel' });
    devPanel.innerHTML = `<div class="panel-header">${t('개발 수준')}</div>`;
    const devGrid = h('div', { className: 'grid-3' });
    for (const [key, label] of [['agriculture', '농업'], ['commerce', '상업'], ['defense', '방어']] as const) {
      const item = h('div', { className: 'stat-row' });
      item.append(h('span', { className: 'stat-label' }, t(label) + ' '), gradeEl(city.development[key]));
      devGrid.appendChild(item);
    }
    devPanel.appendChild(devGrid);
    wrap.appendChild(devPanel);

    // Troops
    const troopPanel = h('div', { className: 'panel' });
    troopPanel.innerHTML = `<div class="panel-header">${t('병력')}</div>`;
    const totalTroops = city.troops.infantry + city.troops.cavalry + city.troops.navy;
    for (const [key, label, color] of [
      ['infantry', '보병', '#4a4e69'],
      ['cavalry', '기병', '#6a4c93'],
      ['navy', '수군', '#1982c4'],
    ] as const) {
      troopPanel.appendChild(createGauge(city.troops[key], Math.max(totalTroops, 1), color, `${t(label)}: ${city.troops[key].toLocaleString()}`));
    }
    wrap.appendChild(troopPanel);

    // Resources
    const resPanel = h('div', { className: 'panel' });
    resPanel.innerHTML = `<div class="panel-header">${t('자원 · 상태')}</div>`;
    resPanel.appendChild(createGauge(city.food, 30000, '#e9c46a', `${t('식량')}: ${city.food.toLocaleString()}`));
    resPanel.appendChild(createGauge(city.morale, 100, '#2d6a4f', `${t('사기')}: ${city.morale}`));
    resPanel.appendChild(createGauge(city.training, 100, '#0077b6', `${t('훈련')}: ${city.training}`));
    wrap.appendChild(resPanel);

    // Generals in this city
    const generalsHere = state.generals.filter(g => g.location === city.id);
    if (generalsHere.length > 0) {
      const genPanel = h('div', { className: 'panel' });
      genPanel.innerHTML = `<div class="panel-header">${t('주둔 장수')}</div>`;
      for (const gen of generalsHere) {
        const row = h('div', { className: 'stat-row' });
        row.innerHTML = `<span>${t(gen.name)} (${t(gen.courtesyName)})</span>
          <span style="font-size:12px">${t(gen.role)} · ${t('통')}${gen.abilities.command} ${t('무')}${gen.abilities.martial} ${t('지')}${gen.abilities.intellect}</span>`;
        genPanel.appendChild(row);
      }
      wrap.appendChild(genPanel);
    }

    // Actions (only for player cities)
    if (city.owner === this.playerFaction) {
      const actPanel = h('div', { className: 'panel' });
      actPanel.innerHTML = `<div class="panel-header">${t('내정 행동')}</div>`;
      const btnRow = h('div');
      btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-sm);';

      const actions = [
        { label: t('징병 (소)'), action: 'conscript', params: { city: city.id, scale: 'small' } },
        { label: t('징병 (중)'), action: 'conscript', params: { city: city.id, scale: 'medium' } },
        { label: t('농업 개발'), action: 'develop', params: { city: city.id, focus: 'agriculture' } },
        { label: t('상업 개발'), action: 'develop', params: { city: city.id, focus: 'commerce' } },
        { label: t('방어 강화'), action: 'develop', params: { city: city.id, focus: 'defense' } },
        { label: t('훈련'), action: 'train', params: { city: city.id } },
      ];

      for (const act of actions) {
        const btn = h('button', { className: 'btn btn-sm' }, act.label);
        btn.addEventListener('click', () => {
          this.onAction?.({ type: 'domestic', action: act.action, params: act.params });
        });
        btnRow.appendChild(btn);
      }
      actPanel.appendChild(btnRow);
      wrap.appendChild(actPanel);
    }

    return wrap;
  }

  update(state: GameState): void {
    if (this.container) this.render(this.container, state);
  }
}
