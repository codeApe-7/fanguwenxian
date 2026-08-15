// 文案模板工具：占位符填充、旁白内关键信息高亮、世界纪年格式化。
//
// 设计约定（详见 docs/剧情引擎与文案设计.md）：
// - 文案数据里用 {key} 占位（如 {name}/{place}/{sect}），渲染时经 fill() 填充，
//   一套模板可覆盖全境界/全剧本，不必为每档重写。
// - 文案数据里用 «…» 标记关键信息（时间窗、境界条件、数量），
//   仅用于 io.narrate 的旁白：旁白整行青色，« » 内切黄色后再切回青色。
//   菜单/print 文本不要用 « »，直接用 colors.ts。

import { ERA, START_YEAR } from '../content/world.js';
import type { Player, GameState } from '../types.js';
import type { GameIO } from '../io.js';
import { magenta, dim } from '../colors.js';

/** 旁白高亮：黄色显示后恢复旁白青色（非 TTY 退回纯文本）。 */
function hl(text: string): string {
  if (!process.stdout.isTTY) return text;
  return `\x1b[33m${text}\x1b[36m`;
}

/**
 * 填充文案模板：{key} 由 ctx 提供，«…» 转旁白高亮。
 * 未提供的 {key} 原样保留（便于测试发现漏配）。
 */
export function fill(tpl: string, ctx: Record<string, string | number> = {}): string {
  let out = tpl.replace(/\{(\w+)\}/g, (m, key: string) => {
    const v = ctx[key];
    return v === undefined ? m : String(v);
  });
  out = out.replace(/«([^»]*)»/g, (_, inner: string) => hl(inner));
  return out;
}

/** 世界纪年显示：「玄启107年」。 */
export function eraYear(year: number): string {
  return `${ERA}${year}年`;
}

/** 由玩家年龄推出世界纪年（开局 16 岁 = 玄启起始年）。 */
export function yearOfAge(age: number): number {
  return START_YEAR + (age - 16);
}

/** 记一笔人生大事（立传素材）：「玄启121年（35岁）· 某事」。 */
export function addBio(p: Player, text: string): void {
  p.biography ??= [];
  p.biography.push(`${eraYear(yearOfAge(p.age))}（${p.age}岁）· ${text}`);
}

/** 人生大事记（立传）：逐年记下的高光与错过。 */
export function printBiography(state: GameState, io: GameIO): void {
  const bio = state.player.biography ?? [];
  io.print(magenta('═══ 人生大事记 ═══'));
  if (bio.length === 0) {
    io.print(dim('尚无大事可记。机缘与抉择，都会留在这里。'));
    return;
  }
  for (const line of bio) io.print('  ' + line);
  io.print(dim(`—— 共 ${bio.length} 笔 ——`));
}
