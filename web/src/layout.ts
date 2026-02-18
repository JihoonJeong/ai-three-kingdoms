import { h } from './renderer.js';
import { t } from '../../core/i18n/index.js';
import type { GameState } from '../../core/data/types.js';

export type TabId = 'map' | 'city' | 'general' | 'diplomacy' | 'log' | 'advisor';

const TAB_KEYS: Record<TabId, string> = {
  map: '전략 맵',
  city: '도시',
  general: '장수',
  diplomacy: '외교',
  log: '기록',
  advisor: '책사',
};

export class Layout {
  private headerInfo!: HTMLElement;
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private contentArea!: HTMLElement;
  private footerResources!: HTMLElement;
  private footerActions!: HTMLElement;
  private overlayArea!: HTMLElement;
  private activeTab: TabId = 'map';
  private onTabChangeCb: ((tab: TabId) => void) | null = null;

  constructor(root: HTMLElement) {
    this.build(root);
  }

  private build(root: HTMLElement): void {
    root.innerHTML = '';

    const header = h('div', { className: 'header' });
    const title = h('div', { className: 'header-title' }, t('AI 삼국지 — 적벽대전'));
    this.headerInfo = h('div', { className: 'header-info' });
    header.append(title, this.headerInfo);

    const tabBar = h('div', { className: 'tab-bar' });
    for (const id of Object.keys(TAB_KEYS) as TabId[]) {
      const btn = h('button', { className: `tab-btn${id === 'map' ? ' active' : ''}` }, t(TAB_KEYS[id]));
      btn.dataset.tab = id;
      btn.addEventListener('click', () => this.setActiveTab(id));
      this.tabButtons.set(id, btn);
      tabBar.appendChild(btn);
    }

    this.contentArea = h('div', { className: 'content' });

    const footer = h('div', { className: 'footer' });
    this.footerResources = h('div', { className: 'footer-resources' });
    this.footerActions = h('div', { className: 'footer-actions' });
    footer.append(this.footerResources, this.footerActions);

    this.overlayArea = h('div', { className: 'overlay hidden' });

    root.append(header, tabBar, this.contentArea, footer, this.overlayArea);
  }

  setActiveTab(tab: TabId): void {
    if (tab === this.activeTab) return;
    this.activeTab = tab;
    for (const [id, btn] of this.tabButtons) {
      btn.classList.toggle('active', id === tab);
    }
    this.onTabChangeCb?.(tab);
  }

  getActiveTab(): TabId { return this.activeTab; }
  getContentArea(): HTMLElement { return this.contentArea; }
  getOverlayArea(): HTMLElement { return this.overlayArea; }
  getFooterActions(): HTMLElement { return this.footerActions; }

  onTabChange(cb: (tab: TabId) => void): void {
    this.onTabChangeCb = cb;
  }

  showOverlay(): void {
    this.overlayArea.classList.remove('hidden');
  }

  hideOverlay(): void {
    this.overlayArea.classList.add('hidden');
    this.overlayArea.innerHTML = '';
  }

  updateHeader(turn: number, maxTurns: number, season: string, actions: number): void {
    this.headerInfo.innerHTML = '';
    this.headerInfo.append(
      h('span', {}, t(season)),
      h('span', {}, `${t('턴')} ${turn}/${maxTurns}`),
      h('span', {}, `${t('행동')} ${actions}/3`),
    );
  }

  updateFooter(state: GameState, playerFaction: string): void {
    this.footerResources.innerHTML = '';
    const playerCities = state.cities.filter(c => c.owner === playerFaction);
    const totalTroops = playerCities.reduce(
      (sum, c) => sum + c.troops.infantry + c.troops.cavalry + c.troops.navy, 0,
    );
    const totalFood = playerCities.reduce((sum, c) => sum + c.food, 0);
    const generalCount = state.generals.filter(g => g.faction === playerFaction).length;

    this.footerResources.append(
      h('span', {}, `${t('병력')}: ${totalTroops.toLocaleString()}`),
      h('span', {}, `${t('식량')}: ${totalFood.toLocaleString()}`),
      h('span', {}, `${t('장수')}: ${generalCount}${t('명')}`),
      h('span', {}, `${t('도시')}: ${playerCities.length}${t('개')}`),
    );
  }
}
