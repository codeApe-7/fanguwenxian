// 修炼、突破、渡劫飞升、服用丹药。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead, GameState } from '../types.js';
import { REALMS, ROOTS, TECHNIQUES, PILLS, FORMATIONS, TALISMANS, sectOf, sectPower, techPower, learnTechnique, FRAGMENT_NEED, toxinPenalty, playerTitle } from '../content.js';
import { green, red, yellow, cyan, dim, magenta } from '../colors.js';
import { chance, randint } from './rng.js';

/** 闭关修炼一年，返回本年度修为增长。 */
export function cultivate(p: Player): number {
  const diff = REALMS[p.realmIdx].difficulty;
  let gain = 10 * p.rootMult * (TECHNIQUES[p.technique]?.mult ?? 1) * diff * p.cheatBonus;
  gain *= techPower(p); // 功法熟练度加成
  const cultPct = sectOf(p)?.cultPct ?? 0; // 血煞魔宗/太虚阵宗等修炼加成
  gain *= 1 + (cultPct > 0 ? cultPct * sectPower(p) : cultPct);
  gain *= FORMATIONS[p.formation]?.cult ?? 1.0; // 聚灵阵等阵法加成
  if (p.daoCompanion) {
    let bonus = sectOf(p)?.dualBonus ?? 0.2; // 合欢宗双修加成
    if (bonus > 0.2) bonus *= sectPower(p);
    gain *= 1 + bonus;
  }
  // 聚灵符自动消耗
  if ((p.talismans['聚灵符'] ?? 0) > 0) {
    p.talismans['聚灵符'] -= 1;
    gain += TALISMANS['聚灵符'].value;
  }
  gain *= toxinPenalty(p); // 丹毒影响修炼效率
  gain = Math.max(1, gain);
  p.cultivation = Math.min(100, p.cultivation + gain);
  // 修行中打磨功法熟练度
  const prof = Math.min(100, (p.techProficiency[p.technique] ?? 0) + randint(2, 5));
  p.techProficiency[p.technique] = prof;
  return gain;
}

/** 参悟残篇：集齐补全功法 / 无名残篇提升当前功法熟练度。返回是否消耗时间。 */
export async function comprehendFragments(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const have = Object.entries(p.fragments).filter(([, n]) => n > 0);
  if (have.length === 0) {
    io.print(red('你手中没有残篇。游历、战斗或奇遇中可得。'));
    return false;
  }
  while (true) {
    io.print(cyan('—— 参悟残篇 ——'));
    have.forEach(([name, n], i) => {
      if (name === '无名残篇') {
        io.print(` ${i + 1}) 无名残篇×${n}（参悟：当前功法熟练度 +10）`);
      } else {
        const lack = FRAGMENT_NEED - n;
        io.print(` ${i + 1}) 《${name}》残篇×${n}（集齐 ${FRAGMENT_NEED} 篇可补全功法${lack > 0 ? `，还差 ${lack} 篇` : '，已齐'}）`);
      }
    });
    io.print(' 0) 返回');
    const ch = await io.ask('参悟编号：');
    if (ch === '0' || ch === '') return false;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > have.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name] = have[idx - 1];
    if (name === '无名残篇') {
      p.fragments['无名残篇'] -= 1;
      const prof = Math.min(100, (p.techProficiency[p.technique] ?? 0) + 10);
      p.techProficiency[p.technique] = prof;
      await io.narrate(green(`你参悟无名残篇，于《${p.technique}》上有所精进（熟练度 ${prof}/100）。`));
      return true;
    }
    const count = p.fragments[name] ?? 0;
    if (count < FRAGMENT_NEED) {
      io.print(yellow(`残篇未齐（${count}/${FRAGMENT_NEED}），还差 ${FRAGMENT_NEED - count} 篇。`));
      continue;
    }
    p.fragments[name] = count - FRAGMENT_NEED;
    if (p.technique === name) {
      const prof = Math.min(100, (p.techProficiency[name] ?? 0) + 20);
      p.techProficiency[name] = prof;
      await io.narrate(green(`你参悟《${name}》残篇，功法更精，熟练度 +20（${prof}/100）。`));
    } else {
      learnTechnique(p, name);
      p.techProficiency[name] = 30; // 补全即小成
      await io.narrate(green(`你参悟《${name}》残篇，补全整部功法（熟练度 30，小成）！可于「闭关·切换主修」中启用。`));
    }
    return true;
  }
}

function successRate(p: Player, big: boolean): number {
  let base = big ? 0.5 : 0.85;
  // 灵根越好成功率越高：天灵根(0) +0.10 … 五灵根(5) -0.15
  const idx = ROOTS.findIndex((r) => r.name === p.root);
  base += (2 - idx) * 0.05;
  base += (p.heart - 50) / 500;
  const bb = sectOf(p)?.breakBonus ?? 0; // 玄清门 +10%、血煞魔宗 −5%
  base += bb > 0 ? bb * sectPower(p) : bb;
  if (p.daoCompanion) base += 0.05;
  if ((p.pillToxin ?? 0) >= 60) base -= 0.05; // 丹毒过深，突破更险
  return Math.max(0.05, Math.min(0.95, base));
}

