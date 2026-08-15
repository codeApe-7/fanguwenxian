// 存档持久化适配层（Node 文件系统）。
// 迁移网页时替换本模块为 localStorage 即可，其余代码不变。

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GameIO } from './io.js';
import type { GameState } from './types.js';
import { REALMS, ELEMENTS, rootsFor } from './content.js';
import { yearOfAge } from './core/text.js';
import { green, red } from './colors.js';

// 存档写入用户主目录，避免落在包安装目录（npx/全局安装下不稳定且易被覆盖）。
// QA 脚本（playtest/selfplay）用 FANGU_SAVE_DIR 重定向存档，避免自动通关覆盖真实存档。
const saveDir = () => process.env.FANGU_SAVE_DIR ?? join(homedir(), '.fangu-wenxian');
const saveFile = () => join(saveDir(), 'savegame.json');

export function hasSave(): boolean {
  return existsSync(saveFile());
}

export function saveGame(state: GameState, io: GameIO): void {
  try {
    mkdirSync(saveDir(), { recursive: true });
    writeFileSync(saveFile(), JSON.stringify(state, null, 2), 'utf-8');
    io.print(green('存档成功！'));
  } catch (e) {
    io.print(red(`存档失败：${(e as Error).message}`));
  }
}

export function loadGame(io: GameIO): GameState | null {
  if (!existsSync(saveFile())) return null;
  try {
    const data = JSON.parse(readFileSync(saveFile(), 'utf-8'));
    if (!data || !data.player || typeof data.player.realmIdx !== 'number') return null;
    const s = data as GameState;
    // 旧存档字段迁移：补齐新增字段默认值
    const p = s.player;
    p.scenario ??= '';
    p.storyStep ??= 0;
    p.betrayedSect ??= null;
    p.betrayYears ??= 0;
    p.sectContribution ??= 0;
    p.sectRank ??= 0;
    p.sectMaster ??= false;
    p.mastered ??= [];
    p.techProficiency ??= {};
    p.techProficiency[p.technique] ??= 0; // 当前主修纳入已习得列表
    p.fragments ??= {};
    p.spells ??= [];
    p.pillToxin ??= 0;
    p.aptitude ??= 1.0;
    p.skills ??= [];
    p.formation ??= '无';
    p.talismans ??= {};
    // —— 战斗与数值重做（0.7.0）字段迁移 ——
    p.spellLv ??= {};
    for (const s of p.spells) p.spellLv[s] ??= 1;
    p.insight ??= 0;
    p.abode ??= '山中茅舍';
    p.goldenCore ??= null;
    p.yuanying ??= null;
    p.daoPath ??= null;
    // 旧档没有五行灵根值：按灵根档位铺一副（金为主），保证战斗乘区有数可用
    if (!p.roots || typeof p.roots !== 'object') p.roots = rootsFor(p.root, ELEMENTS);
    // —— 剧情引擎（0.6.0）字段迁移 ——
    p.storyDone ??= [];
    p.storyMissed ??= [];
    p.flags ??= {};
    p.biography ??= [];
    p.taskCd ??= {};
    p.lettersSent ??= [];
    p.pendingLetters ??= [];
    p.worldSeen ??= [];
    // 世界纪年：旧档按年龄推算补齐（错过的旧节点由调度器静默归档，不补播）
    s.year ??= yearOfAge(p.age);
    // 红颜境界字段迁移（旧档仅有 realm 字符串）
    for (const l of s.leads ?? []) {
      l.seen ??= {};
      if (typeof l.realmIdx !== 'number') {
        let found = false;
        for (let i = 0; i < REALMS.length; i++) {
          if (l.realm?.startsWith(REALMS[i].name)) {
            l.realmIdx = i;
            const rest = l.realm.slice(REALMS[i].name.length);
            const si = REALMS[i].stages.indexOf(rest);
            l.stageIdx = si >= 0 ? si : 0;
            found = true;
            break;
          }
        }
        if (!found) {
          l.realmIdx = 0;
          l.stageIdx = 0;
        }
      }
    }
    return s;
  } catch (e) {
    io.print(red(`读档失败：${(e as Error).message}`));
    return null;
  }
}
