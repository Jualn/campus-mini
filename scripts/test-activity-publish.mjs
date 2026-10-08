import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
const model = {};
vm.runInNewContext(compile('subpkg_activity/pages/publish/publish-model.ts'), {
  exports: model,
  require: () => ({
    MEDIA_TYPES: { PDF: { value: 'PDF' }, WORD: { value: 'WORD' }, IMAGE: { value: 'IMAGE' } },
  }),
});
let page;
vm.runInNewContext(compile('subpkg_activity/pages/publish/publish.ts'), {
  exports: {},
  Page: (value) => {
    page = value;
  },
  require: (name) =>
    name === './publish-model'
      ? model
      : name.endsWith('/logger')
        ? { createLogger: () => ({}) }
        : {},
});
const build = () => page.buildSubmitPayload.call(page);
page.data.form.title = '讲座';
page.data.form.content = '介绍';
let payload = build();
assert.equal(payload.startTime, null);
assert.equal(payload.startPrecision, 0);
assert.equal(payload.maxParticipants, null);
assert.equal(model.validatePublishInformation(payload), '');
page.data.form.startTime = '2026-09-07 15:00:00';
page.data.form.endTime = '2026-09-07';
page.data.extraSections = [{ title: '规则', content: '规则正文' }];
page.data.form.timeline = [{ label: '待定节点', sortOrder: 9 }];
payload = build();
assert.equal(payload.endPrecision, 1);
assert.equal(payload.endTime, '2026-09-07 00:00:00');
assert.equal(payload.sections[1].content, '规则正文');
assert.equal(payload.timelineItems[0].startTime, null);
assert.equal(payload.timelineItems[0].sortOrder, 0);
assert.equal(model.validatePublishInformation(payload), '');
page.data.form.maxParticipants = '0';
assert.ok(model.validatePublishInformation(build()));
page.data.form.maxParticipants = '';
page.data.qrcodeImage = { status: 'uploaded', objectKey: 'test/qr', url: 'https://example.com/qr' };
payload = build();
assert.equal(payload.actions[0].attachmentObjectKey, payload.attachmentItems[0].objectKey);
assert.equal(payload.actions[0].actionType, 5);
page.data.participationActions = [
  {
    typeIndex: 0,
    label: '报名',
    targetValue: 'http://example.com',
    description: '',
    isRequired: false,
  },
];
assert.ok(model.validatePublishInformation(build()));
console.log(
  'PASS: publish payload: unknown/date precision, sections, timeline order, capacity, QR reference, URL validation',
);
