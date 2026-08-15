// 修炼、突破、渡劫飞升、服用丹药。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead, GameState } from '../types.js';
import {
  REALMS, ROOTS, TECHNIQUES, PILLS, FORMATIONS, TALISMANS, SPELLS,
  SPELL_MAX_LV, SPELL_LV_COST, YUANYING_VISIONS, DAO_PATHS, CORE_TYPES, CORE_QUALITY_NAMES,
  sectOf, sectPower, techPower, learnTechnique, learnSpell, FRAGMENT_NEED, toxinPenalty,
  playerTitle, playerHp, playerAttack, playerDefense, playerSpeed, playerSense, playerMaxQi,
  abodeOf, heartName, heartTier, mainElement, rootPurity,
  coreQualityCap, coreBonus, spellLevel, spellPower,
} from '../content.js';
import { green, red, yellow, cyan, dim, magenta, bold } from '../colors.js';
import { chance, randint, pick } from './rng.js';
import { addBio, printBiography } from './text.js';
import { combat, makeEnemy } from './combat.js';

/** 闭关修炼一年，返回本年度修为增长。 */
export function cultivate(p: Player): number {
  const diff = REALMS[p.realmIdx].difficulty;
  let gain = 10 * p.rootMult * (p.aptitude ?? 1.0) * (TECHNIQUES[p.technique]?.mult ?? 1) * diff * p.cheatBonus;
  gain *= techPower(p); // 功法熟练度加成
  const cultPct = sectOf(p)?.cultPct ?? 0; // 血煞魔宗/太虚阵宗等修炼加成
  gain *= 1 + (cultPct > 0 ? cultPct * sectPower(p) : cultPct);
  gain *= FORMATIONS[p.formation]?.cult ?? 1.0; // 聚灵阵等阵法加成
  gain *= abodeOf(p.abode ?? '山中茅舍').speed / 100; // 洞府/灵脉：修炼快慢主要不看你是谁，看你在哪修
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
  // 灵石温养：剩余年数内闭关效率 +20%
  if ((p.spiritWarm ?? 0) > 0) {
    gain *= 1.2;
    p.spiritWarm -= 1;
  }
  gain = Math.max(1, gain);
  // 不在此处封顶：溢出的修为要留给 autoAdvance 结转到下一小阶
  p.cultivation += gain;
  // 修行中打磨功法熟练度
  const prof = Math.min(100, (p.techProficiency[p.technique] ?? 0) + randint(2, 5));
  p.techProficiency[p.technique] = prof;
  return gain;
}

/**
 * 小境界自动晋升。
 * 初期→中期→后期→大圆满没有决策含量，不该让玩家回主菜单按一次「突破」再掷一次骰子；
 * 修为满了就是满了，溢出的部分结转到下一小阶——一次长闭关可以连跨两三阶。
 * 大圆满则停住不动：只有跨大境界才是真正的关口，那一步仍要玩家自己迈。
 * 返回本次连跨了几阶。
 */
