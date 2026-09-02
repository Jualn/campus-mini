import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = readJson('app.json');
const projectConfig = readJson('project.config.json');

const PACKAGE_HARD_LIMIT = 2 * 1024 * 1024;
const PACKAGE_WARNING_LIMIT = 1.5 * 1024 * 1024;
const RUNTIME_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.json',
  '.wxml',
  '.wxss',
  '.wxs',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.map',
]);
const ALWAYS_IGNORED_FOLDERS = new Set(['.git', 'node_modules']);
const sourceExtensions = new Set(['.ts', '.js']);

const subpackages = (appConfig.subPackages ?? appConfig.subpackages ?? []).map((item) => ({
  name: item.name ?? item.root,
  root: normalize(item.root),
}));
const packIgnoreRules = projectConfig.packOptions?.ignore ?? [];
const allFiles = walk(projectRoot);
const runtimeFiles = allFiles.filter(
  (file) => RUNTIME_EXTENSIONS.has(path.extname(file.relative).toLowerCase()) && !isPackIgnored(file.relative),
);

const packageRows = new Map([['main', { files: 0, bytes: 0 }]]);
for (const item of subpackages) packageRows.set(item.name, { files: 0, bytes: 0 });

for (const file of runtimeFiles) {
  const owner = packageOwner(file.relative);
  const row = packageRows.get(owner);
  row.files += 1;
  row.bytes += file.size;
}

const warnings = [];
const errors = [];

for (const [name, row] of packageRows) {
  if (row.bytes >= PACKAGE_HARD_LIMIT) {
    errors.push(`${name} 原始运行文件已达到 ${formatSize(row.bytes)}，超过 2 MiB 审计线`);
  } else if (row.bytes >= PACKAGE_WARNING_LIMIT) {
    warnings.push(`${name} 原始运行文件已达到 ${formatSize(row.bytes)}，超过 1.5 MiB 预警线`);
  }
}

for (const page of appConfig.pages ?? []) {
  if (/(^|\/)test(s)?\//i.test(page) || /(^|\/)test$/i.test(page)) {
    warnings.push(`主包仍声明测试页面：${page}`);
  }
}

const activeRuntimeByStem = new Map();
for (const file of runtimeFiles.filter((item) => sourceExtensions.has(path.extname(item.relative)))) {
  const stem = file.relative.replace(/\.(ts|js)$/i, '');
  const extensions = activeRuntimeByStem.get(stem) ?? [];
  extensions.push(path.extname(file.relative));
  activeRuntimeByStem.set(stem, extensions);
}
for (const [stem, extensions] of activeRuntimeByStem) {
  if (extensions.includes('.ts') && extensions.includes('.js')) {
    warnings.push(`同名 TS/JS 双实现：${stem}.ts 与 ${stem}.js`);
  }
}

for (const file of runtimeFiles.filter((item) => item.relative.endsWith('.map'))) {
  warnings.push(`Source Map 未被发布配置排除：${file.relative}`);
}

for (const violation of findCrossPackageImports(runtimeFiles)) errors.push(violation);
for (const violation of findLocalResourceViolations(runtimeFiles)) errors.push(violation);
for (const violation of checkSubpackageOnlyModules()) errors.push(violation);

console.log('微信小程序代码包原始文件审计（非开发者工具最终压缩体积）');
console.table(
  [...packageRows].map(([name, row]) => ({
    package: name,
    files: row.files,
    size: formatSize(row.bytes),
  })),
);

printMessages('警告', warnings);
printMessages('错误', errors);

if (errors.length > 0) process.exitCode = 1;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function checkSubpackageOnlyModules() {
  const violations = [];
  const movedModules = [
    'actions/activity',
    'actions/admin-auth',
    'actions/search',
    'behaviors/useAsyncLoad',
    'utils/navigation',
    'services/admin-auth',
    'services/activity',
    'services/search',
    'utils/search-history',
  ];
  for (const stem of movedModules) {
    for (const extension of sourceExtensions) {
      if (fs.existsSync(path.join(projectRoot, `${stem}${extension}`))) {
        violations.push(`仅分包使用的模块不应回到主包：${stem}${extension}`);
      }
    }
  }

  // 普通分包保持本地依赖；校验共享副本，避免修复只落在某个分包。
  const sharedCopies = [
    ['behaviors/useAsyncLoad.ts', ['subpkg_activity', 'subpkg_community', 'subpkg_exam', 'subpkg_user']],
    ['utils/navigation.ts', ['subpkg_activity', 'subpkg_exam', 'subpkg_user']],
    ['services/activity-mapper.ts', ['subpkg_activity', 'subpkg_community']],
  ];
  for (const [relative, packages] of sharedCopies) {
    let baseline;
    for (const pkg of packages) {
      const file = `${pkg}/${relative}`;
      const absolute = path.join(projectRoot, file);
      if (!fs.existsSync(absolute)) {
        violations.push(`缺少分包本地模块：${file}`);
        continue;
      }
      const content = fs.readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n');
      baseline ??= content;
      if (content !== baseline) violations.push(`共享模块副本不一致，请同步各分包：${file}`);
    }
  }
  return violations;
}

