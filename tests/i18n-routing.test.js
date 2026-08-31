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

const loadApiSandbox = async fetchImpl => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const sandbox = { console, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, fetch: fetchImpl };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.location = { origin: 'https://jumeitianxia.com' };
  for (const path of ['js/config.js', 'js/source-routing.js', 'js/api.js']) {
    vm.runInNewContext(await readFile(new URL('../' + path, import.meta.url), 'utf8'), sandbox, { filename: path });
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

test('fallback excludes region-limited sources from incompatible regions', async () => {
  const sandbox = await loadScripts(['js/source-routing.js']);
  sandbox.API_SITES = {
    cnOnly: { languages: ['zh-CN'], regions: ['CN'], defaultEligible: true, enabled: true, capabilities: { search: true }, priority: 10 },
    globalZh: { languages: ['zh-CN'], regions: ['GLOBAL_ZH'], defaultEligible: true, enabled: true, capabilities: { search: true }, priority: 5 },
    globalEn: { languages: ['en'], regions: ['GLOBAL_EN'], defaultEligible: true, enabled: true, capabilities: { search: true }, priority: 4 }
  };
  const fallback = sandbox.LibretvRouting.getFallbackSources({ locale: 'zh-TW', region: 'TW' });
  assert.ok(!fallback.includes('cnOnly'));
  assert.ok(fallback.includes('globalZh'));
  assert.ok(!fallback.includes('globalEn'));
});

test('missing eligibility metadata is excluded from automatic routing but remains manually selectable', async () => {
  const sandbox = await loadScripts(['js/source-routing.js']);
  sandbox.API_SITES = { unannotated: { languages: ['zh-CN'], regions: ['CN'], capabilities: { search: true } } };
  assert.deepEqual([...sandbox.LibretvRouting.getEligibleSources({ locale: 'zh-CN', region: 'CN', mode: 'aggregated' })], []);
  assert.deepEqual([...sandbox.LibretvRouting.getEligibleSources({ mode: 'manual', selectedSource: 'unannotated' })], ['unannotated']);
});

test('source health records failures, clears on success, and expires after five minutes', async () => {
  const sandbox = await loadScripts(['js/source-routing.js']);
  const routing = sandbox.LibretvRouting;
  routing.recordSourceFailure('ffzy', 1000);
  assert.equal(routing.isSourceHealthy('ffzy', 1001), false);
  routing.recordSourceSuccess('ffzy', 2000);
  assert.equal(routing.isSourceHealthy('ffzy', 2001), true);
  routing.recordSourceFailure('ffzy', 3000);
  assert.equal(routing.isSourceHealthy('ffzy', 302999), false);
  assert.equal(routing.isSourceHealthy('ffzy', 303000), true);
});

test('request context is explicit and does not depend on a global user country', async () => {
  const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
  const url = new URL('https://jumeitianxia.com/api/search?locale=zh-TW&region=TW&sourceMode=aggregated');
  assert.deepEqual({ ...sandbox.LibretvRouting.getRequestContext(url) }, {
    locale: 'zh-TW', region: 'TW', sourceMode: 'aggregated', selectedSource: ''
  });
});

test('source plan has primary and fallback layers', async () => {
  const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
  const plan = sandbox.LibretvRouting.buildSourcePlan({ locale: 'en', region: 'GLOBAL_EN', sourceMode: 'aggregated' });
  assert.deepEqual([...plan.primary], []);
  assert.ok(plan.fallback.length > 0);
});

test('aggregated search returns primary results and routing metadata', async () => {
  const sandbox = await loadApiSandbox(async () => ({ ok: true, text: async () => JSON.stringify({ list: [{ vod_id: '1', vod_name: 'Primary', vod_pic: 'https://img.test/a.jpg' }] }) }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&locale=zh-CN&region=CN&sourceMode=aggregated')));
  assert.equal(payload.code, 200);
  assert.ok(payload.list.length > 0);
  assert.equal(payload.routing.fellBack, false);
  assert.ok(payload.routing.usedSources.length > 0);
});

test('aggregated search falls back when every primary source fails', async () => {
  const sandbox = await loadApiSandbox(async () => ({ ok: true, text: async () => JSON.stringify({ list: [{ vod_id: '2', vod_name: 'Fallback', vod_pic: 'https://img.test/b.jpg' }] }) }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&locale=en&region=GLOBAL_EN&sourceMode=aggregated')));
  assert.equal(payload.code, 200);
  assert.equal(payload.routing.fellBack, true);
  assert.ok(payload.list.length > 0);
});

test('one primary source failure does not block another source', async () => {
  const sandbox = await loadApiSandbox(async (input) => {
    const target = decodeURIComponent(String(input).slice('https://r.jina.ai/'.length));
    if (target.includes('ffzy5')) return { ok: false, status: 500, text: async () => '{}' };
    return { ok: true, text: async () => JSON.stringify({ list: [{ vod_id: target.includes('tyyszy') ? '3' : '4', vod_name: 'Other', vod_pic: 'https://img.test/c.jpg' }] }) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&locale=zh-CN&region=CN&sourceMode=aggregated')));
  assert.equal(payload.code, 200);
  assert.ok(payload.list.length > 0);
  assert.equal(payload.routing.fellBack, false);
});

test('recommendation plans exclude sources without recommendation capability', async () => {
  const sandbox = await loadScripts(['js/source-routing.js']);
  sandbox.API_SITES = {
    searchOnly: { languages: ['zh-CN'], regions: ['CN'], defaultEligible: true, enabled: true, capabilities: { search: true, recommendations: false }, priority: 100 },
    recommender: { languages: ['zh-CN'], regions: ['CN'], defaultEligible: true, enabled: true, capabilities: { search: true, recommendations: true }, priority: 90 }
  };
  const plan = sandbox.LibretvRouting.buildSourcePlan({ locale: 'zh-CN', region: 'CN', sourceMode: 'aggregated', capability: 'recommendations' });
  assert.ok(![...plan.primary, ...plan.fallback].includes('searchOnly'));
  assert.ok([...plan.primary, ...plan.fallback].includes('recommender'));
  const searchPlan = sandbox.LibretvRouting.buildSourcePlan({ locale: 'zh-CN', region: 'CN', sourceMode: 'aggregated', capability: 'search' });
  assert.ok([...searchPlan.primary, ...searchPlan.fallback].includes('searchOnly'));
});

test('custom recommendations use the supplied custom API and expose routing metadata', async () => {
  let requested = '';
  const sandbox = await loadApiSandbox(async input => {
    requested = decodeURIComponent(String(input));
    return { ok: true, text: async () => JSON.stringify({ list: [{ vod_id: '9', vod_name: 'Custom', vod_pic: 'https://img.test/custom.jpg' }] }) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&source=custom&sourceMode=custom&customApi=https%3A%2F%2Fcustom.example')));
  assert.equal(payload.code, 200);
  assert.equal(payload.list[0].source_code, 'custom');
  assert.equal(payload.routing.usedSources[0], 'custom');
  assert.ok(requested.includes('custom.example'));
});

test('custom search responses include explicit routing metadata', async () => {
  const sandbox = await loadApiSandbox(async () => ({ ok: true, text: async () => JSON.stringify({ list: [{ vod_id: '10', vod_name: 'Custom Search' }] }) }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&source=custom&sourceMode=custom&customApi=https%3A%2F%2Fcustom.example')));
  assert.equal(payload.code, 200);
  assert.deepEqual({ ...payload.routing }, { locale: 'zh-CN', region: 'GLOBAL_ZH', requestedSources: ['custom'], usedSources: ['custom'], fellBack: false });
});

test('recommendation failures still expose routing metadata', async () => {
  const sandbox = await loadApiSandbox(async () => ({ ok: false, status: 503, text: async () => '{}' }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&locale=zh-CN&region=CN&sourceMode=region')));
  assert.equal(payload.code, 400);
  assert.equal(payload.routing.locale, 'zh-CN');
  assert.ok(Array.isArray(payload.routing.requestedSources));
  assert.ok(payload.routing.requestedSources.includes('ffzy'));
  assert.deepEqual([...payload.routing.usedSources], []);
});

test('static page loads source routing before API interception', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="js/source-routing.js"') < html.indexOf('src="js/api.js"'));
});
