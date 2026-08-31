import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const cacheSource = await readFile(new URL('../js/recommendation-cache.js', import.meta.url), 'utf8');
const cacheContext = { globalThis: {} };
vm.runInNewContext(cacheSource, cacheContext);
const { createRecommendationCache } = cacheContext.globalThis;

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test('recommendation cache stores and reads items for the selected source', () => {
  const storage = createMemoryStorage();
  const cache = createRecommendationCache(storage, () => 1000);
  const items = [{ vod_id: 1, vod_name: '示例' }];

  cache.save('ffzy', items);

  assert.equal(JSON.stringify(cache.read('ffzy', 600)), JSON.stringify(items));
  assert.equal(cache.read('tyyszy', 600), null);
});

test('recommendation cache ignores expired and malformed entries', () => {
  const storage = createMemoryStorage();
  let now = 1000;
  const cache = createRecommendationCache(storage, () => now);

  cache.save('ffzy', [{ vod_id: 1 }]);
  now = 2001;
  assert.equal(cache.read('ffzy', 1000), null);

  storage.setItem('libretv:recommendations:ffzy', '{broken');
  assert.equal(cache.read('ffzy', 600), null);
});

test('recommendation cache accepts canonical route keys without duplicating its namespace', () => {
  const storage = createMemoryStorage();
  const cache = createRecommendationCache(storage, () => 1000);
  const routeKey = 'libretv:recommendations:zh-CN:CN:ffzy:page:1';

  cache.save(routeKey, [{ vod_id: 7, source_code: 'ffzy' }]);

  assert.equal(JSON.stringify(cache.read(routeKey, 600)), JSON.stringify([{ vod_id: 7, source_code: 'ffzy' }]));
  assert.ok(storage.getItem(routeKey));
  assert.equal(storage.getItem(`libretv:recommendations:${routeKey}`), null);
});
