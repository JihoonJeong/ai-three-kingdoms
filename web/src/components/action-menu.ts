import { h } from '../renderer.js';
import type { GameState, GameAction, FactionId } from '../../../core/data/types.js';

type ActionCallback = (action: GameAction) => void;

export class ActionMenu {
  private container: HTMLElement;
  private state: GameState | null = null;
  private playerFaction = '유비';
  private onActionCb: ActionCallback | null = null;
  private onEndTurnCb: (() => void) | null = null;
  private openDropdown: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    // Close dropdowns on outside click
    document.addEventListener('click', () => this.closeAll());
  }

  setPlayerFaction(f: string): void { this.playerFaction = f; }
  onAction(cb: ActionCallback): void { this.onActionCb = cb; }
  onEndTurn(cb: () => void): void { this.onEndTurnCb = cb; }

  update(state: GameState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    const state = this.state;
    if (!state) return;

    const disabled = state.actionsRemaining <= 0 || state.gameOver || state.activeBattle !== null;

    // Domestic dropdown
    this.container.appendChild(this.createDropdown('내정', disabled, [
      { label: '징병 (소규모)', action: () => this.showCityPicker('conscript', 'small') },
      { label: '징병 (중규모)', action: () => this.showCityPicker('conscript', 'medium') },
      { label: '농업 개발', action: () => this.showCityPicker('develop', 'agriculture') },
      { label: '상업 개발', action: () => this.showCityPicker('develop', 'commerce') },
      { label: '방어 강화', action: () => this.showCityPicker('develop', 'defense') },
      { label: '훈련', action: () => this.showCityPicker('train', null) },
    ]));

    // Diplomacy dropdown
    this.container.appendChild(this.createDropdown('외교', disabled, [
      { label: '손권에 사신 파견', action: () => this.execDiplomacy('send_envoy', '손권' as FactionId) },
      { label: '손권에 선물', action: () => this.execDiplomacy('gift', '손권' as FactionId) },
      { label: '조조에 위협', action: () => this.execDiplomacy('threaten', '조조' as FactionId) },
    ]));

    // Military dropdown
    this.container.appendChild(this.createDropdown('군사', disabled, [
      { label: '진군 (적벽으로)', action: () => this.showMarchDialog() },
      { label: '정찰', action: () => this.execMilitary('scout') },
      { label: '방어 강화', action: () => this.showCityPicker('fortify', null) },
    ]));

    // End turn
    const endBtn = h('button', { className: 'btn btn-primary' }, '턴 종료');
    endBtn.disabled = state.activeBattle !== null || state.gameOver;
    endBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEndTurnCb?.();
    });
    this.container.appendChild(endBtn);
  }

  private createDropdown(
    label: string,
    disabled: boolean,
    items: Array<{ label: string; action: () => void }>,
  ): HTMLElement {
    const dd = h('div', { className: 'dropdown' });

    const btn = h('button', { className: 'btn' }, `${label} ▼`);
    btn.disabled = disabled;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAll();
      dd.classList.toggle('open');
      this.openDropdown = dd.classList.contains('open') ? dd : null;
    });

    const menu = h('div', { className: 'dropdown-menu' });
    for (const item of items) {
      const menuItem = h('button', { className: 'dropdown-item' }, item.label);
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeAll();
        item.action();
      });
      menu.appendChild(menuItem);
    }

    dd.append(btn, menu);
    return dd;
  }

  private closeAll(): void {
    this.openDropdown?.classList.remove('open');
    this.openDropdown = null;
  }

  private showCityPicker(actionType: string, param: string | null): void {
    if (!this.state) return;
    const playerCities = this.state.cities.filter(c => c.owner === this.playerFaction);
    if (playerCities.length === 0) return;

    // If only 1 city, use it directly
    if (playerCities.length === 1) {
      this.execDomestic(actionType, playerCities[0].id, param);
      return;
    }

    // Show modal picker
    this.showModal('도시 선택', playerCities.map(c => ({
      label: c.name,
      value: c.id,
    })), (cityId) => {
      this.execDomestic(actionType, cityId, param);
    });
  }

  private execDomestic(actionType: string, cityId: string, param: string | null): void {
    let action: GameAction;

    switch (actionType) {
      case 'conscript':
        action = { type: 'domestic', action: 'conscript', params: { city: cityId, scale: param as 'small' | 'medium' | 'large' } };
        break;
      case 'develop':
        action = { type: 'domestic', action: 'develop', params: { city: cityId, focus: param as 'agriculture' | 'commerce' | 'defense' } };
        break;
      case 'train':
        action = { type: 'domestic', action: 'train', params: { city: cityId } };
        break;
      case 'fortify':
        action = { type: 'military', action: 'fortify', params: { city: cityId } };
        break;
      default:
        return;
    }

    this.onActionCb?.(action);
  }

  private execDiplomacy(actionType: string, target: FactionId): void {
    let action: GameAction;

    switch (actionType) {
      case 'send_envoy':
        action = { type: 'diplomacy', action: 'send_envoy', params: { target, purpose: '우호 증진' } };
        break;
      case 'gift':
        action = { type: 'diplomacy', action: 'gift', params: { target, amount: 1000 } };
        break;
      case 'threaten':
        action = { type: 'diplomacy', action: 'threaten', params: { target } };
        break;
      default:
        return;
    }

    this.onActionCb?.(action);
  }

  private execMilitary(actionType: string): void {
    if (!this.state) return;

    if (actionType === 'scout') {
      // Scout chibi battlefield
      const action: GameAction = { type: 'military', action: 'scout', params: { target: 'chibi' } };
      this.onActionCb?.(action);
    }
  }

  private showMarchDialog(): void {
    if (!this.state) return;
    const playerCities = this.state.cities.filter(c => c.owner === this.playerFaction);

    // Pick source city with generals
    const citiesWithGenerals = playerCities.filter(c =>
      this.state!.generals.some(g => g.faction === this.playerFaction && g.location === c.id),
    );

    if (citiesWithGenerals.length === 0) return;

    // Simplified: pick from city, march to chibi
    const fromCity = citiesWithGenerals[0];
    const generalsInCity = this.state.generals
      .filter(g => g.faction === this.playerFaction && g.location === fromCity.id)
      .map(g => g.id);

    const action: GameAction = {
      type: 'military',
      action: 'march',
      params: {
        from: fromCity.id,
        to: 'chibi',
        generals: generalsInCity.slice(0, 3),
        troopsScale: 'medium' as const,
      },
    };

    this.onActionCb?.(action);
  }

  private showModal(
    title: string,
    options: Array<{ label: string; value: string }>,
    onSelect: (value: string) => void,
  ): void {
    const backdrop = h('div', { className: 'modal-backdrop' });
    const modal = h('div', { className: 'modal' });

    modal.appendChild(h('div', { className: 'modal-title' }, title));

    const body = h('div', { className: 'modal-body' });
    for (const opt of options) {
      const btn = h('button', { className: 'btn' }, opt.label);
      btn.style.cssText = 'display:block;width:100%;margin-bottom:var(--space-xs);text-align:left;';
      btn.addEventListener('click', () => {
        backdrop.remove();
        onSelect(opt.value);
      });
      body.appendChild(btn);
    }
    modal.appendChild(body);

    const footer = h('div', { className: 'modal-footer' });
    const cancelBtn = h('button', { className: 'btn' }, '취소');
    cancelBtn.addEventListener('click', () => backdrop.remove());
    footer.appendChild(cancelBtn);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }
}
