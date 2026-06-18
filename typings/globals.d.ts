// typings/globals.d.ts
// miniprogram-api-typings 已声明：wx / App / Page / Component / Behavior / getApp / getCurrentPages
// 这里只补它缺少的部分

// ── 定时器（排除 DOM lib 后丢失）─────────────────────────────
declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number): number
declare function clearTimeout(id?: number): void
declare function setInterval(handler: (...args: unknown[]) => void, timeout?: number): number
declare function clearInterval(id?: number): void

// ── 插件相关 ──────────────────────────────────────────────────
declare function requireMiniProgram(): { version: string }