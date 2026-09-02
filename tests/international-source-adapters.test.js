import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const repoRoot = new URL('../', import.meta.url);

async function loadAdapter(filename, globalName, fetchImpl) {
  const sandbox = { console, URL, URLSearchParams, fetch: fetchImpl };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(await readFile(new URL(`../js/adapters/${filename}`, import.meta.url), 'utf8'), sandbox, { filename });
  return sandbox[globalName];
}

function assertVideoItem(item, sourceCode, sourceName) {
  assert.equal(item.source_code, sourceCode);
  assert.equal(item.source_name, sourceName);
  assert.ok(item.vod_id);
  assert.ok(item.vod_name);
  assert.ok(typeof item.vod_pic === 'string');
  assert.ok(typeof item.vod_content === 'string');
}

test('Internet Archive adapter builds API URLs and normalizes playable metadata', async () => {
  const adapter = await loadAdapter('archive.js', 'ArchiveAdapter');
  const search = new URL(adapter.buildSearchUrl('open movie', 2, 15));
  assert.equal(search.origin, 'https://archive.org');
  assert.equal(search.pathname, '/advancedsearch.php');
  assert.equal(search.searchParams.get('output'), 'json');
  assert.equal(search.searchParams.get('rows'), '15');
  assert.equal(search.searchParams.get('start'), '15');
  assert.match(search.searchParams.get('q'), /mediatype:movies/);
  assert.match(search.searchParams.get('q'), /open movie/);
  assert.equal(adapter.buildDetailUrl('BigBuckBunny_328'), 'https://archive.org/metadata/BigBuckBunny_328');
  assert.equal(adapter.buildDetailUrl({ identifier: 'demo-item' }), 'https://archive.org/metadata/demo-item');

  const normalized = adapter.normalizeSearchResponse({ response: {
    numFound: 1,
    docs: [{ identifier: 'demo-item', title: 'Open Movie', description: 'Public domain film', year: 2024 }]
  }});
  assert.equal(normalized.code, 200);
  assert.equal(normalized.total, 1);
  assertVideoItem(normalized.list[0], 'archive', 'Internet Archive');
  assert.equal(normalized.list[0].vod_id, 'demo-item');
  assert.equal(normalized.list[0].vod_pic, 'https://archive.org/services/img/demo-item');
  assert.equal(normalized.list[0].vod_play_url, '');
});

test('Internet Archive adapter selects HTTPS MP4 files and rejects audio/download derivatives', async () => {
  const adapter = await loadAdapter('archive.js', 'ArchiveAdapter');
  const normalized = adapter.normalizeDetailResponse({
    metadata: { identifier: 'demo-item', title: 'Open Movie', description: 'Description' },
    files: [
      { name: 'demo_movie.mp4', format: 'MPEG4', size: '1000' },
      { name: 'demo_movie_512kb.mp4', format: 'MPEG4', size: '100' },
      { name: 'demo_movie.mp3', format: 'VBR MP3', size: '20' },
      { name: 'demo_movie.zip', format: 'Item Image', size: '50' },
      { name: 'demo_movie.webm', format: 'WebM', size: '900' }
    ]
  }, 'demo-item');
  assert.equal(normalized.code, 200);
  assert.deepEqual([...normalized.episodes], ['https://archive.org/download/demo-item/demo_movie.mp4']);
  assert.equal(normalized.videoInfo.title, 'Open Movie');
  assert.equal(normalized.videoInfo.cover, 'https://archive.org/services/img/demo-item');
  assert.equal(adapter.isPlayableUrl('https://archive.org/download/demo-item/demo_movie.mp4'), true);
  assert.equal(adapter.isPlayableUrl('https://archive.org/download/demo-item/demo_movie.mp3'), false);
  assert.equal(adapter.isPlayableUrl('http://archive.org/download/demo-item/demo_movie.mp4'), false);
});

test('Internet Archive stats expose authoritative catalog count and non-blocking playable estimate', async () => {
  const calls = [];
  const adapter = await loadAdapter('archive.js', 'ArchiveAdapter', async input => {
    calls.push(String(input));
    return { ok: true, json: async () => ({ response: { numFound: 123456, docs: [] } }) };
  });
  const stats = await adapter.getStats();
  assert.equal(stats.catalogCount, 123456);
  assert.equal(stats.playableCount, null);
  assert.equal(stats.countKind, 'estimated');
  assert.equal(stats.status, 'available');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /advancedsearch\.php/);
});

test('PeerTube network adapter preserves instance and UUID while normalizing direct media', async () => {
  const adapter = await loadAdapter('peertube.js', 'PeerTubeAdapter');
  const search = new URL(adapter.buildSearchUrl('open animation', 2, 10));
  assert.equal(search.origin, 'https://sepiasearch.org');
  assert.equal(search.pathname, '/api/v1/search/videos');
  assert.equal(search.searchParams.get('search'), 'open animation');
  assert.equal(search.searchParams.get('start'), '10');
  assert.equal(search.searchParams.get('count'), '10');

  const payload = { total: 1, data: [{
    host: 'tube.example',
    uuid: 'uuid-123',
    name: 'Open Animation',
    description: 'A federated video',
    thumbnailPath: '/static/thumbnails/uuid-123.jpg',
    files: [
      { fileUrl: 'https://tube.example/static/audio.mp4', mimeType: 'audio/mp4', hasVideo: false },
      { fileUrl: 'https://tube.example/static/video-720.mp4', mimeType: 'video/mp4', hasVideo: true, resolution: { id: 720 } },
      { fileUrl: 'http://tube.example/static/video-1080.mp4', mimeType: 'video/mp4', hasVideo: true, resolution: { id: 1080 } }
    ]
  }] };
  const normalized = adapter.normalizeSearchResponse(payload);
  assert.equal(normalized.total, 1);
  assert.equal(normalized.list.length, 1);
  assertVideoItem(normalized.list[0], 'peertube', 'PeerTube Network');
  assert.match(normalized.list[0].vod_id, /tube_2eexample/);
  assert.match(normalized.list[0].vod_id, /uuid-123/);
  assert.equal(normalized.list[0].vod_pic, 'https://tube.example/static/thumbnails/uuid-123.jpg');
  assert.equal(normalized.list[0].vod_play_url, 'Episode 1$https://tube.example/static/video-720.mp4');

  const detailUrl = adapter.buildDetailUrl(normalized.list[0].vod_id);
  assert.equal(detailUrl, 'https://tube.example/api/v1/videos/uuid-123');
});

