// prettier.config.mjs
// 微信小程序项目 Prettier 格式化配置

/** @type {import("prettier").Config} */
const config = {
  // ── 引号 ──────────────────────────────────────────────────────
  singleQuote: true,         // JS/TS 用单引号
  jsxSingleQuote: false,     // JSX 属性用双引号（若用 Taro 有 JSX 时生效）

  // ── 分号 ──────────────────────────────────────────────────────
  semi: true,                // 语句末尾加分号，防止 ASI 歧义

  // ── 缩进 ──────────────────────────────────────────────────────
  tabWidth: 2,               // 2 空格缩进（微信官方示例也是 2 空格）
  useTabs: false,            // 用空格

  // ── 行宽 ──────────────────────────────────────────────────────
  printWidth: 100,           // 超 100 列才换行

  // ── 尾逗号 ────────────────────────────────────────────────────
  trailingComma: "all",      // 多行结构加尾逗号，git diff 更干净

  // ── 括号 ──────────────────────────────────────────────────────
  bracketSpacing: true,      // 对象字面量内侧空格：{ foo: bar }
  arrowParens: "always",     // 箭头函数参数加括号：(x) => x

  // ── 换行符 ────────────────────────────────────────────────────
  endOfLine: "auto",           // 统一 LF（跨平台必备）

  // ── 特殊文件 ──────────────────────────────────────────────────
  overrides: [
    {
      // WXML 用 HTML 解析器格式化
      files: ["*.wxml"],
      options: {
        parser: "html",
        printWidth: 120,       // WXML 标签属性多，行宽放宽
        singleQuote: false,    // HTML 属性用双引号
      },
    },
    {
      // WXSS 用 CSS 解析器
      files: ["*.wxss"],
      options: {
        parser: "css",
        singleQuote: false,
      },
    },
    {
      // 小程序 JSON 配置文件
      files: ["*.json", "app.json", "project.config.json", "sitemap.json"],
      options: {
        parser: "json",
        printWidth: 80,
        trailingComma: "none", // JSON 不支持尾逗号！
      },
    },
    {
      files: ["*.md"],
      options: {
        printWidth: 80,
        proseWrap: "always",   // Markdown 按 printWidth 自动换行
      },
    },
  ],
};

export default config;
