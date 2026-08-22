/* eslint-disable @typescript-eslint/no-unnecessary-condition */
// logger.ts
import config, { ENV } from '../config/index';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
//keyof typeof LEVELS → "debug" | "info" | "warn" | "error" as 断言告诉 TS 这是安全的。
const CURRENT = LEVELS[config.logLevel as keyof typeof LEVELS];

// 微信实时日志（线上可在小程序后台查看）
const rtLog = wx.getRealtimeLogManager?.() ?? null;

const fmt = (level: string, tag: string) => `[${level.toUpperCase()}][${tag}]`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serialize = (v: any) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
const noop = (..._: unknown[]) => {
  /* empty */
};

export function createLogger(module: string) {
  // ── 真机生产环境：rtLog 有值 ────────────────────────────────────────────
  // warn/error 上报 rtLog，并自动提取调用方函数名
  // info 仅输出本地 console，不上报（避免占用配额、产生网络开销）
  if ((ENV === 'release' || ENV === 'trial') && rtLog) {
    return {
      info(...args: unknown[]) {
        if (CURRENT > LEVELS.info) return;
        console.info(fmt('info', module), ...args);
      },
      warn(tag: string, ...args: unknown[]) {
        if (CURRENT > LEVELS.warn) return;
        const TAG = `${module}.${tag}`;
        console.warn(fmt('warn', TAG), ...args);
        rtLog.warn(TAG, ...args.map(serialize));
      },
      error(tag: string, ...args: unknown[]) {
        const TAG = `${module}.${tag}`;
        console.error(fmt('error', TAG), ...args);
        rtLog.error(TAG, ...args.map(serialize));
      },
    };
  }

  // ── 开发者工具：rtLog 为 null ───────────────────────────────────────────
  // console.xxx.bind() 让 devtools 显示真实调用位置，可点击跳转
  return {
    info: CURRENT <= LEVELS.info ? console.info.bind(console, fmt('info', module)) : noop,
    warn: CURRENT <= LEVELS.warn ? console.warn.bind(console, fmt('warn', module)) : noop,
    error: console.error.bind(console, fmt('error', module)),
  };
}
