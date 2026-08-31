import test from 'node:test';
import assert from 'node:assert/strict';

const loadScripts = async paths => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const sandbox = { console, URLSearchParams, globalThis: {} };
  sandbox.globalThis = sandbox;
  for (const path of paths) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    vm.runInNewContext(source, sandbox, { filename: path });
  }
  return sandbox;
};

test('locale resolution prefers stored selection and falls back by language', async () => {
  const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
  assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: 'zh-TW', browserLanguages: ['en-US'] }), 'zh-TW');
  assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: '', browserLanguages: ['zh-HK'] }), 'zh-TW');
  assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: '', browserLanguages: ['fr-FR'] }), 'en');
});

test('region resolution maps locale regions and language groups', async () => {
  const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: '', locale: 'zh-TW', browserLanguages: ['zh-TW'] }), 'TW');
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: '', locale: 'en', browserLanguages: ['en-US'] }), 'GLOBAL_EN');
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: 'HK', locale: 'en', browserLanguages: ['en-US'] }), 'HK');
});
