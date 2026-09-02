import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loadApi = async fetchImpl => {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    fetch: fetchImpl,
    location: { origin: 'https://jumeitianxia.com', href: 'https://jumeitianxia.com/' },
    window: { fetch: fetchImpl },
  };
  sandbox.globalThis = sandbox;
  for (const path of ['js/config.js', 'js/source-routing.js', 'js/api.js']) {
    vm.runInNewContext(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), sandbox, { filename: path });
  }
  return sandbox;
};

function installStatsAdapter(sandbox, statsFn) {
  sandbox.VIDEO_SOURCE_ADAPTERS = {
    fakeStats: {
      getStats: statsFn,
      buildSearchUrl: () => 'https://provider.example/search',
      normalizeSearchResponse: payload => payload?.list || [],
    },
  };
  vm.runInNewContext("API_SITES.blender.adapter = 'fakeStats'; API_SITES.blender.enabled = true;", sandbox);
}

test('source-stats endpoint returns normalized adapter statistics', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => {
    calls += 1;
    return { ok: true, text: async () => '{}' };
  });
  installStatsAdapter(sandbox, async () => ({
    catalogCount: 123,
    playableCount: 97,
    countKind: 'estimated',
    updatedAt: '2026-09-02T00:00:00.000Z',
    sampleSize: 100,
    status: 'available',
  }));

  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/source-stats?source=blender')));
  assert.equal(payload.code, 200);
  assert.equal(payload.source, 'blender');
  assert.deepEqual(payload.stats, {
    catalogCount: 123,
    playableCount: 97,
    countKind: 'estimated',
    updatedAt: '2026-09-02T00:00:00.000Z',
    sampleSize: 100,
    status: 'available',
  });
  assert.equal(calls, 0, 'stats adapters must not use the search fetch path');
});

test('source-stats endpoint caches each source for six hours', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => ({ ok: true, text: async () => '{}' }));
  installStatsAdapter(sandbox, async () => {
    calls += 1;
    return { catalogCount: calls, playableCount: calls, countKind: 'authoritative', status: 'available' };
  });

  const url = new URL('https://jumeitianxia.com/api/source-stats?source=blender');
  const first = JSON.parse(await sandbox.handleApiRequest(url));
  const second = JSON.parse(await sandbox.handleApiRequest(url));
  assert.equal(first.stats.catalogCount, 1);
  assert.equal(second.stats.catalogCount, 1);
  assert.equal(calls, 1);
});

test('disabled or unreachable source stats fail soft without affecting search', async () => {
  const sandbox = await loadApi(async () => ({ ok: true, text: async () => JSON.stringify({ list: [{ vod_id: 'ok' }] }) }));
  installStatsAdapter(sandbox, async () => { throw new Error('provider unavailable'); });

  vm.runInNewContext("API_SITES.blender.enabled = false;", sandbox);
  const disabled = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/source-stats?source=blender')));
  assert.equal(disabled.code, 200);
  assert.equal(disabled.stats.countKind, 'unavailable');
  assert.equal(disabled.stats.status, 'error');

  vm.runInNewContext("API_SITES.blender.enabled = true;", sandbox);
  const unreachable = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/source-stats?source=blender')));
  assert.equal(unreachable.code, 200);
  assert.equal(unreachable.stats.countKind, 'unavailable');
  assert.equal(unreachable.stats.status, 'error');

  const search = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=test&source=blender&sourceMode=manual')));
  assert.equal(search.code, 200);
  assert.equal(search.list[0].vod_id, 'ok');
});

test('unknown source stats returns a safe client error', async () => {
  const sandbox = await loadApi(async () => ({ ok: true, text: async () => '{}' }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/source-stats?source=not-a-source')));
  assert.equal(payload.code, 400);
  assert.equal(payload.stats.countKind, 'unavailable');
});

test('source without stats capability returns unavailable without calling adapter', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => ({ ok: true, text: async () => '{}' }));
  installStatsAdapter(sandbox, async () => { calls += 1; return { catalogCount: 1, status: 'available' }; });
  vm.runInNewContext("API_SITES.blender.capabilities = { search: true, stats: false };", sandbox);
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/source-stats?source=blender')));
  assert.equal(payload.code, 200);
  assert.equal(payload.stats.countKind, 'unavailable');
  assert.equal(calls, 0);
});

test('settings source statistics are lazy and use a six-hour browser cache', async () => {
  const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const local = new Map();
  let fetchCalls = 0;
  const container = { innerHTML: '' };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ code: 200, source: 'blender', stats: { catalogCount: 4, playableCount: null, countKind: 'estimated', status: 'available', updatedAt: new Date().toISOString() } }) };
    },
    navigator: { languages: ['en-US'] },
    location: { search: '', href: 'https://jumeitianxia.com/' },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) },
    document: { addEventListener() {}, getElementById: id => id === 'sourceStatsList' ? container : null, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, append() {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; } },
    window: { open() {} },
    DEFAULT_API_SOURCE: 'ffzy',
    CUSTOM_API_CONFIG: { separator: ',', maxSources: 3 },
    API_REQUEST_TIMEOUT: 1000,
    SITE_STATUS_TEST_TIMEOUT: 10,
    SITE_STATUS_CACHE_EXPIRY: 1000,
    PLAYER_CONFIG: { adFilteringStorage: 'adFilteringEnabled' },
    API_SITES: { blender: { name: 'Blender', languages: ['en'], enabled: true } },
    LibretvI18n: { t: (key, _locale, fallback) => fallback || key, apply() {}, resolveLocale: ({ storedLocale }) => storedLocale || 'en', resolveRegion: ({ storedRegion }) => storedRegion || 'GLOBAL_EN' },
    LibretvRouting: { buildSourcePlan: () => ({ primary: ['blender'], fallback: [] }) },
    createRecommendationCache: () => ({ read() { return null; }, save() {} })
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(appSource, sandbox, { filename: 'js/app.js' });

  assert.equal(fetchCalls, 0, 'loading the app must not fetch source stats');
  await sandbox.loadSourceStats();
  assert.equal(fetchCalls, 1);
  await sandbox.loadSourceStats();
  assert.equal(fetchCalls, 1, 'fresh localStorage stats should be reused');
  assert.match(container.innerHTML, /Blender/);
  assert.match(container.innerHTML, /4/);
  assert.match(container.innerHTML, /estimate|about/i);
});

test('settings panel triggers source stats only when opened', async () => {
  const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
  let opened = false;
  let loads = 0;
  const panel = { classList: { shown: false, toggle() { this.shown = !this.shown; }, contains() { return this.shown; } }, setAttribute(_name, value) { opened = value === 'false'; } };
  const sandbox = {
    console,
    document: { getElementById: id => id === 'settingsPanel' ? panel : null },
    localStorage: { getItem() { return null; } },
    loadSourceStats: () => { loads += 1; },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(uiSource, sandbox, { filename: 'js/ui.js' });
  sandbox.toggleSettings({ stopPropagation() {} });
  assert.equal(opened, true);
  assert.equal(loads, 1);
});
