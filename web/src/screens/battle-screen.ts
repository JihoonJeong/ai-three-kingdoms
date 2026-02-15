import { h, assetUrl, createGauge } from '../renderer.js';
import { BattleView } from '../../../core/ui/battle-view.js';
import { getCharacterAssetPath, getBattleBgPath } from '../../../core/ui/types.js';
import { resolveExpression } from '../../../core/ui/character-display.js';
import type { BattleState, General, BattleTurnLog } from '../../../core/data/types.js';

export class BattleScreen {
  private container: HTMLElement | null = null;
  private battleView: BattleView | null = null;
  private selectedTacticId: string | null = null;
  private playerFaction = '유비';
  private locationName = '';
  private lastGenerals: General[] = [];
  private onTacticExecute: ((tacticId: string) => void) | null = null;
  private onRetreat: (() => void) | null = null;

  // 동적 업데이트용 참조
  private guideEl: HTMLElement | null = null;
  private execBtn: HTMLButtonElement | null = null;

  onExecuteTactic(cb: (tacticId: string) => void): void { this.onTacticExecute = cb; }
  onRetreatClick(cb: () => void): void { this.onRetreat = cb; }

  render(container: HTMLElement, battle: BattleState, generals: General[], playerFaction = '유비', locationName?: string): void {
    this.container = container;
    this.playerFaction = playerFaction;
    this.locationName = locationName ?? (this.locationName || battle.location);
    this.lastGenerals = generals;
    container.innerHTML = '';
    this.battleView = new BattleView(battle);
    this.selectedTacticId = null;

    const bgPath = assetUrl(getBattleBgPath(battle.terrain));
    const screen = h('div', { className: 'battle-screen' });
    screen.style.backgroundImage = `url('${bgPath}')`;

    // Fire effect overlay
    screen.appendChild(h('div', { className: 'fx-fire' }));

    // ─── Header ──────────────────────────────────────
    const header = h('div', { className: 'battle-header' });
    header.appendChild(h('div', { className: 'battle-title' }, `전투: ${this.locationName}`));
    const info = h('div', { className: 'battle-info' });
    info.append(
      h('span', {}, `지형: ${battle.terrain}`),
      h('span', {}, `날씨: ${battle.weather}`),
      h('span', {}, `전투턴: ${battle.battleTurn}/${battle.maxBattleTurns}`),
    );
    header.appendChild(info);
    screen.appendChild(header);

    // ─── Main battle area ────────────────────────────
    const main = h('div', { className: 'battle-main' });
    const isPlayerAttacker = battle.attackers.faction === playerFaction;

    main.appendChild(this.renderSide(
      isPlayerAttacker ? '아군 (공격)' : '적군 (공격)',
      battle.attackers.faction, battle.attackers, generals,
    ));

    const center = h('div', { className: 'battle-center' });
    center.appendChild(h('div', { className: 'battle-vs' }, 'VS'));
    const weather = h('div', { className: 'battle-weather' });
    weather.textContent = `${battle.weather} · ${battle.terrain}`;
    center.appendChild(weather);
    main.appendChild(center);

    main.appendChild(this.renderSide(
      isPlayerAttacker ? '적군 (방어)' : '아군 (방어)',
      battle.defenders.faction, battle.defenders, generals,
    ));
    screen.appendChild(main);

    // ─── Guide + Execute button (같은 줄) ─────────────
    const guideBar = h('div', { className: 'battle-guide' });
    const guideText = h('span', { className: 'battle-guide-text' });
    guideText.textContent = '전술 카드를 선택한 후 \'전술 실행\'을 눌러주세요';
    this.guideEl = guideText;
    guideBar.appendChild(guideText);

    const execBtn = h('button', { className: 'btn btn-primary btn-execute disabled' });
    execBtn.textContent = '전술 실행';
    execBtn.disabled = true;
    execBtn.addEventListener('click', () => {
      if (this.selectedTacticId) {
        this.onTacticExecute?.(this.selectedTacticId);
      }
    });
    this.execBtn = execBtn as HTMLButtonElement;
    guideBar.appendChild(execBtn);

    screen.appendChild(guideBar);

    // ─── Tactic cards ────────────────────────────────
    const tacticBar = h('div', { className: 'tactic-cards' });
    const cards = this.battleView.getTacticCards();

    for (const card of cards) {
      const el = h('div', { className: 'tactic-card' });
      el.dataset.tacticId = card.tactic.id;

      // 선택 배지
      el.appendChild(h('div', { className: 'tactic-selected-badge' }, '✓ 선택'));

      // 이미지
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

      // 이름
      el.appendChild(h('div', { className: 'tactic-card-name' }, card.tactic.name));

      // 위험도
      const riskClass = card.tactic.risk === '낮음' ? 'low' : card.tactic.risk === '보통' ? 'mid' : 'high';
      el.appendChild(h('div', { className: `tactic-card-risk ${riskClass}` }, `위험: ${card.tactic.risk}`));

      // 설명
      if (card.tactic.description) {
        el.appendChild(h('div', { className: 'tactic-card-desc' }, card.tactic.description));
      }

      // 조건
      if (card.tactic.requirements) {
        el.appendChild(h('div', { className: 'tactic-card-req' }, card.tactic.requirements));
      }

      // 클릭 → 선택
      el.addEventListener('click', () => {
        this.selectedTacticId = card.tactic.id;
        // 모든 카드 선택 상태 토글
        for (const c of tacticBar.children) {
          (c as HTMLElement).classList.toggle('selected', (c as HTMLElement).dataset.tacticId === card.tactic.id);
        }
        // 안내 문구 갱신
        if (this.guideEl) {
          this.guideEl.textContent = `'${card.tactic.name}' 선택됨 — 전술 실행을 눌러 실행하세요`;
          this.guideEl.classList.add('active');
        }
        // 실행 버튼 활성화
        if (this.execBtn) {
          this.execBtn.classList.remove('disabled');
          this.execBtn.disabled = false;
        }
      });

      tacticBar.appendChild(el);
    }
    screen.appendChild(tacticBar);

    // ─── Footer (전투 로그만) ────────────────────────────
    if (battle.log.length > 0) {
      const footer = h('div', { className: 'battle-footer' });
      const log = h('div', { className: 'battle-log' });
      for (const entry of battle.log) {
        log.appendChild(this.renderLogEntry(entry, isPlayerAttacker));
      }
      footer.appendChild(log);
      screen.appendChild(footer);
    }
    container.appendChild(screen);
  }

