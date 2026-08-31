import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loadScripts = async (paths, extra = {}) => {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    ...extra,
  };
  sandbox.globalThis = sandbox;
  for (const path of paths) {
    vm.runInNewContext(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), sandbox, { filename: path });
  }
  return sandbox;
};

const loadRouting = extra => loadScripts(['js/source-routing.js'], extra);

const loadApi = async fetchImpl => loadScripts(['js/config.js', 'js/source-routing.js', 'js/api.js'], {
  fetch: fetchImpl,
  window: { fetch: fetchImpl },
  location: { origin: 'https://jumeitianxia.com', href: 'https://jumeitianxia.com/' },
}).then(sandbox => {
  sandbox.window = sandbox;
  return sandbox;
});

const addDisabledApiSite = sandbox => vm.runInNewContext("API_SITES.disabled = { api: 'https://disabled.example', name: 'Disabled', enabled: false };", sandbox);

test('manual source selection rejects prototype keys and disabled sources', async () => {
  const sandbox = await loadRouting();
  sandbox.API_SITES = {
    enabled: { enabled: true },
    disabled: { enabled: false },
  };
  assert.deepEqual([...sandbox.LibretvRouting.getEligibleSources({ mode: 'manual', selectedSource: 'toString' })], []);
  assert.deepEqual([...sandbox.LibretvRouting.getEligibleSources({ mode: 'manual', selectedSource: '__proto__' })], []);
  assert.deepEqual([...sandbox.LibretvRouting.getEligibleSources({ mode: 'manual', selectedSource: 'disabled' })], []);
  assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: '', storedSource: 'disabled' }), 'region');
});

test('resolveRegion normalizes stored values and ignores prototype keys', async () => {
  const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: 'tw', locale: 'en', browserLanguages: ['en-US'] }), 'TW');
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: '__proto__', locale: 'en', browserLanguages: ['en-US'] }), 'GLOBAL_EN');
  assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: 'constructor', locale: 'zh-CN', browserLanguages: ['zh-CN'] }), 'CN');
});

test('search rejects invalid and disabled sources without fetching an undefined URL', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => { calls += 1; return { ok: true, text: async () => JSON.stringify({ list: [] }) }; });
  addDisabledApiSite(sandbox);
  for (const source of ['toString', '__proto__', 'disabled']) {
    const payload = JSON.parse(await sandbox.handleApiRequest(new URL(`https://jumeitianxia.com/api/search?wd=x&source=${source}&sourceMode=manual`)));
    assert.equal(payload.code, 400);
    assert.match(payload.msg, /API来源|来源/);
  }
  assert.equal(calls, 0);
});

test('detail rejects invalid and disabled sources without fetching an undefined URL', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => { calls += 1; return { ok: true, text: async () => JSON.stringify({ list: [] }) }; });
  addDisabledApiSite(sandbox);
  for (const source of ['constructor', '__proto__', 'disabled']) {
    const payload = JSON.parse(await sandbox.handleApiRequest(new URL(`https://jumeitianxia.com/api/detail?id=1&source=${source}`)));
    assert.equal(payload.code, 400);
    assert.match(payload.msg, /API来源|来源/);
  }
  assert.equal(calls, 0);
});

test('recommendations reject an explicitly invalid or disabled source before routing', async () => {
  let calls = 0;
  const sandbox = await loadApi(async () => { calls += 1; return { ok: true, text: async () => JSON.stringify({ list: [] }) }; });
  addDisabledApiSite(sandbox);
  for (const source of ['constructor', '__proto__', 'disabled']) {
    const payload = JSON.parse(await sandbox.handleApiRequest(new URL(`https://jumeitianxia.com/api/recommendations?page=1&source=${source}&sourceMode=region`)));
    assert.equal(payload.code, 400);
    assert.match(payload.msg, /API来源|来源/);
  }
  assert.equal(calls, 0);
});

test('recommendation fallback is true only when a fallback source succeeds', async () => {
  const sandbox = await loadApi(async () => ({ ok: false, status: 503, text: async () => '{}' }));
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&locale=zh-CN&region=CN&sourceMode=region')));
  assert.equal(payload.code, 400);
  assert.equal(payload.routing.fellBack, false);
  assert.deepEqual(payload.routing.usedSources, []);
});

test('recommendation fallback reports true and the selected source when fallback returns data', async () => {
  const sandbox = await loadApi(async input => {
    const target = decodeURIComponent(String(input).slice('https://r.jina.ai/'.length));
    if (target.includes('ffzy5')) return { ok: false, status: 503, text: async () => '{}' };
    return { ok: true, text: async () => JSON.stringify({ list: [{ vod_id: 'fallback-1', vod_name: 'Fallback' }] }) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&locale=zh-CN&region=CN&sourceMode=region')));
  assert.equal(payload.code, 200);
  assert.equal(payload.routing.fellBack, true);
  assert.equal(payload.routing.usedSources.length, 1);
});

test('recommendations distinguish no eligible sources from provider failure', async () => {
  const sandbox = await loadApi(async () => ({ ok: false, status: 503, text: async () => '{}' }));
  vm.runInNewContext("Object.keys(API_SITES).forEach(key => { API_SITES[key].enabled = false; });", sandbox);
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&locale=zh-CN&region=CN&sourceMode=region')));
  assert.equal(payload.code, 400);
  assert.equal(payload.routing.noEligibleSources, true);
  assert.deepEqual(payload.routing.usedSources, []);
});

test('aggregated search distinguishes no eligible sources from eligible sources with no results', async () => {
  const noEligible = await loadApi(async () => ({ ok: true, text: async () => JSON.stringify({ list: [] }) }));
  vm.runInNewContext("Object.keys(API_SITES).forEach(key => { API_SITES[key].enabled = false; });", noEligible);
  const noEligiblePayload = JSON.parse(await noEligible.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&locale=zh-CN&region=CN&sourceMode=aggregated')));
  assert.equal(noEligiblePayload.code, 200);
  assert.equal(noEligiblePayload.routing.noEligibleSources, true);
  assert.deepEqual(noEligiblePayload.routing.usedSources, []);

  const eligibleNoResults = await loadApi(async () => ({ ok: true, text: async () => JSON.stringify({ list: [] }) }));
  vm.runInNewContext("Object.keys(API_SITES).forEach(key => { API_SITES[key].enabled = key === 'ffzy'; });", eligibleNoResults);
  const eligiblePayload = JSON.parse(await eligibleNoResults.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=x&locale=zh-CN&region=CN&sourceMode=aggregated')));
  assert.equal(eligiblePayload.code, 200);
  assert.equal(eligiblePayload.routing.noEligibleSources, false);
});