const REALM_STORIES: Record<number, string> = {
  1: '筑基已成，你终于褪去凡胎，正式踏入仙途，宗门上下为之侧目。',
  2: '一粒金丹吞入腹，始知我命由我不由天。结丹之境，寿五百载。',
  3: '元婴出窍，遨游太虚。此境之后，方称得上“真君”二字。',
  4: '化神之上，神游万里，凡俗种种皆如过眼云烟。',
  5: '炼虚合道，你已臻此界绝顶，隐隐触摸到天地法则。',
  6: '合体之境，肉身与元神合一，举手投足间可撼山岳。',
  7: '大乘圆满，只差临门一脚，便可冲击那传说中的渡劫之境。',
  8: '渡劫期！天劫将至，九死一生，成则飞升，败则魂飞魄散！',
};

async function realmStory(p: Player, io: GameIO): Promise<void> {
  const story = REALM_STORIES[p.realmIdx];
  if (story) {
    await io.narrate(story);
  }
}

/** 尝试突破，返回是否成功。 */
export async function breakthrough(p: Player, leads: FemaleLead[], io: GameIO): Promise<boolean> {
  const big = p.stageIdx === REALMS[p.realmIdx].stages.length - 1;
  const pillName = REALMS[p.realmIdx].breakPill;
  let rate = successRate(p, big);

  if (big && pillName) {
    if ((p.pills[pillName] ?? 0) > 0) {
      const use = await io.ask(`是否服用 ${yellow(pillName)} 辅助突破？(y/n，当前 ${p.pills[pillName]} 枚)`, ['y', 'n'], 'y');
      if (use === 'y') {
        p.pills[pillName] -= 1;
        rate += 0.3;
      }
    } else {
      await io.narrate(`突破${playerTitle(p)}需 ${pillName} 辅助，你手中并无此丹，成功率大减……`);
      rate -= 0.2;
    }
  }

  await io.narrate(`你盘膝而坐，凝神聚气，冲击 ${green(playerTitle(p))} 的瓶颈……`);
  await io.narrate(`突破成功率：${yellow(`${(rate * 100).toFixed(0)}%`)}`);

  if (chance(rate)) {
    await io.narrate(green('轰！体内气机畅通，境界壁垒应声而破！'));
    if (big) {
      p.realmIdx += 1;
      p.stageIdx = 0;
      p.lifespan = REALMS[p.realmIdx].lifespan;
      await io.narrate(`你成功突破至 ${green(REALMS[p.realmIdx].name)}！寿元延至 ${p.lifespan} 岁。`);
      await realmStory(p, io);
    } else {
      p.stageIdx += 1;
      await io.narrate(`你晋升至 ${green(playerTitle(p))}。`);
    }
    p.cultivation = 0;
    p.heart = Math.min(100, p.heart + 5);
    return true;
  } else {
    await io.narrate(red('灵气紊乱，心魔陡生！突破失败……'));
    const resist = sectOf(p)?.demonResist ?? false; // 净禅寺心魔抗性
    const lossHalf = sectOf(p)?.traitKey === 'breakLossHalf'; // 玄清门道基稳固
    const cultLoss = lossHalf ? Math.floor((big ? 50 : 30) / 2) : big ? 50 : 30;
    p.cultivation = Math.max(0, p.cultivation - cultLoss);
    p.heart = Math.max(0, p.heart - (resist ? 5 : 10));
    if (!resist && chance(0.3)) {
      await io.narrate(red('走火入魔！你遭受重创，寿元折损！'));
      p.lifespan -= randint(5, 15);
    }
    return false;
  }
}