  // ─── 진영 렌더 ──────────────────────────────────────
  private renderSide(
    label: string,
    faction: string,
    force: BattleState['attackers'],
    generals: General[],
  ): HTMLElement {
    const side = h('div', { className: 'battle-side' });
    side.appendChild(h('div', { className: 'battle-side-label' }, label));

    // 장수 초상화 + 이름 + 능력치
    const portraits = h('div', { className: 'battle-portraits' });
    for (const genId of force.generals) {
      const gen = generals.find(g => g.id === genId);
      const wrap = h('div', { className: 'battle-portrait' });

      // 이미지
      const imgContainer = h('div', { className: 'battle-portrait-img' });
      const img = h('img') as HTMLImageElement;
      const battleExpr = resolveExpression(genId, { type: 'battle' });
      img.src = assetUrl(getCharacterAssetPath(genId, battleExpr));
      img.alt = gen?.name ?? genId;
      img.onerror = () => {
        imgContainer.innerHTML = '';
        const fb = h('div');
        const fColor = faction === '유비' ? '#2d6a4f' : faction === '조조' ? '#1b1b3a' : '#c9184a';
        fb.style.cssText = `width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${fColor};color:#f5f0e8;font-size:14px;font-weight:700;`;
        fb.textContent = gen?.name ?? genId;
        imgContainer.appendChild(fb);
      };
      imgContainer.appendChild(img);
      wrap.appendChild(imgContainer);

      // 이름 + 능력치
      const info = h('div', { className: 'battle-portrait-info' });
      info.appendChild(h('div', { className: 'battle-portrait-name' }, gen?.name ?? genId));
      if (gen) {
        info.appendChild(h('div', { className: 'battle-portrait-stats' },
          `통${gen.abilities.command} 무${gen.abilities.martial}`));
        const battleSkills = gen.skills.filter(s =>
          ['수전', '기략', '기습', '화공', '철벽', '돌격', '궁술'].includes(s));
        if (battleSkills.length > 0) {
          info.appendChild(h('div', { className: 'battle-portrait-skills' }, battleSkills.join(' ')));
        }
      }
      wrap.appendChild(info);
      portraits.appendChild(wrap);
    }
    side.appendChild(portraits);

    // 병력/사기 게이지
    const stats = h('div', { className: 'battle-stats' });

    const troopPct = force.initialTroops > 0
      ? Math.round((force.troops / force.initialTroops) * 100) : 0;
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

    if (force.formation) {
      const formRow = h('div');
      formRow.style.cssText = 'font-size:11px;color:var(--color-hanji);text-align:center;margin-top:var(--space-xs);';
      formRow.textContent = `진형: ${force.formation}`;
      stats.appendChild(formRow);
    }

    side.appendChild(stats);
    return side;
  }

