// 随机数工具（纯函数）。
//
// 缺省用 Math.random()；调 seedRng() 后换成确定性的 mulberry32。
// 平衡断言（胜率蒙特卡洛、渡劫存活率）本质是在采样一个分布，
// 不定种子就会偶发假红——同一份代码跑三遍，两遍绿一遍红，
// 于是没人再认真看失败信息。测试固定种子，游戏本体照旧随机。

let rand: () => number = Math.random;

/** 固定随机种子，令后续所有随机可复现；传 null 恢复真随机。 */
export function seedRng(seed: number | null): void {
  if (seed === null) {
    rand = Math.random;
    return;
  }
  let s = seed >>> 0;
  rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 取当前随机源（内部使用）。 */
export function random(): number {
  return rand();
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function randint(a: number, b: number): number {
  return a + Math.floor(rand() * (b - a + 1));
}

export function chance(p: number): boolean {
  return rand() < p;
}

/** 加权随机选取，items 为 [项, 权重] 列表，返回被选中的项。 */
export function weightedChoice<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

/** 加权随机选取，items 为 [名称, 权重] 列表，返回名称。 */
export function weightedPick(items: ReadonlyArray<readonly [string, number]>): string {
  return weightedChoice(items);
}

/** 洗牌（返回新数组，不改原数组）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
