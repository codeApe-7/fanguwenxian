// 世界纪事：世界按自己的日程运转，你赶不赶得上是你的事。
//
// - 周期事件（every N 年）给时间轴打节拍：等待与闭关自此「有指向」。
// - 一次性大事带绝对年份窗口与双向境界门槛：太慢错过，冲太快也错过；
//   窗口关闭当年播报错过反馈——玩家要知道自己错过了什么。
// - 传音投递（content/letters.ts）：条件满足→随机延迟挂起→每年至多送达一封。

import type { GameIO } from '../io.js';
import type { GameState, Player } from '../types.js';
import { REALMS, TREASURES, PILLS, incomeScale, playerTitle, betterTreasures, treasureSummary } from '../content.js';
import { LETTERS } from '../content/letters.js';
import { applyStoryEffects } from './storyline.js';
import { dialogueOf } from '../content/dialogue.js';
import { fill, eraYear, addBio } from './text.js';
import { combat } from './combat.js';
import { pick, randint } from './rng.js';
import { green, red, yellow, cyan, magenta, dim } from '../colors.js';

// ---- 世界大事定义 ----

export interface WorldEventDef {
  id: string;
  name: string;
  /** 周期（年）；缺省为一次性事件。 */
  every?: number;
  /** 首届 / 窗口开启年。 */
  startYear: number;
  /** 一次性事件的窗口关闭年（含当年）。 */
  endYear?: number;
  /** 参与门槛：境界窗（双向）与年齿上限。 */
  realmMin?: number;
  realmMax?: number;
  ageMax?: number;
  /** 世界层旁白：这件事在世界里是什么（不含主角视角）。 */
  world: string[];
  /** 参与流程。 */
  run?: (state: GameState, io: GameIO) => Promise<void>;
  /** 一次性事件的错过反馈。 */
  missText?: string[];
}

