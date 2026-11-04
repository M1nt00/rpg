/** 시드 고정 가능한 난수 (mulberry32). 상태를 숫자 하나로 들고 다녀서 저장·테스트가 쉽다. */
export interface Rng {
  seed: number;
}

export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0): Rng {
  return { seed: seed >>> 0 };
}

export function next(r: Rng): number {
  r.seed = (r.seed + 0x6d2b79f5) >>> 0;
  let t = r.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function range(r: Rng, min: number, max: number): number {
  return min + next(r) * (max - min);
}

export function int(r: Rng, min: number, maxInclusive: number): number {
  return Math.floor(range(r, min, maxInclusive + 1));
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: Rng, list: readonly T[]): T {
  return list[Math.floor(next(r) * list.length)];
}

export function weighted<T>(r: Rng, list: readonly T[], weight: (t: T) => number): T | undefined {
  const total = list.reduce((s, x) => s + Math.max(0, weight(x)), 0);
  if (total <= 0) return undefined;
  let roll = next(r) * total;
  for (const x of list) {
    roll -= Math.max(0, weight(x));
    if (roll < 0) return x;
  }
  return list[list.length - 1];
}