test('PeerTube adapter accepts HLS, rejects insecure/audio URLs, and reports estimated network stats', async () => {
  const adapter = await loadAdapter('peertube.js', 'PeerTubeAdapter', async input => ({
    ok: true,
    json: async () => ({ total: 987654 })
  }));
  assert.equal(adapter.isPlayableUrl('https://tube.example/static/video.m3u8'), true);
  assert.equal(adapter.isPlayableUrl('https://tube.example/static/video.mp4'), true);
  assert.equal(adapter.isPlayableUrl('https://tube.example/static/audio.mp4'), false);
  assert.equal(adapter.isPlayableUrl('http://tube.example/static/video.mp4'), false);
  const detail = adapter.normalizeDetailResponse({
    host: 'tube.example', uuid: 'uuid-hls', name: 'HLS Video', files: [],
    streamingPlaylists: [{ playlistUrl: 'https://tube.example/static/video.m3u8', files: [] }]
  });
  assert.deepEqual([...detail.episodes], ['https://tube.example/static/video.m3u8']);
  const stats = await adapter.getStats();
  assert.equal(stats.catalogCount, 987654);
  assert.equal(stats.playableCount, null);
  assert.equal(stats.countKind, 'estimated');
  assert.equal(stats.status, 'available');
});

test('PeerTube stable IDs preserve UUID punctuation through detail URL decoding', async () => {
  const adapter = await loadAdapter('peertube.js', 'PeerTubeAdapter');
  const id = adapter.normalizeSearchResponse({ data: [{
    host: 'tube.example', uuid: 'uuid__with_under_score', name: 'Stable ID', files: []
  }] }).list[0].vod_id;
  assert.match(id, /^[\w-]+$/);
  assert.equal(adapter.buildDetailUrl(id), 'https://tube.example/api/v1/videos/uuid__with_under_score');
});

test('Wikimedia adapter searches video files and normalizes browser-playable media', async () => {
  const adapter = await loadAdapter('wikimedia.js', 'WikimediaAdapter');
  const search = new URL(adapter.buildSearchUrl('open film', 2, 8));
  assert.equal(search.origin, 'https://commons.wikimedia.org');
  assert.equal(search.pathname, '/w/api.php');
  assert.equal(search.searchParams.get('action'), 'query');
  assert.equal(search.searchParams.get('generator'), 'search');
  assert.equal(search.searchParams.get('gsrnamespace'), '6');
  assert.equal(search.searchParams.get('gsrlimit'), '8');
  assert.match(search.searchParams.get('gsrsearch'), /incategory:Videos/);
  assert.match(search.searchParams.get('gsrsearch'), /open film/);

  const title = 'File:Open film.webm';
  assert.match(adapter.buildDetailUrl(title), /titles=File%3AOpen%20film\.webm/);
  const normalized = adapter.normalizeSearchResponse({ query: {
    searchinfo: { totalhits: 2 },
    pages: {
      '1': { pageid: 1, title, imageinfo: [{
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Open_film.webm',
        thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Open_film.webm/640px-Open_film.webm.jpg',
        mime: 'video/webm', size: 1234
      }] },
      '2': { pageid: 2, title: 'File:Audio.mp3', imageinfo: [{
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Audio.mp3', mime: 'audio/mpeg'
      }] }
    }
  }});
  assert.equal(normalized.code, 200);
  assert.equal(normalized.total, 2);
  assert.equal(normalized.list.length, 1);
  assertVideoItem(normalized.list[0], 'wikimedia', 'Wikimedia Commons');
  assert.equal(normalized.list[0].vod_id, 'File:Open film.webm');
  assert.equal(normalized.list[0].vod_pic, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Open_film.webm/640px-Open_film.webm.jpg');
  assert.equal(normalized.list[0].vod_play_url, 'Episode 1$https://upload.wikimedia.org/wikipedia/commons/a/ab/Open_film.webm');
});

test('Wikimedia adapter filters unsafe media and parses authoritative search totals', async () => {
  const adapter = await loadAdapter('wikimedia.js', 'WikimediaAdapter', async () => ({
    ok: true,
    json: async () => ({ query: { searchinfo: { totalhits: 42 }, pages: {} } })
  }));
  assert.equal(adapter.isPlayableUrl('https://upload.wikimedia.org/video.webm'), true);
  assert.equal(adapter.isPlayableUrl('https://upload.wikimedia.org/video.mp4'), true);
  assert.equal(adapter.isPlayableUrl('https://upload.wikimedia.org/video.ogv'), true);
  assert.equal(adapter.isPlayableUrl('https://upload.wikimedia.org/file.jpg'), false);
  assert.equal(adapter.isPlayableUrl('javascript:alert(1)'), false);
  const stats = await adapter.getStats();
  assert.equal(stats.catalogCount, 42);
  assert.equal(stats.playableCount, null);
  assert.equal(stats.countKind, 'estimated');
  assert.equal(stats.status, 'available');
});
