// 宗门系统：任务、贡献、职阶晋升、拜入/改投、叛出（含叛宗惩罚）。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { SECTS, REALMS, TECHNIQUES, PILLS, SPELLS, SECT_RANKS, SECT_RANK_NEED, SECT_RANK_POWER, SECT_RANK_REALM, learnTechnique, learnSpell, upgradeTechnique, techniqueSummary, playerTitle, playerHp, incomeScale } from '../content.js';
import type { SectDef } from '../content.js';
import { SECT_TASKS, honorificOf } from '../content/tasks.js';
import type { SectTaskDef } from '../content/tasks.js';
import { PLACES } from '../content/world.js';
import { fill, addBio, eraYear } from './text.js';
import { green, red, yellow, cyan, magenta, dim } from '../colors.js';
import { pick, chance, randint } from './rng.js';
import { combat } from './combat.js';
import type { CarryHp, CombatOpts } from './combat.js';

const BETRAY_FEE = 200;       // 请辞出宗需缴纳的灵石
const PURSUIT_YEARS = 15;     // 强行叛逃被追杀的年限
const DONATE_RATE = 10;       // 每 10 灵石换 1 贡献
const TOURNEY_INTERVAL = 3;   // 宗门大比每 3 年一届（按世界纪年）
const MASTER_NEED = 600;      // 挑战宗主所需贡献
const MASTER_SALARY = 100;    // 宗主每年俸禄（灵石）

// ---- 宗门任务（任务库见 content/tasks.ts：三层文案 + 冷却 + 境界窗） ----

// 难度标注与配色（简单=绿 / 普通=黄 / 困难=红）
const DIFF_LABEL: Record<number, string> = { 1: '简单', 2: '普通', 3: '困难' };
const DIFF_COLOR: Record<number, (s: string) => string> = { 1: green, 2: yellow, 3: red };

// 贡献随境界线性上浮：炼气 ×1.0，筑基 ×1.5，结丹 ×2.0，元婴 ×2.5 … 渡劫 ×5.0
// 理由：战斗敌人本就随境界变强（风险上升），固定奖励会让高境界任务失去性价比。
function taskReward(base: number, realmIdx: number): number {
  return Math.round(base * (1 + realmIdx * 0.5));
}

function rankOf(p: { sectRank: number }): number {
  return Math.min(p.sectRank ?? 0, SECT_RANKS.length - 1);
}

/** 任务失败的贡献代价（接了不做有成本，「接哪个任务」才是决策）。 */
function taskPenalty(base: number, realmIdx: number): number {
  return Math.max(1, Math.floor(taskReward(base, realmIdx) / 4));
}

/**
 * 执行一个宗门任务，返回是否消耗时间。
 * 流程：列表（含冷却/身份过滤）→ 详情（世界告示 + 执事口吻）→ 接取确认 → 执行。
 * 战斗任务失败扣贡献并进入冷却——失败也是叙事，更是代价。
 */
