import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const repoRoot = new URL('../', import.meta.url);

const assertJsonEqual = (actual, expected) => {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
};

async function loadAdapter() {
  const sandbox = { URL, URLSearchParams, console };
  sandbox.globalThis = sandbox;
  const source = await readFile(new URL('js/adapters/blender.js', repoRoot), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'js/adapters/blender.js' });
  return sandbox.BlenderAdapter;
}

test('builds PeerTube search, recommendations, and detail URLs', async () => {
  const adapter = await loadAdapter();

  const search = new URL(adapter.buildSearchUrl('space opera', 2, 10));
  assert.equal(search.origin, 'https://video.blender.org');
  assert.equal(search.pathname, '/api/v1/search/videos');
  assert.equal(search.searchParams.get('search'), 'space opera');
  assert.equal(search.searchParams.get('start'), '10');
  assert.equal(search.searchParams.get('count'), '10');
  assert.equal(search.searchParams.get('sort'), '-match');

  const bounded = new URL(adapter.buildSearchUrl('short', 0, 10000));
  assert.equal(bounded.searchParams.get('start'), '0');
  assert.equal(bounded.searchParams.get('count'), '100');

  const recommendations = new URL(adapter.buildRecommendationsUrl(3, 6));
  assert.equal(recommendations.pathname, '/api/v1/videos');
  assert.equal(recommendations.searchParams.get('start'), '12');
  assert.equal(recommendations.searchParams.get('count'), '6');
  assert.equal(recommendations.searchParams.get('sort'), '-publishedAt');

  assert.equal(
    adapter.buildDetailUrl('f6d5/uuid'),
    'https://video.blender.org/api/v1/videos/f6d5%2Fuuid'
  );
});

test('normalizes PeerTube search results into video cards with MP4 play URLs', async () => {
  const adapter = await loadAdapter();
  const payload = {
    data: [{
      id: 42,
      uuid: 'blender-uuid-42',
      name: 'English Blender Short',
      description: 'A short film from Blender Open Movies.',
      thumbnailPath: '/static/thumbnails/blender-uuid-42.jpg',
      duration: 125,
      files: [
        { fileUrl: 'https://cdn.example.test/video.m3u8', mimeType: 'application/x-mpegURL' },
        { fileUrl: 'https://cdn.example.test/video-720.mp4', mimeType: 'video/mp4', hasVideo: true, hasAudio: true, resolution: { id: 720 } },
        { fileUrl: 'https://cdn.example.test/video-audio.mp4', mimeType: 'video/mp4', hasVideo: false, hasAudio: true, resolution: { id: 1080 } },
      ],
    }],
    total: 1,
  };

  const normalized = adapter.normalizeSearchResponse(payload);
  assert.equal(normalized.code, 200);
  assert.equal(normalized.total, 1);
  assert.equal(normalized.list.length, 1);
  assertJsonEqual(normalized.list[0], {
    vod_id: 'blender-uuid-42',
    source_id: '42',
    vod_name: 'English Blender Short',
    vod_pic: 'https://video.blender.org/static/thumbnails/blender-uuid-42.jpg',
    vod_content: 'A short film from Blender Open Movies.',
    vod_play_url: 'Episode 1$https://cdn.example.test/video-720.mp4',
    source_code: 'blender',
    source_name: 'Blender PeerTube',
  });
});

test('uses PeerTube thumbnail variants when thumbnailPath is omitted', async () => {
  const adapter = await loadAdapter();
  const normalized = adapter.normalizeSearchResponse({
    data: [{
      uuid: 'thumbnail-fallback',
      name: 'Thumbnail fallback',
      thumbnails: [{ fileUrl: 'https://video.blender.org/lazy-static/thumb.jpg' }],
    }],
  });

  assert.equal(normalized.list[0].vod_pic, 'https://video.blender.org/lazy-static/thumb.jpg');
});

test('normalizes detail responses and keeps only playable MP4 episode URLs', async () => {
  const adapter = await loadAdapter();
  const normalized = adapter.normalizeDetailResponse({
    id: 7,
    uuid: 'detail-uuid-7',
    name: 'Big Buck Bunny',
    description: 'An English open movie.',
    thumbnailPath: '/static/thumbnails/detail-uuid-7.jpg',
    files: [
      { fileUrl: 'https://cdn.example.test/bunny-1080.mp4', mimeType: 'video/mp4' },
      { fileUrl: 'https://cdn.example.test/bunny-720.mp4', mimeType: 'video/mp4' },
      { fileUrl: 'https://cdn.example.test/bunny.m3u8', mimeType: 'application/x-mpegURL' },
    ],
  });

  assert.equal(normalized.code, 200);
  assertJsonEqual(normalized.episodes, [
    'https://cdn.example.test/bunny-1080.mp4',
  ]);
  assert.equal(normalized.title, 'Big Buck Bunny');
  assert.equal(normalized.cover, 'https://video.blender.org/static/thumbnails/detail-uuid-7.jpg');
  assert.equal(normalized.desc, 'An English open movie.');
  assertJsonEqual(normalized.videoInfo, {
    title: 'Big Buck Bunny',
    cover: 'https://video.blender.org/static/thumbnails/detail-uuid-7.jpg',
    desc: 'An English open movie.',
    source_name: 'Blender PeerTube',
    source_code: 'blender',
  });
});

test('accepts nested data detail payloads and returns an empty result for malformed data', async () => {
  const adapter = await loadAdapter();
  const nested = adapter.normalizeDetailResponse({
    data: {
      uuid: 'nested-1',
      name: 'Nested video',
      files: [{ fileUrl: 'https://cdn.example.test/nested.mp4' }],
    },
  });
  assert.equal(nested.episodes[0], 'https://cdn.example.test/nested.mp4');
  assert.equal(nested.videoInfo.title, 'Nested video');

  const malformed = adapter.normalizeSearchResponse({ data: null });
  assertJsonEqual(malformed, { code: 200, list: [], total: 0 });
  assertJsonEqual(adapter.normalizeDetailResponse(null), {
    code: 200,
    episodes: [],
    videoInfo: {
      title: '',
      cover: '',
      desc: '',
      source_name: 'Blender PeerTube',
      source_code: 'blender',
    },
  });
});

test('rejects non-http asset URLs while normalizing cards', async () => {
  const adapter = await loadAdapter();
  const normalized = adapter.normalizeSearchResponse({
    data: [{
      uuid: 'unsafe-assets',
      name: 'Unsafe assets',
      thumbnailPath: 'javascript:alert(1)',
      files: [{ fileUrl: 'javascript:alert(2)' }],
    }],
  });

  assert.equal(normalized.list[0].vod_pic, '');
  assert.equal(normalized.list[0].vod_play_url, '');
});
