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
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  for (const path of [
    'js/config.js',
    'js/i18n/messages.js',
    'js/i18n/index.js',
    'js/source-routing.js',
    'js/adapters/blender.js',
    'js/adapters/nasa.js',
    'js/api.js'
  ]) {
    vm.runInNewContext(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), sandbox, { filename: path });
  }
  vm.runInNewContext('globalThis.API_SITES_FOR_TEST = API_SITES', sandbox);
  sandbox.window = sandbox;
  return sandbox;
};

const blenderSearchPayload = {
  total: 1,
  data: [{
    uuid: '8f65c679-68f2-4ba8-9368-ca73699955a7',
    name: 'Blender English Short Film',
    language: { id: 'en', label: 'English' },
    description: 'An English open movie.',
    duration: 120,
    thumbnails: [{ fileUrl: 'https://video.blender.org/thumb.jpg' }],
    embedPath: '/videos/embed/test'
  }]
};

const blenderDetailPayload = {
  uuid: '8f65c679-68f2-4ba8-9368-ca73699955a7',
  name: 'Blender English Short Film',
  description: 'An English open movie.',
  language: { id: 'en', label: 'English' },
  files: [{ resolution: { id: 720 }, fileUrl: 'https://video.blender.org/video-720.mp4', hasAudio: true, hasVideo: true }]
};

const nasaSearchPayload = {
  collection: {
    metadata: { total_hits: 1 },
    items: [{
      href: 'https://images-assets.nasa.gov/video/English%20NASA%20Briefing/collection.json',
      data: [{
        nasa_id: 'English NASA Briefing',
        title: 'English NASA Briefing',
        description: 'An English NASA briefing.',
        media_type: 'video'
      }],
      links: [{ href: 'https://images-assets.nasa.gov/video/English%20NASA%20Briefing/English%20NASA%20Briefing~large.jpg', render: 'image' }]
    }]
  }
};

test('English routing prioritizes verified Blender and NASA sources', async () => {
  const sandbox = await loadApi(async () => ({ ok: true, text: async () => JSON.stringify(blenderSearchPayload) }));
  assert.equal(sandbox.API_SITES_FOR_TEST.blender.languages[0], 'en');
  assert.equal(sandbox.API_SITES_FOR_TEST.nasa.languages[0], 'en');
  const plan = sandbox.LibretvRouting.buildSourcePlan({ locale: 'en', region: 'GLOBAL_EN', sourceMode: 'region' });
  assert.deepEqual([...plan.primary], ['blender']);
  assert.ok(plan.fallback.includes('nasa'));
});

