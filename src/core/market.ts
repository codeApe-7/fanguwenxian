// 坊市交易。

import type { GameIO } from '../io.js';
import type { Player } from '../types.js';
import { PILLS, TREASURES, TECHNIQUES, MATERIALS, SPELLS, SPELL_TIER_NAMES, ABODES, learnTechnique, learnSpell, techniqueSummary, treasureSummary, abodeOf } from '../content.js';
import type { PillType } from '../content.js';
import { green, red, yellow, cyan, dim } from '../colors.js';

const PILL_TAG: Record<PillType, string> = { xiu: '修为', heal: '疗伤', break: '突破', detox: '解毒' };

const TECH_PRICES: Record<string, number> = {
  基础吐纳术: 0,
  青灵诀: 200,
  玄霜诀: 500,
  紫薇心经: 1500,
  九转玄元功: 5000,
  太上忘尘经: 15000,
  金刚淬体功: 800,
  铁骨功: 1000,
  龟息诀: 1200,
  养生诀: 600,
  御风诀: 250,
  烈阳掌: 300,
  玄冥劲: 300,
  狂雷劲: 450,
  磐石功: 600,
  洗髓经: 900,
  玄龟甲功: 700,
  延寿经: 1500,
  回春功: 800,
  青囊诀: 1000,
  凝神诀: 400,
  五禽戏: 350,
  庚金诀: 350,
  乙木经: 350,
  离火诀: 400,
  碧波心法: 350,
  厚土功: 380,
  清音诀: 400,
  天籁真经: 1200,
  傀儡真解: 450,
  万傀大法: 1300,
  御兽心经: 400,
  万兽诀: 1100,
  万毒真经: 800,
  蛊心诀: 1400,
  纯阳诀: 550,
  太阴炼神诀: 600,
};

export async function market(p: Player, io: GameIO): Promise<void> {
  while (true) {
    await io.clear();
    io.print(yellow(`═══ 坊市 ═══    你的灵石：${p.spirit}`));
    io.print(' 1) 购买丹药   2) 购买法宝   3) 购买功法');
    io.print(' 4) 神通玉简   5) 洞府地契   6) 出售材料   7) 离开');
    const ch = await io.ask('选择：', ['1', '2', '3', '4', '5', '6', '7'], '7');
    if (ch === '1') await shopPills(p, io);
    else if (ch === '2') await shopTreasures(p, io);
    else if (ch === '3') await shopTechniques(p, io);
    else if (ch === '4') await shopSpells(p, io);
    else if (ch === '5') await shopAbodes(p, io);
    else if (ch === '6') await sellMaterials(p, io);
    else return;
  }
}

/**
 * 神通玉简：给灵石一个真正的去处，也让玩家能主动配流派。
 * 宗门专属的几式不在此出售——那要去各宗藏经阁拿贡献换。
 */
