/*
 * Eslint config file
 * Documentation: https://eslint.org/docs/user-guide/configuring/
 * Install the Eslint extension before using this feature.
 */
module.exports = {
  root: true,
  env: {
    es6: true,
    browser: true,
    node: true,
  },
    // 继承规则，可选 'standard' 或 'airbnb-base'
  extends: ['standard', 'plugin:prettier/recommended'],
  plugins: ['html'], // 支持检查 wxml 内 JS
  ecmaFeatures: {
    modules: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  globals: {
    wx: true,
    App: true,
    Page: true,
    getCurrentPages: true,
    getApp: true,
    Component: true,
    requirePlugin: true,
    requireMiniProgram: true,
  },
  // extends: 'eslint:recommended',
  rules: {
    // 根据你团队需求调整
    'semi': ['error', 'always'],           // 必须使用分号
    'no-unused-vars': ['warn'],           // 未使用变量警告
    'no-console': 'off',                  // 允许 console
    'comma-dangle': ['error', 'never'],  // 尾逗号
    'prettier/prettier': ['error']        // 启用 prettier 格式化规则
  },
}
