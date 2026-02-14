import { h, assetUrl, createGauge } from '../renderer.js';
import { BattleView } from '../../../core/ui/battle-view.js';
import { getCharacterAssetPath, getBattleBgPath } from '../../../core/ui/types.js';
import type { GameState, BattleState, General } from '../../../core/data/types.js';

export class BattleScreen {
  private container: HTMLElement | null = null;
  private battleView: BattleView | null = null;
  private selectedTacticId: string | null = null;
  private onTacticExecute: ((tacticId: string) => void) | null = null;
  private onRetreat: (() => void) | null = null;

  onExecuteTactic(cb: (tacticId: string) => void): void { this.onTacticExecute = cb; }
  onRetreatClick(cb: () => void): void { this.onRetreat = cb; }

  render(container: HTMLElement, battle: BattleState, generals: General[]): void {
    this.container = container;
    container.innerHTML = '';
    this.battleView = new BattleView(battle);
    this.selectedTacticId = null;

    const bgPath = assetUrl(getBattleBgPath(battle.terrain));

    const screen = h('div', { className: 'battle-screen' });
    screen.style.backgroundImage = `url('${bgPath}')`;

    // Fire effect overlay
    const fireOverlay = h('div', { className: 'fx-fire' });
    screen.appendChild(fireOverlay);

    // Header
    const header = h('div', { className: 'battle-header' });
    const bf = h('div', { className: 'battle-title' }, `전투: ${battle.location}`);
    const info = h('div', { className: 'battle-info' });
    info.append(
      h('span', {}, `지형: ${battle.terrain}`),
      h('span', {}, `날씨: ${battle.weather}`),
      h('span', {}, `턴: ${battle.battleTurn}/${battle.maxBattleTurns}`),
    );
    header.append(bf, info);
    screen.appendChild(header);

    // Main battle area
    const main = h('div', { className: 'battle-main' });

    // Attacker side
    main.appendChild(this.renderSide('공격측', battle.attackers.faction, battle.attackers, generals));

    // Center
    const center = h('div', { className: 'battle-center' });
    center.appendChild(h('div', { className: 'battle-vs' }, 'VS'));
    const weather = h('div', { className: 'battle-weather' });
    weather.textContent = `${battle.weather} · ${battle.terrain}`;
    center.appendChild(weather);
    main.appendChild(center);

    // Defender side
    main.appendChild(this.renderSide('방어측', battle.defenders.faction, battle.defenders, generals));

    screen.appendChild(main);

    // Tactic cards
    const tacticBar = h('div', { className: 'tactic-cards' });
    const viewState = this.battleView.getState();
    const cards = this.battleView.getTacticCards();

    for (const card of cards) {
      const el = h('div', { className: 'tactic-card' });
      el.addEventListener('click', () => {
        this.selectedTacticId = card.tactic.id;
        // Re-render tactic selection UI
        for (const c of tacticBar.children) {
          (c as HTMLElement).classList.toggle('selected', (c as HTMLElement).dataset.tacticId === card.tactic.id);
        }
      });
      el.dataset.tacticId = card.tactic.id;

      const imgWrap = h('div', { className: 'tactic-card-img' });
      const img = h('img') as HTMLImageElement;
      img.src = assetUrl(card.assetPath);
      img.alt = card.tactic.name;
      img.onerror = () => {
        imgWrap.innerHTML = '';
        const fb = h('div');
        fb.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#4a4e69;color:#f5f0e8;font-size:20px;';
        fb.textContent = card.tactic.name[0];
        imgWrap.appendChild(fb);
      };
      imgWrap.appendChild(img);
      el.appendChild(imgWrap);

      el.appendChild(h('div', { className: 'tactic-card-name' }, card.tactic.name));

      const riskClass = card.tactic.risk === '낮음' ? 'low' : card.tactic.risk === '보통' ? 'mid' : 'high';
      el.appendChild(h('div', { className: `tactic-card-risk ${riskClass}` }, `위험: ${card.tactic.risk}`));

      if (card.tactic.description) {
        el.appendChild(h('div', { className: 'tactic-card-desc' }, card.tactic.description));
      }

      tacticBar.appendChild(el);
    }
    screen.appendChild(tacticBar);

    // Footer
    const footer = h('div', { className: 'battle-footer' });

    const log = h('div', { className: 'battle-log' });
    for (const entry of battle.log) {
      const logEl = h('div', { className: 'battle-log-entry' });
      logEl.textContent = `[턴${entry.battleTurn}] ${entry.description}`;
      log.appendChild(logEl);
    }
    footer.appendChild(log);

    const execBtn = h('button', { className: 'btn btn-primary' }, '전술 실행');
    execBtn.addEventListener('click', () => {
      if (this.selectedTacticId) {
        this.onTacticExecute?.(this.selectedTacticId);
      }
    });
    footer.appendChild(execBtn);

    screen.appendChild(footer);
    container.appendChild(screen);
  }

