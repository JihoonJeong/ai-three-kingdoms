import { h, assetUrl } from '../renderer.js';
import { t } from '../../../core/i18n/index.js';
import { StrategyMap } from '../../../core/ui/strategy-map.js';
import type { GameState, FactionId } from '../../../core/data/types.js';

export class MapScreen {
  private container: HTMLElement | null = null;
  private strategyMap = new StrategyMap();
  private onCitySelectCb: ((cityId: string) => void) | null = null;

  onCitySelect(cb: (cityId: string) => void): void {
    this.onCitySelectCb = cb;
  }

  render(container: HTMLElement, state: GameState): void {
    this.container = container;
    container.innerHTML = '';
    this.strategyMap.updateFromGameState(state);

    const wrapper = h('div', { className: 'map-wrapper' });
    wrapper.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';

    // Map background
    const bg = h('img') as HTMLImageElement;
    bg.src = assetUrl('assets/map/background.webp');
    bg.alt = t('전략 맵');
    bg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    bg.onerror = () => {
      wrapper.style.background = 'linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)';
      bg.remove();
    };
    wrapper.appendChild(bg);

    // SVG overlay
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

    const mapState = this.strategyMap.getState();

    for (const marker of mapState.markers) {
      const g = document.createElementNS(svgNS, 'g');
      g.style.cursor = 'pointer';

      const color = this.strategyMap.getFactionColor(marker.faction as FactionId | null);

      if (marker.type === 'city') {
        // Pulsing circle for city
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', String(marker.position.x));
        circle.setAttribute('cy', String(marker.position.y));
        circle.setAttribute('r', '2.5');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#d4a017');
        circle.setAttribute('stroke-width', '0.3');

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', String(marker.position.x));
        label.setAttribute('y', String(marker.position.y + 5));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#f5f0e8');
        label.setAttribute('font-size', '2.8');
        label.setAttribute('font-family', "'Noto Serif KR', serif");
        label.setAttribute('stroke', '#1a1a2e');
        label.setAttribute('stroke-width', '0.4');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = t(marker.label);

        g.append(circle, label);
        g.addEventListener('click', () => this.onCitySelectCb?.(marker.id));

      } else if (marker.type === 'battlefield') {
        const cx = marker.position.x, cy = marker.position.y;
        const diamond = document.createElementNS(svgNS, 'polygon');
        diamond.setAttribute('points',
          `${cx},${cy - 3} ${cx + 2.5},${cy} ${cx},${cy + 3} ${cx - 2.5},${cy}`);
        diamond.setAttribute('fill', '#8b0000');
        diamond.setAttribute('stroke', '#d4a017');
        diamond.setAttribute('stroke-width', '0.3');

        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', String(cx));
        label.setAttribute('y', String(cy + 6));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#d4a017');
        label.setAttribute('font-size', '2.8');
        label.setAttribute('font-family', "'Noto Serif KR', serif");
        label.setAttribute('stroke', '#1a1a2e');
        label.setAttribute('stroke-width', '0.4');
        label.setAttribute('paint-order', 'stroke');
        label.textContent = t(marker.label);

        g.append(diamond, label);
      }

      svg.appendChild(g);
    }

    wrapper.appendChild(svg);
    container.appendChild(wrapper);
  }

  update(state: GameState): void {
    if (this.container) this.render(this.container, state);
  }
}
