// Hash verification only. Never treat this as Provider/runtime compatibility evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.env.CONTRACTS_ROOT || path.join(root, '../contracts'));
const output = path.join(root, 'docs/operations/independent-person-v1/input-lock.json');
const revisions = ['unified-v1-r4', 'identity-organization-v1-r5', 'points-v1-r5'];
const locations = ['unified-v1', 'identity-organization-v1', 'points-v1'].map((name) => `docs/coordination/${name}/handoff.json`);
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
if (!fs.existsSync(source)) throw new Error('Local Contracts materials are missing; provide this pinned material set via CONTRACTS_ROOT. Other machines are not assumed to have it.');
const manifests = locations.map((name) => JSON.parse(fs.readFileSync(path.join(source, name))));
for (const [index, manifest] of manifests.entries()) {
  if (manifest.revision !== revisions[index]) throw new Error(`Unexpected revision: ${manifest.revision}`);
  if (JSON.stringify(manifest.files) !== JSON.stringify(manifests[0].files)) throw new Error('Handoffs do not share the same SHA list');
}
for (const file of manifests[0].files) {
  if (sha(fs.readFileSync(path.join(source, file.path))) !== file.sha256) throw new Error(`Contracts input drift: ${file.path}`);
}
const catalogs = Object.fromEntries(['rbac-v1', 'duty-templates-v1', 'person-foundation-v1'].map((name) => [name, JSON.parse(fs.readFileSync(path.join(source, `api/catalogs/${name}.json`)))]));
if (catalogs['duty-templates-v1'].templates.length !== 32) throw new Error('Expected 32 canonical Duty definitions including acceptance management');
const handoffs = locations.map((name, index) => ({ path: name, revision: revisions[index], sha256: sha(fs.readFileSync(path.join(source, name))) }));
if (process.argv.includes('--pin') || process.argv.includes('--refresh')) {
  if (fs.existsSync(output) && !process.argv.includes('--refresh')) throw new Error('Input lock already exists; do not silently repin');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ schemaVersion: 1, pinnedOn: '2026-10-27', classification: 'BREAKING', acceptedCompatibilityBaseline: null, handoffs, catalogVersions: Object.fromEntries(Object.entries(catalogs).map(([key, value]) => [key, value.catalogVersion])), roleCount: catalogs['rbac-v1'].roles.length, permissionCount: catalogs['rbac-v1'].permissions.length, dutyCount: 32, miniProgramPackageVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, backendVersion: 'NOT_VERIFIED', adminWebVersion: 'NOT_VERIFIED', files: manifests[0].files }, null, 2) + '\n');
} else {
  const lock = JSON.parse(fs.readFileSync(output));
  if (JSON.stringify(lock.handoffs) !== JSON.stringify(handoffs) || JSON.stringify(lock.files) !== JSON.stringify(manifests[0].files)) throw new Error('Pinned inputs no longer match local Contracts');
}
console.log(`PASS input integrity: three pinned handoffs, ${manifests[0].files.length} identical SHA entries; BREAKING; no accepted compatibility baseline. Not runtime evidence.`);
