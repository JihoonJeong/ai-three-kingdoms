import { h, createGauge } from '../renderer.js';
import { getRelationLevel } from '../../../core/data/types.js';
import type { GameState, FactionId, DiplomacyRelation } from '../../../core/data/types.js';

const FACTION_INFO: Record<string, { name: string; color: string; badgeClass: string }> = {
  '유비': { name: '유비군 (촉)', color: '#2d6a4f', badgeClass: 'badge-liu' },
  '조조': { name: '조조군 (위)', color: '#1b1b3a', badgeClass: 'badge-cao' },
  '손권': { name: '손권군 (오)', color: '#c9184a', badgeClass: 'badge-sun' },
};

export class DiplomacyScreen {
  private container: HTMLElement | null = null;
  private playerFaction = '유비';
  private onAction: ((action: { type: string; action: string; params: Record<string, unknown> }) => void) | null = null;

  setPlayerFaction(f: string): void { this.playerFaction = f; }
  onExecuteAction(cb: (action: { type: string; action: string; params: Record<string, unknown> }) => void): void {
    this.onAction = cb;
  }

  render(container: HTMLElement, state: GameState): void {
    this.container = container;
    container.innerHTML = '';

    const wrap = h('div');
    wrap.style.padding = 'var(--space-md)';

    wrap.appendChild(h('div', { className: 'panel-header' }, '외교 관계'));

    // Relation cards for other factions
    const otherFactions = state.factions.filter(f => f.id !== this.playerFaction);
    const grid = h('div', { className: 'grid-2' });

    for (const faction of otherFactions) {
      const rel = this.findRelation(state.diplomacy.relations, this.playerFaction as FactionId, faction.id);
      grid.appendChild(this.renderFactionCard(faction.id, rel, state));
    }

    wrap.appendChild(grid);

    // Diplomacy between all factions
    const allPanel = h('div', { className: 'panel' });
    allPanel.style.marginTop = 'var(--space-md)';
    allPanel.innerHTML = '<div class="panel-header">전체 세력 관계</div>';

    for (const rel of state.diplomacy.relations) {
      const row = h('div', { className: 'stat-row' });
      const infoA = FACTION_INFO[rel.factionA];
      const infoB = FACTION_INFO[rel.factionB];
      row.innerHTML = `
        <span><span class="badge ${infoA?.badgeClass ?? ''}">${rel.factionA}</span>
        ↔ <span class="badge ${infoB?.badgeClass ?? ''}">${rel.factionB}</span></span>
        <span>${rel.relation} (${rel.value}) ${rel.isAlliance ? '⚔ 동맹' : ''}</span>`;
      allPanel.appendChild(row);
    }
    wrap.appendChild(allPanel);

    container.appendChild(wrap);
  }

  private findRelation(rels: DiplomacyRelation[], a: FactionId, b: FactionId): DiplomacyRelation | null {
    return rels.find(r =>
      (r.factionA === a && r.factionB === b) || (r.factionA === b && r.factionB === a),
    ) ?? null;
  }

  private renderFactionCard(factionId: FactionId, rel: DiplomacyRelation | null, state: GameState): HTMLElement {
    const card = h('div', { className: 'panel' });
    const info = FACTION_INFO[factionId];

    const header = h('div', { className: 'panel-header' });
    header.append(
      h('span', { className: `badge ${info?.badgeClass ?? ''}` }, info?.name ?? factionId),
    );
    if (rel?.isAlliance) {
      header.append(' ', h('span', { className: 'badge badge-liu' }, '동맹'));
    }
    card.appendChild(header);

    // Relation gauge
    const value = rel?.value ?? 50;
    const level = rel?.relation ?? getRelationLevel(value);
    const gaugeColor = value >= 61 ? '#2d6a4f' : value >= 41 ? '#d4a017' : '#d00000';
    card.appendChild(createGauge(value, 100, gaugeColor, `${level}: ${value}/100`));

    // Faction leader
    const leader = state.generals.find(g => g.id === state.factions.find(f => f.id === factionId)?.leader);
    if (leader) {
      const leaderRow = h('div');
      leaderRow.style.cssText = 'font-size:13px;margin-top:var(--space-sm);';
      leaderRow.textContent = `군주: ${leader.name} (${leader.courtesyName})`;
      card.appendChild(leaderRow);
    }

    // Faction cities
    const fCities = state.cities.filter(c => c.owner === factionId);
    const cityRow = h('div');
    cityRow.style.cssText = 'font-size:12px;color:var(--color-charcoal);margin-top:var(--space-xs);';
    cityRow.textContent = `도시: ${fCities.map(c => c.name).join(', ') || '없음'}`;
    card.appendChild(cityRow);

    // Diplomacy events
    if (rel && rel.events.length > 0) {
      const evtRow = h('div');
      evtRow.style.cssText = 'font-size:11px;color:var(--color-charcoal);margin-top:var(--space-sm);';
      evtRow.textContent = '최근: ' + rel.events.slice(-2).join(' / ');
      card.appendChild(evtRow);
    }

    // Diplomacy actions
    const actRow = h('div');
    actRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-top:var(--space-sm);';

    const actions = [
      { label: '사신 파견', action: 'send_envoy', params: { target: factionId, purpose: '우호 증진' } },
      { label: '선물', action: 'gift', params: { target: factionId, amount: 1000 } },
      { label: '위협', action: 'threaten', params: { target: factionId } },
    ];

    for (const act of actions) {
      const btn = h('button', { className: 'btn btn-sm' }, act.label);
      btn.addEventListener('click', () => {
        this.onAction?.({ type: 'diplomacy', action: act.action, params: act.params });
      });
      actRow.appendChild(btn);
    }
    card.appendChild(actRow);

    return card;
  }

  update(state: GameState): void {
    if (this.container) this.render(this.container, state);
  }
}
