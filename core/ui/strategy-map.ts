// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전략 맵 컴포넌트
// 수묵화 배경 위 인터랙티브 SVG 오버레이
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { GameState, FactionId, City, Battlefield } from '../data/types.js';
import type { MapMarker, ArmyMovement, MapViewState } from './types.js';

// ─── 도시 좌표 매핑 (% 기반) ─────────────────────────

const CITY_POSITIONS: Record<string, { x: number; y: number }> = {
  gangha:    { x: 75, y: 35 },
  hagu:      { x: 80, y: 60 },
  sishang:   { x: 85, y: 80 },
  nanjun:    { x: 50, y: 25 },
  jiangling: { x: 25, y: 20 },
};

const BATTLEFIELD_POSITIONS: Record<string, { x: number; y: number }> = {
  chibi: { x: 55, y: 55 },
};

// ─── StrategyMap 클래스 ──────────────────────────────

export class StrategyMap {
  private state: MapViewState;

  constructor() {
    this.state = {
      markers: [],
      movements: [],
      season: '가을',
      selectedMarkerId: null,
    };
  }

  /** 게임 상태로부터 맵 마커를 갱신한다. */
  updateFromGameState(gameState: GameState): void {
    const markers: MapMarker[] = [];

    // 도시 마커
    for (const city of gameState.cities) {
      const pos = CITY_POSITIONS[city.id];
      if (!pos) continue;

      markers.push({
        id: city.id,
        type: 'city',
        position: pos,
        faction: city.owner,
        label: city.name,
        state: this.getCityMarkerState(city, gameState),
      });
    }

    // 전투지역 마커
    for (const bf of gameState.battlefields) {
      const pos = BATTLEFIELD_POSITIONS[bf.id];
      if (!pos) continue;

      markers.push({
        id: bf.id,
        type: 'battlefield',
        position: pos,
        faction: null,
        label: bf.name,
        state: gameState.activeBattle?.location === bf.id ? 'battle' : 'normal',
      });
    }

    this.state.markers = markers;
    this.state.season = gameState.season;
  }

  /** 마커를 선택한다. */
  selectMarker(markerId: string | null): void {
    this.state.selectedMarkerId = markerId;
    for (const marker of this.state.markers) {
      if (marker.id === markerId) {
        marker.state = 'selected';
      } else if (marker.state === 'selected') {
        marker.state = 'normal';
      }
    }
  }

  /** 군대 이동 애니메이션을 추가한다. */
  addMovement(from: string, to: string, faction: FactionId): void {
    const fromPos = CITY_POSITIONS[from] ?? BATTLEFIELD_POSITIONS[from];
    const toPos = CITY_POSITIONS[to] ?? BATTLEFIELD_POSITIONS[to];
    if (!fromPos || !toPos) return;

    this.state.movements.push({
      from: fromPos,
      to: toPos,
      faction,
      isAnimating: true,
    });
  }

  /** 모든 이동 애니메이션을 완료 처리한다. */
  clearMovements(): void {
    this.state.movements = [];
  }

  /** 현재 맵 상태를 반환한다. */
  getState(): Readonly<MapViewState> {
    return this.state;
  }

  /** 계절에 따른 오버레이 에셋 경로를 반환한다. */
  getSeasonOverlayPath(): string | null {
    const season = this.state.season;
    if (season.includes('가을')) return 'assets/map/seasons/autumn-overlay.webp';
    if (season.includes('겨울')) return 'assets/map/seasons/winter-overlay.webp';
    if (season.includes('봄'))  return 'assets/map/seasons/spring-overlay.webp';
    return null;
  }

  /** 세력 색상을 반환한다. */
  getFactionColor(faction: FactionId | null): string {
    const colors: Record<FactionId, string> = {
      '유비': '#2d6a4f',
      '조조': '#1b1b3a',
      '손권': '#c9184a',
    };
    return faction ? colors[faction] : '#6c757d';
  }

  // ─── 내부 ─────────────────────────────────────────

  private getCityMarkerState(
    city: City,
    gameState: GameState,
  ): 'normal' | 'selected' | 'battle' | 'alert' {
    // 현재 전투 중인 도시
    if (gameState.activeBattle) {
      const battleAdj = gameState.battlefields.find(
        bf => bf.id === gameState.activeBattle!.location,
      );
      if (battleAdj?.adjacentCities.includes(city.id)) return 'alert';
    }
    return 'normal';
  }
}
