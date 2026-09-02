import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const loadAdapter = async fetchImpl => {
  const sandbox = { console, URL, URLSearchParams, fetch: fetchImpl };
  sandbox.globalThis = sandbox;
  const source = await readFile(new URL('../js/adapters/nasa.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'js/adapters/nasa.js' });
  return sandbox.NasaAdapter;
};

test('NASA stats expose the collection total without blocking on playable sampling', async () => {
  const adapter = await loadAdapter(async () => ({
    ok: true,
    text: async () => JSON.stringify({ collection: { metadata: { total_hits: 6543 }, items: [] } })
  }));
  const stats = await adapter.getStats();
  assert.equal(stats.catalogCount, 6543);
  assert.equal(stats.playableCount, null);
  assert.equal(stats.countKind, 'estimated');
  assert.equal(stats.status, 'available');
});

test('buildSearchUrl creates a bounded NASA video search request', async () => {
  const adapter = await loadAdapter();

  assert.equal(adapter.SOURCE_CODE, 'nasa');
  assert.equal(adapter.SOURCE_NAME, 'NASA');
  assert.equal(adapter.API_BASE_URL, 'https://images-api.nasa.gov');

  assert.equal(
    adapter.buildSearchUrl('Apollo launch', 2, 15),
    'https://images-api.nasa.gov/search?q=Apollo%20launch&page=2&page_size=15&media_type=video'
  );
  assert.equal(
    adapter.buildSearchUrl('  Apollo  ', 0, 500),
    'https://images-api.nasa.gov/search?q=Apollo&page=1&page_size=100&media_type=video'
  );
});

test('buildRecommendationsUrl requests the latest NASA video page', async () => {
  const adapter = await loadAdapter();
  assert.equal(
    adapter.buildRecommendationsUrl(3, 12),
    'https://images-api.nasa.gov/search?q=&page=3&page_size=12&media_type=video'
  );
});

test('normalizeSearchResponse maps NASA metadata to stable English video items', async () => {
  const adapter = await loadAdapter();
  const payload = {
    collection: {
      items: [
        {
          href: 'http://images-assets.nasa.gov/video/Apollo 17/collection.json',
          data: [{
            nasa_id: 'Apollo 17',
            title: 'Apollo 17 Launch',
            description: 'Official NASA launch footage.',
            date_created: '2022-12-01T00:00:00Z',
            media_type: 'video',
            center: 'KSC'
          }],
          links: [
            { href: 'https://images-assets.nasa.gov/video/Apollo 17/Apollo 17~large.jpg', rel: 'alternate', render: 'image', width: 800 },
            { href: 'https://images-assets.nasa.gov/video/Apollo 17/Apollo 17~thumb.jpg', rel: 'preview', render: 'image', width: 300 }
          ]
        },
        {
          href: 'http://images-assets.nasa.gov/video/Apollo 17/collection.json',
          data: [{ nasa_id: 'Apollo 17', title: 'Duplicate', media_type: 'video' }]
        },
        {
          href: 'https://images-assets.nasa.gov/image/only-image/collection.json',
          data: [{ nasa_id: 'image-1', title: 'Not a video', media_type: 'image' }]
        }
      ]
    }
  };

  const items = adapter.normalizeSearchResponse(payload);
  assert.equal(items.length, 1);
  assert.match(items[0].vod_id, /^nasa_[0-9a-f]+$/);
  assert.equal(items[0].vod_name, 'Apollo 17 Launch');
  assert.equal(items[0].vod_content, 'Official NASA launch footage.');
  assert.equal(items[0].vod_pic, 'https://images-assets.nasa.gov/video/Apollo%2017/Apollo%2017~thumb.jpg');
  assert.equal(items[0].detail_url, 'https://images-assets.nasa.gov/video/Apollo%2017/collection.json');
  assert.equal(items[0].source_code, 'nasa');
  assert.equal(items[0].source_name, 'NASA');
  assert.equal(items[0].language, 'en');
  assert.equal(items[0].vod_year, '2022');
});

test('buildDetailUrl accepts an asset collection URL and stable NASA id', async () => {
  const adapter = await loadAdapter();
  const id = adapter.toStableId('Apollo 17');

  assert.equal(adapter.fromStableId(id), 'Apollo 17');
  assert.equal(
    adapter.buildDetailUrl('http://images-assets.nasa.gov/video/Apollo 17/collection.json'),
    'https://images-assets.nasa.gov/video/Apollo%2017/collection.json'
  );
  assert.equal(
    adapter.buildDetailUrl(id),
    'https://images-api.nasa.gov/asset/Apollo%2017'
  );
});

test('stable ids remain collision-free for NASA ids that resemble the adapter prefix', async () => {
  const adapter = await loadAdapter();
  const encoded = adapter.toStableId('a');
  const nasaPrefixed = adapter.toStableId('nasa_61');
  assert.notEqual(encoded, nasaPrefixed);
  assert.equal(adapter.fromStableId(nasaPrefixed), 'nasa_61');
});

test('getCollectionUrl extracts and normalizes the asset collection href', async () => {
  const adapter = await loadAdapter();
  assert.equal(
    adapter.getCollectionUrl({
      collection: {
        items: [{
          href: 'http://images-assets.nasa.gov/video/Apollo 17/collection.json',
          data: [{ nasa_id: 'Apollo 17', media_type: 'video' }]
        }]
      }
    }),
    'https://images-assets.nasa.gov/video/Apollo%2017/collection.json'
  );
  assert.equal(adapter.getCollectionUrl({ collection: { items: [] } }), '');
});

test('normalizeDetailResponse selects one playable medium MP4 rendition', async () => {
  const adapter = await loadAdapter();
  const collection = [
    'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~orig.mp4',
    'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~large.mp4',
    'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.mp4',
    'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~small.mp4',
    'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17.srt'
  ];

  assert.deepEqual([...adapter.normalizeDetailResponse(collection)], [
    'https://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.mp4'
  ]);
  assert.deepEqual([...adapter.normalizeDetailResponse(['https://example.test/video.mp4'])], [
    'https://example.test/video.mp4'
  ]);
  assert.deepEqual([...adapter.normalizeDetailResponse(['https://example.test/video.srt'])], []);
  assert.deepEqual([...adapter.normalizeDetailResponse({ collection: { items: [
    { href: 'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~large.mp4' },
    { href: 'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.mp4' },
    { href: 'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17.srt' }
  ] } })], ['https://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.mp4']);
});

test('normalizeDetailMetadata derives a human title and image from an asset collection', async () => {
  const adapter = await loadAdapter();
  const id = adapter.toStableId('Apollo 17');
  const metadata = adapter.normalizeDetailMetadata({ collection: { items: [
    { href: 'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.mp4' },
    { href: 'http://images-assets.nasa.gov/video/Apollo 17/Apollo 17~medium.jpg' }
  ] } }, id);
  assert.equal(metadata.title, 'Apollo 17');
  assert.equal(metadata.cover, 'https://images-assets.nasa.gov/video/Apollo%2017/Apollo%2017~medium.jpg');
});
