import { h } from '../renderer.js';
import { getTotalTroopsOfCity } from '../../../core/data/types.js';
import type { GameState, GameAction, FactionId, TroopsScale, City, TransferType, TransferScale } from '../../../core/data/types.js';

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
      { label: '징병 (대규모)', action: () => this.showCityPicker('conscript', 'large') },
      { label: '농업 개발', action: () => this.showCityPicker('develop', 'agriculture') },
      { label: '상업 개발', action: () => this.showCityPicker('develop', 'commerce') },
      { label: '방어 강화', action: () => this.showCityPicker('develop', 'defense') },
      { label: '훈련', action: () => this.showCityPicker('train', null) },
      { label: '등용', action: () => this.showRecruitDialog() },
      { label: '보급 (병력)', action: () => this.showTransferDialog('troops') },
      { label: '보급 (식량)', action: () => this.showTransferDialog('food') },
    ]));

    // Diplomacy dropdown
    this.container.appendChild(this.createDropdown('외교', disabled, [
      { label: '손권에 사신 파견', action: () => this.execDiplomacy('send_envoy', '손권' as FactionId) },
      { label: '손권에 선물', action: () => this.execDiplomacy('gift', '손권' as FactionId) },
      { label: '조조에 위협', action: () => this.execDiplomacy('threaten', '조조' as FactionId) },
      { label: '설득', action: () => this.showPersuadeDialog() },
    ]));

    // Military dropdown
    this.container.appendChild(this.createDropdown('군사', disabled, [
      { label: '진군', action: () => this.showMarchDialog() },
      { label: '장수 배치', action: () => this.showAssignDialog() },
      { label: '정찰', action: () => this.showScoutDialog() },
      { label: '방어 강화', action: () => this.showCityPicker('fortify', null) },
      { label: '매복', action: () => this.showAmbushDialog() },
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

  // ─── 위치 조회 헬퍼 ───────────────────────────────────

  private getLocationInfo(id: string): { name: string; owner: FactionId | null; isBattlefield: boolean } | null {
    if (!this.state) return null;
    const city = this.state.cities.find(c => c.id === id);
    if (city) return { name: city.name, owner: city.owner, isBattlefield: false };
    const bf = this.state.battlefields.find(b => b.id === id);
    if (bf) return { name: bf.name, owner: null, isBattlefield: true };
    return null;
  }

  // ─── 진군 — 3단계 모달 ────────────────────────────────

  private showMarchDialog(): void {
    if (!this.state) return;

    // Step 1: 출발 도시 선택 (아군 도시 중 장수가 있는 도시)
    const citiesWithGenerals = this.state.cities
      .filter(c => c.owner === this.playerFaction)
      .filter(c => this.state!.generals.some(
        g => g.faction === this.playerFaction && g.location === c.id,
      ));

    if (citiesWithGenerals.length === 0) return;

    // 도시 1개면 자동 선택
    if (citiesWithGenerals.length === 1) {
      this.showMarchStep2(citiesWithGenerals[0]);
      return;
    }

    const options = citiesWithGenerals.map(c => {
      const generals = this.state!.generals.filter(
        g => g.faction === this.playerFaction && g.location === c.id,
      );
      const troops = getTotalTroopsOfCity(c);
      return {
        label: `${c.name} (장수 ${generals.length}, 병력 ${troops.toLocaleString()})`,
        value: c.id,
      };
    });

    this.showModal('출발 도시 선택', options, (cityId) => {
      const city = this.state!.cities.find(c => c.id === cityId)!;
      this.showMarchStep2(city);
    });
  }

  private showMarchStep2(fromCity: City): void {
    if (!this.state) return;

    // Step 2: 목적지 선택 — 적/중립 도시 + 전투지역만 (아군 도시는 '보급' 사용)
    const destinations: Array<{ label: string; value: string }> = [];
    for (const adjId of fromCity.adjacent) {
      const info = this.getLocationInfo(adjId);
      if (!info) continue;

      // 아군 도시 제외 (보급으로 이동)
      if (!info.isBattlefield && info.owner === this.playerFaction) continue;

      let label: string;
      if (info.isBattlefield) {
        label = `${info.name} ⚔️`;
      } else if (info.owner) {
        label = `${info.name} — ${info.owner}`;
      } else {
        label = `${info.name} (중립)`;
      }
      destinations.push({ label, value: adjId });
    }

    if (destinations.length === 0) return;

    this.showModal('목적지 선택', destinations, (toId) => {
      this.showMarchConfirm(fromCity, toId);
    });
  }

  private showMarchConfirm(fromCity: City, toId: string): void {
    if (!this.state) return;

    const destInfo = this.getLocationInfo(toId);
    if (!destInfo) return;

    // 해당 도시에 있는 아군 장수 (사망/포로 제외)
    const generals = this.state.generals.filter(
      g => g.faction === this.playerFaction && g.location === fromCity.id &&
           g.condition !== '사망' && g.condition !== '포로',
    );
    if (generals.length === 0) return;

    // 커스텀 모달 — 장수 체크박스 + 병력 규모 버튼
    const backdrop = h('div', { className: 'modal-backdrop' });
    const modal = h('div', { className: 'modal' });

    modal.appendChild(h('div', { className: 'modal-title' },
      `${fromCity.name} → ${destInfo.name} 출진`));

    const body = h('div', { className: 'modal-body' });

    // 장수 선택 (체크박스, 최대 3명, 기본 전체 선택)
    body.appendChild(h('div', {
      style: 'margin-bottom:var(--space-sm);font-weight:bold;',
    }, '장수 선택 (최대 3)'));

    const checkboxes: Array<{ id: string; checkbox: HTMLInputElement }> = [];
    for (const g of generals) {
      const label = h('label', {
        style: 'display:block;margin-bottom:var(--space-xs);cursor:pointer;',
      });
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checkboxes.length < 3;
      cb.style.cssText = 'margin-right:var(--space-xs);';
      cb.addEventListener('change', () => {
        const checked = checkboxes.filter(c => c.checkbox.checked);
        if (checked.length > 3) {
          cb.checked = false;
        }
      });
      label.append(cb, ` ${g.name}`);
      body.appendChild(label);
      checkboxes.push({ id: g.id, checkbox: cb });
    }

    // 병력 규모 선택
    body.appendChild(h('div', {
      style: 'margin-top:var(--space-sm);margin-bottom:var(--space-xs);font-weight:bold;',
    }, '병력 규모'));

    let selectedScale: TroopsScale = 'medium';
    const scaleContainer = h('div', { style: 'display:flex;gap:var(--space-xs);' });
    const scales: Array<{ label: string; value: TroopsScale }> = [
      { label: '소규모 (30%)', value: 'small' },
      { label: '중규모 (50%)', value: 'medium' },
      { label: '주력 (70%)', value: 'main' },
    ];
    const scaleButtons: HTMLElement[] = [];
    for (const s of scales) {
      const btn = h('button', { className: 'btn' }, s.label);
      if (s.value === 'medium') btn.classList.add('btn-primary');
      btn.addEventListener('click', () => {
        selectedScale = s.value;
        for (const b of scaleButtons) b.classList.remove('btn-primary');
        btn.classList.add('btn-primary');
      });
      scaleButtons.push(btn);
      scaleContainer.appendChild(btn);
    }
    body.appendChild(scaleContainer);

    modal.appendChild(body);

    // Footer
    const footer = h('div', { className: 'modal-footer' });
    const cancelBtn = h('button', { className: 'btn' }, '취소');
    cancelBtn.addEventListener('click', () => backdrop.remove());
    const confirmBtn = h('button', { className: 'btn btn-primary' }, '출진');
    confirmBtn.addEventListener('click', () => {
      const selectedGenerals = checkboxes
        .filter(c => c.checkbox.checked)
        .map(c => c.id);
      if (selectedGenerals.length === 0) return;
      backdrop.remove();
      const action: GameAction = {
        type: 'military',
        action: 'march',
        params: {
          from: fromCity.id,
          to: toId,
          generals: selectedGenerals,
          troopsScale: selectedScale,
        },
      };
      this.onActionCb?.(action);
    });
    footer.append(cancelBtn, confirmBtn);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  // ─── 장수 배치 — 2단계 모달 ───────────────────────────

  private showAssignDialog(): void {
    if (!this.state) return;

    // Step 1: 배치할 장수 선택 (양호/피로 상태만)
    const availableGenerals = this.state.generals.filter(
      g => g.faction === this.playerFaction &&
           (g.condition === '양호' || g.condition === '피로'),
    );

    if (availableGenerals.length === 0) return;

    const options = availableGenerals.map(g => {
      const locInfo = this.getLocationInfo(g.location);
      const locName = locInfo?.name ?? g.location;
      return {
        label: `${g.name} — ${locName}`,
        value: g.id,
      };
    });

    this.showModal('배치할 장수 선택', options, (generalId) => {
      this.showAssignStep2(generalId);
    });
  }

  private showAssignStep2(generalId: string): void {
    if (!this.state) return;

    const general = this.state.generals.find(g => g.id === generalId);
    if (!general) return;

    // 현재 위치의 인접 아군 도시만
    const currentCity = this.state.cities.find(c => c.id === general.location);
    if (!currentCity) return;

    const destinations = currentCity.adjacent
      .map(id => this.state!.cities.find(c => c.id === id))
      .filter((c): c is City => c !== null && c !== undefined && c.owner === this.playerFaction);

    if (destinations.length === 0) return;

    // 목적지 1개면 자동 선택
    if (destinations.length === 1) {
      const action: GameAction = {
        type: 'domestic',
        action: 'assign',
        params: { general: generalId, destination: destinations[0].id },
      };
      this.onActionCb?.(action);
      return;
    }

    const options = destinations.map(c => ({
      label: c.name,
      value: c.id,
    }));

    this.showModal('목적지 선택', options, (destId) => {
      const action: GameAction = {
        type: 'domestic',
        action: 'assign',
        params: { general: generalId, destination: destId },
      };
      this.onActionCb?.(action);
    });
  }

  // ─── 정찰 — 1단계 모달 ───────────────────────────────

  private showScoutDialog(): void {
    if (!this.state) return;

    const options: Array<{ label: string; value: string }> = [];

    // 비아군 도시
    for (const c of this.state.cities) {
      if (c.owner === this.playerFaction) continue;
      const ownerLabel = c.owner ? ` — ${c.owner}` : '';
      options.push({ label: `${c.name}${ownerLabel}`, value: c.id });
    }

    // 전투지역
    for (const bf of this.state.battlefields) {
      options.push({ label: `${bf.name} (전투지역)`, value: bf.id });
    }

    if (options.length === 0) return;

    this.showModal('정찰 대상 선택', options, (targetId) => {
      const action: GameAction = {
        type: 'military',
        action: 'scout',
        params: { target: targetId },
      };
      this.onActionCb?.(action);
    });
  }

  // ─── 등용 — 2단계 모달 ──────────────────────────────

  private showRecruitDialog(): void {
    if (!this.state) return;

    const playerCities = this.state.cities.filter(c => c.owner === this.playerFaction);
    // 비아군 장수가 있는 도시만
    const citiesWithTargets = playerCities.filter(c =>
      this.state!.generals.some(g => g.faction !== this.playerFaction && g.location === c.id),
    );
    if (citiesWithTargets.length === 0) return;

    const cityOptions = citiesWithTargets.map(c => ({
      label: c.name,
      value: c.id,
    }));

    const pickCity = (cityId: string) => {
      const targets = this.state!.generals.filter(
        g => g.faction !== this.playerFaction && g.location === cityId && g.condition !== '사망',
      );
      if (targets.length === 0) return;

      const generalOptions = targets.map(g => ({
        label: `${g.name} (${g.faction})`,
        value: g.id,
      }));

      this.showModal('등용 — 장수 선택', generalOptions, (generalId) => {
        const action: GameAction = {
          type: 'domestic', action: 'recruit',
          params: { city: cityId, targetGeneral: generalId },
        };
        this.onActionCb?.(action);
      });
    };

    if (citiesWithTargets.length === 1) {
      pickCity(citiesWithTargets[0].id);
      return;
    }

    this.showModal('등용 — 도시 선택', cityOptions, pickCity);
  }

  // ─── 설득 — 2단계 모달 ──────────────────────────────

  private showPersuadeDialog(): void {
    if (!this.state) return;

    const targets = this.state.generals.filter(
      g => g.faction !== this.playerFaction &&
           g.condition !== '사망' && g.condition !== '포로',
    );
    if (targets.length === 0) return;

    const generalOptions = targets.map(g => ({
      label: `${g.name} (${g.faction})`,
      value: g.id,
    }));

    this.showModal('설득 — 대상 선택', generalOptions, (generalId) => {
      const methods = [
        { label: '의리로 설득', value: '의리' },
        { label: '이익으로 설득', value: '이익' },
        { label: '위협으로 압박', value: '위협' },
      ];

      this.showModal('설득 — 방법 선택', methods, (method) => {
        const action: GameAction = {
          type: 'diplomacy', action: 'persuade',
          params: { targetGeneral: generalId, method },
        };
        this.onActionCb?.(action);
      });
    });
  }

  // ─── 매복 — 2단계 모달 ──────────────────────────────

  private showAmbushDialog(): void {
    if (!this.state) return;

    // 매복 가능 지역: 아군 도시에 인접한 적 도시/전투지역
    const playerCityIds = this.state.cities
      .filter(c => c.owner === this.playerFaction)
      .flatMap(c => c.adjacent);

    const uniqueLocations = [...new Set(playerCityIds)];
    const locationOptions: Array<{ label: string; value: string }> = [];

    for (const locId of uniqueLocations) {
      const info = this.getLocationInfo(locId);
      if (!info) continue;
      if (!info.isBattlefield && info.owner === this.playerFaction) continue;
      const label = info.isBattlefield
        ? `${info.name} ⚔️`
        : `${info.name} — ${info.owner ?? '중립'}`;
      locationOptions.push({ label, value: locId });
    }

    if (locationOptions.length === 0) return;

    this.showModal('매복 — 위치 선택', locationOptions, (location) => {
      const availableGenerals = this.state!.generals.filter(
        g => g.faction === this.playerFaction &&
             (g.condition === '양호' || g.condition === '피로'),
      );
      if (availableGenerals.length === 0) return;

      const generalOptions = availableGenerals.map(g => {
        const locInfo = this.getLocationInfo(g.location);
        return {
          label: `${g.name} — ${locInfo?.name ?? g.location}`,
          value: g.id,
        };
      });

      this.showModal('매복 — 장수 선택', generalOptions, (generalId) => {
        const action: GameAction = {
          type: 'military', action: 'ambush',
          params: { location, general: generalId },
        };
        this.onActionCb?.(action);
      });
    });
  }

  // ─── 보급 — 3단계 모달 ──────────────────────────────

  private showTransferDialog(transferType: TransferType): void {
    if (!this.state) return;

    const typeLabel = transferType === 'troops' ? '병력' : '식량';
    const playerCities = this.state.cities.filter(c => c.owner === this.playerFaction);
    if (playerCities.length === 0) return;

    const srcOptions = playerCities.map(c => {
      const troops = getTotalTroopsOfCity(c);
      const detail = transferType === 'troops'
        ? `병력 ${troops.toLocaleString()}`
        : `식량 ${c.food.toLocaleString()}`;
      return { label: `${c.name} (${detail})`, value: c.id };
    });

    const pickFrom = (fromId: string) => {
      const fromCity = this.state!.cities.find(c => c.id === fromId)!;
      const destinations = fromCity.adjacent
        .map(id => this.state!.cities.find(c => c.id === id))
        .filter((c): c is City => c !== null && c !== undefined && c.owner === this.playerFaction);

      if (destinations.length === 0) return;

      const pickTo = (toId: string) => {
        this.showTransferScale(fromId, toId, transferType);
      };

      if (destinations.length === 1) {
        pickTo(destinations[0].id);
        return;
      }

      const destOptions = destinations.map(c => ({ label: c.name, value: c.id }));
      this.showModal(`보급 (${typeLabel}) — 도착 도시`, destOptions, pickTo);
    };

    if (playerCities.length === 1) {
      pickFrom(playerCities[0].id);
      return;
    }

    this.showModal(`보급 (${typeLabel}) — 출발 도시`, srcOptions, pickFrom);
  }

  private showTransferScale(
    fromId: string, toId: string, transferType: TransferType,
  ): void {
    const typeLabel = transferType === 'troops' ? '병력' : '식량';
    const fromCity = this.state!.cities.find(c => c.id === fromId)!;
    const toCity = this.state!.cities.find(c => c.id === toId)!;

    let scaleOptions: Array<{ label: string; value: string }>;

    if (transferType === 'troops') {
      const total = getTotalTroopsOfCity(fromCity);
      scaleOptions = [
        { label: `소규모 (30%, 약 ${Math.floor(total * 0.3).toLocaleString()}명)`, value: 'small' },
        { label: `중규모 (50%, 약 ${Math.floor(total * 0.5).toLocaleString()}명)`, value: 'medium' },
        { label: `대규모 (70%, 약 ${Math.floor(total * 0.7).toLocaleString()}명)`, value: 'large' },
      ];
    } else {
      scaleOptions = [
        { label: `소규모 (1,000) — 보유: ${fromCity.food.toLocaleString()}`, value: 'small' },
        { label: `중규모 (2,500) — 보유: ${fromCity.food.toLocaleString()}`, value: 'medium' },
        { label: `대규모 (5,000) — 보유: ${fromCity.food.toLocaleString()}`, value: 'large' },
      ];
    }

    this.showModal(
      `보급 (${typeLabel}): ${fromCity.name} → ${toCity.name}`,
      scaleOptions,
      (scale) => {
        const action: GameAction = {
          type: 'domestic', action: 'transfer',
          params: {
            from: fromId,
            to: toId,
            transferType,
            scale: scale as TransferScale,
          },
        };
        this.onActionCb?.(action);
      },
    );
  }

  // ─── 모달 ────────────────────────────────────────────

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
