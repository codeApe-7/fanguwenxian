// 坊市交易。

import type { GameIO } from '../io.js';
import type { Player } from '../types.js';
import { PILLS, TREASURES, TECHNIQUES, MATERIALS, learnTechnique, techniqueSummary } from '../content.js';
import type { PillType } from '../content.js';
import { green, red, yellow, cyan } from '../colors.js';

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
    io.print(' 1) 购买丹药   2) 购买法宝   3) 购买功法   4) 出售材料   5) 离开');
    const ch = await io.ask('选择：', ['1', '2', '3', '4', '5'], '5');
    if (ch === '1') await shopPills(p, io);
    else if (ch === '2') await shopTreasures(p, io);
    else if (ch === '3') await shopTechniques(p, io);
    else if (ch === '4') await sellMaterials(p, io);
    else return;
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
    items.forEach(([name, def], i) => io.print(` ${i + 1}) ${name}（攻+${def.atk} 防+${def.def}，${def.price} 灵石）`));
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
