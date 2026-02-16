// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 결정적 RNG (Mulberry32)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 같은 seed → 항상 같은 난수열.
// 시뮬레이션 재현성을 위해 Math.random 대신 사용.

/**
 * Mulberry32 — 빠르고 간단한 32비트 PRNG.
 * 반환 값: [0, 1) 범위의 부동소수점.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