export function autoAdvance(p: Player, io: GameIO): number {
  let steps = 0;
  while (p.cultivation >= 100 && p.stageIdx < REALMS[p.realmIdx].stages.length - 1) {
    p.cultivation -= 100;
    p.stageIdx += 1;
    p.heart = Math.min(100, p.heart + 1);
    p.insight = (p.insight ?? 0) + 1;
    steps += 1;
    io.print(green(`　气机自然而然地松了一寸——你晋入 ${playerTitle(p)}。${dim('（悟道点 +1）')}`));
  }
  if (p.cultivation >= 100) {
    p.cultivation = 100;
    if (steps === 0) io.print(yellow('修为已臻圆满，可尝试冲击大境界瓶颈。'));
  }
  return steps;
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

/** 大境界突破成功率。小境界已改为自动晋升，不再掷骰，这里只管跨大境界那一步。 */
function successRate(p: Player): number {
  let base = 0.5;
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

/** 大境界突破后的境界故事：每一境不只是数字变大，而是一重新的存在方式。 */
const REALM_STORIES: Record<number, string[]> = {
  1: [
    '一夜之间，体内浊气尽数排出，皮膜下透出温润宝光——筑基已成。',
    '自今日起，辟谷不饥，寒暑不侵。山下的日月，开始与你无关了。',
  ],
  2: [
    '丹田之中轰然一声，如古钟撞谷——万缕灵气收束凝形，一粒金丹悬于气海，晃晃如小日。',
    '一粒金丹吞入腹，始知我命由我不由天。结丹之境，寿至五百。',
  ],
  3: [
    '顶门一声轻响，一个盘膝小人破窍而出，眉眼与你一般无二。它绕体三匝，似笑非笑，复又归窍。',
    '元婴既成，神游太虚不再是传说。从今往后，人前称你一声「真君」。',
  ],
  4: [
    '无形的桎梏应声而碎，神识如春潮漫过千里山河——草木开谢、虫走兽鸣，俱在心头掌上。',
    '化神之境，神与天地相闻。凡俗种种，从此如观掌纹。',
  ],
  5: [
    '定中你忘了自己的形骸。再睁眼时，只觉此身如寄，天地如庐。',
    '炼虚合道。隐约之间，你的指尖触到了「法则」的边缘——粗糙，滚烫，浩瀚无边。',
  ],
  6: [
    '肉身与元神轰然合一。你随手一握，空间在指缝间发出不堪重负的轻吟。',
    '合体之境，举手投足可撼山岳。天下之大，堪称对手者，屈指可数。',
  ],
  7: [
    '大乘圆满。九州修士谈及你时，不再提名姓，只说「那一位」。',
    '再往前一步，就是天。你抬起头——头顶的雷云，已经开始为你聚集。',
  ],
  8: [
    '渡劫期！天地不再掩饰它的敌意，每一次吐纳，都像在与整片天空掰腕子。',
    '成，则飞升上界；败，则形神俱灭。三千年来，走到这一步的人不多——走过去的，更少。',
  ],
};

async function realmStory(p: Player, io: GameIO): Promise<void> {
  const story = REALM_STORIES[p.realmIdx];
  if (story) {
    for (const line of story) await io.narrate(line);
  }
}

/**
 * 结丹：凝一枚金丹。
 * 型由本命五行定，品由灵根纯度封顶——开局那次灵根测定，在两百年后又兑现了一次。
 * 这不是选择题，是揭晓：你两百年前替自己选的路，现在报出分数。
 */
async function formGoldenCore(p: Player, io: GameIO): Promise<void> {
  const elem = mainElement(p.roots);
  const type = CORE_TYPES[elem];
  const cap = coreQualityCap(rootPurity(p.roots));
  // 心境与丹毒是临门一脚：定得住心的人，丹凝得圆
  // 纯度既抬上限也抬下限：天灵根最差也有五品，五灵根最好也只到三品
  let roll = randint(Math.ceil(cap / 2), cap);
  if (heartTier(p.heart) >= 4 && roll < cap) roll += 1;
  if ((p.pillToxin ?? 0) >= 60 && roll > 1) roll -= 1;
  const quality = Math.max(1, Math.min(cap, roll));
  p.goldenCore = { type: type.name, quality };
  const b = coreBonus(quality);
  io.print();
  await io.narrate(magenta(`【结丹】${type.name} · ${CORE_QUALITY_NAMES[quality]}`));
  await io.narrate(type.desc);
  await io.narrate(dim(`灵根纯度封顶 ${CORE_QUALITY_NAMES[cap]}，你结出的是 ${CORE_QUALITY_NAMES[quality]}。`));
  await io.narrate(green(`气血 +${Math.round(b.hpPct * 100)}%${b.qi > 0 ? `，每回合多聚 ${b.qi} 点灵气` : ''}。`));
  if (quality >= cap) await io.narrate(yellow('凝到了你这副灵根能凝的极限。此后再想更进一步，只能另辟蹊径。'));
  addBio(p, `结${type.name}·${CORE_QUALITY_NAMES[quality]}`);
}

/** 元婴：择一异象，此后每场战斗的资源循环都由它决定。 */
async function chooseYuanying(p: Player, io: GameIO): Promise<void> {
  io.print();
  await io.narrate(magenta('【元婴异象】元婴既成，它睁眼看你的那一刻，你要替它选一条路。'));
  YUANYING_VISIONS.forEach((v, i) => io.print(` ${i + 1}) ${cyan(v.name)}：${v.desc}`));
  io.print(dim('  择定即不可改——元婴只结一次。'));
  const nums = YUANYING_VISIONS.map((_, i) => String(i + 1));
  const idx = parseInt(await io.ask('你的选择：', nums, '1'), 10) - 1;
  const v = YUANYING_VISIONS[Math.max(0, Math.min(YUANYING_VISIONS.length - 1, idx))];
  p.yuanying = v.name;
  await io.narrate(green(`你的元婴自此带着「${v.name}」的相。${v.desc}`));
  addBio(p, `元婴显「${v.name}」之相`);
}

/** 化神：以何入道。定流派，给专属仙法。 */
async function chooseDaoPath(p: Player, io: GameIO): Promise<void> {
  io.print();
  await io.narrate(magenta('【入道】化神之境，须以一物为骨、一念为纲，从此万法归一。'));
  DAO_PATHS.forEach((d, i) => io.print(` ${i + 1}) ${cyan(d.name)}：${d.desc}${dim(`（授《${d.spell}》）`)}`));
  io.print(dim('  一生只入一道。'));
  const nums = DAO_PATHS.map((_, i) => String(i + 1));
  const idx = parseInt(await io.ask('你的选择：', nums, '1'), 10) - 1;
  const d = DAO_PATHS[Math.max(0, Math.min(DAO_PATHS.length - 1, idx))];
  p.daoPath = d.name;
  learnSpell(p, d.spell);
  await io.narrate(green(`${d.name}。${d.desc}`));
  await io.narrate(green(`你于定中悟得 ${magenta(d.spell)}。`));
  addBio(p, d.name);
}

/** 尝试冲击大境界瓶颈，返回是否成功。小境界不走这里——它自动晋升。 */
export async function breakthrough(p: Player, leads: FemaleLead[], io: GameIO): Promise<boolean> {
  const pillName = REALMS[p.realmIdx].breakPill;
  let rate = successRate(p);

  if (pillName) {
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

  rate = Math.max(0.01, Math.min(1, rate)); // 丹药/灵根等修正后仍应在 (0,1] 内，避免负成功率卡死或超 100%

  await io.narrate(`你盘膝而坐，凝神聚气，冲击 ${green(REALMS[p.realmIdx + 1]?.name ?? '更高之境')} 的瓶颈……`);
  await io.narrate(`突破成功率：${yellow(`${(rate * 100).toFixed(0)}%`)}`);

  if (chance(rate)) {
    await io.narrate(green('轰！体内气机畅通，境界壁垒应声而破！'));
    p.realmIdx += 1;
    p.stageIdx = 0;
    p.lifespan = REALMS[p.realmIdx].lifespan;
    p.cultivation = 0;
    p.heart = Math.min(100, p.heart + 5);
    p.insight = (p.insight ?? 0) + 3; // 大境界给三点：悟道点全程给不满，只够点厚一两式
    await io.narrate(`你成功突破至 ${green(REALMS[p.realmIdx].name)}！寿元延至 ${p.lifespan} 岁。${dim('（悟道点 +3）')}`);
    await realmStory(p, io);
    addBio(p, `突破${REALMS[p.realmIdx].name}`);
    // 每个大境界一层新机制：结丹定品、元婴定引擎、化神定流派
    if (p.realmIdx === 2 && !p.goldenCore) await formGoldenCore(p, io);
    if (p.realmIdx === 3 && !p.yuanying) await chooseYuanying(p, io);
    if (p.realmIdx === 4 && !p.daoPath) await chooseDaoPath(p, io);
    return true;
  } else {
    await io.narrate(red('灵气紊乱，心魔陡生！突破失败……'));
    const resist = sectOf(p)?.demonResist ?? false; // 净禅寺心魔抗性
    const lossHalf = sectOf(p)?.traitKey === 'breakLossHalf'; // 玄清门道基稳固
    const cultLoss = lossHalf ? 25 : 50;
    p.cultivation = Math.max(0, p.cultivation - cultLoss);
    p.heart = Math.max(0, p.heart - (resist ? 5 : 10));
    if (!resist && chance(0.3)) {
      await io.narrate(red('走火入魔！你遭受重创，寿元折损！'));
      p.lifespan -= randint(5, 15);
    }
    return false;
  }
}

/** 参悟神通：把悟道点砸进少数几式里。点不满，这才是取舍。 */
export async function studySpells(p: Player, io: GameIO): Promise<boolean> {
  p.spellLv ??= {};
  const known = (p.spells ?? []).filter((s) => SPELLS[s]);
  if (known.length === 0) {
    io.print(red('你尚未习得任何神通。功法、坊市玉简、宗门藏经阁与机缘皆可得。'));
    await io.pause();
    return false;
  }
  while (true) {
    await io.clear();
    io.print(cyan('═══ 参悟神通 ═══'));
    io.print(`悟道点：${yellow(String(p.insight ?? 0))}${dim('　（小境界晋升 +1，大境界突破 +3；全程给不满，只够点厚一两式）')}`);
    known.forEach((s, i) => {
      const d = SPELLS[s];
      const lv = spellLevel(p, s);
      const next = lv >= SPELL_MAX_LV ? dim('（圆满）') : `　升 ${lv + 1} 层需 ${SPELL_LV_COST[lv]} 点`;
      io.print(` ${i + 1}) ${d.element}·${s} ${bold(`${lv} 层`)}（威力 ×${spellPower(lv).toFixed(2)}，耗气 ${d.cost}）${next}`);
      io.print(dim(`    ${d.desc}`));
    });
    io.print(' 0) 返回');
    const ch = await io.ask('参悟哪一式：');
    if (ch === '0' || ch === '') return false;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > known.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const name = known[idx - 1];
    const lv = spellLevel(p, name);
    if (lv >= SPELL_MAX_LV) {
      io.print(yellow('此式已臻圆满，再参无益。'));
      await io.pause();
      continue;
    }
    const cost = SPELL_LV_COST[lv];
    if ((p.insight ?? 0) < cost) {
      io.print(red(`悟道点不足（需 ${cost}，当前 ${p.insight ?? 0}）。`));
      await io.pause();
      continue;
    }
    p.insight = (p.insight ?? 0) - cost;
    p.spellLv[name] = lv + 1;
    await io.narrate(green(`你于定中重演 ${magenta(name)} 千百遍，此式进至 ${lv + 1} 层（威力 ×${spellPower(lv + 1).toFixed(2)}，耗气仍是 ${SPELLS[name].cost}）。`));
    return true;
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

/**
 * 天劫修正：一生的抉择，在最后一道雷前逐笔结算。
 * 由「成功率加减」改为「雷威加减」——积累不再兑现成一次掷骰，而是兑现成你能不能扛住第九道雷。
 */
function tribulationMods(p: Player): Array<{ text: string; atk: number; shield: number }> {
  const f = (name: string) => (p.flags?.[name] ?? 0) >= 1;
  const mods: Array<{ text: string; atk: number; shield: number }> = [];
  if (f('见天门')) mods.push({ text: '你曾于朔月之夜得窥天门虚影，雷落之路早已在心中走过一遍。', atk: -0.08, shield: 0 });
  if (f('渡口')) mods.push({ text: '浮玉渡口灵阵轰鸣，聚灵引雷，为你分去了三成雷威。', atk: -0.08, shield: 0.1 });
  if (f('消业')) mods.push({ text: '四十九日散财消业没有白费——雷云翻涌，却似欠了三分狠意。', atk: -0.08, shield: 0 });
  if (f('骨愿')) mods.push({ text: '心口那截指骨微微发烫——三千年前折在雷下的人，此刻与你同行。', atk: -0.05, shield: 0.1 });
  if (f('天忌')) mods.push({ text: '无生魔主的旧账终究记在了你头上——雷云比常例厚了三重，劫上加劫！', atk: 0.18, shield: 0 });
  if (f('丹疾')) mods.push({ text: '深埋道基的丹毒灰翳在雷光下无所遁形，成了劫雷最好的下口之处。', atk: 0.08, shield: 0 });
  return mods;
}

/** 飞升结语：读一生的 flag，把你走过的路一段段收束。 */
function epilogueLines(state: GameState): string[] {
  const p = state.player;
  const f = (name: string) => (p.flags?.[name] ?? 0) >= 1;
  const lines: string[] = [];
  // 剧本收束
  if (p.scenario === '天命凡骨') {
    if (f('骨愿')) lines.push('跨入天门的刹那，心口的骨片化作一蓬萤光，在你身侧盘旋三匝，散入九霄——三千年的执念，终于到了。凡骨证道，自你而始，却不自你而终。');
    else lines.push('乱葬岗的无字碑还立在故乡的风里。有人问起碑下埋的是谁，村里最老的老人也只摇头——只有你知道，那里埋着「不可能」三个字。');
    if (f('传法')) lines.push('你留下的《凡骨录》传抄百年，九州寒门修士几乎人手一部。扉页那句话被无数人描了又描：灵根定的是快慢，不是生死。');
  } else if (p.scenario === '世家贵子') {
    if (f('宽恕')) lines.push('祖祠的长明灯换了一代又一代人守着。族学的孩子开蒙第一课，先生总会讲那个故事：恩怨到此为止，是比报仇更难的事。');
    else if (f('灭亲')) lines.push('家族卷宗里，那一页始终锁在铁匣里没人敢翻。你飞升后，族人在你的牌位前多设了一盏灯——为你，也为那些没能等到公道的人。');
    if (f('家族重光')) lines.push('你的家族自此列名九州望族，祠堂香火三千年不绝。每逢雷雨夜，守祠人都说能看见牌位上金光一闪——像是有人隔着天在看。');
  } else if (p.scenario === '逍遥浪子') {
    if (f('野渡传世')) lines.push('浮玉「野渡」的灯火自此长明。此后千年，无宗无派的散修渡劫前都会去山下客栈喝一碗酒，朝山上拱一拱手——规矩没人定过，就这么传下来了。');
    else if (f('渡口')) lines.push('浮玉渡口在你飞升后缓缓闭合，白玉牌坊重归沉寂——它等的下一个人，不知要再等几千年。');
    else lines.push('你走后，江湖上关于那张残图的传说越编越玄。只有山下客栈的老掌柜记得：那位客官临走前，往柜台上放了三文钱——说是补当年一碗茶的账。');
  } else if (p.scenario === '魔星降世') {
    if (f('魔道')) lines.push('魔道三千年无主，自你雷下登天那一夜起，有了新的说法。九州魔修不再供魔主牌位——他们供一道雷。');
    else if (f('渡魔')) lines.push('昭衡司的「渡魔条」沿用了下去。百年后有个身怀魔胎的孩子在司衙前领到玄铁令时，司正对他说：这条规矩，是一位前辈拿一辈子替你挣的。');
    else lines.push('你飞升后，正道与魔道各自把你写进了自己的典籍——写法南辕北辙，倒有一句相同：其人其道，不可以常理计。');
  }
  // 共通收束
  if (f('善名') || f('侠名')) lines.push('人间为你立的生祠，你从未回去看过。香火却一年旺过一年——凡人记恩，比修士长久。');
  if (f('见死不救')) lines.push('唯有一件旧事，你在最后一道雷里又看见了一遍：那道没有回音的求援传音。天上路长，有些账，带着走。');
  if (p.sectMaster) lines.push(`${p.sect}后山多了一座朝天的衣冠冢。历代弟子路过都要拱手——那是他们飞升的老宗主，也是山门永远的靠山。`);
  return lines;
}

/**
 * 渡劫飞升结局，返回是否成仙。
 * 不再是一次 chance(0.7)——两百年的积累，要在两场带规则的战斗里自己兑现：
 *   一、心魔劫：对手是你自己，禁丹药法宝，心境是你唯一的护甲；
 *   二、九重雷劫：打不死它，只能撑满九道雷。
 */
export async function ascend(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const leads = state.leads;
  await io.clear();
  await io.narrate('渡劫期大圆满。这一日，天地忽然安静下来——风停了，鸟兽绝迹，九霄之上雷云千里，压得群山齐齐矮了三分。');
  await io.narrate('你沐浴更衣，散尽杂物，一步一步走上孤峰之巅。');
  await io.narrate('三百年人间路，到今天，只剩头顶九重雷。');

  const hasPill = (p.pills['渡劫丹'] ?? 0) > 0;
  // 全部道侣（含旧档仅存的 daoCompanion 名）
  const daoNames = leads.filter((l) => l.dao).map((l) => l.name);
  if (p.daoCompanion && !daoNames.includes(p.daoCompanion)) daoNames.push(p.daoCompanion);
  const hasCompanion = daoNames.length > 0;

  if (hasPill) {
    await io.narrate(green('你服下渡劫丹，药力如洪炉烈火，气机暴涨——今日硬撼天劫！'));
    p.pills['渡劫丹'] -= 1;
  }
  if (hasCompanion) {
    await io.narrate(magenta(`道侣 ${daoNames.join('、')} 执意随你上峰，与你并肩立于雷云之下。`));
    await io.narrate('「生同衾，死同穴。」掌心相抵，两道气机合而为一。');
  }

  const maxHp = playerHp(p);

  // ———— 第一场：心魔劫 ————
  let heartHeld = true;
  if ((p.flags?.['佛魔一念'] ?? 0) >= 1) {
    await io.narrate(dim('佛魔一念，心台无尘。心魔劫于你形同虚设——雷云之下，你连一个念头都没有多起。'));
  } else {
    io.print();
    await io.narrate(magenta('【心魔劫】雷云未落，你先看见了自己——一模一样的眉眼，一模一样的道袍，站在三步之外。'));
    await io.narrate('「这些年你走的路，」它说，「我都在。」');
    // 心境是这一场唯一的护甲：一辈子的修养，在此刻兑现成一层实打实的罩子
    const tier = heartTier(p.heart);
    const shield = Math.round(maxHp * tier * 0.08);
    if (shield > 0) {
      await io.narrate(green(`你此生心境「${heartName(p.heart)}」，一层清光自内而外浮起，罩住周身（护罩 ${shield}）。`));
    } else {
      await io.narrate(red('你心中杂念丛生，护不住自己——心境「心猿意马」，无光可护。'));
    }
    // 心魔就是你：同样的灵根、同样的牌组、同样的层数——「这些年你走的路，我都在。」
    const mirror = makeEnemy(p, { kind: '修士', foe: `心魔 · ${p.name}` });
    mirror.realm = playerTitle(p);
    mirror.element = mainElement(p.roots);
    mirror.roots = { ...p.roots };
    mirror.kind = '心魔';
    mirror.maxHp = Math.round(maxHp * 0.9);
    mirror.hp = mirror.maxHp;
    mirror.atk = Math.round(playerAttack(p) * 0.9);
    mirror.def = playerDefense(p);
    mirror.spd = playerSpeed(p);
    mirror.sense = playerSense(p);
    mirror.qi = 3;
    mirror.maxQi = playerMaxQi(p);
    mirror.deck = [...(p.spells ?? [])];
    mirror.spellLv = { ...(p.spellLv ?? {}) };
    mirror.loot = 0;
    const r = await combat(p, leads, io, {
      fight: '心魔', enemy: mirror, title: '心魔劫', preShield: shield,
      intro: '{enemy}抬起手，做了一个你做过千百遍的起手式。',
    });
    heartHeld = r === 'win';
    if (heartHeld) {
      await io.narrate(green('那道身影散了。散之前，它冲你点了点头——像是终于认了。'));
    } else {
      await io.narrate(red('你没能压住它。神魂被撕开一道口子，血从七窍里渗出来——雷还没落，你已经先输了半场。'));
    }
  }

  // ———— 第二场：九重雷劫 ————
  io.print();
  await io.narrate(magenta('【九重雷劫】云开了一线。第一道雷已经在酝酿。'));

  let atkMult = 0.7;   // 九道雷的总伤略高于「满血 + 一层护罩」，逼你在场上再想办法
  let shieldPct = hasCompanion ? 0.2 : 0;
  for (const m of tribulationMods(p)) {
    await io.narrate(m.atk <= 0 ? dim(m.text) : red(m.text));
    atkMult *= 1 + m.atk;
    shieldPct += m.shield;
  }
  if (hasCompanion) await io.narrate(green('两道气机合流，道侣以身替你分去了一部分雷威。'));
  if (hasPill) { atkMult *= 0.85; shieldPct += 0.5; }
  if (!heartHeld) shieldPct = Math.max(0, shieldPct - 0.2);

  const bolt = makeEnemy(p, { kind: '修士', foe: '九天雷劫' });
  bolt.realm = '天罚';
  bolt.element = '金';
  bolt.kind = '天劫';
  bolt.maxHp = 1;
  bolt.hp = 1;
  bolt.immortal = true;      // 打不死它。你只能撑过去。
  bolt.atk = Math.round(playerAttack(p) * atkMult);
  bolt.def = 999999;
  bolt.spd = 99;             // 遁速无穷：躲不掉，也逃不掉
  bolt.sense = 0;
  bolt.qi = 0;
  bolt.maxQi = 0;
  bolt.deck = [];            // 天劫不施法，它只是落下来
  bolt.atkGrowth = 1.15;     // 一雷重过一雷
  bolt.pierce = 0.5;         // 天雷无视半数防御
  bolt.loot = 0;

  const survived = await combat(p, leads, io, {
    fight: '天劫', enemy: bolt, title: '九重雷劫',
    preShield: Math.round(maxHp * shieldPct),
    startHpPct: heartHeld ? 100 : 55,
    intro: '{enemy}压城而下。你抬起头——从今往后，只剩九个回合。',
  });

  if (survived === 'win') {
    await io.narrate('第一道雷落下时，你脚下的孤峰断了一角。');
    await io.narrate('第四道雷落下时，你的法宝碎了，护体灵光碎了，只剩一口气还擎着。');
    await io.narrate('第九道雷落下时——你还站着。');
    await io.narrate(yellow('雷云散尽，天地失色。一道金桥自云端垂落，直抵你的脚前。'));
    await io.narrate(green('你回头看了一眼这方生活了几百年的人间，整了整衣冠，踏桥而上。天门大开！'));
    addBio(p, '九重雷劫圆满，白日飞升');
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
    io.print();
    for (const line of epilogueLines(state)) {
      await io.narrate(line);
    }
    io.print();
    printBiography(state, io);
    io.print(dim('  ——《凡骨问仙》终。此传由后人整理，谨录如上。'));
    return true;
  } else {
    await io.narrate(red('第七道雷落下时，你听见了自己道基碎裂的声音。'));
    await io.narrate(red('没有痛。天地很亮，然后很黑。'));
    addBio(p, '渡劫失败，殒身雷下');
    io.print(red('═'.repeat(46)));
    io.print(red(`   游戏结束：${p.name}，享年 ${p.age} 岁，渡劫失败，形神俱灭`));
    io.print(red('═'.repeat(46)));
    io.print(dim(`   最终境界：${playerTitle(p)}`));
    io.print();
    printBiography(state, io);
    io.print(dim('  三千年后，有樵夫在断峰下拾得半片焦黑的衣角，供入山神庙——香火竟颇灵验。'));
    return false;
  }
}
