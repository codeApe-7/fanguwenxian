// 修炼、突破、渡劫飞升、服用丹药。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead, GameState } from '../types.js';
import { REALMS, ROOTS, TECHNIQUES, PILLS, FORMATIONS, TALISMANS, sectOf, sectPower, techPower, learnTechnique, FRAGMENT_NEED, toxinPenalty, playerTitle } from '../content.js';
import { green, red, yellow, cyan, dim, magenta } from '../colors.js';
import { chance, randint } from './rng.js';
import { addBio, printBiography } from './text.js';

/** 闭关修炼一年，返回本年度修为增长。 */
export function cultivate(p: Player): number {
  const diff = REALMS[p.realmIdx].difficulty;
  let gain = 10 * p.rootMult * (p.aptitude ?? 1.0) * (TECHNIQUES[p.technique]?.mult ?? 1) * diff * p.cheatBonus;
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
  // 灵石温养：剩余年数内闭关效率 +20%
  if ((p.spiritWarm ?? 0) > 0) {
    gain *= 1.2;
    p.spiritWarm -= 1;
  }
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

  rate = Math.max(0.01, Math.min(1, rate)); // 丹药/灵根等修正后仍应在 (0,1] 内，避免负成功率卡死或超 100%

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
      addBio(p, `突破${REALMS[p.realmIdx].name}`);
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

/** 天劫成功率修正：一生的抉择，在最后一道雷前逐笔结算。 */
function tribulationMods(p: Player): Array<{ text: string; delta: number }> {
  const f = (name: string) => (p.flags?.[name] ?? 0) >= 1;
  const mods: Array<{ text: string; delta: number }> = [];
  if (f('见天门')) mods.push({ text: '你曾于朔月之夜得窥天门虚影，雷落之路早已在心中走过一遍。', delta: 0.05 });
  if (f('渡口')) mods.push({ text: '浮玉渡口灵阵轰鸣，聚灵引雷，为你分去了三成雷威。', delta: 0.05 });
  if (f('消业')) mods.push({ text: '四十九日散财消业没有白费——雷云翻涌，却似欠了三分狠意。', delta: 0.05 });
  if (f('佛魔一念')) mods.push({ text: '佛魔一念，心台无尘。心魔劫于你形同虚设。', delta: 0.05 });
  if (f('骨愿')) mods.push({ text: '心口那截指骨微微发烫——三千年前折在雷下的人，此刻与你同行。', delta: 0.03 });
  if (f('天忌')) mods.push({ text: '无生魔主的旧账终究记在了你头上——雷云比常例厚了三重，劫上加劫！', delta: -0.1 });
  if (f('丹疾')) mods.push({ text: '深埋道基的丹毒灰翳在雷光下无所遁形，成了劫雷最好的下口之处。', delta: -0.05 });
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

/** 渡劫飞升结局，返回是否成仙。 */
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

  // 一生抉择的结算
  let rate = 0.7 + (hasCompanion ? 0.1 : 0);
  for (const m of tribulationMods(p)) {
    await io.narrate(m.delta >= 0 ? dim(m.text) : red(m.text));
    rate += m.delta;
  }
  rate = Math.max(0.05, Math.min(0.95, rate));

  if (hasPill || chance(rate)) {
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
