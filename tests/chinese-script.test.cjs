const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const { convertChineseText, convertChineseCaptions } = require('../app/utilities/chinese-script.ts');

test('converts phrases in both directions and preserves punctuation and non-Chinese text', () => {
  assert.equal(convertChineseText('头发发展，后台！Hello 123\n广东话', 'traditional'), '頭髮發展，後台！Hello 123\n廣東話');
  assert.equal(convertChineseText('頭髮發展，後台！Hello 123\n廣東話', 'simplified'), '头发发展，后台！Hello 123\n广东话');
  assert.equal(convertChineseText('頭髮发展', 'traditional'), '頭髮發展');
  assert.equal(convertChineseText('', 'simplified'), '');
});
test('converts all eligible caption rows without changing timing, nulls, Japanese, Korean, or originals', () => {
  const input = [{ startTime: '00:00:01,200', endTime: '00:00:04,900', text: { yue: '广东话', zh: '头发发展', en: 'Hello 广东', jp: '日本語の漢字', ko: '한국어', unused: null } }];
  const before = structuredClone(input);
  const result = convertChineseCaptions(input, 'traditional');
  assert.deepEqual(input, before);
  assert.deepEqual(result[0], { ...before[0], text: { ...before[0].text, yue: '廣東話', zh: '頭髮發展', en: 'Hello 廣東' } });
  assert.deepEqual(convertChineseCaptions(result, 'simplified'), before);
  assert.deepEqual(convertChineseCaptions([], 'traditional'), []);
});
