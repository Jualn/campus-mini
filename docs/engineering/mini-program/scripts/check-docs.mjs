import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone, read-only documentation check; no app imports or dependencies.
const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(docs, '../../..');
const errors = [];
const fail = message => errors.push(message);
const modules = [
  '01-scope-platform-boundary.md', '02-architecture.md',
  '03-typescript-code-quality.md', '04-runtime-lifecycle-state.md',
  '05-network-contracts-errors.md', '06-performance-packaging.md',
  '07-testing-validation.md', '08-security-privacy-capabilities.md',
  '09-build-ci-release.md', '10-observability-diagnostics.md',
  '11-ui-interaction-accessibility.md',
];
const required = ['README.md', ...modules, 'project-profile.md',
  'enforcement-matrix.md', 'maintenance.md'];
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const read = file => {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { fail(`Missing/unreadable file: ${relative(file)}`); return ''; }
};
const unfenced = text => text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
const links = text => [...unfenced(text).matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)]
  .map(match => match[1].trim().replace(/^<|>$/g, ''));
const headings = text => {
  const seen = new Map();
  return new Set([...unfenced(text).matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => {
    const base = match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  }));
};
const texts = new Map(required.map(name => [path.join(docs, name), read(path.join(docs, name))]));
const agentPath = path.join(root, 'AGENTS.md');
texts.set(agentPath, read(agentPath));
const rootReadme = path.join(root, 'README.md');
if (fs.existsSync(rootReadme)) texts.set(rootReadme, read(rootReadme));
for (const name of fs.readdirSync(docs).filter(name => name.endsWith('.md'))) {
  const file = path.join(docs, name);
  if (!texts.has(file)) texts.set(file, read(file));
}
const indexLinks = new Set(links(texts.get(path.join(docs, 'README.md'))));
for (const file of texts.keys()) {
  if (path.dirname(file) === docs && path.basename(file) !== 'README.md' && !indexLinks.has(path.basename(file))) {
    fail(`Index missing route: ${path.basename(file)}`);
  }
}
const agentLinks = links(texts.get(agentPath));
for (const target of ['project-profile.md', 'README.md', 'maintenance.md']) {
  if (!agentLinks.includes(`docs/engineering/mini-program/${target}`)) fail(`AGENTS missing route: ${target}`);
}
for (const [file, text] of texts) {
  for (const href of links(text)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) continue;
    let decoded;
    try { decoded = decodeURIComponent(href); }
    catch { fail(`${relative(file)}: malformed link ${href}`); continue; }
    const [filePart, anchor] = decoded.split('#');
    const target = filePart ? path.resolve(path.dirname(file), filePart) : file;
    if (!fs.existsSync(target)) { fail(`${relative(file)}: broken link ${href}`); continue; }
    const withinRoot = path.relative(root, target);
    if (target.endsWith('.md') && !withinRoot.startsWith('..') && !path.isAbsolute(withinRoot) && !texts.has(target)) {
      // Map iteration also visits newly discovered docs; cycles are visited once.
      texts.set(target, read(target));
    }
    if (anchor && target.endsWith('.md') && !headings(texts.get(target) ?? read(target)).has(anchor)) {
      fail(`${relative(file)}: missing heading ${href}`);
    }
  }
}
const profile = texts.get(path.join(docs, 'project-profile.md'));
const statuses = [...profile.matchAll(/^Profile status: (\S+)\s*$/gm)];
const status = statuses[0]?.[1];
if (statuses.length !== 1 || !['TEMPLATE', 'ACTIVE'].includes(status)) fail('Profile must declare exactly one TEMPLATE or ACTIVE status.');
if (process.argv.includes('--require-active') && status !== 'ACTIVE') fail('ACTIVE Profile required; repository facts are not yet established.');
if (process.argv.slice(2).some(arg => arg !== '--require-active')) fail('Usage: node check-docs.mjs [--require-active]');
const rows = new Map();
for (const line of profile.split(/\r?\n/).filter(line => line.startsWith('|'))) {
  const cells = line.split('|').slice(1, -1).map(value => value.trim());
  if (cells[0] === 'ID' || cells.every(value => /^[-:]+$/.test(value))) continue;
  if (cells.length !== 4) { fail(`Malformed Profile row: ${line}`); continue; }
  const [id, state, value, evidence] = cells;
  if (rows.has(id)) fail(`Duplicate Profile ID: ${id}`);
  rows.set(id, { state, value, evidence });
  if (!/^[a-z][a-z-]*$/.test(id)) fail(`Invalid Profile ID: ${id}`);
  if (!['VERIFIED', 'UNKNOWN', 'TARGET'].includes(state)) fail(`Invalid state for ${id}: ${state}`);
  if (!evidence) fail(`Missing evidence/explanation: ${id}`);
  if (state === 'UNKNOWN' && value !== '—') fail(`UNKNOWN value must be an em dash: ${id}`);
  if (['VERIFIED', 'TARGET'].includes(state)) {
    if (!value || /^(—|TBD|UNKNOWN|VERIFY_FROM.*)$/i.test(value)) fail(`Unresolved ${state} value: ${id}`);
    if (!links(evidence).length || !/\b\d{4}-\d{2}-\d{2}\b/.test(evidence)) fail(`${state} needs linked evidence and date: ${id}`);
  }
}
const expectedIds = ['governance', 'docs-check', 'runtime', 'source-root', 'base-library',
  'renderer', 'component-framework', 'project-config', 'appid', 'package-manager', 'node',
  'typescript', 'typings', 'devtools', 'miniprogram-ci', 'lint', 'formatter', 'domains',
  'contracts', 'generated-contracts', 'network', 'auth', 'shared-state', 'storage',
  'streaming', 'packages', 'loading', 'budgets', 'ui', 'theme', 'capabilities', 'workers',
  'validation', 'install', 'compile', 'device', 'release', 'environment', 'credentials', 'observability'];
for (const id of expectedIds) if (!rows.has(id)) fail(`Missing Profile fact: ${id}`);
if (status === 'ACTIVE') {
  for (const id of ['runtime', 'source-root', 'base-library', 'contracts', 'validation', 'release']) {
    if (rows.get(id)?.state !== 'VERIFIED') fail(`ACTIVE critical fact must be VERIFIED: ${id}`);
  }
  if (/\bTBD\b|VERIFY_FROM/.test(profile)) fail('ACTIVE Profile contains legacy placeholders.');
}
if (fs.existsSync(path.join(root, 'AGENTS.override.md'))) fail('Root AGENTS.override.md shadows the installed entry; reconcile explicitly.');
if (errors.length) {
  console.error(errors.map(message => `ERROR: ${message}`).join('\n'));
  process.exitCode = 1;
} else {
  const unknown = [...rows.values()].filter(row => row.state === 'UNKNOWN').length;
  console.log(`PASS: ${texts.size} documents; routes, local links/anchors and Profile schema valid.`);
  console.log(`Profile: ${status}; ${unknown} UNKNOWN facts. This is documentation integrity, not application/CI/runtime verification.`);
}