test('Blender search is normalized into the site video shape', async () => {
  const sandbox = await loadApi(async input => {
    const target = String(input);
    assert.doesNotMatch(target, /^https:\/\/r\.jina\.ai\//);
    assert.match(target, /video\.blender\.org\/api\/v1\/search\/videos/);
    return { ok: true, text: async () => JSON.stringify(blenderSearchPayload) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=short&source=blender&sourceMode=manual&locale=en&region=GLOBAL_EN')));
  assert.equal(payload.code, 200);
  assert.equal(payload.list[0].source_code, 'blender');
  assert.equal(payload.list[0].vod_name, 'Blender English Short Film');
  assert.equal(payload.list[0].vod_pic, 'https://video.blender.org/thumb.jpg');
});

test('NASA search is normalized and preserves a safe detail identifier', async () => {
  const sandbox = await loadApi(async input => {
    const target = String(input);
    assert.doesNotMatch(target, /^https:\/\/r\.jina\.ai\//);
    assert.match(target, /images-api\.nasa\.gov\/search/);
    return { ok: true, text: async () => JSON.stringify(nasaSearchPayload) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/search?wd=NASA&source=nasa&sourceMode=manual&locale=en&region=GLOBAL_EN')));
  assert.equal(payload.code, 200);
  assert.equal(payload.list[0].source_code, 'nasa');
  assert.equal(payload.list[0].vod_name, 'English NASA Briefing');
  assert.match(payload.list[0].vod_id, /^nasa_[A-Za-z0-9_-]+$/);
});

test('Blender detail returns a playable MP4 episode', async () => {
  const sandbox = await loadApi(async input => {
    const target = String(input);
    assert.match(target, /video\.blender\.org\/api\/v1\/videos\/8f65c679-68f2-4ba8-9368-ca73699955a7$/);
    return { ok: true, text: async () => JSON.stringify(blenderDetailPayload) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/detail?id=8f65c679-68f2-4ba8-9368-ca73699955a7&source=blender&locale=en&region=GLOBAL_EN')));
  assert.equal(payload.code, 200);
  assert.deepEqual(payload.episodes, ['https://video.blender.org/video-720.mp4']);
});

test('NASA detail upgrades asset URLs to HTTPS MP4 playback', async () => {
  const sandbox = await loadApi(async input => {
    const target = String(input);
    assert.match(target, /images-api\.nasa\.gov\/asset\/English%20NASA%20Briefing/);
    return { ok: true, text: async () => JSON.stringify({ collection: { items: [
      { href: 'http://images-assets.nasa.gov/video/English NASA Briefing/English NASA Briefing~small.mp4' },
      { href: 'http://images-assets.nasa.gov/video/English NASA Briefing/English NASA Briefing.srt' }
    ] } }) };
  });
  const encodedId = sandbox.NasaAdapter.toStableId('English NASA Briefing');
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL(`https://jumeitianxia.com/api/detail?id=${encodedId}&source=nasa&locale=en&region=GLOBAL_EN&title=English%20NASA%20Briefing&cover=https%3A%2F%2Fimages-assets.nasa.gov%2Fvideo%2FEnglish%2520NASA%2520Briefing%2FEnglish%2520NASA%2520Briefing~thumb.jpg&desc=Official%20NASA%20briefing&year=2024`)));
  assert.equal(payload.code, 200);
  assert.deepEqual(payload.episodes, ['https://images-assets.nasa.gov/video/English NASA Briefing/English NASA Briefing~small.mp4']);
  assert.equal(payload.videoInfo.title, 'English NASA Briefing');
  assert.equal(payload.videoInfo.cover, 'https://images-assets.nasa.gov/video/English%20NASA%20Briefing/English%20NASA%20Briefing~thumb.jpg');
  assert.equal(payload.videoInfo.desc, 'Official NASA briefing');
  assert.equal(payload.videoInfo.year, '2024');
});

test('English recommendations use Blender first and expose source metadata', async () => {
  const sandbox = await loadApi(async input => {
    const target = String(input);
    assert.match(target, /video\.blender\.org\/api\/v1\/videos/);
    return { ok: true, text: async () => JSON.stringify({ total: 1, data: blenderSearchPayload.data }) };
  });
  const payload = JSON.parse(await sandbox.handleApiRequest(new URL('https://jumeitianxia.com/api/recommendations?page=1&locale=en&region=GLOBAL_EN&sourceMode=region')));
  assert.equal(payload.code, 200);
  assert.equal(payload.routing.usedSources[0], 'blender');
  assert.equal(payload.list[0].source_code, 'blender');
});

test('homepage loads international adapters before API interception', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const apiIndex = html.indexOf('src="js/api.js"');
  for (const adapter of ['blender', 'archive', 'peertube', 'wikimedia', 'nasa']) {
    const index = html.indexOf(`src="js/adapters/${adapter}.js"`);
    assert.ok(index >= 0, `missing ${adapter} adapter script`);
    assert.ok(index < apiIndex, `${adapter} adapter must load before api.js`);
  }
});

test('API interceptor leaves cross-origin provider API paths untouched', async () => {
  let calls = 0;
  const sandbox = await loadApi(async input => {
    calls += 1;
    assert.match(String(input?.url || input), /^https:\/\/video\.blender\.org\/api\/v1\//);
    return { ok: true, text: async () => JSON.stringify({ total: 0, data: [] }) };
  });
  const response = await sandbox.window.fetch('https://video.blender.org/api/v1/videos?count=1');
  assert.equal(calls, 1);
  assert.equal(response.ok, true);
});

test('API interceptor handles Request-like inputs without touching cross-origin provider APIs', async () => {
  let calls = 0;
  const sandbox = await loadApi(async input => {
    calls += 1;
    assert.match(String(input?.url || input), /^https:\/\/video\.blender\.org\/api\/v1\//);
    return { ok: true, text: async () => JSON.stringify({ total: 0, data: [] }) };
  });
  const response = await sandbox.window.fetch({ url: 'https://video.blender.org/api/v1/videos?count=1' });
  assert.equal(calls, 1);
  assert.equal(response.ok, true);
});
