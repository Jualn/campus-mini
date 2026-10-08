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
const sourcePath = path.join(root, 'components/ui-icon/registry.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const registryModuleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { ICON_REGISTRY, ICON_SIZE_RPX, resolveIcon } = await import(registryModuleUrl);

assert.equal(resolveIcon('search').src, '/assets/icons/core/search.svg');
assert.equal(resolveIcon('like').src, '/assets/icons/core/like.svg');
assert.equal(resolveIcon('like', 'active').src, '/assets/icons/core/like-active.svg');
assert.equal(resolveIcon('home').src, '/assets/icons/core/home.svg');
assert.equal(resolveIcon('home', 'active').src, '/assets/icons/core/home-active.svg');
assert.equal(resolveIcon('message', 'active').src, '/assets/icons/core/message-active.svg');
assert.equal(resolveIcon('user', 'active').src, '/assets/icons/core/user-active.svg');
assert.equal(resolveIcon('settings').src, '/assets/icons/core/settings.svg');
assert.equal(resolveIcon('search', 'active').src, '/assets/icons/core/search.svg');
assert.equal(resolveIcon('search', 'active').unsupportedState, true);
for (const state of ['toString', 'constructor', '__proto__']) {
  assert.equal(resolveIcon('search', state).src, '/assets/icons/core/search.svg');
  assert.equal(resolveIcon('search', state).unsupportedState, true);
}
assert.equal(resolveIcon('not-an-icon').src, '');
assert.equal(resolveIcon('not-an-icon').unknownName, true);
assert.equal(resolveIcon('search', 'default', 'toString').invalidSize, true);
assert.equal(resolveIcon('search', 'default', 'toString').resolvedSize, 'md');
assert.equal(resolveIcon('search', 'default', 'sm').resolvedSize, 'sm');
assert.equal(ICON_SIZE_RPX.sm, 24);
assert.equal(ICON_SIZE_RPX.md, 32);
assert.equal(ICON_SIZE_RPX.lg, 40);
assert.equal(ICON_SIZE_RPX.xl, 48);

assert.deepEqual(
  findDirectIconAssets('<image\n src="/images/interact/comment.svg" />', ICON_REGISTRY),
  ['/images/interact/comment.svg'],
);
assert.deepEqual(
  findDirectIconAssets(
    '<!-- <image src="/images/interact/comment.svg" /> --><ui-icon name="comment" /><image src="{{avatarUrl}}" /><image src="/assets/icons/common/post.svg" />',
    ICON_REGISTRY,
  ),
  [],
);
assert.equal(resolveIcon('reply').src, resolveIcon('comment').src);
assert.equal(resolveIcon('views').src, resolveIcon('visibility').src);
assert.ok(ICON_REGISTRY.views && ICON_REGISTRY.visibility);
assert.equal(
  resolveIcon('chevron-left', 'inverse').src,
  '/assets/icons/core/chevron-left-inverse.svg',
);
assert.equal(resolveIcon('remove', 'inverse').unsupportedState, false);
assert.equal(resolveIcon('share', 'inverse').unsupportedState, true);

const realAssetExists = (asset) => fs.existsSync(path.join(root, asset.replace(/^\//, '')));
assert.deepEqual(findMissingIconAssets(ICON_REGISTRY, realAssetExists), []);
assert.deepEqual(
  findMissingIconAssets({ test: { default: '/missing.svg' } }, () => false),
  ['/missing.svg'],
);

const semanticKeys = readIconSemanticKeys(source);
assert.deepEqual(
  readIconSemanticKeys(
    `export const ICON_REGISTRY = {search: {default: '/a.svg'}, "search": {default: '/b.svg'}} as const;`,
  ),
  ['search', 'search'],
  '重复名称检查不应依赖引号或缩进',
);
assert.equal(
  new Set(semanticKeys).size,
  semanticKeys.length,
  'Registry contains duplicate semantics',
);
console.log('Icon system tests passed');