export const WORLD_EVENTS: WorldEventDef[] = [
  // —— 周期 · 青崖英杰会（练气/筑基的年轻人擂台） ——
  {
    id: '英杰会', name: '青崖英杰会', every: 5, startYear: 105,
    realmMax: 1, ageMax: 60,
    world: [
      '青崖山每五年开一次「英杰会」，只收«筑基以下»、年岁«六十以内»的年轻修士登台论剑。',
      '九州各宗都派人来相看苗子——擂台上露过脸的，往后行走坊市都好使三分脸面。',
    ],
    run: async (state, io) => {
      const p = state.player;
      const ch = await io.ask('是否登台一试？(y/n)', ['y', 'n'], 'y');
      if (ch !== 'y') {
        io.print(dim('你在台下看了半日热闹，各自散去。'));
        return;
      }
      const r = await combat(p, state.leads, io, {
        intro: '擂台之上，与你对阵的同辈天骄气势如虹——正是 {enemy}！',
        kind: '天骄',
        fight: '擂台',
        noItems: true, // 英杰会同例：解去丹药法器登台
        title: '青崖英杰会 · 擂台',
      });
      if (r === 'win') {
        const reward = 120 * incomeScale(p.realmIdx);
        p.spirit += reward;
        p.heart = Math.min(100, p.heart + 4);
        p.flags['英杰'] = (p.flags['英杰'] ?? 0) + 1;
        if (p.sect !== '散修') p.sectContribution += 30;
        await io.narrate(green(`你连胜数阵，跻身本届英杰之列！彩头 ${reward} 灵石${p.sect !== '散修' ? '，宗门与有荣焉（贡献 +30）' : ''}。`));
        addBio(p, '青崖英杰会登台夺魁');
      } else {
        p.spirit += 30;
        p.heart = Math.max(0, p.heart - 2);
        await io.narrate(yellow('你止步台下数轮，得了份安慰彩头。英杰路远，来届再战。'));
      }
    },
  },
  // —— 周期 · 四海拍卖大会 ——
  {
    id: '拍卖会', name: '四海拍卖大会', every: 10, startYear: 108,
    world: [
      '十年一度的四海拍卖大会开锣，百宝斋坐庄，九州奇珍云集。',
      '常有急于出手的卖家压价求快——识货的人，能在这里捡到真便宜。',
    ],
    run: async (state, io) => {
      const p = state.player;
      const vip = (p.flags['百宝贵客'] ?? 0) >= 1;
      const rate = vip ? 0.7 : 0.8;
      // 拍品一：优于现有的法宝
      const better = betterTreasures(p);
      if (better.length > 0) {
        const t = pick(better);
        const price = Math.floor(TREASURES[t].price * rate);
        io.print(`压轴拍品：法宝 ${cyan(t)}（${treasureSummary(t)}），落槌价约 ${price} 灵石${vip ? dim('（贵客青帖让利）') : ''}。`);
        if (p.spirit >= price) {
          const ch = await io.ask(`出价 ${price} 灵石竞拍？(y/n)`, ['y', 'n'], 'n');
          if (ch === 'y') {
            p.spirit -= price;
            p.treasure = t;
            io.print(green(`一槌定音，${t} 归你！`));
          }
        } else {
          io.print(dim('可惜你囊中灵石不足，只得眼看它花落别家。'));
        }
      }
      // 拍品二：本境突破丹
      const pillName = REALMS[p.realmIdx].breakPill;
      if (pillName) {
        const price = Math.floor((PILLS[pillName]?.price ?? 0) * rate);
        if (price > 0) {
          io.print(`另有一枚 ${yellow(pillName)} 流拍再上，落槌价约 ${price} 灵石。`);
          if (p.spirit >= price) {
            const ch = await io.ask(`出价 ${price} 灵石拍下？(y/n)`, ['y', 'n'], 'n');
            if (ch === 'y') {
              p.spirit -= price;
              p.pills[pillName] = (p.pills[pillName] ?? 0) + 1;
              io.print(green(`拍得 ${pillName}×1。`));
            }
          }
        }
      }
    },
  },
  // —— 周期 · 甲子灵潮 ——
  {
    id: '灵潮', name: '甲子灵潮', every: 60, startYear: 132,
    world: [
      '甲子一轮，天地灵气如潮汛涨落。今岁灵潮大盛，九州灵脉齐鸣，草木一夜抽新。',
      '老修士们纷纷闭关——«未来五年»，吐纳事半功倍，错过再等一甲子。',
    ],
    run: async (state, io) => {
      const p = state.player;
      p.spiritWarm = (p.spiritWarm ?? 0) + 5;
      io.print(green(`灵潮灌顶，未来 ${p.spiritWarm} 年闭关效率 +20%。`));
      addBio(p, '逢甲子灵潮，天地同修');
    },
  },
  // —— 一次性 · 玄阴魔乱 ——
  {
    id: '魔乱', name: '玄阴魔乱', startYear: 120, endYear: 135, realmMin: 1,
    world: [
      '玄启一百二十年，魔道巨擘「玄阴老祖」出关，纠集群魔连破正道七城，九州震动。',
      '昭衡司广发英雄帖，正邪之战一触即发——乱世已至，人人都得选个站处。',
    ],
    run: async (state, io) => {
      const p = state.player;
      const evil = (p.flags['魔道'] ?? 0) >= 1 || p.sect === '血煞魔宗';
      io.print(' 1) 应昭衡司之召，助正道御魔');
      io.print(' 2) 乱世自保，闭门不出');
      if (evil) io.print(' 3) 浑水摸鱼，趁乱取利');
      const choices = evil ? ['1', '2', '3'] : ['1', '2'];
      const ch = await io.ask('你的选择：', choices, '2');
      if (ch === '1') {
        const r = await combat(p, state.leads, io, {
          intro: '御魔前线，一名魔将裹着尸气当面撞阵——正是 {enemy}！',
          boost: 1, kind: '魔修', title: '玄阴魔乱 · 御魔前线',
        });
        if (r === 'win') {
          const reward = 200 * incomeScale(p.realmIdx);
          p.spirit += reward;
          p.flags['卫道'] = (p.flags['卫道'] ?? 0) + 1;
          p.heart = Math.min(100, p.heart + 5);
          await io.narrate(green(`你阵斩魔将，随联军收复两城。犒赏 ${reward} 灵石，「卫道」之名录入军功簿。`));
          addBio(p, '玄阴魔乱助正道御魔，阵斩魔将');
        } else {
          p.heart = Math.max(0, p.heart - 5);
          await io.narrate(red('前线失利，你负伤随军后撤。乱世刀兵，几人全身。'));
        }
      } else if (ch === '3') {
        const r = await combat(p, state.leads, io, {
          intro: '你趁乱潜入一座被弃的坊市宝库，一名同样来「取利」的魔修拦路——正是 {enemy}！',
          boost: 1, kind: '魔修', title: '玄阴魔乱 · 空城取利',
        });
        if (r === 'win') {
          const loot = 400 * incomeScale(p.realmIdx);
          p.spirit += loot;
          p.flags['乱世枭行'] = (p.flags['乱世枭行'] ?? 0) + 1;
          p.heart = Math.max(0, p.heart - 3);
          await io.narrate(yellow(`乱世横财，落袋 ${loot} 灵石。这笔账，将来太平了未必没人翻。`));
          addBio(p, '玄阴魔乱中趁乱取利');
        } else {
          await io.narrate(red('黑吃黑失手，你负伤空手而归。'));
        }
      } else {
        p.heart = Math.max(0, p.heart - 3);
        await io.narrate(dim('你封了洞府静修。烽烟在山外烧了十几年，你的蒲团纹丝未动——只是偶尔夜里，会听见山下逃难的人声。'));
      }
    },
    missText: [
      '玄阴魔乱平息的消息传来时，一切都结束了：老祖伏诛，七城易主又复归，功劳簿上写满了别人的名字。',
      '那几年你尚无力登台——乱世的戏，你只赶上了散场。',
    ],
  },
  // —— 一次性 · 沉星海眼 ——
  {
    id: '海眼', name: '沉星海眼', startYear: 150, endYear: 185, realmMin: 2, realmMax: 4,
    world: [
      '玄启一百五十年起，东海之上现出一处巨大的漩涡，古称「沉星海眼」，传为上古陨星入海之地。',
      '海眼灵机吞吐有度：修为浅者入之即溺，神通过盛者又为其所斥——只容«结丹至化神»的修士入内探宝。',
    ],
    run: async (state, io) => {
      const p = state.player;
      const ch = await io.ask('是否入海眼探宝？(y/n)', ['y', 'n'], 'y');
      if (ch !== 'y') {
        io.print(dim('你在海船上远远看了一眼那道漩涡，终究没有下去。'));
        return;
      }
      await io.narrate('你随灵潮沉入海眼。水下别有洞天：陨星残骸悬浮如林，星髓的清辉里游着通体透明的鱼。');
      const r = await combat(p, state.leads, io, {
        intro: '星骸林深处，一头以星髓为食的凶物睁开了眼——正是 {enemy}！',
        boost: 1, kind: '妖兽', title: '沉星海眼 · 星骸林',
      });
      if (r === 'win') {
        p.fragments['造化长生经'] = (p.fragments['造化长生经'] ?? 0) + 1;
        p.materials['灵石精'] = (p.materials['灵石精'] ?? 0) + 3;
        p.flags['海眼'] = 1;
        await io.narrate(green('凶物遁走。你在最大的一块陨星里凿出三块灵石精，又于星核之中得残卷一篇——竟是仙品《造化长生经》残篇！'));
        addBio(p, '入沉星海眼，得仙品残篇');
      } else {
        p.heart = Math.max(0, p.heart - 5);
        await io.narrate(red('凶物凶悍，你负伤浮出海面。海眼仍在，伤好之前，先别想它。'));
      }
    },
    missText: [
      '玄启一百八十五年，沉星海眼无声闭合，如一只倦极的眼睛。',
      '三十五年窗口，你或是修为未及，或是神通过盛，终究无缘一见星骸之林。海底的机缘，留给下一个千年了。',
    ],
  },
  // —— 一次性 · 天门虚影 ——
  {
    id: '天门', name: '天门虚影', startYear: 235, endYear: 260, realmMin: 6,
    world: [
      '玄启二百三十五年起，每逢朔月，九霄之上隐现一道门形虚影，霞光垂落如瀑。',
      '古籍称之「天门映世」，千载难逢——«合体以上»的大能凝神仰观，或可窥见天阶一角。',
    ],
    run: async (state, io) => {
      const p = state.player;
      await io.narrate('你登上万仞孤峰，于朔月之夜凝望天门虚影。');
      await io.narrate('霞光落在眉心的一瞬，你「看」见了门后的一线：那里没有云海仙宫，只有一条向上的路——和你脚下这条，并无不同。');
      p.flags['见天门'] = 1;
      p.heart = Math.min(100, p.heart + 10);
      await io.narrate(green('道心一片澄明。他日渡劫，此番所见必有助益。'));
      addBio(p, '朔月之夜，得窥天门虚影');
    },
    missText: ['天门虚影隐没的那年，你尚未臻合体之境。有些风景，只在山顶才看得见。'],
  },
];

