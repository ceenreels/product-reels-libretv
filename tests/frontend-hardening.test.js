import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');
const playerSource = await readFile(new URL('../player.html', import.meta.url), 'utf8');

const load = async (source, overrides = {}) => {
  const local = new Map();
  const document = {
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, append() {}, appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {} }; }
  };
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({ list: [] }) }),
    navigator: { languages: ['en-US'] },
    location: { search: '', href: 'https://jumeitianxia.com/' },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, String(value)), removeItem: key => local.delete(key) },
    document,
    window: { open() {} },
    DEFAULT_API_SOURCE: 'ffzy',
    CUSTOM_API_CONFIG: { separator: ',', maxSources: 3 },
    API_REQUEST_TIMEOUT: 1000,
    SITE_STATUS_TEST_TIMEOUT: 10,
    SITE_STATUS_CACHE_EXPIRY: 1000,
    PLAYER_CONFIG: { adFilteringStorage: 'adFilteringEnabled' },
    API_SITES: { ffzy: {}, tyyszy: {}, zy360: {} },
    LibretvI18n: { t: (key, _locale, fallback) => fallback || key, apply() {}, resolveLocale: ({ storedLocale }) => storedLocale || 'en', resolveRegion: ({ storedRegion }) => storedRegion || 'GLOBAL_EN' },
    LibretvRouting: { buildSourcePlan: () => ({ primary: ['tyyszy'], fallback: ['zy360'] }) },
    createRecommendationCache: () => ({ read() { return null; }, save() {} })
  };
  Object.assign(sandbox, overrides);
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox;
};

test('URL locale accepts locale and lang while stored locale wins', async () => {
  assert.match(appSource, /get\(['"]locale['"]\)\s*\|\|\s*[\w.]+\.get\(['"]lang['"]\)/);
  assert.match(appSource, /hasPersistedLocale/);
  assert.match(playerSource, /get\(['"]locale['"]\)\s*\|\|\s*[\w.]+\.get\(['"]lang['"]\)/);
});

test('player bootstrap reads locale or lang and gives persisted locale precedence', () => {
  assert.match(playerSource, /q\.get\(['"]locale['"]\)\s*\|\|\s*q\.get\(['"]lang['"]\)/);
  assert.match(playerSource, /persisted\s*=\s*localStorage\.getItem\(['"]libretv:locale['"]\)/);
});

test('legacy recommendation candidates stay isolated to active route', async () => {
  const sandbox = await load(appSource, { currentApiSource: 'region', sourceMode: 'region' });
  assert.deepEqual(Array.from(sandbox.getLegacyRecommendationSources({ source: 'region', sourceMode: 'region', plan: { primary: ['tyyszy'], fallback: ['zy360'] } })), ['tyyszy', 'zy360']);
  assert.deepEqual(Array.from(sandbox.getLegacyRecommendationSources({ source: 'custom', sourceMode: 'custom', plan: { primary: [], fallback: [] } })), ['custom']);
  assert.deepEqual(Array.from(sandbox.getLegacyRecommendationSources({ source: 'ffzy', sourceMode: 'manual', plan: { primary: [], fallback: [] } })), ['ffzy']);
});

test('external settings close synchronizes aria-hidden', async () => {
  assert.match(appSource, /panel\.classList\.remove\(['"]show['"]\);[\s\S]{0,120}panel\.setAttribute\(['"]aria-hidden['"],\s*['"]true['"]\)/);
});

test('search and recommendation code contains generation guards', () => {
  assert.match(appSource, /recommendationGeneration|recommendationRequestToken|generationToken/);
  assert.match(appSource, /searchGeneration|searchRequestToken/);
  assert.match(appSource, /requestGeneration\s*!==\s*recommendationGeneration/);
  assert.match(appSource, /requestGeneration\s*!==\s*searchGeneration/);
});

test('invalidating an active search clears the stale loading overlay', async () => {
  let hidden = 0;
  const sandbox = await load(appSource, { hideLoading: () => { hidden += 1; } });
  sandbox.invalidateSearchRequests();
  assert.equal(hidden, 1);
});

test('persisted source validation rejects prototype and disabled sources', async () => {
  const sandbox = await load(appSource, { API_SITES: { ffzy: { enabled: true }, disabled: { enabled: false } } });
  assert.equal(sandbox.hasUsableApiSource('toString'), false);
  assert.equal(sandbox.hasUsableApiSource('__proto__'), false);
  assert.equal(sandbox.hasUsableApiSource('disabled'), false);
  assert.equal(sandbox.hasUsableApiSource('ffzy'), true);
});

test('stale recommendation response cannot overwrite newer route state', async () => {
  let resolveFirst;
  let resolveSecond;
  let calls = 0;
  const area = { classList: { remove() {} } };
  const container = { innerHTML: '' };
  const sandbox = await load(appSource, {
    document: { addEventListener() {}, getElementById: id => id === 'recommendationArea' ? area : id === 'recommendationResults' ? container : null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}) },
    fetch: () => {
      calls += 1;
      return new Promise(resolve => calls === 1 ? (resolveFirst = resolve) : (resolveSecond = resolve));
    }
  });
  sandbox.renderRecommendations = items => { container.innerHTML = items[0]?.vod_name || 'empty'; };
  const first = sandbox.loadRecommendations();
  const second = sandbox.loadRecommendations();
  resolveFirst({ ok: true, json: async () => ({ list: [{ vod_name: 'old' }] }) });
  await first;
  assert.doesNotMatch(container.innerHTML, /old/);
  resolveSecond({ ok: true, json: async () => ({ list: [{ vod_name: 'new' }] }) });
  await second;
  assert.equal(container.innerHTML, 'new');
});

test('dynamic UI messages and noEligibleSources keys exist in all locales', async () => {
  const source = await readFile(new URL('../js/i18n/messages.js', import.meta.url), 'utf8');
  const sandbox = await load(source + '(function(){})();', { LibretvI18n: undefined });
  const keys = ['searchPrompt', 'searchEmpty', 'searchError', 'searchTimeout', 'clickToPlay', 'unknownVideo', 'noEpisodes', 'noEligibleSources', 'siteTesting', 'customApiUnset', 'adLabel'];
  for (const locale of sandbox.SUPPORTED_LOCALES) for (const key of keys) assert.equal(typeof sandbox.MESSAGES[locale][key], 'string', `${locale}.${key}`);
});
