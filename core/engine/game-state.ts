// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 게임 상태 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  GameState, City, General, Faction, FactionId, BattleState,
  GamePhase, GameResult, DiplomacyRelation, ActionLogEntry,
  Battlefield,
} from '../data/types.js';
import {
  ACTIONS_PER_TURN, getTotalTroopsOfCity, getRelationLevel,
} from '../data/types.js';

export class GameStateManager {
  private state: GameState;

  constructor(state: GameState) {
    this.state = structuredClone(state);
  }

  // ─── 읽기 ────────────────────────────────────────────

  getState(): Readonly<GameState> {
    return this.state;
  }

  getCity(id: string): City | undefined {
    return this.state.cities.find(c => c.id === id);
  }

  getBattlefield(id: string): Battlefield | undefined {
    return this.state.battlefields.find(b => b.id === id);
  }

  getGeneral(id: string): General | undefined {
    return this.state.generals.find(g => g.id === id);
  }

  getGeneralByName(name: string): General | undefined {
    return this.state.generals.find(g => g.name === name);
  }

  getCitiesByFaction(faction: FactionId): City[] {
    return this.state.cities.filter(c => c.owner === faction);
  }

  getGeneralsByFaction(faction: FactionId): General[] {
    return this.state.generals.filter(g => g.faction === faction);
  }

  getGeneralsByLocation(location: string): General[] {
    return this.state.generals.filter(g => g.location === location);
  }

  getFaction(id: FactionId): Faction | undefined {
    return this.state.factions.find(f => f.id === id);
  }

  getRelation(a: FactionId, b: FactionId): DiplomacyRelation | undefined {
    return this.state.diplomacy.relations.find(
      r => (r.factionA === a && r.factionB === b) ||
           (r.factionA === b && r.factionB === a)
    );
  }

  getTotalTroops(faction: FactionId): number {
    return this.getCitiesByFaction(faction)
      .reduce((sum, city) => sum + getTotalTroopsOfCity(city), 0);
  }

  getPlayerFaction(): Faction {
    const faction = this.state.factions.find(f => f.isPlayer);
    if (!faction) throw new Error('플레이어 세력을 찾을 수 없습니다');
    return faction;
  }

  isAlly(factionId: FactionId): boolean {
    const playerFaction = this.getPlayerFaction();
    const relation = this.getRelation(playerFaction.id, factionId);
    return relation?.isAlliance ?? false;
  }

  // ─── 쓰기 ────────────────────────────────────────────

  updateCity(id: string, updates: Partial<City>): void {
    const city = this.state.cities.find(c => c.id === id);
    if (!city) throw new Error(`도시를 찾을 수 없습니다: ${id}`);
    Object.assign(city, updates);
  }

  updateGeneral(id: string, updates: Partial<General>): void {
    const general = this.state.generals.find(g => g.id === id);
    if (!general) throw new Error(`장수를 찾을 수 없습니다: ${id}`);
    Object.assign(general, updates);
  }

  updateRelation(a: FactionId, b: FactionId, updates: Partial<DiplomacyRelation>): void {
    const relation = this.getRelation(a, b);
    if (!relation) throw new Error(`외교 관계를 찾을 수 없습니다: ${a}-${b}`);
    Object.assign(relation, updates);
    // 수치 변경 시 관계 레벨 자동 갱신
    if (updates.value !== undefined) {
      relation.relation = getRelationLevel(relation.value);
    }
  }

  addRelationValue(a: FactionId, b: FactionId, delta: number): number {
    const relation = this.getRelation(a, b);
    if (!relation) throw new Error(`외교 관계를 찾을 수 없습니다: ${a}-${b}`);
    relation.value = Math.max(0, Math.min(100, relation.value + delta));
    relation.relation = getRelationLevel(relation.value);
    return relation.value;
  }

  useAction(): number {
    if (this.state.actionsRemaining <= 0) {
      throw new Error('이번 턴의 행동을 모두 소진했습니다');
    }
    this.state.actionsRemaining--;
    return this.state.actionsRemaining;
  }

  resetActions(): void {
    this.state.actionsRemaining = ACTIONS_PER_TURN;
  }

  advanceTurn(): void {
    this.state.turn++;
  }

  setPhase(phase: GamePhase): void {
    this.state.phase = phase;
  }

  setSeason(season: string): void {
    this.state.season = season;
  }

  setBattle(battle: BattleState | null): void {
    this.state.activeBattle = battle;
  }

  addCompletedEvent(eventId: string): void {
    if (!this.state.completedEvents.includes(eventId)) {
      this.state.completedEvents.push(eventId);
    }
  }

  isEventCompleted(eventId: string): boolean {
    return this.state.completedEvents.includes(eventId);
  }

  setFlag(key: string, value: unknown): void {
    this.state.flags[key] = value;
  }

  getFlag<T = unknown>(key: string): T | undefined {
    return this.state.flags[key] as T | undefined;
  }

  addActionLog(entry: ActionLogEntry): void {
    this.state.actionLog.push(entry);
  }

  setGameOver(result: GameResult): void {
    this.state.gameOver = true;
    this.state.result = result;
  }

  addCityTroops(cityId: string, type: 'infantry' | 'cavalry' | 'navy', amount: number): void {
    const city = this.getCity(cityId);
    if (!city) throw new Error(`도시를 찾을 수 없습니다: ${cityId}`);
    city.troops[type] = Math.max(0, city.troops[type] + amount);
  }

  // ─── 직렬화 ──────────────────────────────────────────

  serialize(): string {
    return JSON.stringify(this.state);
  }

  static deserialize(json: string): GameStateManager {
    const state = JSON.parse(json) as GameState;
    return new GameStateManager(state);
  }

  clone(): GameStateManager {
    return new GameStateManager(this.state);
  }
}
