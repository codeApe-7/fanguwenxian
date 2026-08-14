#!/usr/bin/env node
// 入口：装配终端 IO 与游戏引擎。

import { createRequire } from 'node:module';
import { TerminalIO } from './terminal.js';
import { loadGame } from './store.js';
import { intro, createCharacter, runGame } from './core/engine.js';

const require = createRequire(import.meta.url);
const VERSION = (require('../package.json') as { version?: string }).version ?? '0.0.0';

const HELP = `《凡骨问仙》终端文字修仙冒险游戏  v${VERSION}

用法：fangu-wenxian
  --version, -v   显示版本号
  --help, -h      显示本帮助`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const io = new TerminalIO();
  try {
    const choice = await intro(io);
    if (choice === '3') {
      io.print('有缘再会。');
      return;
    }

    let state = choice === '2' ? loadGame(io) : null;
    if (state) {
      await io.narrate('读档成功，继续你的仙途……');
    } else {
      state = await createCharacter(io);
    }

    await runGame(state, io);
  } finally {
    io.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
