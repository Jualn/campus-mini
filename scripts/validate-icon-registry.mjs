import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  findDirectIconAssets,
  findMissingIconAssets,
  readIconSemanticKeys,
} from './icon-registry-validation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'components/ui-icon/registry.ts'), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { ICON_REGISTRY, ICON_SIZE_RPX } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);
const semantics = readIconSemanticKeys(source);
assert.equal(new Set(semantics).size, semantics.length, '重复 semantic 声明');

for (const [semantic, descriptor] of Object.entries(ICON_REGISTRY)) {
  assert.equal(typeof descriptor.default, 'string', `${semantic} 缺少 default asset`);
  for (const asset of Object.values(descriptor)) {
    assert.ok(asset.startsWith('/'), `${semantic} asset 必须使用静态根路径`);
    assert.ok(!asset.includes('subpkg_'), `${semantic} 引用了分包资源`);
    assert.ok(
      !/brand|wechat|empty|activity|exam|emoji/i.test(asset),
      `${semantic} 将非 Core 资源纳入 Registry`,
    );
    assert.ok(
      fs.existsSync(path.join(root, asset.slice(1))),
      `${semantic} 指向不存在资源：${asset}`,
    );
  }
  for (const state of Object.keys(descriptor)) {
    assert.ok(
      state === 'default' ||
        (['like', 'home', 'message', 'user'].includes(semantic) && state === 'active') ||
        (['chevron-left', 'remove'].includes(semantic) && state === 'inverse'),
      `${semantic} 暴露了未批准的 state：${state}`,
    );
  }
}
assert.deepEqual(
  findMissingIconAssets(ICON_REGISTRY, (asset) => fs.existsSync(path.join(root, asset.slice(1)))),
  [],
);
assert.deepEqual(Object.keys(ICON_REGISTRY.like), ['default', 'active']);

// 来源表保留为文档，只校验 semantic/state/path 与 Registry 双向一致。
const manifest = fs.readFileSync(path.join(root, 'assets/icons/core/SOURCES.md'), 'utf8');
const sourceRecords = manifest
  .split(/\r?\n/)
  .filter((line) => line.startsWith('| `'))
  .map((line) => {
    const columns = line
      .split('|')
      .slice(1, -1)
      .map((column) => column.trim());
    assert.equal(columns.length, 7, 'SOURCES 来源记录必须包含七个字段');
    const [semantic, state = 'default'] = columns[0].replaceAll('`', '').split(/\s+/);
    const localAsset = columns[1].replaceAll('`', '');
    const asset = localAsset.startsWith('/') ? localAsset : `/assets/icons/core/${localAsset}`;
    assert.ok(columns.slice(2).every(Boolean), `${semantic} 来源字段不完整`);
    return `${semantic}:${state}:${asset}`;
  });
const registryRecords = Object.entries(ICON_REGISTRY).flatMap(([semantic, descriptor]) =>
  Object.entries(descriptor).map(([state, asset]) => `${semantic}:${state}:${asset}`),
);
assert.deepEqual(sourceRecords.sort(), registryRecords.sort(), 'SOURCES 与 Registry 不一致');
const registeredCoreFiles = new Set(
  registryRecords
    .map((record) => record.split(':').at(-1))
    .filter((asset) => asset.startsWith('/assets/icons/core/'))
    .map((asset) => path.basename(asset)),
);

