import { h, assetUrl, createGauge } from '../renderer.js';
import { BattleView } from '../../../core/ui/battle-view.js';
import { getCharacterAssetPath, getBattleBgPath } from '../../../core/ui/types.js';
import { resolveExpression } from '../../../core/ui/character-display.js';
import { t } from '../../../core/i18n/index.js';
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
    header.appendChild(h('div', { className: 'battle-title' }, `${t('전투')}: ${t(this.locationName)}`));
    const info = h('div', { className: 'battle-info' });
    info.append(
      h('span', {}, `${t('지형')}: ${t(battle.terrain)}`),
      h('span', {}, `${t('날씨')}: ${t(battle.weather)}`),
      h('span', {}, `${t('전투턴')}: ${battle.battleTurn}/${battle.maxBattleTurns}`),
    );
    header.appendChild(info);
    screen.appendChild(header);

    // ─── Main battle area ────────────────────────────
    const main = h('div', { className: 'battle-main' });
    const isPlayerAttacker = battle.attackers.faction === playerFaction;

    main.appendChild(this.renderSide(
      isPlayerAttacker ? t('아군 (공격)') : t('적군 (공격)'),
      battle.attackers.faction, battle.attackers, generals,
    ));

    const center = h('div', { className: 'battle-center' });
    center.appendChild(h('div', { className: 'battle-vs' }, 'VS'));
    const weather = h('div', { className: 'battle-weather' });
    weather.textContent = `${t(battle.weather)} · ${t(battle.terrain)}`;
    center.appendChild(weather);
    main.appendChild(center);

    main.appendChild(this.renderSide(
      isPlayerAttacker ? t('적군 (방어)') : t('아군 (방어)'),
      battle.defenders.faction, battle.defenders, generals,
    ));
    screen.appendChild(main);

    // ─── Guide + Execute button (같은 줄) ─────────────
    const guideBar = h('div', { className: 'battle-guide' });
    const guideText = h('span', { className: 'battle-guide-text' });
    guideText.textContent = t('전술 카드를 선택한 후 \'전술 실행\'을 눌러주세요');
    this.guideEl = guideText;
    guideBar.appendChild(guideText);

    const execBtn = h('button', { className: 'btn btn-primary btn-execute disabled' });
    execBtn.textContent = t('전술 실행');
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
      el.appendChild(h('div', { className: 'tactic-selected-badge' }, t('✓ 선택')));

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
      el.appendChild(h('div', { className: 'tactic-card-name' }, t(card.tactic.name)));

      // 위험도
      const riskClass = card.tactic.risk === '낮음' ? 'low' : card.tactic.risk === '보통' ? 'mid' : 'high';
      el.appendChild(h('div', { className: `tactic-card-risk ${riskClass}` }, `${t('위험')}: ${t(card.tactic.risk)}`));

      // 설명
      if (card.tactic.description) {
        el.appendChild(h('div', { className: 'tactic-card-desc' }, t(card.tactic.description)));
      }

      // 조건
      if (card.tactic.requirements) {
        el.appendChild(h('div', { className: 'tactic-card-req' }, t(card.tactic.requirements)));
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
          this.guideEl.textContent = `'${t(card.tactic.name)}' ${t('선택됨 — 전술 실행을 눌러 실행하세요')}`;
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
        fb.textContent = t(gen?.name ?? genId);
        imgContainer.appendChild(fb);
      };
      imgContainer.appendChild(img);
      wrap.appendChild(imgContainer);

      // 이름 + 능력치
      const info = h('div', { className: 'battle-portrait-info' });
      info.appendChild(h('div', { className: 'battle-portrait-name' }, t(gen?.name ?? genId)));
      if (gen) {
        info.appendChild(h('div', { className: 'battle-portrait-stats' },
          `${t('통')}${gen.abilities.command} ${t('무')}${gen.abilities.martial}`));
        const battleSkills = gen.skills.filter(s =>
          ['수전', '기략', '기습', '화공', '철벽', '돌격', '궁술'].includes(s));
        if (battleSkills.length > 0) {
          info.appendChild(h('div', { className: 'battle-portrait-skills' }, battleSkills.map(s => t(s)).join(' ')));
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
    troopRow.appendChild(h('span', { className: 'battle-stat-label' }, t('병력')));
    const troopBar = h('div', { className: 'battle-stat-bar' });
    troopBar.appendChild(createGauge(
      force.troops, force.initialTroops,
      troopPct > 50 ? '#2d6a4f' : troopPct > 25 ? '#e85d04' : '#d00000',
      `${force.troops.toLocaleString()} (${troopPct}%)`,
    ));
    troopRow.appendChild(troopBar);
    stats.appendChild(troopRow);

    const moraleRow = h('div', { className: 'battle-stat-row' });
    moraleRow.appendChild(h('span', { className: 'battle-stat-label' }, t('사기')));
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
      formRow.textContent = `${t('진형')}: ${t(force.formation)}`;
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
      h('span', { className: 'log-turn' }, `[${t('턴')}${entry.battleTurn}] `),
      h('span', { className: 'log-tactics' }, `${t('아군')}: ${t(allyTactic)} vs ${t('적군')}: ${t(enemyTactic)} `),
    );
    const dmg = h('div', { className: 'log-damage' });
    dmg.append(
      h('span', { className: 'dmg-enemy' }, `${t('적')} -${enemyCasualties.toLocaleString()}`),
      h('span', { className: 'dmg-ally' }, `${t('아군')} -${allyCasualties.toLocaleString()}`),
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
      `◆ ${t('제')} ${lastLog.battleTurn} ${t('전투턴 결과')} ◆`));

    // 전술 대결
    overlay.appendChild(h('div', { className: 'turn-result-tactics' },
      `${t('아군')}: ${t(allyTactic)}  ⚔  ${t('적군')}: ${t(enemyTactic)}`));

    // 서술
    const desc = h('div', { className: 'turn-result-desc' });
    desc.textContent = lastLog.description;
    overlay.appendChild(desc);

    // 피해/사기 카드
    const statsGrid = h('div', { className: 'turn-result-stats' });

    // 적군 피해
    const enemyStat = h('div', { className: 'turn-result-stat enemy' });
    enemyStat.append(
      h('div', { className: 'stat-label' }, t('적군 피해')),
      h('div', { className: 'stat-value' }, `-${enemyCasualties.toLocaleString()}${t('명')}`),
      h('div', { className: `stat-morale ${enemyMorale >= 0 ? 'positive' : 'negative'}` },
        `${t('사기')} ${enemyMorale >= 0 ? '+' : ''}${enemyMorale}`),
    );
    statsGrid.appendChild(enemyStat);

    // 아군 피해
    const allyStat = h('div', { className: 'turn-result-stat ally' });
    allyStat.append(
      h('div', { className: 'stat-label' }, t('아군 피해')),
      h('div', { className: 'stat-value' }, `-${allyCasualties.toLocaleString()}${t('명')}`),
      h('div', { className: `stat-morale ${allyMorale >= 0 ? 'positive' : 'negative'}` },
        `${t('사기')} ${allyMorale >= 0 ? '+' : ''}${allyMorale}`),
    );
    statsGrid.appendChild(allyStat);

    overlay.appendChild(statsGrid);

    // 계속 버튼
    const btn = h('button', { className: 'btn btn-primary' }, t('다음 전술 선택'));
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
    const resultText = won ? t('승리!') : isDraw ? t('무승부') : t('패배...');
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
      h('div', {}, `${t('소요 턴')}: ${battle.log.length}`),
      h('div', {}, `${t('아군 잔여 병력')}: ${allyForce.troops.toLocaleString()}${t('명')}`),
      h('div', {}, `${t('아군 총 피해')}: ${totalAllyCasualties.toLocaleString()}${t('명')}`),
      h('div', {}, `${t('적군 총 피해')}: ${totalEnemyCasualties.toLocaleString()}${t('명')}`),
    );
    overlay.appendChild(statsDiv);

    // 포로 장수
    if (battle.result?.capturedGenerals && battle.result.capturedGenerals.length > 0) {
      const names = battle.result.capturedGenerals.map(id => {
        const gen = this.lastGenerals.find(g => g.id === id);
        return t(gen?.name ?? id);
      });
      overlay.appendChild(h('div', { className: 'battle-result-captured' },
        `${t('포로')}: ${names.join(', ')}`));
    }

    // 확인 버튼
    const closeBtn = h('button', { className: 'btn' }, t('확인'));
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