  // ─── 로그 엔트리 ────────────────────────────────────
  private renderLogEntry(entry: BattleTurnLog, isPlayerAttacker = true): HTMLElement {
    const allyTactic = isPlayerAttacker ? entry.attackerTactic : entry.defenderTactic;
    const enemyTactic = isPlayerAttacker ? entry.defenderTactic : entry.attackerTactic;
    const allyCasualties = isPlayerAttacker ? entry.attackerCasualties : entry.defenderCasualties;
    const enemyCasualties = isPlayerAttacker ? entry.defenderCasualties : entry.attackerCasualties;

    const el = h('div', { className: 'battle-log-entry' });
    el.append(
      h('span', { className: 'log-turn' }, `[턴${entry.battleTurn}] `),
      h('span', { className: 'log-tactics' }, `아군: ${allyTactic} vs 적군: ${enemyTactic} `),
    );
    const dmg = h('div', { className: 'log-damage' });
    dmg.append(
      h('span', { className: 'dmg-enemy' }, `적 -${enemyCasualties.toLocaleString()}`),
      h('span', { className: 'dmg-ally' }, `아군 -${allyCasualties.toLocaleString()}`),
    );
    el.appendChild(dmg);
    return el;
  }

  // ─── 턴 결과 패널 ──────────────────────────────────
  showTurnResult(battle: BattleState, generals: General[]): void {
    if (!this.container) return;
    const screen = this.container.querySelector('.battle-screen');
    if (!screen) return;

    const lastLog = battle.log[battle.log.length - 1];
    if (!lastLog) return;

    const isPlayerAttacker = battle.attackers.faction === this.playerFaction;
    const allyTactic = isPlayerAttacker ? lastLog.attackerTactic : lastLog.defenderTactic;
    const enemyTactic = isPlayerAttacker ? lastLog.defenderTactic : lastLog.attackerTactic;
    const allyCasualties = isPlayerAttacker ? lastLog.attackerCasualties : lastLog.defenderCasualties;
    const enemyCasualties = isPlayerAttacker ? lastLog.defenderCasualties : lastLog.attackerCasualties;
    const allyMorale = isPlayerAttacker ? lastLog.attackerMoraleChange : lastLog.defenderMoraleChange;
    const enemyMorale = isPlayerAttacker ? lastLog.defenderMoraleChange : lastLog.attackerMoraleChange;

    const overlay = h('div', { className: 'battle-turn-result' });

    // 타이틀
    overlay.appendChild(h('div', { className: 'turn-result-title' },
      `◆ 제 ${lastLog.battleTurn} 전투턴 결과 ◆`));

    // 전술 대결
    overlay.appendChild(h('div', { className: 'turn-result-tactics' },
      `아군: ${allyTactic}  ⚔  적군: ${enemyTactic}`));

    // 서술
    const desc = h('div', { className: 'turn-result-desc' });
    desc.textContent = lastLog.description;
    overlay.appendChild(desc);

    // 피해/사기 카드
    const statsGrid = h('div', { className: 'turn-result-stats' });

    // 적군 피해
    const enemyStat = h('div', { className: 'turn-result-stat enemy' });
    enemyStat.append(
      h('div', { className: 'stat-label' }, '적군 피해'),
      h('div', { className: 'stat-value' }, `-${enemyCasualties.toLocaleString()}명`),
      h('div', { className: `stat-morale ${enemyMorale >= 0 ? 'positive' : 'negative'}` },
        `사기 ${enemyMorale >= 0 ? '+' : ''}${enemyMorale}`),
    );
    statsGrid.appendChild(enemyStat);

    // 아군 피해
    const allyStat = h('div', { className: 'turn-result-stat ally' });
    allyStat.append(
      h('div', { className: 'stat-label' }, '아군 피해'),
      h('div', { className: 'stat-value' }, `-${allyCasualties.toLocaleString()}명`),
      h('div', { className: `stat-morale ${allyMorale >= 0 ? 'positive' : 'negative'}` },
        `사기 ${allyMorale >= 0 ? '+' : ''}${allyMorale}`),
    );
    statsGrid.appendChild(allyStat);

    overlay.appendChild(statsGrid);

    // 계속 버튼
    const btn = h('button', { className: 'btn btn-primary' }, '다음 전술 선택');
    btn.addEventListener('click', () => {
      this.render(this.container!, battle, generals, this.playerFaction);
    });
    overlay.appendChild(btn);

    screen.appendChild(overlay);
  }

