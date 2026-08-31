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

test('message dictionaries cover all visible UI categories', async () => {
  const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
  const required = ['search','searchPlaceholder','recommendations','recommendationDescription','recommendationLoading','chooseSource','settings','aggregated','customApi','customApiDescription','recentSearches','clearHistory','yellowFilter','yellowFilterDescription','adFilter','adFilterDescription','sourceStatus','sourceHealthy','sourceUnavailable','loading','playerLoading','playerError','tryAgain','noEpisodes','autoplay','reverseOrder','previousEpisode','nextEpisode','episodeList','shortcutHint','networkError','timeoutError','apiError','unknownError','footer','about','privacy','backHome','privacyLocalStorage','privacyAds','privacyVideoServices','privacyChoices','privacyUpdates'];
  for (const locale of sandbox.SUPPORTED_LOCALES) for (const key of required) assert.equal(typeof sandbox.MESSAGES[locale][key], 'string', `${locale}.${key}`);
});

test('invalid stored source does not force manual mode', async () => {
  const sandbox = await loadScripts(['js/source-routing.js']);
  sandbox.API_SITES = { ffzy: {} };
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedSource: 'missing' }), 'region');
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedSource: 'toString' }), 'region');
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedSource: '__proto__' }), 'region');
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: 'manual', storedSource: 'missing' }), 'manual');
});

test('regional routing keeps only matching default-eligible sources', async () => {
  const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
  const result = sandbox.LibretvRouting.getEligibleSources({ locale: 'zh-CN', region: 'CN', mode: 'aggregated' });
  assert.ok(result.includes('ffzy'));
  assert.ok(result.includes('jisu'));
  assert.ok(!result.includes('cjhw'));
  assert.ok(!result.includes('dbzy'));
});

test('legacy concrete source selection becomes manual mode', async () => {
  const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: '', storedSource: 'ffzy' }), 'manual');
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: '', storedSource: '' }), 'region');
});

test('English users fall back without pretending Chinese sources are English', async () => {
  const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
  const primary = sandbox.LibretvRouting.getEligibleSources({ locale: 'en', region: 'GLOBAL_EN', mode: 'aggregated' });
  const fallback = sandbox.LibretvRouting.getFallbackSources({ locale: 'en', region: 'GLOBAL_EN' });
  assert.equal(primary.length, 0);
  assert.ok(fallback.length > 0);
});