// ---- 状态栏提示：下一桩世界大事 ----

/** 计算下一桩（含正在进行的）世界大事，供状态栏「等待有指向」。 */
export function nextWorldEvent(year: number, p: Player): { name: string; year: number } | null {
  let best: { name: string; year: number } | null = null;
  for (const ev of WORLD_EVENTS) {
    let next: number | null = null;
    if (ev.every) {
      next = ev.startYear >= year ? ev.startYear : year + ((ev.every - ((year - ev.startYear) % ev.every)) % ev.every);
    } else if (!p.worldSeen.includes(ev.id) && year <= (ev.endYear ?? ev.startYear)) {
      next = Math.max(year, ev.startYear);
    }
    if (next !== null && (best === null || next < best.year)) {
      best = { name: ev.name, year: next };
    }
  }
  return best;
}

// ---- 年末结算：世界大事 + 传音投递 ----

function qualifies(p: Player, ev: WorldEventDef): boolean {
  if (ev.realmMin !== undefined && p.realmIdx < ev.realmMin) return false;
  if (ev.realmMax !== undefined && p.realmIdx > ev.realmMax) return false;
  if (ev.ageMax !== undefined && p.age > ev.ageMax) return false;
  return true;
}

async function announceEvent(state: GameState, io: GameIO, ev: WorldEventDef): Promise<void> {
  io.print();
  await io.narrate(magenta(`【${eraYear(state.year)} · ${ev.name}】`));
  for (const line of ev.world) await io.narrate(fill(line, { name: state.player.name, realm: playerTitle(state.player) }));
  if (ev.run) await ev.run(state, io);
}