async function takeTask(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  while (true) {
    p.taskCd ??= {};
    io.print(cyan('—— 执事堂 · 任务栏 ——'));
    // 境界窗过滤：不够格的要务不示人，过了身份的杂役自动下架
    const eligible = SECT_TASKS.filter(
      (t) => (t.realmMin === undefined || p.realmIdx >= t.realmMin) &&
             (t.realmMax === undefined || p.realmIdx <= t.realmMax),
    );
    const retired = SECT_TASKS.filter((t) => t.realmMax !== undefined && p.realmIdx > t.realmMax).length;
    if (eligible.length === 0) {
      io.print(yellow('任务栏上暂无合乎你身份的差事。'));
      await io.pause();
      return false;
    }
    eligible.forEach((task, i) => {
      const reward = taskReward(task.reward, p.realmIdx);
      const cdLeft = (p.taskCd[task.id] ?? 0) - state.year;
      const tag = DIFF_COLOR[task.diff](DIFF_LABEL[task.diff]);
      if (cdLeft > 0) {
        io.print(dim(` ${i + 1}) ${task.step}（冷却中，${cdLeft} 年后再接）`));
      } else {
        io.print(` ${i + 1}) ${task.step} ${tag}（贡献 +${reward}${task.kind === 'combat' ? `，败则 -${taskPenalty(task.reward, p.realmIdx)}` : ''}）`);
      }
    });
    if (retired > 0) io.print(dim(`   （另有 ${retired} 项低阶杂役，已不劳你这般修为出手）`));
    io.print(' 0) 返回');
    const ch = await io.ask('选择任务：');
    if (ch === '0' || ch === '') return false;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > eligible.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const task = eligible[idx - 1];
    if ((p.taskCd[task.id] ?? 0) > state.year) {
      io.print(yellow('此任务尚在冷却，执事另派了他人。'));
      continue;
    }
    const reward = taskReward(task.reward, p.realmIdx);
    const ctx = { daoyou: honorificOf(rankOf(p), p.sectMaster), place: pick(PLACES), name: p.name };

    // —— 三层文案：告示（世界层）→ 执事（人物层） ——
    io.print();
    await io.narrate(dim('【告示】') + fill(task.world, ctx));
    await io.narrate(fill(task.say, ctx));
    const ok = await io.ask('接下此任务？(y/n)', ['y', 'n'], 'y');
    if (ok !== 'y') continue;

    if (task.kind === 'combat') {
      const r = await combat(p, state.leads, io, {
        intro: task.intro ? fill(task.intro, ctx) : undefined,
        boost: task.boost ?? 0,
        kind: task.foeKind ?? '妖兽',
        title: `宗门任务 · ${task.step}`,
      });
      p.taskCd[task.id] = state.year + task.cd;
      if (r === 'win') {
        p.sectContribution += reward;
        await io.narrate(green(`任务完成，贡献 +${reward}。`));
      } else {
        const penalty = taskPenalty(task.reward, p.realmIdx);
        p.sectContribution = Math.max(0, p.sectContribution - penalty);
        if (task.failSay) await io.narrate(fill(task.failSay, ctx));
        io.print(red(`任务失利，贡献 -${penalty}。`));
      }
      return true;
    }
    if (task.kind === 'collect') {
      const m = task.material!;
      if ((p.materials[m] ?? 0) < (task.matN ?? 1)) {
        io.print(red(`材料不足（需 ${m}×${task.matN}，当前 ${p.materials[m] ?? 0}）。`));
        if (task.failSay) await io.narrate(fill(task.failSay, ctx));
        continue;
      }
      p.materials[m] -= task.matN!;
      p.sectContribution += reward;
      p.taskCd[task.id] = state.year + task.cd;
      io.print(green(`上交 ${m}×${task.matN}，贡献 +${reward}。`));
      return true;
    }
    if (task.kind === 'craft') {
      const pill = task.pill!;
      if ((p.pills[pill] ?? 0) < 1) {
        io.print(red(`你没有 ${pill}。`));
        if (task.failSay) await io.narrate(fill(task.failSay, ctx));
        continue;
      }
      p.pills[pill] -= 1;
      p.sectContribution += reward;
      p.taskCd[task.id] = state.year + task.cd;
      io.print(green(`上交 ${pill}×1，贡献 +${reward}。`));
      return true;
    }
    // 巡逻 / 镇守（不会失败）
    await io.narrate(task.done ?? '你巡守宗门属地一年，修界碑、访佃户，赶走了几只不开眼的小妖。');
    p.sectContribution += reward;
    p.taskCd[task.id] = state.year + task.cd;
    if (chance(0.4)) {
      const n = randint(20, 60) * incomeScale(p.realmIdx);
      p.spirit += n;
      io.print(green(`途中顺手采得些灵物，卖得 ${n} 灵石。`));
    }
    return true;
  }
}

/** 捐献灵石换贡献（不消耗时间）。 */
async function donate(state: GameState, io: GameIO): Promise<void> {
  const p = state.player;
  io.print(`捐献灵石（每 ${DONATE_RATE} 灵石 = 1 贡献），当前灵石：${p.spirit}`);
  const raw = await io.ask('捐献多少灵石？（0 返回）');
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return;
  if (n > p.spirit) {
    io.print(red('灵石不足。'));
    await io.pause();
    return;
  }
  p.spirit -= n;
  const c = Math.floor(n / DONATE_RATE);
  p.sectContribution += c;
  io.print(green(`捐献 ${n} 灵石，获得 ${c} 贡献。`));
  await io.pause();
}