  // ─── 전투 결과 화면 ────────────────────────────────
  showResult(battle: BattleState, playerFaction: string): void {
    if (!this.container) return;
    const screen = this.container.querySelector('.battle-screen');
    if (!screen) return;
    this.playerFaction = playerFaction;

    const won = battle.result?.winner === playerFaction;
    const isDraw = battle.result?.winner === null;
    const isPlayerAttacker = battle.attackers.faction === playerFaction;
    const allyForce = isPlayerAttacker ? battle.attackers : battle.defenders;

    const overlay = h('div', { className: 'battle-result' });

    // 승패 텍스트
    const resultText = won ? '승리!' : isDraw ? '무승부' : '패배...';
    const resultClass = won ? 'battle-result-win' : isDraw ? 'battle-result-draw' : 'battle-result-lose';
    overlay.appendChild(h('div', {
      className: `battle-result-text ${resultClass}`,
    }, resultText));

    // 전투 통계
    const totalAllyCasualties = battle.log.reduce((sum, l) =>
      sum + (isPlayerAttacker ? l.attackerCasualties : l.defenderCasualties), 0);
    const totalEnemyCasualties = battle.log.reduce((sum, l) =>
      sum + (isPlayerAttacker ? l.defenderCasualties : l.attackerCasualties), 0);

    const statsDiv = h('div', { className: 'battle-result-stats' });
    statsDiv.append(
      h('div', {}, `소요 턴: ${battle.log.length}`),
      h('div', {}, `아군 잔여 병력: ${allyForce.troops.toLocaleString()}명`),
      h('div', {}, `아군 총 피해: ${totalAllyCasualties.toLocaleString()}명`),
      h('div', {}, `적군 총 피해: ${totalEnemyCasualties.toLocaleString()}명`),
    );
    overlay.appendChild(statsDiv);

    // 포로 장수
    if (battle.result?.capturedGenerals && battle.result.capturedGenerals.length > 0) {
      const names = battle.result.capturedGenerals.map(id => {
        const gen = this.lastGenerals.find(g => g.id === id);
        return gen?.name ?? id;
      });
      overlay.appendChild(h('div', { className: 'battle-result-captured' },
        `포로: ${names.join(', ')}`));
    }

    // 확인 버튼
    const closeBtn = h('button', { className: 'btn' }, '확인');
    closeBtn.style.marginTop = 'var(--space-md)';
    closeBtn.addEventListener('click', () => this.onRetreat?.());
    overlay.appendChild(closeBtn);

    screen.appendChild(overlay);
  }

  update(battle: BattleState, generals: General[]): void {
    if (this.container) {
      this.render(this.container, battle, generals, this.playerFaction);
    }
  }
}
