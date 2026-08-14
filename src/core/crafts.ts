// 四艺副业：炼丹、炼器、阵法、符箓（均需机缘解锁后由技艺菜单进入）。

import type { GameIO } from '../io.js';
import type { Player } from '../types.js';
import { RECIPES, FORGE_RECIPES, FORMATIONS, TALISMANS, sectOf, sectPower } from '../content.js';
import { green, red, yellow } from '../colors.js';
import { chance } from './rng.js';

/** 四艺成功率（宗门加成：丹霞谷/天工坊/万符门 +10%，随职阶放大）。 */
function craftRate(p: Player, skill: string, base: number): number {
  const s = sectOf(p);
  return s?.skill === skill ? base + (s.craftBonus ?? 0) * sectPower(p) : base;
}

/** 宗门特质：四艺失败退还半数材料（丹霞谷/天工坊/万符门）。返回是否退还。 */
function refundOnFail(p: Player, recipe: Record<string, number>): boolean {
  if (sectOf(p)?.traitKey !== 'craftRefund') return false;
  for (const [m, n] of Object.entries(recipe)) {
    p.materials[m] = (p.materials[m] ?? 0) + Math.ceil(n / 2);
  }
  return true;
}

/** 炼丹：材料 -> 丹药。 */
export async function alchemy(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(RECIPES);
  while (true) {
    await io.clear();
    io.print(yellow(`═══ 丹房 ═══    灵石：${p.spirit}`));
    io.print('可炼丹药：');
    items.forEach(([name, recipe], i) => {
      const need = Object.entries(recipe).map(([m, n]) => `${m}×${n}`).join(' ');
      io.print(` ${i + 1}) ${name}（需 ${need}）`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('炼丹编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, recipe] = items[idx - 1];
    if (Object.entries(recipe).some(([m, n]) => (p.materials[m] ?? 0) < n)) {
      io.print(red('材料不足。'));
      await io.pause();
      continue;
    }
    for (const [m, n] of Object.entries(recipe)) p.materials[m] -= n;
    if (chance(craftRate(p, '炼丹', 0.85))) {
      p.pills[name] = (p.pills[name] ?? 0) + 1;
      io.print(green(`炼丹成功，获得 ${name}×1！`));
    } else {
      const refunded = refundOnFail(p, recipe);
      io.print(red(refunded ? '丹炉炸了……幸得宗门秘法护持，挽回半数材料。' : '丹炉炸了，材料尽毁……'));
    }
    await io.pause();
  }
}

/** 炼器：材料 -> 法宝。 */
export async function forge(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(FORGE_RECIPES);
  while (true) {
    await io.clear();
    io.print(yellow(`═══ 炼器炉 ═══    灵石：${p.spirit}`));
    io.print('可炼法宝：');
    items.forEach(([name, recipe], i) => {
      const need = Object.entries(recipe).map(([m, n]) => `${m}×${n}`).join(' ');
      io.print(` ${i + 1}) ${name}（需 ${need}）`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('炼器编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, recipe] = items[idx - 1];
    if (Object.entries(recipe).some(([m, n]) => (p.materials[m] ?? 0) < n)) {
      io.print(red('材料不足。'));
      await io.pause();
      continue;
    }
    for (const [m, n] of Object.entries(recipe)) p.materials[m] -= n;
    if (chance(craftRate(p, '炼器', 0.8))) {
      p.treasure = name;
      io.print(green(`炼器成功，获得法宝 ${name}！`));
    } else {
      const refunded = refundOnFail(p, recipe);
      io.print(red(refunded ? '炼器失败……幸得宗门秘法护持，挽回半数材料。' : '炼器失败，材料尽毁……'));
    }
    await io.pause();
  }
}

/** 阵法：消耗材料布阵，获得被动加成（攻击/防御/修炼）。 */
export async function formation(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(FORMATIONS);
  while (true) {
    await io.clear();
    io.print(yellow(`═══ 阵法 ═══    当前阵法：${p.formation}`));
    items.forEach(([name, def], i) => {
      const need = Object.entries(def.cost).map(([m, n]) => `${m}×${n}`).join(' ');
      const mark = name === p.formation ? '（已布）' : '';
      io.print(` ${i + 1}) ${name}（需 ${need}，${def.desc}）${mark}`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('布阵编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, def] = items[idx - 1];
    if (name === p.formation) {
      io.print(yellow('你已布下此阵。'));
      continue;
    }
    if (Object.entries(def.cost).some(([m, n]) => (p.materials[m] ?? 0) < n)) {
      io.print(red('材料不足。'));
      await io.pause();
      continue;
    }
    for (const [m, n] of Object.entries(def.cost)) p.materials[m] -= n;
    p.formation = name;
    io.print(green(`你布下 ${name}（${def.desc}）！`));
    await io.pause();
  }
}

/** 符箓：材料 -> 一次性符箓（攻击/护身/聚灵）。 */
export async function talisman(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(TALISMANS);
  while (true) {
    await io.clear();
    io.print(yellow(`═══ 符箓 ═══    灵石：${p.spirit}`));
    io.print('可制符箓：');
    items.forEach(([name, def], i) => {
      const need = Object.entries(def.cost).map(([m, n]) => `${m}×${n}`).join(' ');
      io.print(` ${i + 1}) ${name}（需 ${need}，${def.desc}，持有 ${p.talismans[name] ?? 0}）`);
    });
    io.print(' 0) 返回');
    const ch = await io.ask('制符编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, def] = items[idx - 1];
    if (Object.entries(def.cost).some(([m, n]) => (p.materials[m] ?? 0) < n)) {
      io.print(red('材料不足。'));
      await io.pause();
      continue;
    }
    for (const [m, n] of Object.entries(def.cost)) p.materials[m] -= n;
    if (chance(craftRate(p, '符箓', 0.85))) {
      p.talismans[name] = (p.talismans[name] ?? 0) + 1;
      io.print(green(`制符成功，获得 ${name}×1！`));
    } else {
      const refunded = refundOnFail(p, def.cost);
      io.print(red(refunded ? '符纸烧毁……幸得宗门秘法护持，挽回半数材料。' : '符纸烧毁，材料尽毁……'));
    }
    await io.pause();
  }
}