/** 每年调用：结算世界大事与传音（错过的一次性大事在关窗次年播报）。 */
export async function worldTick(state: GameState, io: GameIO): Promise<void> {
  const p = state.player;
  p.worldSeen ??= [];
  p.lettersSent ??= [];
  p.pendingLetters ??= [];

  // 1) 世界大事
  for (const ev of WORLD_EVENTS) {
    if (ev.every) {
      const due = state.year >= ev.startYear && (state.year - ev.startYear) % ev.every === 0;
      if (due && qualifies(p, ev)) await announceEvent(state, io, ev);
      continue;
    }
    const seen = p.worldSeen.includes(ev.id);
    const end = ev.endYear ?? ev.startYear;
    if (!seen && state.year >= ev.startYear && state.year <= end) {
      if (qualifies(p, ev)) {
        p.worldSeen.push(ev.id);
        await announceEvent(state, io, ev);
      }
    } else if (!seen && state.year === end + 1) {
      p.worldSeen.push(ev.id);
      if (ev.missText) {
        io.print();
        await io.narrate(yellow(`【错过 · ${ev.name}】`));
        for (const line of ev.missText) await io.narrate(line);
        addBio(p, `错过了「${ev.name}」`);
      }
    }
  }

  // 2) 传音：条件满足 → 随机延迟挂起
  for (const def of LETTERS) {
    if (def.forLead) {
      for (const lead of state.leads) {
        const id = `${def.id}:${lead.name}`;
        if (p.lettersSent.includes(id) || p.pendingLetters.some((x) => x.id === id)) continue;
        if (def.when(state, lead)) p.pendingLetters.push({ id, dueYear: state.year + randint(def.delay[0], def.delay[1]) });
      }
    } else {
      if (p.lettersSent.includes(def.id) || p.pendingLetters.some((x) => x.id === def.id)) continue;
      if (def.when(state)) p.pendingLetters.push({ id: def.id, dueYear: state.year + randint(def.delay[0], def.delay[1]) });
    }
  }

  // 3) 送达（每年至多一封，余者顺延）
  const dueIdx = p.pendingLetters.findIndex((x) => x.dueYear <= state.year);
  if (dueIdx >= 0) {
    const { id } = p.pendingLetters[dueIdx];
    p.pendingLetters.splice(dueIdx, 1);
    p.lettersSent.push(id);
    const [baseId, leadName] = id.includes(':') ? id.split(':') : [id, undefined];
    const def = LETTERS.find((x) => x.id === baseId);
    const lead = leadName ? state.leads.find((l) => l.name === leadName) : undefined;
    if (def && (!def.forLead || lead)) {
      io.print();
      io.print(cyan('【传音】'));
      await io.narrate(def.intro ?? '一道传音符破空而至，悬在你眉前嗡嗡轻颤。');
      const ctx = { name: p.name, her: lead?.name ?? '' };
      if (def.forLead && lead) {
        await io.narrate(fill(dialogueOf(lead.personality).letterOpen, ctx));
      }
      if (def.text) for (const line of def.text) await io.narrate(fill(line, ctx));
      applyStoryEffects(state, def.effects);
      if (def.run) await def.run(state, io, lead);
    }
  }
}