/** 晋升考核：挑战守关师兄，胜则晋升（消耗贡献）。 */
async function tryPromote(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const rank = rankOf(p);
  if (rank >= SECT_RANKS.length - 1) {
    io.print(yellow(`你已是${SECT_RANKS[rank]}，位极人臣。`));
    await io.pause();
    return false;
  }
  const next = rank + 1;
  const need = SECT_RANK_NEED[next];
  if (p.realmIdx < SECT_RANK_REALM[next]) {
    io.print(red(`修为不足（晋升${SECT_RANKS[next]}需 ${REALMS[SECT_RANK_REALM[next]].name} 以上，你当前 ${playerTitle(p)}）。`));
    await io.pause();
    return false;
  }
  if ((p.sectContribution ?? 0) < need) {
    io.print(red(`贡献不足（晋升${SECT_RANKS[next]}需 ${need} 贡献，当前 ${p.sectContribution}）。`));
    await io.pause();
    return false;
  }
  io.print(`晋升考核：击败守关师兄，方可晋升${SECT_RANKS[next]}。`);
  const ch = await io.ask('是否挑战？(y/n)', ['y', 'n'], 'y');
  if (ch !== 'y') return false;
  const r = await combat(p, state.leads, io, {
    intro: '守关师兄按剑而立，冲你一点头——正是 {enemy}！',
    kind: '同门',
    arena: '切磋',
    title: `晋升考核 · ${SECT_RANKS[next]}`,
  });
  if (r === 'win') {
    p.sectContribution -= need;
    p.sectRank = next;
    await io.narrate(green(`你击败守关师兄，晋升为 ${SECT_RANKS[next]}！宗门效果提升至 ×${SECT_RANK_POWER[next]}。`));
    if (next >= 2) addBio(p, `晋升${p.sect}${SECT_RANKS[next]}`);
  } else {
    await io.narrate(red('你败下阵来，晋升失败，来年再战。'));
  }
  return true;
}

// ---- 宗门宝库（藏经阁 / 聚宝仙楼） ----

// 藏经阁：通用功法 -> 贡献价
const SCRIPTURE_SHOP: Array<[string, number]> = [
  ['青灵诀', 50],
  ['玄霜诀', 100],
  ['紫薇心经', 200],
  ['九转玄元功', 400],
  ['太上忘尘经', 800],
  ['金刚淬体功', 150],
  ['铁骨功', 180],
  ['龟息诀', 250],
  ['养生诀', 120],
  ['御风诀', 60],
  ['烈阳掌', 70],
  ['玄冥劲', 70],
  ['狂雷劲', 100],
  ['磐石功', 130],
  ['洗髓经', 200],
  ['玄龟甲功', 150],
  ['延寿经', 300],
  ['回春功', 180],
  ['青囊诀', 220],
  ['凝神诀', 90],
  ['五禽戏', 80],
  ['庚金诀', 80],
  ['乙木经', 80],
  ['离火诀', 90],
  ['碧波心法', 80],
  ['厚土功', 85],
  ['清音诀', 90],
  ['天籁真经', 250],
  ['傀儡真解', 100],
  ['万傀大法', 280],
  ['御兽心经', 90],
  ['万兽诀', 240],
  ['万毒真经', 180],
  ['蛊心诀', 300],
  ['纯阳诀', 120],
  ['太阴炼神诀', 130],
];
const SIGNATURE_PRICE = 600; // 镇宗功法贡献价

/** 藏经阁可兑换功法：通用功法 + 本宗镇宗功法。 */
function scriptureItems(p: Player): Array<[string, number]> {
  const sig = SECTS.find((s) => s.name === p.sect)?.technique;
  const items = [...SCRIPTURE_SHOP];
  if (sig && !items.some(([n]) => n === sig)) items.unshift([sig, SIGNATURE_PRICE]);
  return items;
}

