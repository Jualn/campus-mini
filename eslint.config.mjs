// eslint.config.mjs
// 微信小程序 TypeScript 项目专用 ESLint 配置
// ESLint v9 Flat Config 格式

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier"; // 关闭所有与 Prettier 冲突的格式规则
import prettierPlugin from "eslint-plugin-prettier"; // 把 Prettier 当 ESLint 规则运行

// ─── 微信小程序全局变量定义 ─────────────────────────────────────────
// 告诉 ESLint 这些变量是合法的，不会报 no-undef
const miniprogramGlobals = {
  wx: "readonly",               // 核心 API 对象：wx.request / wx.showToast 等
  App: "readonly",              // 注册小程序实例
  Page: "readonly",             // 注册页面
  Component: "readonly",        // 注册自定义组件
  Behavior: "readonly",         // 定义 Behavior（跨组件复用逻辑）
  getApp: "readonly",           // 获取全局 App 实例
  getCurrentPages: "readonly",  // 获取当前页面栈
  requirePlugin: "readonly",    // 引入微信插件
  requireMiniProgram: "readonly", // 插件内引用宿主小程序
};

export default tseslint.config(
  // ─── 1. 全局忽略 ────────────────────────────────────────────────
  {
    ignores: [
      "eslint.config.mjs",
      "prettier.config.mjs",
      "miniprogram_npm/**",  // 开发者工具构建 npm 后生成，不需要 lint
      ".miniprogram-ci/**",  // CI 工具缓存目录
      "node_modules/**",
      "dist/**",
      "typings/**",          // miniprogram-api-typings 自动生成的类型声明
      "pages/test/**",       // 架构改造明确排除的测试页面
      "**/*.js",             // 本项目规范检查只针对 TypeScript 源码
      "*.min.js",
    ],
  },

  // ─── 2. JS 基础推荐规则 ─────────────────────────────────────────
  js.configs.recommended,

  // ─── 3. TypeScript 推荐规则（含类型检查）────────────────────────
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ─── 4. 主配置（TS / JS 文件）──────────────────────────────────
  {
    // 小程序原生开发无 .tsx/.jsx
    // 若使用 Taro / uni-app，补充 "**/*.tsx"
    files: ["**/*.ts"],

    plugins: {
      prettier: prettierPlugin,
    },

    languageOptions: {
      ecmaVersion: 2020,        // 小程序 JS 引擎支持到 ES2020
      sourceType: "module",     // TS 编译器统一按模块处理
      globals: miniprogramGlobals, // 注入小程序全局变量

      parserOptions: {
        projectService: true,            // 启用类型感知 lint（需要 tsconfig.json）
        tsconfigRootDir: import.meta.dirname,          
      },
    },

    rules: {
      // ── Prettier ──────────────────────────────────────────────
      // eslint-config-prettier 已关闭所有格式规则，不会冲突
      "prettier/prettier": "error",

      // ── 变量 ──────────────────────────────────────────────────
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": "off",                // 关掉 JS 版，用 TS 版替代
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",            // _开头参数允许未使用（惯例占位）
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ── 类型安全 ──────────────────────────────────────────────
      // wx API 返回值有大量 any，先用 warn 渐进改造；
      // 项目稳定后可改为 error
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",

      // ── Promise 安全（小程序大量异步，这两条最关键）────────────
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          // 允许 void wx.navigateTo({...}) 明确声明"有意忽略"
          ignoreVoid: true,
        },
      ],
      "@typescript-eslint/no-misused-promises": "error", // 不能把 async 传给 void 回调
      "@typescript-eslint/await-thenable": "error",       // 不能 await 非 Promise 值
      "@typescript-eslint/require-await": "error",        // async 函数里必须有 await
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      // try 块里要写 return await（确保异常能被 catch 捕获）

      // ── 禁用浏览器 / Node.js 特有 API ─────────────────────────
      // 防止误用 Web API，小程序环境没有这些
      "no-restricted-globals": [
        "error",
        { name: "window",         message: "小程序无 window，请使用 wx API" },
        { name: "document",       message: "小程序无 document，请使用 WXML + wx API" },
        { name: "location",       message: "小程序无 location，请使用 wx.navigateTo 等" },
        { name: "history",        message: "小程序无 history，请使用 wx.navigateBack" },
        { name: "localStorage",   message: "请使用 wx.setStorageSync / wx.setStorage" },
        { name: "sessionStorage", message: "请使用 wx.setStorage" },
        { name: "fetch",          message: "小程序无 fetch，请使用 wx.request" },
        { name: "XMLHttpRequest", message: "小程序无 XHR，请使用 wx.request" },
        { name: "WebSocket",      message: "请使用 wx.connectSocket" },
        { name: "alert",          message: "小程序无 alert，请使用 wx.showModal" },
        { name: "confirm",        message: "小程序无 confirm，请使用 wx.showModal" },
        { name: "prompt",         message: "小程序无 prompt，请使用 wx.showModal" },
        // setTimeout / setInterval 小程序支持，不限制
      ],

      // ── 禁止 require（统一用 import）─────────────────────────
      "@typescript-eslint/no-require-imports": "error",

      // ── 代码质量 ──────────────────────────────────────────────
      "eqeqeq": ["error", "always", { null: "ignore" }], // 必须 ===
      "no-console": [
        "warn",
        { allow: ["warn", "error", "info"] }, // 调试常用 info，放行
      ],
      "no-debugger": "error",
      "@typescript-eslint/only-throw-error": "error",   // 只能 throw Error 对象

      // ── 类型断言风格 ──────────────────────────────────────────
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",              // 统一用 as，不用 <Type>（无 TSX 也推荐）
        },
      ],

      // ── 类型导入 ──────────────────────────────────────────────
      // import type { Foo } 明确区分类型导入，减少运行时体积
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // ── 非空断言 ──────────────────────────────────────────────
      // 小程序开发有时需要，改为 warn（而非 error）渐进处理
      "@typescript-eslint/no-non-null-assertion": "warn",

      // ── 命名约定 ──────────────────────────────────────────────
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "interface",  format: ["PascalCase"] },
        { selector: "typeAlias",  format: ["PascalCase"] },
        { selector: "enum",       format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
        {
          selector: "variable",
          // 允许 UPPER_CASE 常量、PascalCase 用于 Page/Component 选项对象
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          "leadingUnderscore": "allow", // 允许 _ 开头的变量（惯例私有 / 占位）
        },
      ],
    },
  },
  
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],

    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: miniprogramGlobals,
    },
  },

  // ─── 5. app.ts 入口文件宽松规则 ─────────────────────────────────
  {
    files: ["**/app.ts", "**/app.js"],
    rules: {
      "no-console": "off", // 全局初始化日志允许
    },
  },

  // ─── 6. 测试文件宽松规则 ─────────────────────────────────────────
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "no-console": "off",
    },
  },

  // ─── 7. 关闭所有与 Prettier 冲突的格式规则（必须放最后）────────
  prettierConfig,
);
