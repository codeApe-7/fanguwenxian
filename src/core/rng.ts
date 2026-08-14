// 随机数工具（纯函数）。

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randint(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

/** 加权随机选取，items 为 [项, 权重] 列表，返回被选中的项。 */
export function weightedChoice<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
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