function walk(directory, prefix = '') {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ALWAYS_IGNORED_FOLDERS.has(entry.name)) continue;
    const relative = normalize(path.join(prefix, entry.name));
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute, relative));
    else if (entry.isFile()) result.push({ relative, absolute, size: fs.statSync(absolute).size });
  }
  return result;
}

function normalize(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function isPackIgnored(relative) {
  return packIgnoreRules.some((rule) => {
    const value = normalize(rule.value ?? '');
    if (!value) return false;
    if (rule.type === 'folder') return relative === value || relative.startsWith(`${value}/`);
    if (rule.type === 'file') return relative === value;
    if (rule.type === 'suffix') return relative.endsWith(value);
    if (rule.type === 'prefix') return relative.startsWith(value);
    return false;
  });
}

function packageOwner(relative) {
  const matched = subpackages.find(
    (item) => relative === item.root || relative.startsWith(`${item.root}/`),
  );
  return matched?.name ?? 'main';
}

function findCrossPackageImports(files) {
  const violations = [];
  const sourceFiles = files.filter((file) => sourceExtensions.has(path.extname(file.relative)));
  const importPattern = /(?:from\s+|require\s*\()\s*['"]([^'"]+)['"]/g;

  for (const file of sourceFiles) {
    const sourceOwner = packageOwner(file.relative);
    const source = fs.readFileSync(file.absolute, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const target = resolveLocalImport(file.relative, specifier);
      if (!target) continue;
      const targetOwner = packageOwner(target);
      if (sourceOwner === 'main' && targetOwner !== 'main') {
        violations.push(`主包 ${file.relative} 不应引用分包 ${targetOwner}：${specifier}`);
      } else if (sourceOwner !== 'main' && targetOwner !== 'main' && sourceOwner !== targetOwner) {
        violations.push(`${sourceOwner} 中的 ${file.relative} 不应跨包引用 ${targetOwner}：${specifier}`);
      }
    }
  }
  return [...new Set(violations)];
}

function findLocalResourceViolations(files) {
  const violations = [];
  const resourcePattern = /(?:src\s*=\s*["']|url\(\s*["']?)([^"'()\s}]+)/g;

  for (const file of files.filter((item) => ['.wxml', '.wxss'].includes(path.extname(item.relative)))) {
    const sourceOwner = packageOwner(file.relative);
    const source = fs.readFileSync(file.absolute, 'utf8');
    for (const match of source.matchAll(resourcePattern)) {
      const reference = match[1];
      if (!reference || reference.includes('{') || /^(?:https?:|data:|wxfile:)/.test(reference)) {
        continue;
      }

      const cleanReference = reference.split(/[?#]/, 1)[0];
      const target = normalize(
        cleanReference.startsWith('/')
          ? cleanReference.slice(1)
          : path.join(path.dirname(file.relative), cleanReference),
      );

      if (!fs.existsSync(path.join(projectRoot, target))) {
        violations.push(`${file.relative} 引用了不存在的本地资源：${reference}`);
        continue;
      }

      const targetOwner = packageOwner(target);
      if (sourceOwner === 'main' && targetOwner !== 'main') {
        violations.push(`主包 ${file.relative} 不应引用分包资源 ${targetOwner}：${reference}`);
      } else if (sourceOwner !== 'main' && targetOwner !== 'main' && sourceOwner !== targetOwner) {
        violations.push(`${sourceOwner} 中的 ${file.relative} 不应跨包引用 ${targetOwner}：${reference}`);
      }
    }
  }

  return [...new Set(violations)];
}

function resolveLocalImport(sourceRelative, specifier) {
  const base = normalize(path.join(path.dirname(sourceRelative), specifier));
  const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.json`, `${base}/index.ts`, `${base}/index.js`];
  return candidates.find((candidate) => fs.existsSync(path.join(projectRoot, candidate))) ?? null;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function printMessages(label, messages) {
  if (messages.length === 0) {
    console.log(`${label}：无`);
    return;
  }
  console.log(`${label}（${messages.length}）：`);
  for (const message of messages) console.log(`- ${message}`);
}
