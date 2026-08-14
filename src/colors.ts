// ANSI 颜色工具（终端渲染层专用）。
// 迁移到网页时，只需替换本模块：让 c() 返回 HTML 标签或纯文本即可，其余代码不变。

type ColorName = 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';

const CODES: Record<ColorName, number> = {
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
};

/** 给文本上色；非 TTY 环境（如管道、网页）时退回纯文本，避免污染输出。 */
export function c(text: string, color?: ColorName): string {
  if (!color) return text;
  if (!process.stdout.isTTY) return text;
  return `\x1b[${CODES[color]}m${text}\x1b[0m`;
}

export const RESET = '\x1b[0m';

export function colorStart(color: ColorName): string {
  return `\x1b[${CODES[color]}m`;
}

export const bold = (t: string) => c(t, 'bold');
export const dim = (t: string) => c(t, 'dim');
export const red = (t: string) => c(t, 'red');
export const green = (t: string) => c(t, 'green');
export const yellow = (t: string) => c(t, 'yellow');
export const blue = (t: string) => c(t, 'blue');
export const magenta = (t: string) => c(t, 'magenta');
export const cyan = (t: string) => c(t, 'cyan');