/**
 * 法堂可兑换神通：通用玉简（贡献价 = 灵石价的 1/12）+ 本宗不传之秘。
 * 宗门专属的几式坊市无货，只有在自家法堂才拿得到——这是留在宗门里的理由之一。
 */
function spellItems(p: Player): Array<[string, number]> {
  const items: Array<[string, number]> = [];
  for (const [name, d] of Object.entries(SPELLS)) {
    if (!d.price) continue;
    if (d.sect && d.sect !== p.sect) continue;
    items.push([name, Math.max(10, Math.round(d.price / (d.sect ? 8 : 12)))]);
  }
  return items.sort((a, b) => a[1] - b[1]);
}
// 聚宝仙楼：丹药/材料 -> 贡献价
const PILL_SHOP: Array<[string, number]> = [
  ['凝气丹', 10],
  ['聚灵丹', 20],
  ['疗伤丹', 8],
  ['回春丹', 20],
  ['净元丹', 40],
  ['筑基丹', 50],
  ['结丹丹', 150],
  ['婴变丹', 400],
  ['化神丹', 1000],
  ['炼虚丹', 2000],
  ['合体丹', 3800],
  ['大乘丹', 6000],
  ['渡劫丹', 12000],
];
const MAT_SHOP: Array<[string, number]> = [
  ['灵草', 5],
  ['灵花', 12],
  ['妖兽内丹', 30],
  ['灵石精', 75],
];

