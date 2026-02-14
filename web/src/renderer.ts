/** 간단한 DOM 헬퍼 유틸리티 */

/** Vite publicDir(assets/)는 루트에서 서빙. core 헬퍼가 'assets/...' 접두어로 리턴하므로 제거 */
export function assetUrl(corePath: string): string {
  return '/' + corePath.replace(/^assets\//, '');
}

/** 요소 생성 단축 함수 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'className') el.className = val;
      else if (key === 'textContent') el.textContent = val;
      else el.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  }
  return el;
}

/** querySelector 단축 */
export function $(selector: string, parent: Element | Document = document): Element | null {
  return parent.querySelector(selector);
}

/** 이미지 로드 (실패 시 fallback) */
export function createImg(
  src: string,
  alt: string,
  fallbackText?: string,
  fallbackColor?: string,
): HTMLElement {
  const wrapper = h('div', { className: 'img-wrapper' });

  const img = h('img', { src, alt });
  img.onerror = () => {
    wrapper.innerHTML = '';
    const fallback = h('div', { className: 'img-fallback' });
    fallback.style.backgroundColor = fallbackColor ?? '#4a4e69';
    fallback.textContent = fallbackText ?? alt;
    wrapper.appendChild(fallback);
  };
  wrapper.appendChild(img);
  return wrapper;
}

/** 게이지 바 생성 */
export function createGauge(
  value: number,
  max: number,
  color: string,
  label?: string,
): HTMLElement {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = h('div', { className: 'gauge' });
  bar.innerHTML = `
    <div class="gauge-fill" style="width:${pct}%;background:${color}"></div>
    ${label ? `<span class="gauge-label">${label}: ${value}/${max}</span>` : ''}
  `;
  return bar;
}

/** 타이핑 효과 */
export function typeText(
  el: HTMLElement,
  text: string,
  speed = 20,
): Promise<void> {
  return new Promise(resolve => {
    el.textContent = '';
    let i = 0;
    const timer = setInterval(() => {
      el.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        resolve();
      }
    }, speed);

    // 클릭으로 즉시 완료
    const skip = () => {
      clearInterval(timer);
      el.textContent = text;
      el.removeEventListener('click', skip);
      resolve();
    };
    el.addEventListener('click', skip);
  });
}