async function shopSpells(p: Player, io: GameIO): Promise<void> {
  const items = Object.keys(SPELLS).filter((n) => SPELLS[n].price && !SPELLS[n].sect);
  while (true) {
    io.print(cyan('—— 神通玉简 ——'));
    io.print(dim('  五行相生为【连击】，相克则伤害大增——配一套能接得上的，比堆一堆高阶更管用。'));
    items.forEach((n, i) => {
      const d = SPELLS[n];
      const own = (p.spells ?? []).includes(n) ? green('（已习得）') : '';
      io.print(` ${i + 1}) ${d.element}·${n}${dim(`（${SPELL_TIER_NAMES[d.tier]}，耗气 ${d.cost}）`)} ${d.price} 灵石${own}`);
      io.print(dim(`    ${d.desc}`));
    });
    io.print(` 0) 返回    灵石：${p.spirit}`);
    const ch = await io.ask('购买编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const name = items[idx - 1];
    if ((p.spells ?? []).includes(name)) {
      io.print(yellow('你已习得此式。'));
      continue;
    }
    const price = SPELLS[name].price!;
    if (p.spirit < price) {
      io.print(red('灵石不足。'));
      continue;
    }
    p.spirit -= price;
    learnSpell(p, name);
    io.print(green(`你购得《${name}》玉简，神识一探，此式已入胸中（可在「闭关·参悟神通」中加深）。`));
  }
}

/** 洞府地契：修炼快慢主要不看你是谁，看你在哪修。 */
async function shopAbodes(p: Player, io: GameIO): Promise<void> {
  const items = ABODES.filter((a) => a.price);
  while (true) {
    const cur = abodeOf(p.abode ?? '山中茅舍');
    io.print(cyan('—— 洞府地契 ——'));
    io.print(`当前：${cyan(cur.name)}（闭关 ×${(cur.speed / 100).toFixed(2)}）`);
    items.forEach((a, i) => {
      const tag = a.speed <= cur.speed ? dim('（不如现居）') : green(`（闭关 ×${(a.speed / 100).toFixed(2)}）`);
      io.print(` ${i + 1}) ${a.name}${tag} ${a.price} 灵石`);
      io.print(dim(`    ${a.desc}`));
    });
    io.print(` 0) 返回    灵石：${p.spirit}`);
    const ch = await io.ask('购买编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const a = items[idx - 1];
    if (a.speed <= cur.speed) {
      io.print(yellow('此处灵气还不如你现居之地，买它做什么。'));
      continue;
    }
    if (p.spirit < a.price!) {
      io.print(red('灵石不足。'));
      continue;
    }
    p.spirit -= a.price!;
    p.abode = a.name;
    io.print(green(`地契过手。自此你在${a.name}闭关，效率 ×${(a.speed / 100).toFixed(2)}。`));
  }
}

async function shopPills(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(PILLS);
  while (true) {
    io.print(cyan('—— 丹药 ——'));
    items.forEach(([name, def], i) => io.print(` ${i + 1}) ${name}（${PILL_TAG[def.type]}，${def.price} 灵石）`));
    io.print(` 0) 返回    灵石：${p.spirit}`);
    const ch = await io.ask('购买编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, def] = items[idx - 1];
    if (p.spirit < def.price) {
      io.print(red('灵石不足。'));
      continue;
    }
    p.spirit -= def.price;
    p.pills[name] = (p.pills[name] ?? 0) + 1;
    io.print(green(`购得 ${name}×1。`));
  }
}

async function shopTreasures(p: Player, io: GameIO): Promise<void> {
  const items = Object.entries(TREASURES);
  while (true) {
    io.print(cyan('—— 法宝 ——'));
    items.forEach(([name, def], i) => io.print(` ${i + 1}) ${name}（${treasureSummary(name)}，${def.price} 灵石）`));
    io.print(` 0) 返回    灵石：${p.spirit}`);
    const ch = await io.ask('购买编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, def] = items[idx - 1];
    if (p.spirit < def.price) {
      io.print(red('灵石不足。'));
      continue;
    }
    p.spirit -= def.price;
    p.treasure = name;
    io.print(green(`购得法宝 ${name}！`));
  }
}

async function shopTechniques(p: Player, io: GameIO): Promise<void> {
  // 镇宗功法不在此出售（仅各宗藏经阁）；仙品不售（仅残篇/奇遇）
  const items = Object.entries(TECHNIQUES).filter(([, d]) => !d.sect && d.tier !== 3);
  while (true) {
    io.print(cyan('—— 功法 ——'));
    items.forEach(([name], i) => {
      const mark = name === p.technique ? '（当前）' : '';
      io.print(` ${i + 1}) ${name}（${techniqueSummary(name)}，${TECH_PRICES[name]} 灵石）${mark}`);
    });
    io.print(` 0) 返回    灵石：${p.spirit}`);
    const ch = await io.ask('购买编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const name = items[idx - 1][0];
    if (name === p.technique) {
      io.print(yellow('你已修炼此功法。'));
      continue;
    }
    const price = TECH_PRICES[name];
    if (p.spirit < price) {
      io.print(red('灵石不足。'));
      continue;
    }
    p.spirit -= price;
    learnTechnique(p, name);
    io.print(green(`你购得 ${name}！（可在「闭关·切换主修」中启用）`));
  }
}

async function sellMaterials(p: Player, io: GameIO): Promise<void> {
  while (true) {
    io.print(cyan('—— 出售材料 ——'));
    const have = Object.entries(MATERIALS).filter(([name]) => (p.materials[name] ?? 0) > 0);
    if (have.length === 0) {
      io.print('你没有可出售的材料。');
      await io.pause();
      return;
    }
    have.forEach(([name, price], i) => io.print(` ${i + 1}) ${name}×${p.materials[name]}（${price} 灵石/个）`));
    io.print(' 0) 返回');
    const ch = await io.ask('出售编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > have.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, price] = have[idx - 1];
    p.materials[name] -= 1;
    p.spirit += price;
    io.print(green(`售出 ${name}×1，得 ${price} 灵石。`));
  }
}