/** 通用兑换循环：apply 返回 false 表示未成交（不扣贡献）。 */
async function buyFrom(
  state: GameState, io: GameIO, title: string,
  items: Array<[string, number]>, apply: (name: string) => boolean,
): Promise<void> {
  const p = state.player;
  while (true) {
    io.print(cyan(`—— ${title} ——`));
    items.forEach(([name, price], i) => {
      const sum = TECHNIQUES[name] ? techniqueSummary(name) : null;
      io.print(` ${i + 1}) ${name}${sum ? `（${sum}）` : ''}（${p.sectMaster ? 0 : price} 贡献）`);
    });
    io.print(` 0) 返回    贡献：${p.sectContribution}`);
    const ch = await io.ask('兑换编号：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > items.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const [name, price] = items[idx - 1];
    if (!p.sectMaster && (p.sectContribution ?? 0) < price) {
      io.print(red('贡献不足。'));
      continue;
    }
    if (!apply(name)) continue;
    if (!p.sectMaster) p.sectContribution -= price;
    io.print(green(`兑换成功：${name}×1。`));
  }
}

/** 宗门宝库：藏经阁（功法）/ 聚宝仙楼（丹药、材料），宗主免单。 */
async function treasury(state: GameState, io: GameIO): Promise<void> {
  const p = state.player;
  while (true) {
    await io.clear();
    io.print(magenta('═══ 宗门宝库 ═══'));
    io.print(`贡献：${p.sectContribution ?? 0}${p.sectMaster ? '（宗主免单）' : ''}`);
    io.print(' 1) 藏经阁（兑换功法）');
    io.print(' 2) 聚宝仙楼（兑换丹药 / 材料）');
    io.print(' 3) 法堂（兑换神通玉简）');
    io.print(' 0) 返回');
    const ch = await io.ask('选择：', ['0', '1', '2', '3'], '0');
    if (ch === '0' || ch === '') return;
    if (ch === '1') {
      await buyFrom(state, io, '藏经阁', scriptureItems(p), (n) => {
        if (p.technique === n) {
          io.print(yellow('你已修炼此功法。'));
          return false;
        }
        learnTechnique(p, n);
        return true;
      });
    } else if (ch === '3') {
      await buyFrom(state, io, '法堂', spellItems(p), (n) => {
        if ((p.spells ?? []).includes(n)) {
          io.print(yellow('你已习得此式。'));
          return false;
        }
        learnSpell(p, n);
        return true;
      });
    } else {
      await buyFrom(state, io, '聚宝仙楼', [...PILL_SHOP, ...MAT_SHOP], (n) => {
        if (PILLS[n]) p.pills[n] = (p.pills[n] ?? 0) + 1;
        else p.materials[n] = (p.materials[n] ?? 0) + 1;
        return true;
      });
    }
  }
}

// ---- 宗门大比 / 宗主之位 / 宗门战争 ----

/** 参加宗门大比（每 3 年一届，按世界纪年开榜，内门以上可参赛，三轮积分赛）。 */
async function tourney(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  if (state.year % TOURNEY_INTERVAL !== 0) {
    const next = state.year + (TOURNEY_INTERVAL - (state.year % TOURNEY_INTERVAL));
    io.print(red(`宗门大比每 ${TOURNEY_INTERVAL} 年一届，下届开榜在 ${eraYear(next)}。`));
    await io.pause();
    return false;
  }
  if (rankOf(p) < 1) {
    io.print(red('宗门大比需内门弟子及以上方可参赛。'));
    await io.pause();
    return false;
  }
  await io.narrate('九州宗门大比开幕，各宗天骄云集！');
  await io.narrate('执法长老当众宣了台规：登台者尽解丹药法器，只凭一身修为与所学神通。');
  let wins = 0;
  // 三轮连打：气血带伤进下一场，轮间只得半炷香调息——赢下首轮不等于赢下全场
  const carry: CarryHp = { hp: playerHp(p) };
  for (let i = 0; i < 3; i++) {
    const rival = pick(SECTS.filter((s) => s.name !== p.sect)).name;
    const r = await combat(p, state.leads, io, {
      intro: `第 ${i + 1} 轮，${cyan(rival)}的天骄跃上擂台——正是 {enemy}！`,
      kind: '天骄',
      fight: '擂台',
      // 大比不许带丹药法器上台：比的是修为与神通，不是谁家底厚
      noItems: true,
      title: `宗门大比 · 第${'一二三'[i]}轮`,
      carry,
    });
    if (r === 'win') wins += 1;
    if (i < 2) {
      carry.hp = Math.min(playerHp(p), carry.hp + Math.round(playerHp(p) * 0.3));
      await io.narrate(dim('场间半炷香调息。你压下翻涌的气血，再上擂台。'));
    }
  }
  if (wins === 3) {
    p.sectContribution += 100;
    p.spirit += 300 * incomeScale(p.realmIdx);
    p.materials['灵石精'] = (p.materials['灵石精'] ?? 0) + 1;
    await io.narrate(green('三战全胜！你力压群雄，夺下本届大比魁首，宗门上下与有荣焉！'));
    // 大事记只立首度夺魁——立传记的是「第一次」，不是流水账
    p.flags ??= {};
    if (!p.flags['大比魁首']) {
      p.flags['大比魁首'] = 1;
      addBio(p, '首夺宗门大比魁首');
    }
  } else if (wins === 2) {
    p.sectContribution += 60;
    p.spirit += 150 * incomeScale(p.realmIdx);
    await io.narrate(green('两胜一负，你名列大比前茅，为宗门争光。'));
  } else if (wins === 1) {
    p.sectContribution += 30;
    p.spirit += 50 * incomeScale(p.realmIdx);
    await io.narrate(yellow('一胜两负，你在大比中居于中游。'));
  } else {
    p.sectContribution += 10;
    await io.narrate(red('三战皆墨，你铩羽而归，只得些微苦劳。'));
  }
  return true;
}

/** 挑战宗主（需长老 + 600 贡献），胜则继位。 */
async function challengeMaster(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  if (p.sectMaster) {
    io.print(yellow('你已是本宗宗主。'));
    await io.pause();
    return false;
  }
  if (rankOf(p) < SECT_RANKS.length - 1) {
    io.print(red('需晋升长老后方可挑战宗主。'));
    await io.pause();
    return false;
  }
  if ((p.sectContribution ?? 0) < MASTER_NEED) {
    io.print(red(`贡献不足（需 ${MASTER_NEED}，当前 ${p.sectContribution}）。`));
    await io.pause();
    return false;
  }
  io.print(`挑战宗主：击败现任宗主方可继位（消耗 ${MASTER_NEED} 贡献）。`);
  const ch = await io.ask('是否挑战？(y/n)', ['y', 'n'], 'y');
  if (ch !== 'y') return false;
  const r = await combat(p, state.leads, io, {
    intro: '你踏上宗主大殿，现任宗主自蒲团起身，衣袖一振——正是 {enemy}！',
    foe: `${p.sect}宗主`,
    title: '挑战宗主',
  });
  if (r === 'win') {
    p.sectContribution -= MASTER_NEED;
    p.sectMaster = true;
    const legacy = upgradeTechnique(p);
    await io.narrate(green('你击败现任宗主，继承宗主之位！'));
    addBio(p, `继任${p.sect}宗主`);
    if (legacy) await io.narrate(green(`宗门传承灌顶，你得传承功法《${legacy}》（可于「闭关·切换主修」中启用）！`));
    await io.narrate(green(`此后每年可领俸禄 ${MASTER_SALARY} 灵石，宗门宝库免单，并可发动宗门战争。`));
  } else {
    await io.narrate(red('你败在宗主手下，继位失败。'));
  }
  return true;
}

/** 发动宗门战争（仅宗主，三阶段攻伐）。 */
async function declareWar(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  if (!p.sectMaster) {
    io.print(red('唯有宗主方可发动宗门战争。'));
    await io.pause();
    return false;
  }
  const targets = SECTS.filter((s) => s.name !== p.sect && s.name !== '散修');
  io.print('选择宣战目标：');
  targets.forEach((s, i) => io.print(` ${i + 1}) ${s.name}：${s.desc}`));
  io.print(' 0) 返回');
  const ch = await io.ask('选择：');
  if (ch === '0' || ch === '') return false;
  const idx = parseInt(ch, 10);
  if (isNaN(idx) || idx < 1 || idx > targets.length) {
    io.print(red('无效编号。'));
    await io.pause();
    return false;
  }
  const target = targets[idx - 1];
  const ch2 = await io.ask(`确定向 ${target.name} 宣战？(y/n)`, ['y', 'n'], 'y');
  if (ch2 !== 'y') return false;

  await io.narrate(`你率全宗之众，杀向 ${red(target.name)}！`);
  let wins = 0;
  // 三阵一气呵成，中间只来得及吞一粒丹——这是强攻，不是擂台
  const carry: CarryHp = { hp: playerHp(p) };
  const push = async (intro: string, opts: Partial<CombatOpts>): Promise<void> => {
    const r = await combat(p, state.leads, io, { intro, carry, title: `攻伐${target.name}`, ...opts });
    if (r === 'win') wins += 1;
    carry.hp = Math.min(playerHp(p), carry.hp + Math.round(playerHp(p) * 0.1));
  };
  await push('攻破护山大阵，守阵弟子拼死拦截——正是 {enemy}！', { kind: '同门' });
  await push('杀入宗门腹地，内门精英结阵拦路——正是 {enemy}！', { kind: '天骄' });
  await push('直捣宗主大殿，对方宗主亲自迎战——正是 {enemy}！', { foe: `${target.name}宗主`, boost: 1 });

  if (wins === 3) {
    const loot = randint(300, 800) * incomeScale(p.realmIdx);
    p.spirit += loot;
    p.materials['妖兽内丹'] = (p.materials['妖兽内丹'] ?? 0) + 2;
    p.sectContribution += 100;
    const t = upgradeTechnique(p);
    await io.narrate(green(`大胜！你攻破 ${target.name}，掠夺灵石 ${loot}、妖兽内丹×2，贡献 +100。`));
    addBio(p, `率${p.sect}攻破${target.name}`);
    if (t) {
      await io.narrate(green(`并从其藏经阁夺得功法《${t}》（可于「闭关·切换主修」中启用）！`));
    } else {
      await io.narrate(green('其藏经阁中功法皆不如你所学，尽数变卖。'));
    }
  } else if (wins === 2) {
    const loot = randint(150, 400) * incomeScale(p.realmIdx);
    p.spirit += loot;
    await io.narrate(green(`小胜！你击退 ${target.name} 主力，掠夺灵石 ${loot}。`));
  } else {
    const loss = Math.min(p.spirit, randint(100, 300));
    p.spirit -= loss;
    p.heart = Math.max(0, p.heart - 5);
    await io.narrate(red(`战败！你率残部败退，损失灵石 ${loss}，心境 -5。`));
  }
  return true;
}

/** 每年宗门结算（宗主俸禄等），由主循环 yearEnd 调用。 */
export function sectYearEnd(p: Player, io: GameIO): void {
  if (p.sectMaster && p.sect !== '散修') {
    const salary = MASTER_SALARY * incomeScale(p.realmIdx);
    p.spirit += salary;
    io.print(dim(`宗主俸禄 +${salary} 灵石。`));
  }
}

// ---- 拜入 / 改投 / 叛出 ----

/** 加入门槛描述（仅展示用）。 */
function joinReqText(s: SectDef): string {
  const parts: string[] = [];
  if (s.minRealm !== undefined) parts.push(`${REALMS[s.minRealm].name}以上`);
  if (s.needDao) parts.push('有道侣');
  if (s.joinFee) parts.push(`缴${s.joinFee}灵石`);
  return parts.join('、');
}

/** 检查加入门槛，不满足返回原因，满足返回 null。 */
function checkJoinReq(s: SectDef, state: GameState): string | null {
  const p = state.player;
  if (s.minRealm !== undefined && p.realmIdx < s.minRealm) {
    return `修为不足，需 ${REALMS[s.minRealm].name} 以上方可拜入。`;
  }
  if (s.needDao && !state.leads.some((l) => l.dao)) {
    return '你尚未与红颜结为道侣，不得入宗。';
  }
  if (s.joinFee && p.spirit < s.joinFee) {
    return `灵石不足（需缴纳 ${s.joinFee} 灵石拜师费）。`;
  }
  return null;
}

/** 脱离当前宗门（转散修）。返回是否脱离成功。 */
async function leaveSect(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  if (p.sect === '散修') {
    io.print(yellow('你本就是散修，无宗可叛。'));
    await io.pause();
    return false;
  }
  io.print(`你欲脱离 ${p.sect}：`);
  io.print(` 1) 缴纳 ${BETRAY_FEE} 灵石请辞（平稳脱离，无后患）`);
  io.print(` 2) 强行叛逃（被旧宗追杀 ${PURSUIT_YEARS} 年）`);
  io.print(' 0) 作罢');
  const ch = await io.ask('选择：', ['0', '1', '2'], '0');
  if (ch === '0' || ch === '') return false;
  if (ch === '1') {
    if (p.spirit < BETRAY_FEE) {
      io.print(red('灵石不足。'));
      await io.pause();
      return false;
    }
    p.spirit -= BETRAY_FEE;
    await io.narrate(`你缴纳 ${BETRAY_FEE} 灵石，与旧宗好聚好散，从此两不相欠。`);
  } else {
    p.betrayedSect = p.sect;
    p.betrayYears = PURSUIT_YEARS;
    await io.narrate(red(`你强行叛逃！${p.sect} 大为震怒，对你下达追杀令！`));
    addBio(p, `叛出${p.sect}，遭追杀令通缉`);
  }
  p.sect = '散修';
  p.sectContribution = 0;
  p.sectRank = 0;
  await io.narrate(yellow('从此天大地大，你成了无门无派的散修。'));
  return true;
}

/** 拜入/改投宗门。返回是否成功加入。 */
async function joinSect(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const targets = SECTS.filter((s) => s.name !== p.sect);
  io.print('选择拜入的宗门：');
  targets.forEach((s, i) => {
    const req = joinReqText(s);
    io.print(` ${i + 1}) ${s.name}：${s.desc}（${s.bonus}）${req ? dim(`[需${req}]`) : ''}`);
  });
  io.print(' 0) 返回');
  const ch = await io.ask('选择：');
  if (ch === '0' || ch === '') return false;
  const idx = parseInt(ch, 10);
  if (isNaN(idx) || idx < 1 || idx > targets.length) {
    io.print(red('无效编号。'));
    await io.pause();
    return false;
  }
  const target = targets[idx - 1];

  // 先查门槛，再谈脱离（避免脱离旧宗后才发现不够格）
  const fail = checkJoinReq(target, state);
  if (fail) {
    io.print(red(fail));
    await io.pause();
    return false;
  }
  // 已是正式宗门弟子，需先脱离旧宗
  if (p.sect !== '散修') {
    io.print(yellow('改投他宗需先脱离当前宗门。'));
    if (!(await leaveSect(state, io))) return false;
    if (target.name === '散修') return true; // 脱离即完成
  }

  if (target.joinFee) p.spirit -= target.joinFee;
  p.sect = target.name;
  p.sectContribution = 0;
  p.sectRank = 0;
  if (target.skill && !p.skills.includes(target.skill)) p.skills.push(target.skill);
  await io.narrate(green(`你拜入 ${target.name}，从${SECT_RANKS[0]}做起。${target.skill ? `得宗门真传，通晓${target.skill}之术。` : ''}`));
  addBio(p, `改投${target.name}`);
  return true;
}

// ---- 宗门菜单 ----

/** 宗门菜单。返回本回合是否消耗了时间（任务/晋升/加入/脱离成功）。 */
export async function sectMenu(state: GameState, io: GameIO): Promise<boolean> {
  const p = state.player;
  const isFree = p.sect === '散修';
  while (true) {
    await io.clear();
    const def = SECTS.find((s) => s.name === p.sect);
    io.print(magenta('═══ 宗门 ═══'));
    io.print(`当前宗门：${cyan(p.sect)}（${def?.bonus ?? ''}）`);
    if (!isFree) {
      const rank = rankOf(p);
      const maxRank = rank >= SECT_RANKS.length - 1;
      const prog = maxRank
        ? ''
        : `（晋升还需：贡献 ${SECT_RANK_NEED[rank + 1]}，${REALMS[SECT_RANK_REALM[rank + 1]].name}以上）`;
      const masterTag = p.sectMaster ? '（宗主）' : '';
      io.print(`职阶：${SECT_RANKS[rank]}${masterTag}    贡献：${p.sectContribution ?? 0}${prog}`);
    }
    if (def?.technique) io.print(dim(`镇宗功法：《${def.technique}》（藏经阁专属）`));
    if (def?.trait) io.print(dim(`特质：${def.trait}`));
    if (def?.rule) io.print(dim(`门规：${def.rule}`));
    if (p.betrayedSect) {
      io.print(red(`旧宗通缉：被 ${p.betrayedSect} 追杀中（剩 ${p.betrayYears} 年）！`));
    }
    io.print('── 宗门事务 ──');
    if (isFree) {
      io.print(' 1) 拜入宗门');
      io.print(' 0) 返回');
    } else {
      io.print(' 1) 接取宗门任务');
      io.print(` 2) 捐献灵石（每 ${DONATE_RATE} 灵石 = 1 贡献）`);
      io.print(' 3) 晋升考核');
      io.print(` 4) 宗门大比（每 ${TOURNEY_INTERVAL} 年一届 · 需内门以上）`);
      io.print(` 5) 挑战宗主（需长老 · 贡献 ${MASTER_NEED}）`);
      io.print(' 6) 发动宗门战争（仅宗主）');
      io.print(' 7) 宗门宝库（藏经阁 / 聚宝仙楼）');
      io.print(' 8) 拜入/改投宗门');
      io.print(' 9) 叛出宗门（转散修）');
      io.print(' 0) 返回');
    }
    const choices = isFree ? ['0', '1'] : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const ch = await io.ask('选择：', choices, '0');
    if (ch === '0' || ch === '') return false;
    if (isFree) {
      if (await joinSect(state, io)) return true;
      continue;
    }
    if (ch === '1') {
      if (await takeTask(state, io)) return true;
    } else if (ch === '2') {
      await donate(state, io);
    } else if (ch === '3') {
      if (await tryPromote(state, io)) return true;
    } else if (ch === '4') {
      if (await tourney(state, io)) return true;
    } else if (ch === '5') {
      if (await challengeMaster(state, io)) return true;
    } else if (ch === '6') {
      if (await declareWar(state, io)) return true;
    } else if (ch === '7') {
      await treasury(state, io);
    } else if (ch === '8') {
      if (await joinSect(state, io)) return true;
    } else if (await leaveSect(state, io)) {
      return true;
    }
  }
}
