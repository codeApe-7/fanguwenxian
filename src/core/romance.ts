// 女主 / 道侣系统。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead } from '../types.js';
import { PERSONALITY_MODS, REALMS, sectOf } from '../content.js';
import { green, red, yellow, magenta, dim } from '../colors.js';
import { randint, chance } from './rng.js';

/** 取女主性格的互动倍率（未知性格按 1.0 处理）。 */
function modsOf(l: FemaleLead) {
  return PERSONALITY_MODS[l.personality] ?? { name: l.personality, talk: 1, debate: 1, gift: 1 };
}

/** 红颜随时间成长修为（每年结算，成长慢于主角，不超过主角当前大境界）。 */
export function advanceLeads(leads: FemaleLead[], playerRealm: number): void {
  for (const l of leads) {
    if (l.realmIdx >= playerRealm) continue; // 不超越主角
    if (!chance(0.2)) continue;
    const realm = REALMS[l.realmIdx];
    if (l.stageIdx < realm.stages.length - 1) {
      l.stageIdx += 1;
    } else if (l.realmIdx < REALMS.length - 2) {
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

export async function romance(p: Player, leads: FemaleLead[], io: GameIO): Promise<void> {
  while (true) {
    await io.clear();
    io.print(magenta('═══ 红颜知己 ═══'));
    if (leads.length === 0) {
      io.print('你尚未结识任何佳人，游历天下或可邂逅。');
      return;
    }
    leads.forEach((l, i) => io.print(` ${i + 1}) ${l.name} ${l.dao ? '【道侣】' : ''}  好感：${l.favor}`));
    io.print(' 0) 返回');
    const ch = await io.ask('选择拜访对象：');
    if (ch === '0' || ch === '') return;
    const idx = parseInt(ch, 10);
    if (isNaN(idx) || idx < 1 || idx > leads.length) {
      io.print(red('无效编号。'));
      await io.pause();
      continue;
    }
    await visitLead(p, leads[idx - 1], io);
  }
}

async function visitLead(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  while (true) {
    await io.clear();
    io.print(magenta(`═══ 拜访 ${lead.name} ═══`));
    io.print(leadDescription(lead));
    io.print(dim('─'.repeat(40)));
    io.print(' 1) 交谈      2) 论道（需好感≥30）');
    io.print(lead.dao ? ' 3) 赠礼      4) 双修' : ' 3) 赠礼      4) 结为道侣（需好感≥80）');
    io.print(' 0) 返回');
    const ch = await io.ask('选择：');
    if (ch === '0' || ch === '') return;
    if (ch === '1') {
      const g = Math.max(1, Math.round(randint(3, 8) * modsOf(lead).talk));
      lead.favor = Math.min(100, lead.favor + g);
      io.print(green(`你与 ${lead.name} 相谈甚欢，好感 +${g}。`));
    } else if (ch === '2') {
      if (lead.favor < 30) {
        io.print(red('你们还不够熟识。'));
        await io.pause();
        continue;
      }
      const g = Math.max(1, Math.round(randint(5, 12) * modsOf(lead).debate));
      lead.favor = Math.min(100, lead.favor + g);
      p.cultivation = Math.min(100, p.cultivation + 8);
      p.heart = Math.min(100, p.heart + 3);
      io.print(green(`你与 ${lead.name} 论道半日，好感 +${g}，修为 +8。`));
    } else if (ch === '3') {
      await giftLead(p, lead, io);
    } else if (ch === '4') {
      if (lead.dao) await dualCultivate(p, lead, io);
      else await makeDaoCompanion(p, lead, io);
    }
    await io.pause();
  }
}

async function giftLead(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  io.print('赠礼： 1) 灵石50  2) 灵石200  3) 凝气丹  4) 聚灵丹');
  const ch = await io.ask('选择礼物：');
  const gains: Record<string, number> = { '1': 4, '2': 12, '3': 6, '4': 10 };
  if (!(ch in gains)) {
    io.print(red('无效选择。'));
    return;
  }
  if (ch === '1' || ch === '2') {
    const cost = ch === '1' ? 50 : 200;
    if (p.spirit < cost) {
      io.print(red('灵石不足。'));
      return;
    }
    p.spirit -= cost;
  } else {
    const pill = ch === '3' ? '凝气丹' : '聚灵丹';
    if ((p.pills[pill] ?? 0) <= 0) {
      io.print(red(`你没有 ${pill}。`));
      return;
    }
    p.pills[pill] -= 1;
  }
  const gain = Math.max(1, Math.round(gains[ch] * modsOf(lead).gift));
  lead.favor = Math.min(100, lead.favor + gain);
  io.print(green(`${lead.name} 收下礼物，好感 +${gain}。`));
}

async function makeDaoCompanion(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  if (lead.dao) {
    io.print(yellow('她已经是你的道侣了。'));
    return;
  }
  if (lead.favor < 80) {
    io.print(red('你们的情意尚浅，还不到结为道侣的时候。'));
    return;
  }
  lead.dao = true;
  p.daoCompanion = lead.name;
  p.heart = Math.min(100, p.heart + 10);
  await io.narrate(magenta(`山盟海誓，天地为证。你与 ${lead.name} 结为道侣，从此携手仙途！`));
  await io.narrate('此后拜访她，可与之双修，共参大道（修为收益为论道两倍）。');
}

/** 双修（道侣专属）：修为收益为论道两倍（16），合欢宗等双修宗门再加成。 */
async function dualCultivate(p: Player, lead: FemaleLead, io: GameIO): Promise<void> {
  const dual = sectOf(p)?.dualBonus ?? 0; // 合欢宗双修加成 +50%
  const gain = Math.round(16 * (1 + dual));
  const favor = randint(5, 10);
  lead.favor = Math.min(100, lead.favor + favor);
  p.cultivation = Math.min(100, p.cultivation + gain);
  p.heart = Math.min(100, p.heart + 2);
  await io.narrate(magenta(`你与 ${lead.name} 阴阳和合，共参大道。`));
  io.print(green(`双修圆满：修为 +${gain}，好感 +${favor}，心境 +2。`));
  if (p.cultivation >= 100) io.print(yellow('修为已臻圆满，可尝试突破境界。'));
}
