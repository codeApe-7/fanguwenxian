// 自动通关驱动器（文案 QA 用）：脚本化 GameIO 全速跑完一局，输出全程文本。
// 运行：npx tsx playtest.ts [剧本 1-4] [种子]  > /tmp/playthrough.txt
// 给了种子即可复现同一局（复现 bug 用）；不给则每次都不一样。

process.env.FANGU_SAVE_DIR ??= '/tmp/fangu-playtest'; // 结局自动存档重定向，勿覆盖真实存档

import type { GameIO } from './src/io.js';
import type { GameState } from './src/types.js';
import { ORIGINS, SECTS, SCENARIOS } from './src/content.js';
import { START_YEAR } from './src/content/world.js';
import { createPlayer } from './src/core/character.js';
import { runGame } from './src/core/engine.js';
import { seedRng, random } from './src/core/rng.js';

const scenarioArg = process.argv[2]; // 可指定剧本：1-4
const seedArg = process.argv[3];      // 可指定种子：同种子复现同一局
if (seedArg !== undefined) seedRng(Number(seedArg));
const strip = (s: string) => s.replace(/\x1b\[[0-9]*m/g, '');

class BotIO implements GameIO {
  asks = 0;
  clear() {}
  print(t = '') { console.log(strip(t)); }
  async narrate(t: string) { console.log(strip(t)); }
  async ask(q: string, choices?: string[], def?: string): Promise<string> {
    this.asks++;
    if (this.asks > 60000) throw new Error('ask 次数超限，疑似死循环');
    const question = strip(q);
    let ans: string;
    if (question.includes('确定退出')) ans = 'y';
    else if (choices && choices.includes('10') && choices.includes('7')) {
      // 主菜单：修为满则突破，否则闭关
      ans = '__MENU__';
    } else if (question.startsWith('你的选择')) {
      ans = choices ? choices[Math.floor(random() * choices.length)] : '1';
    } else if (question.includes('(y/n)')) {
      ans = 'y';
    } else {
      ans = def ?? choices?.[0] ?? '';
    }
    console.log(`${question} 〔${ans}〕`);
    return ans;
  }
  async pause() {}
}

async function main() {
  const io = new BotIO();
  const idx = scenarioArg ? parseInt(scenarioArg, 10) - 1 : 0;
  const scenario = SCENARIOS[Math.max(0, Math.min(3, idx))];
  const p = createPlayer('问仙子', ORIGINS[0], SECTS[7]); // 玄清门（突破加成，容易走完全程）
  p.scenario = scenario.name;
  p.aptitude = 1.5;
  p.root = '天灵根';
  p.rootMult = 5.0;
  p.cheatBonus = 1.8; // 高配开局，尽量在寿元内跑完全程剧情
  p.spirit = 2000;
  const state: GameState = { player: p, leads: [], year: START_YEAR };

  // 主菜单答案由状态决定：修为满→突破(7)；每 6 年游历一次(2)；否则闭关(1)
  const origAsk = io.ask.bind(io);
  let turn = 0;
  io.ask = async (q, choices, def) => {
    const ans = await origAsk(q, choices, def);
    if (ans !== '__MENU__') return ans;
    turn++;
    if (p.cultivation >= 100) return '7';
    if (turn % 5 === 0) return '2';
    return '1';
  };
  // 闭关菜单：默认闭关 10 年（选项 4）
  const origAsk2 = io.ask.bind(io);
  io.ask = async (q, choices, def) => {
    const question = strip(q);
    if (question === '选择：' && choices && choices.length === 9 && choices.includes('8') && !choices.includes('9')) {
      console.log('选择： 〔4〕');
      return '4';
    }
    return origAsk2(q, choices, def);
  };

  console.log(`===== 剧本：${scenario.name} =====`);
  await runGame(state, io);
  console.log(`===== 结束：${p.age} 岁 / 纪年 ${state.year} / 大事记 ${p.biography.length} 笔 =====`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
