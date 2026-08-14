// 战斗系统。

import type { GameIO } from '../io.js';
import type { Player, FemaleLead } from '../types.js';
import { ENEMY_POOL, TREASURES, MATERIALS, TALISMANS, TECHNIQUES, SPELLS, realmAbs, sectOf, playerAttack, playerDefense, playerHp, incomeScale } from '../content.js';
import { green, red, yellow, cyan, dim } from '../colors.js';
import { pick, randint, chance } from './rng.js';

export interface Enemy {
  name: string;
  hp: number;
  atk: number;
  def: number;
  loot: number;
}

export function makeEnemy(p: Player, boost = 0): Enemy {
  const tier = Math.min(2, Math.floor(p.realmIdx / 3));
  const name = pick(ENEMY_POOL[tier]);
  const abs = p.realmIdx * 4 + p.stageIdx;
  const level = Math.max(0, abs + pick([-1, 0, 0, 1, 1]) + boost);
  return {
    name,
    hp: 30 + level * 18,
    atk: 6 + level * 4,
    def: 2 + level * 2,
    loot: randint(20, 60) * incomeScale(p.realmIdx),
  };
}

export type CombatResult = 'win' | 'lose' | 'escape';

export async function combat(
  p: Player,
  leads: FemaleLead[],
  io: GameIO,
  intro?: string, // 可选开场白，占位符 {enemy} 会被替换为敌人名
  boost = 0,      // 敌人等级加成（宗门任务难度）
): Promise<CombatResult> {
  const enemy = makeEnemy(p, boost);
  await io.clear();
  const line = (intro ?? '你于荒野之中遭遇了 {enemy}！').replace('{enemy}', red(enemy.name));
  await io.narrate(line);

  let php = playerHp(p);
  let ehp = enemy.hp;
  let turn = 1;
  let buffAtk = 0;   // 本场战斗攻击增益
  let stunTurns = 0; // 敌人被定身回合数
  const spellLeft = new Map<string, number>(); // 每战神通剩余次数
  for (const s of p.spells ?? []) {
    const def = SPELLS[s];
    if (def) spellLeft.set(s, def.uses);
  }

  while (php > 0 && ehp > 0) {
    io.print(dim(`—— 第 ${turn} 回合 ——`));
    io.print(`你：气血 ${php}/${playerHp(p)}    敌人 ${enemy.name}：气血 ${Math.max(0, ehp)}`);
    const hasSpell = (p.spells ?? []).length > 0;
    // 施法为主输出（置顶），普通攻击为兜底；Enter 默认落在普通攻击上，保证兜底不卡死
    const actions: Array<{ key: string; label: string }> = [];
    if (hasSpell) actions.push({ key: 'spell', label: '施法' });
    actions.push({ key: 'attack', label: '普通攻击' });
    actions.push({ key: 'heal', label: '疗伤' });
    actions.push({ key: 'talisman', label: '符箓' });
    actions.push({ key: 'escape', label: '逃跑' });
    const prompt = '选择行动：' + actions.map((a, i) => `${i + 1})${a.label}`).join(' ');
    const choices = actions.map((_, i) => String(i + 1));
    const defChoice = String(actions.findIndex((a) => a.key === 'attack') + 1);
    const choice = await io.ask(prompt, choices, defChoice);
    const idx = parseInt(choice, 10);
    if (isNaN(idx) || idx < 1 || idx > actions.length) continue;
    const action = actions[idx - 1].key;

    if (action === 'attack') {
      const dmg = Math.max(1, Math.round(playerAttack(p) * 0.6) + buffAtk - enemy.def + randint(-2, 2));
      ehp -= dmg;
      io.print(`你凝神一击，造成 ${green(String(dmg))} 点伤害！`);
    } else if (action === 'heal') {
      if ((p.pills['疗伤丹'] ?? 0) > 0) {
        p.pills['疗伤丹'] -= 1;
        php = Math.min(playerHp(p), php + 40);
        io.print(green('你服下疗伤丹，气血恢复。'));
      } else if ((p.pills['回春丹'] ?? 0) > 0) {
        p.pills['回春丹'] -= 1;
        php = Math.min(playerHp(p), php + 100);
        io.print(green('你服下回春丹，气血大复！'));
      } else {
        io.print(red('你没有疗伤丹药。'));
        continue;
      }
    } else if (action === 'talisman') {
      if ((p.talismans['烈焰符'] ?? 0) > 0) {
        p.talismans['烈焰符'] -= 1;
        const dmg = TALISMANS['烈焰符'].value;
        ehp -= dmg;
        io.print(`你掷出烈焰符，烈焰吞没敌人，造成 ${green(String(dmg))} 点伤害！`);
      } else if ((p.talismans['护身符'] ?? 0) > 0) {
        p.talismans['护身符'] -= 1;
        const heal = TALISMANS['护身符'].value;
        php = Math.min(playerHp(p), php + heal);
        io.print(green(`你祭出护身符，护体神光流转，恢复 ${heal} 点气血。`));
      } else {
        io.print(red('你没有符箓。'));
        continue;
      }
    } else if (action === 'spell') {
      const avail = (p.spells ?? []).filter((s) => (spellLeft.get(s) ?? 0) > 0);
      if (avail.length === 0) {
        io.print(red('你尚未修习神通（或已用尽）。'));
        continue;
      }
      io.print(cyan('—— 神通 ——'));
      avail.forEach((s, i) => io.print(` ${i + 1}) ${s}：${SPELLS[s].desc}（剩 ${spellLeft.get(s)} 次）`));
      const sc = await io.ask('施展：');
      const si = parseInt(sc, 10);
      if (isNaN(si) || si < 1 || si > avail.length) {
        io.print(red('无效编号。'));
        continue;
      }
      const sname = avail[si - 1];
      const spell = SPELLS[sname];
      spellLeft.set(sname, (spellLeft.get(sname) ?? 0) - 1);
      if (spell.type === 'atk') {
        const dmg = Math.max(1, spell.value + Math.round(playerAttack(p) * 0.9) - enemy.def + randint(-2, 2));
        ehp -= dmg;
        io.print(`你施展 ${cyan(spell.name)}，造成 ${green(String(dmg))} 点伤害！`);
      } else if (spell.type === 'heal') {
        const heal = spell.value + realmAbs(p) * 2;
        php = Math.min(playerHp(p), php + heal);
        io.print(green(`你施展 ${spell.name}，恢复 ${heal} 点气血。`));
      } else if (spell.type === 'buff') {
        buffAtk += spell.value;
        io.print(green(`你施展 ${spell.name}，本场战斗攻击 +${spell.value}。`));
      } else if (spell.type === 'debuff') {
        enemy.atk = Math.max(1, enemy.atk - spell.value);
        io.print(yellow(`你施展 ${spell.name}，敌人攻势大减。`));
      } else if (spell.type === 'stun') {
        stunTurns = 1;
        io.print(yellow(`你施展 ${spell.name}，敌人被定住一回合！`));
      } else {
        await io.narrate(yellow(`你施展 ${spell.name}，遁入土中，成功逃脱！`));
        return 'escape';
      }
    } else {
      if (chance(0.6)) {
        await io.narrate(yellow('你且战且退，成功逃脱。'));
        return 'escape';
      }
      await io.narrate(red('逃跑失败，被敌人追上！'));
    }

    if (ehp > 0) {
      if (stunTurns > 0) {
        stunTurns -= 1;
        io.print(dim('敌人仍被神通所困，动弹不得！'));
      } else {
        const dmg = Math.max(1, enemy.atk - playerDefense(p) + randint(-2, 2));
        php -= dmg;
        io.print(`${enemy.name} 反击，你受到 ${red(String(dmg))} 点伤害！`);
      }
    }
    turn += 1;
  }

  if (php <= 0) {
    await io.narrate(red('你力竭倒下，被敌人重创！'));
    p.spirit = Math.max(0, p.spirit - Math.floor(enemy.loot / 2));
    p.heart = Math.max(0, p.heart - 5);
    await io.narrate(`你狼狈逃脱，遗失灵石若干（剩 ${p.spirit}）。`);
    return 'lose';
  }

  await io.narrate(green(`你击杀了 ${enemy.name}！`));
  p.fightsWon += 1;
  let loot = enemy.loot;
  if (sectOf(p)?.traitKey === 'battleLoot') loot = Math.floor(loot * 1.2); // 血煞魔宗杀伐证道
  p.spirit += loot;
  io.print(`搜刮战场，获得 ${yellow(String(loot))} 灵石。`);
  if (sectOf(p)?.traitKey === 'battleHeart') {
    p.heart = Math.min(100, p.heart + 1); // 太乙剑宗剑心通明
    io.print(dim('剑心通明，心境 +1。'));
  }
  if (chance(0.1)) {
    const t = pick(Object.keys(TECHNIQUES));
    p.fragments[t] = (p.fragments[t] ?? 0) + 1;
    io.print(dim(`缴获《${t}》残篇×1。`));
  }
  if (chance(0.35)) {
    const mat = pick(Object.keys(MATERIALS));
    const qty = 1 + Math.floor(p.realmIdx / 2); // 材料产出随境界适度放大
    p.materials[mat] = (p.materials[mat] ?? 0) + qty;
    io.print(`并获得 ${cyan(mat)}×${qty}。`);
  }
  if (chance(0.12)) {
    const t = pick(Object.keys(TREASURES));
    const curAtk = TREASURES[p.treasure]?.atk ?? 0;
    if (TREASURES[t].atk > curAtk) {
      p.treasure = t;
      io.print(`缴获法宝 ${cyan(t)}！`);
    } else {
      io.print(`缴获法宝 ${t}，但不如你现有法宝，弃之。`);
    }
  }
  return 'win';
}