  private renderSide(
    label: string,
    faction: string,
    force: BattleState['attackers'],
    generals: General[],
  ): HTMLElement {
    const side = h('div', { className: 'battle-side' });
    side.appendChild(h('div', { className: 'battle-side-label' }, `${label} (${faction})`));

    // Portraits
    const portraits = h('div', { className: 'battle-portraits' });
    for (const genId of force.generals) {
      const gen = generals.find(g => g.id === genId);
      const wrap = h('div', { className: 'battle-portrait' });
      const img = h('img') as HTMLImageElement;
      img.src = assetUrl(getCharacterAssetPath(genId, 'default'));
      img.alt = gen?.name ?? genId;
      img.onerror = () => {
        wrap.innerHTML = '';
        const fb = h('div');
        const fColor = faction === '유비' ? '#2d6a4f' : faction === '조조' ? '#1b1b3a' : '#c9184a';
        fb.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${fColor};color:#f5f0e8;font-size:16px;font-weight:700;`;
        fb.textContent = gen?.name ?? genId;
        wrap.appendChild(fb);
      };
      wrap.appendChild(img);
      portraits.appendChild(wrap);
    }
    side.appendChild(portraits);

    // Stats
    const stats = h('div', { className: 'battle-stats' });

    // Troops gauge
    const troopPct = force.initialTroops > 0
      ? Math.round((force.troops / force.initialTroops) * 100)
      : 0;
    const troopRow = h('div', { className: 'battle-stat-row' });
    troopRow.appendChild(h('span', { className: 'battle-stat-label' }, '병력'));
    const troopBar = h('div', { className: 'battle-stat-bar' });
    troopBar.appendChild(createGauge(
      force.troops, force.initialTroops,
      troopPct > 50 ? '#2d6a4f' : troopPct > 25 ? '#e85d04' : '#d00000',
      `${force.troops.toLocaleString()} (${troopPct}%)`,
    ));
    troopRow.appendChild(troopBar);
    stats.appendChild(troopRow);

    // Morale gauge
    const moraleRow = h('div', { className: 'battle-stat-row' });
    moraleRow.appendChild(h('span', { className: 'battle-stat-label' }, '사기'));
    const moraleBar = h('div', { className: 'battle-stat-bar' });
    moraleBar.appendChild(createGauge(
      force.morale, 100,
      force.morale > 50 ? '#0077b6' : force.morale > 25 ? '#e85d04' : '#d00000',
      `${force.morale}`,
    ));
    moraleRow.appendChild(moraleBar);
    stats.appendChild(moraleRow);

    // Formation
    if (force.formation) {
      const formRow = h('div');
      formRow.style.cssText = 'font-size:11px;color:var(--color-hanji);text-align:center;margin-top:var(--space-xs);';
      formRow.textContent = `진형: ${force.formation}`;
      stats.appendChild(formRow);
    }

    side.appendChild(stats);
    return side;
  }

  showResult(battle: BattleState, playerFaction: string): void {
    if (!this.container) return;
    const screen = this.container.querySelector('.battle-screen');
    if (!screen) return;

    const overlay = h('div', { className: 'battle-result' });
    const won = battle.result?.winner === playerFaction;
    const text = h('div', {
      className: `battle-result-text ${won ? 'battle-result-win' : 'battle-result-lose'}`,
    }, won ? '승리!' : '패배...');
    overlay.appendChild(text);

    const closeBtn = h('button', { className: 'btn' }, '확인');
    closeBtn.style.marginTop = 'var(--space-lg)';
    closeBtn.addEventListener('click', () => this.onRetreat?.());
    overlay.appendChild(closeBtn);

    screen.appendChild(overlay);
  }

  update(battle: BattleState, generals: General[]): void {
    if (this.container) {
      this.render(this.container, battle, generals);
    }
  }
}
