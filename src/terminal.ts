// 终端版 GameIO 实现（Node readline + ANSI）。

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { cyan, dim, red, colorStart, RESET } from './colors.js';
import type { GameIO } from './io.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TerminalIO implements GameIO {
  private rl = readline.createInterface({ input, output });
  private interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  clear(): void {
    if (this.interactive) {
      output.write('\x1b[2J\x1b[3J\x1b[H');
    }
  }

  print(text = ''): void {
    output.write(text + '\n');
  }

  async narrate(text: string): Promise<void> {
    // 非交互（管道/网页）时直接整行输出，避免打字机延迟
    if (!this.interactive) {
      output.write(cyan(text) + '\n');
      return;
    }
    output.write(colorStart('cyan'));
    for (const ch of text) {
      output.write(ch);
      await sleep(12);
    }
    output.write(RESET + '\n');
  }

  async ask(question: string, choices?: string[], def?: string): Promise<string> {
    const hint = choices ? ` [${choices.join('/')}]` : '';
    while (true) {
      const raw = (await this.rl.question(question + hint + ' ')).trim();
      if (raw === '' && def !== undefined) return def;
      if (!choices || choices.includes(raw)) return raw;
      this.print(red(`请输入 ${choices.join('/')}`));
    }
  }

  async pause(): Promise<void> {
    await this.ask(dim('—— 按回车继续 ——'));
  }

  close(): void {
    this.rl.close();
  }
}
