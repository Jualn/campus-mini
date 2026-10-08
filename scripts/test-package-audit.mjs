import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(projectRoot, 'scripts/audit-packages.mjs'), 'utf8');
const code = source
  .replace(/^import .*;\r?\n/gm, '')
  .replace(
    "const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    'const projectRoot = TEST_ROOT;',
  );

// Execute the actual audit with in-memory additions; never modify the working tree.
function auditWithAddition(relative = '', addition = '') {
  const messages = [];
  const result = {};
  const facade = {
    ...fs,
    readFileSync(file, encoding) {
      const content = fs.readFileSync(file, encoding);
      return file === path.join(projectRoot, relative) ? content + addition : content;
    },
  };
  vm.runInNewContext(code, {
    fs: facade,
    path,
    TEST_ROOT: projectRoot,
    process: result,
    console: { log: (message) => messages.push(message), table: () => {} },
  });
  return { exitCode: result.exitCode, messages };
}

assert.equal(auditWithAddition().exitCode, undefined, 'current package must pass');
for (const statement of [
  "import './actions/exam';",
  "import * as exam from './actions/exam';",
  "const exam = require('./actions/exam');",
]) {
  const result = auditWithAddition('app.ts', `\n${statement}\n`);
  assert.equal(result.exitCode, 1, 'excluded runtime imports must fail');
  assert.ok(result.messages.some((message) => message.includes('发布配置已排除的模块')));
}
const resource = auditWithAddition(
  'pages/index/index.wxml',
  '\n<image src="/images/icons/exam/cte.svg" />\n',
);
assert.equal(resource.exitCode, 1, 'excluded resources must fail');
assert.ok(resource.messages.some((message) => message.includes('发布配置已排除的资源')));
console.log('PASS: package audit rejects excluded runtime imports and resources');
