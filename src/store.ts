// 存档持久化适配层（Node 文件系统）。
// 迁移网页时替换本模块为 localStorage 即可，其余代码不变。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { GameIO } from './io.js';
import type { GameState } from './types.js';
import { green, red } from './colors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAVE_FILE = join(__dirname, '..', 'savegame.json');

export function hasSave(): boolean {
  return existsSync(SAVE_FILE);
}

export function saveGame(state: GameState, io: GameIO): void {
  try {
    writeFileSync(SAVE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    io.print(green('存档成功！'));
  } catch (e) {
    io.print(red(`存档失败：${(e as Error).message}`));
  }
}

export function loadGame(io: GameIO): GameState | null {
  if (!existsSync(SAVE_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(SAVE_FILE, 'utf-8'));
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
    p.fragments ??= {};
    p.spells ??= [];
    p.pillToxin ??= 0;
    p.skills ??= [];
    p.formation ??= '无';
    p.talismans ??= {};
    return s;
  } catch (e) {
    io.print(red(`读档失败：${(e as Error).message}`));
    return null;
  }
}