function verifyVisualAsset(asset, color) {
  const svg = fs.readFileSync(path.join(root, asset), 'utf8');
  assert.match(svg, /viewBox="0 0 24 24"/, `${asset} 不符合 24px 画布`);
  assert.match(svg, /stroke-width="2"/, `${asset} 笔画规格漂移`);
  assert.match(svg, /stroke-linecap="round"/, `${asset} 端点规格漂移`);
  assert.match(svg, /stroke-linejoin="round"/, `${asset} 连接规格漂移`);
  assert.ok(!svg.includes('currentColor'), `${asset} 外部 image 不能依赖 CSS color 继承`);
  if (color) assert.ok(svg.includes(`stroke="${color}"`), `${asset} 颜色与来源记录不一致`);
  return [...svg.matchAll(/<(?:path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g)]
    // Compare geometry, allowing fill/color changes and silhouette-first paint order.
    .map(([tag]) => tag.replace(/\s(?:fill|stroke|stroke-width)="[^"]*"/g, ''))
    .sort()
    .join('\n');
}

for (const file of registeredCoreFiles) verifyVisualAsset(`assets/icons/core/${file}`);
for (const name of ['home', 'message', 'user', 'like']) {
  const descriptor = ICON_REGISTRY[name];
  assert.equal(
    verifyVisualAsset(descriptor.default.slice(1)),
    verifyVisualAsset(descriptor.active.slice(1)),
    `${name} 选中态的图形轮廓不应改变`,
  );
}
const visualManifest = fs.readFileSync(path.join(root, 'assets/icons/VISUAL_SOURCES.md'), 'utf8');
for (const line of visualManifest.split(/\r?\n/).filter((line) => line.startsWith('| `'))) {
  const [asset, , color] = line
    .split('|')
    .slice(1, -1)
    .map((value) => value.trim().replaceAll('`', ''));
  verifyVisualAsset(asset, color);
}
assert.deepEqual(
  fs
    .readdirSync(path.join(root, 'assets/icons/core'))
    .filter((file) => file.endsWith('.svg'))
    .sort(),
  [...registeredCoreFiles].sort(),
  'Core SVG 与 Registry 不一致',
);
const stylesheet = fs.readFileSync(path.join(root, 'components/ui-icon/index.wxss'), 'utf8');
for (const [size, rpx] of Object.entries(ICON_SIZE_RPX)) {
  const rule = stylesheet.match(new RegExp(`\\.ui-icon--${size}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(rule, `缺少 size 样式 ${size}`);
  assert.match(rule, new RegExp(`width:\\s*${rpx}rpx\\s*;`));
  assert.match(rule, new RegExp(`height:\\s*${rpx}rpx\\s*;`));
}

function verifyComponentRegistration(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      verifyComponentRegistration(file);
    } else if (file.endsWith('.wxml')) {
      const markup = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      assert.deepEqual(
        findDirectIconAssets(markup, ICON_REGISTRY),
        [],
        `${path.relative(root, file)} 直接引用已迁移的 Registry asset，请使用 UiIcon`,
      );
      assert.ok(
        !markup.includes('/assets/icons/core/'),
        `${path.relative(root, file)} 直接引用 Core asset`,
      );
      const icons = [...markup.matchAll(/<ui-icon\b[^>]*>/g)];
      if (icons.length === 0) continue;
      for (const [tag] of icons) {
        const literal = (property) => {
          const value = tag.match(new RegExp(`\\s${property}\\s*=\\s*(["'])([\\s\\S]*?)\\1`))?.[2];
          return value?.includes('{{') ? undefined : value;
        };
        const name = literal('name');
        const size = literal('size');
        const state = literal('state');
        if (name !== undefined) {
          assert.ok(Object.hasOwn(ICON_REGISTRY, name), `${file} 未知 semantic：${name}`);
          if (state !== undefined) {
            assert.ok(
              Object.hasOwn(ICON_REGISTRY[name], state),
              `${file} 不支持 state：${name}/${state}`,
            );
          }
        }
        if (size !== undefined)
          assert.ok(Object.hasOwn(ICON_SIZE_RPX, size), `${file} 未知 size：${size}`);
      }
      const configPath = file.slice(0, -5) + '.json';
      assert.ok(fs.existsSync(configPath), `${path.relative(root, file)} 缺少 JSON 配置`);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      assert.equal(
        config.usingComponents?.['ui-icon'],
        '/components/ui-icon/index',
        `${path.relative(root, file)} 未注册主包 UiIcon`,
      );
    }
  }
}

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
for (const directory of [
  'custom-tab-bar',
  'pages',
  'components',
  ...(app.subPackages ?? app.subpackages ?? []).map((subpackage) => subpackage.root),
]) {
  verifyComponentRegistration(path.join(root, directory));
}
console.log(`Icon registry validation passed (${Object.keys(ICON_REGISTRY).length} semantics)`);
