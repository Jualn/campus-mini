// Verify the explicitly accepted Article package without rewriting other domains' locks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.env.CONTRACTS_ROOT || path.join(root, '../contracts'));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const revision = 'article-content-v1-r1';
const sourceHash = 'a123457ebbb882835ad04ffeb4006dd5266b2094b1fb9eb531e9f7fb058c4519';
const archiveHash = '0bd9a42ba7f1d033b070f51a7b0c807f60a1536e9b96dcc7f7eaba0abd662c08';
const manifest = JSON.parse(fs.readFileSync(path.join(source, `artifacts/${revision}.manifest.json`)));
assert.equal(manifest.artifactRevision, revision);
assert.equal(manifest.sourceRevisionSha256, sourceHash);
assert.equal(sha(fs.readFileSync(path.join(source, `artifacts/${revision}.zip`))), archiveHash);
assert.equal(fs.readFileSync(path.join(source, `artifacts/${revision}.sha256`), 'utf8').split(/\s/)[0], archiveHash);
assert.equal(sha(manifest.sourceFiles.slice().sort().map((name) =>
  `${sha(fs.readFileSync(path.join(source, name)))}  ${name}\n`).join('')), sourceHash);
console.log(`PASS ${revision}: canonical source ${sourceHash}; ZIP ${archiveHash}. Integrity only; no Provider/runtime evidence.`);
const oldLock = JSON.parse(fs.readFileSync(path.join(root, 'docs/operations/independent-person-v1/input-lock.json')));
const drift = oldLock.files.filter((file) => sha(fs.readFileSync(path.join(source, file.path))) !== file.sha256);
if (drift.length) console.warn(`Existing independent-person input lock: ${drift.length} files drifted; preserved unchanged. Article acceptance does not repin unrelated domains.`);
