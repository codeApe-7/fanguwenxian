// 女主 / 道侣系统。
// 对白经「性格 × 场景」矩阵查表（content/dialogue.ts）——同一套互动逻辑，
// 八种性格各有措辞；好感 40/70 各有一段一次性的里程碑小剧情。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead } from '../types.js';
import { PERSONALITY_MODS, REALMS, PILLS, MATERIALS, sectOf } from '../content.js';
import { dialogueOf } from '../content/dialogue.js';
import { fill, addBio } from './text.js';
import { green, red, yellow, magenta, dim } from '../colors.js';
import { pick, randint, chance } from './rng.js';

/** 取女主性格的互动倍率（未知性格按 1.0 处理）。 */
function modsOf(l: FemaleLead) {
  return PERSONALITY_MODS[l.personality] ?? { name: l.personality, talk: 1, debate: 1, gift: 1 };
}

/** 对白填充上下文。 */
function ctxOf(p: Player, l: FemaleLead): Record<string, string> {
  return { name: p.name, her: l.name };
}

/** 境界差对好感的修正：红颜高于主角更难打动（每高一阶 ×0.85），低于则略易。 */
function realmGapMult(p: Player, l: FemaleLead): number {
  const gap = l.realmIdx - p.realmIdx;
  if (gap > 0) return Math.pow(0.85, gap);
  if (gap < 0) return Math.pow(1.1, -gap);
  return 1;
}

/** 红颜相对主角高出的境界数（用于论道/双修额外收益）。 */
function realmLead(l: FemaleLead, p: Player): number {
  return Math.max(0, l.realmIdx - p.realmIdx);
}

/**
 * 境界难度系数（与闭关同源）。论道/双修的修为收益按此缩放，
 * 否则高境界下闭关一年仅得数点，而论道/双修恒为两位数，会架空闭关系统。
 */
function realmScale(p: Player): number {
  return REALMS[p.realmIdx]?.difficulty ?? 1;
}

/** 礼物珍贵度 -> 基础好感（越珍贵越高）。 */
function giftFavor(value: number): number {
  return Math.max(1, Math.round(value / 20));
}

/** 红颜随时间成长修为（每年结算，最多领先主角两个大境界，可至渡劫）。 */
export function advanceLeads(leads: FemaleLead[], playerRealm: number): void {
  for (const l of leads) {
    if (l.realmIdx >= playerRealm + 2) continue; // 最多领先主角两阶
    if (!chance(0.2)) continue;
    const realm = REALMS[l.realmIdx];
    if (l.stageIdx < realm.stages.length - 1) {
      l.stageIdx += 1;
    } else if (l.realmIdx < REALMS.length - 1) {
      l.realmIdx += 1;
      l.stageIdx = 0;
    } else {
      continue;
    }
    l.realm = REALMS[l.realmIdx].name + REALMS[l.realmIdx].stages[l.stageIdx];
  }
}

export function leadDescription(l: FemaleLead): string {
  return (
    `${magenta(l.name)} · ${l.title}\n` +
    `    容貌：${l.appearance}  性格：${l.personality}  修为：${l.realm}  好感：${l.favor}`
  );
}

/**
 * 好感里程碑：跨过 40 / 70 时各触发一段一次性小剧情（性格专属）。
 * 每次互动后调用；一次至多触发一段（先 40 后 70，分两次相处触发更有层次）。
 */
async function maybeMilestone(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  lead.seen ??= {};
  const d = dialogueOf(lead.personality);
  if (lead.favor >= 40 && !lead.seen['m40']) {
    lead.seen['m40'] = true;
    io.print();
    for (const line of d.m40) await io.narrate(fill(line, ctxOf(p, lead)));
    p.heart = Math.min(100, p.heart + 3);
    io.print(dim(`（你与 ${lead.name} 之间，有什么悄悄变了。心境 +3）`));
    return;
  }
  if (lead.favor >= 70 && !lead.seen['m70']) {
    lead.seen['m70'] = true;
    io.print();
    for (const line of d.m70) await io.narrate(fill(line, ctxOf(p, lead)));
    p.heart = Math.min(100, p.heart + 5);
    io.print(dim(`（自此，${lead.name} 于你已不是寻常故交。心境 +5）`));
  }
}

/**
 * 拜访红颜。返回消耗的年数——每一次交谈/论道/赠礼/双修各耗时 1 年，
 * 只看不动手则不耗时。若整次拜访不计时，玩家可在一年内反复论道把修为刷满。
 */
