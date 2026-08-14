// 入口：装配终端 IO 与游戏引擎。

import { TerminalIO } from './terminal.js';
import { loadGame } from './store.js';
import { intro, createCharacter, runGame } from './core/engine.js';

async function main(): Promise<void> {
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