/** 服用丹药：分类展示全部丹药（修为丹可服，疗伤丹战斗用，突破丹突破时用，净元丹清丹毒）。 */
export async function takePill(p: Player, io: GameIO): Promise<void> {
  const xiu = ['凝气丹', '聚灵丹'];
  const detox = ['净元丹'];
  const heal = ['疗伤丹', '回春丹'];
  const brk = ['筑基丹', '结丹丹', '婴变丹', '化神丹', '炼虚丹', '合体丹', '大乘丹', '渡劫丹'];
  const ownedAll = [...xiu, ...detox, ...heal, ...brk].filter((n) => (p.pills[n] ?? 0) > 0);
  if (ownedAll.length === 0) {
    io.print(red('你身上没有任何丹药。'));
    return;
  }
  io.print('—— 丹药 ——');
  ownedAll.forEach((n) => {
    const def = PILLS[n];
    const note = def.type === 'xiu' ? '' : def.type === 'detox' ? dim('（清除丹毒）') : def.type === 'heal' ? dim('（战斗中使用）') : dim('（突破时使用）');
    io.print(` ${n}×${p.pills[n]}${note}`);
  });
  const toxin = p.pillToxin ?? 0;
  if (toxin > 0) {
    const pen = toxinPenalty(p);
    const note = pen >= 1 ? dim('（无碍）') : pen >= 0.9 ? yellow('（修炼 −10%）') : pen >= 0.75 ? yellow('（修炼 −25%）') : red('（修炼 −50%！）');
    io.print(`丹毒：${toxin}/100${note}（每年自然消解 2，净元丹可清 30）`);
  }
  const selectable = [...xiu, ...detox].filter((n) => (p.pills[n] ?? 0) > 0);
  if (selectable.length === 0) {
    io.print(yellow('你暂无可直接服用的丹药。'));
    return;
  }
  while (true) {
    io.print('服用：');
    selectable.forEach((n, i) => {
      if (PILLS[n].type === 'detox') {
        io.print(` ${i + 1}) ${n}×${p.pills[n]}（清除丹毒 ${PILLS[n].value}）`);
      } else {
        const val = Math.round(PILLS[n].value * (1 + p.realmIdx * 0.3));
        const t = Math.max(1, Math.round(val * 0.2));
        io.print(` ${i + 1}) ${n}×${p.pills[n]}（修为+${val}，丹毒+${t}）`);
      }
    });
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > selectable.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const name = selectable[idx - 1];
    const def = PILLS[name];
    if (def.type === 'detox') {
      p.pills[name] -= 1;
      p.pillToxin = Math.max(0, (p.pillToxin ?? 0) - def.value);
      io.print(green(`服下 ${name}，丹毒清除 ${def.value}（剩 ${p.pillToxin}）。`));
      return;
    }
    const val = Math.round(def.value * (1 + p.realmIdx * 0.3));
    const t = Math.max(1, Math.round(val * 0.2));
    p.pills[name] -= 1;
    p.cultivation = Math.min(100, p.cultivation + val);
    p.pillToxin = Math.min(100, (p.pillToxin ?? 0) + t);
    io.print(green(`服下 ${name}，修为 +${val}，丹毒 +${t}。`));
    if (p.cultivation >= 100) io.print(yellow('修为已臻圆满，可尝试突破境界。'));
    if ((p.pillToxin ?? 0) >= 30) io.print(yellow(`丹毒已深（${p.pillToxin}/100），修炼效率下降，慎服。`));
    return;
  }
}

/** 渡劫飞升结局，返回是否成仙。 */
export async function ascend(p: Player, leads: FemaleLead[], io: GameIO): Promise<boolean> {
  await io.clear();
  await io.narrate('渡劫期大圆满，九天之上，雷云翻涌。');
  await io.narrate('你立于孤峰之巅，直面那传说中的九重天劫。');
  const hasPill = (p.pills['渡劫丹'] ?? 0) > 0;
  // 全部道侣（含旧档仅存的 daoCompanion 名）
  const daoNames = leads.filter((l) => l.dao).map((l) => l.name);
  if (p.daoCompanion && !daoNames.includes(p.daoCompanion)) daoNames.push(p.daoCompanion);
  const hasCompanion = daoNames.length > 0;
  if (hasPill) {
    await io.narrate(green('你服下渡劫丹，气机暴涨，硬撼天劫！'));
    p.pills['渡劫丹'] -= 1;
  }
  if (hasCompanion) {
    await io.narrate(magenta(`你的道侣 ${daoNames.join('、')} 执手相随，与你并肩立于雷云之下。`));
    await io.narrate('「生同衾，死同穴。」她们与你掌心相抵，共抗天劫。');
  }
  const rate = 0.7 + (hasCompanion ? 0.1 : 0);
  if (hasPill || chance(rate)) {
    await io.narrate('九重雷劫，一重强过一重，你遍体鳞伤，却始终屹立不倒！');
    await io.narrate(yellow('最后一重雷劫落下，天地失色……'));
    await io.narrate(green('你终于挺了过来，肉身成圣，霞光万道，天门大开！'));
    if (hasCompanion) {
      io.print(magenta('═'.repeat(46)));
      io.print(magenta(`   神仙眷侣！${p.name} 与 ${daoNames.join('、')} 携手飞升，`));
      io.print(magenta('   自此比翼九霄，双宿双飞，成仙作祖！'));
      io.print(magenta('═'.repeat(46)));
    } else {
      io.print(green('═'.repeat(46)));
      io.print(green(`   恭喜！${p.name} 历经 ${p.age} 载，渡劫飞升，`));
      io.print(green('   自此逍遥九天，成仙作祖！'));
      io.print(green('═'.repeat(46)));
    }
    return true;
  } else {
    await io.narrate(red('天劫之下，你终究没能撑过去，形神俱灭……'));
    io.print(red('═'.repeat(46)));
    io.print(red(`   游戏结束：${p.name}，享年 ${p.age} 岁，渡劫失败，形神俱灭`));
    io.print(red('═'.repeat(46)));
    io.print(dim(`   最终境界：${playerTitle(p)}`));
    return false;
  }
}