export async function romance(p: Player, leads: FemaleLead[], io: GameIO): Promise<number> {
  let years = 0;
  while (true) {
    await io.clear();
    io.print(magenta('═══ 红颜知己 ═══'));
    if (leads.length === 0) {
      io.print('你尚未结识任何佳人，游历天下或可邂逅。');
      return years;
    }
    leads.forEach((l, i) => io.print(` ${i + 1}) ${l.name} ${l.dao ? '【道侣】' : ''}  好感：${l.favor}`));
    io.print(' 0) 返回');
    if (years > 0) io.print(dim(`本次往来已历 ${years} 年。`));
    const ch = await io.ask('选择拜访对象：');
    if (ch === '0' || ch === '') return years;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > leads.length) {
      io.print(red('无效编号。'));
      await io.pause();
      continue;
    }
    years += await visitLead(p, leads[idx - 1], io);
  }
}

/** 与某位红颜相处，返回消耗的年数。 */
async function visitLead(p: Player, lead: FemaleLead, io: GameIO): Promise<number> {
  let years = 0;
  let greeted = false;
  while (true) {
    await io.clear();
    io.print(magenta(`═══ 拜访 ${lead.name} ═══`));
    io.print(leadDescription(lead));
    io.print(dim('─'.repeat(40)));
    if (!greeted) {
      greeted = true;
      await io.narrate(fill(pick(dialogueOf(lead.personality).greet), ctxOf(p, lead)));
    }
    io.print(' 1) 交谈      2) 论道（需好感≥30）');
    io.print(lead.dao ? ' 3) 赠礼      4) 双修' : ' 3) 赠礼      4) 结为道侣（需好感≥80）');
    io.print(' 0) 返回');
    io.print(dim('（交谈/论道/赠礼/双修各耗时 1 年，赠礼被婉拒亦然）'));
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return years;
    const d = dialogueOf(lead.personality);
    if (ch === '1') {
      const g = Math.max(1, Math.round(randint(3, 8) * modsOf(lead).talk * realmGapMult(p, lead)));
      lead.favor = Math.min(100, lead.favor + g);
      await io.narrate(fill(pick(d.talk), ctxOf(p, lead)));
      io.print(green(`一席长谈，好感 +${g}。`));
      await maybeMilestone(p, lead, io);
      years += 1;
    } else if (ch === '2') {
      if (lead.favor < 30) {
        io.print(red('你们还不够熟识。'));
        await io.pause();
        continue;
      }
      const g = Math.max(1, Math.round(randint(5, 12) * modsOf(lead).debate * realmGapMult(p, lead)));
      const cult = Math.max(1, Math.round((8 + realmLead(lead, p) * 4) * realmScale(p)));
      lead.favor = Math.min(100, lead.favor + g);
      p.cultivation = Math.min(100, p.cultivation + cult);
      p.heart = Math.min(100, p.heart + 3);
      await io.narrate(fill(pick(d.debate), ctxOf(p, lead)));
      io.print(green(`论道一载，好感 +${g}，修为 +${cult}，心境 +3。`));
      await maybeMilestone(p, lead, io);
      years += 1;
    } else if (ch === '3') {
      if (await giftLead(p, lead, io)) years += 1;
      else continue;
    } else if (ch === '4') {
      if (lead.dao) {
        await dualCultivate(p, lead, io);
        years += 1;
      } else if (await makeDaoCompanion(p, lead, io)) {
        years += 1;
      }
    }
    await io.pause();
  }
}

/** 赠礼。返回是否真的出手相赠（含被婉拒）——决定是否耗时一年。 */
async function giftLead(p: Player, lead: FemaleLead, io: GameIO): Promise<boolean> {
  while (true) {
    // 动态构建可赠清单：玩家身上有的灵石 / 丹药 / 材料，越珍贵越好
    const gifts: Array<{ label: string; value: number; cost: { spirit?: number; pill?: string; material?: string } }> = [];
    if (p.spirit >= 50) gifts.push({ label: '灵石×50', value: 50, cost: { spirit: 50 } });
    if (p.spirit >= 200) gifts.push({ label: '灵石×200', value: 200, cost: { spirit: 200 } });
    if (p.spirit >= 500) gifts.push({ label: '灵石×500', value: 500, cost: { spirit: 500 } });
    for (const [name, n] of Object.entries(p.pills ?? {})) {
      if (n <= 0) continue;
      gifts.push({ label: `${name}×1`, value: PILLS[name]?.price ?? 0, cost: { pill: name } });
    }
    for (const [name, n] of Object.entries(p.materials ?? {})) {
      if (n <= 0) continue;
      gifts.push({ label: `${name}×1`, value: MATERIALS[name] ?? 0, cost: { material: name } });
    }
    gifts.sort((a, b) => a.value - b.value);
    if (gifts.length === 0) {
      io.print(red('你身无长物，无可相赠。'));
      return false;
    }
    io.print('赠礼（越珍贵，好感越高、越易被接受）：');
    gifts.forEach((g, i) => io.print(` ${i + 1}) ${g.label}（好感约 +${Math.min(100, giftFavor(g.value))}）`));
    io.print(' 0) 返回');
    const ch = await io.ask('选择礼物：');
    if (ch === '0' || ch === '') return false;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > gifts.length) {
      io.print(red('无效编号。'));
      continue;
    }
    const gift = gifts[idx - 1];
    const d = dialogueOf(lead.personality);
    // 接受概率：好感越高、礼物越珍贵越易被接受
    const rejectChance = Math.max(0, 0.75 - lead.favor * 0.01 - gift.value * 0.002);
    if (chance(rejectChance)) {
      // 被婉拒也算出手一次（照样耗时一年），否则可原地重试到接受为止，等同白嫖好感
      await io.narrate(fill(d.giftReject, ctxOf(p, lead)));
      io.print(yellow('礼物被婉拒了。'));
      return true;
    }
    if (gift.cost.spirit) p.spirit -= gift.cost.spirit;
    if (gift.cost.pill) p.pills[gift.cost.pill] -= 1;
    if (gift.cost.material) p.materials[gift.cost.material] -= 1;
    const gain = Math.max(1, Math.round(giftFavor(gift.value) * modsOf(lead).gift * realmGapMult(p, lead)));
    lead.favor = Math.min(100, lead.favor + gain);
    await io.narrate(fill(pick(d.giftAccept), ctxOf(p, lead)));
    io.print(green(`好感 +${gain}。`));
    await maybeMilestone(p, lead, io);
    return true;
  }
}

/** 结为道侣。返回是否成事（决定是否耗时一年）。 */
async function makeDaoCompanion(p: Player, lead: FemaleLead, io: GameIO): Promise<boolean> {
  if (lead.dao) {
    io.print(yellow('她已经是你的道侣了。'));
    return false;
  }
  const need = Math.min(100, 80 + realmLead(lead, p) * 10); // 红颜境界越高，所需好感越高
  if (lead.favor < need) {
    io.print(red(`还不到结为道侣的时候（好感需 ≥${need}，当前 ${lead.favor}）。`));
    return false;
  }
  const d = dialogueOf(lead.personality);
  await io.narrate(`你取出早已备好的信物，向 ${lead.name} 道明心迹。`);
  for (const line of d.dao) await io.narrate(fill(line, ctxOf(p, lead)));
  lead.dao = true;
  p.daoCompanion = lead.name;
  p.heart = Math.min(100, p.heart + 10);
  addBio(p, `与 ${lead.name} 结为道侣`);
  await io.narrate(magenta(`山盟海誓，天地为证。你与 ${lead.name} 结为道侣，从此携手仙途！`));
  await io.narrate('此后拜访她，可与之双修，共参大道（修为收益为论道两倍）。');
  return true;
}

/** 双修（道侣专属）：修为收益为论道两倍，合欢宗等双修宗门再加成，并随境界难度缩放。 */
async function dualCultivate(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  const dual = sectOf(p)?.dualBonus ?? 0; // 合欢宗双修加成 +50%
  // 红颜境界越高收益越大；再按境界难度缩放，避免高境界下反超闭关
  const gain = Math.max(1, Math.round((16 + realmLead(lead, p) * 6) * (1 + dual) * realmScale(p)));
  const favor = randint(5, 10);
  lead.favor = Math.min(100, lead.favor + favor);
  p.cultivation = Math.min(100, p.cultivation + gain);
  p.heart = Math.min(100, p.heart + 2);
  await io.narrate(magenta(`你与 ${lead.name} 灵息相引，坎离既济，共参大道。`));
  await io.narrate(fill(dialogueOf(lead.personality).dual, ctxOf(p, lead)));
  io.print(green(`双修圆满：修为 +${gain}，好感 +${favor}，心境 +2。`));
  if (p.cultivation >= 100) io.print(yellow('修为已臻圆满，可尝试突破境界。'));
}
