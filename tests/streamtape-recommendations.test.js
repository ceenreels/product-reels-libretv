import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const repoRoot = new URL('../', import.meta.url);

async function loadRecommendations() {
  const sandbox = {
    URL,
    URLSearchParams,
    console,
    location: { href: 'https://jumeitianxia.com/' },
    fetch: async () => ({
      ok: true,
      json: async () => [
        {
          id: 'demo123',
          title: 'Demo',
          thumbnail: 'https://thumb.tapecontent.net/thumb/demo123/demo.jpg',
          embed_url: 'https://streamtape.com/e/demo123/',
          recommendation_type: 'streamtape'
        }
      ]
    })
  };
  sandbox.globalThis = sandbox;
  const source = await readFile(new URL('js/suggest.js', repoRoot), 'utf8');
  vm.runInNewContext(source, sandbox, { filename: 'js/suggest.js' });
  return sandbox;
}

test('Streamtape recommendations are explicit official embed items, not API sources', async () => {
  const sandbox = await loadRecommendations();
  const items = await sandbox.SuggestRecommendations.load();

  assert.ok(items.length >= 1);
  for (const item of items) {
    assert.match(item.id, /^[A-Za-z0-9]+$/);
    assert.match(item.embed_url, /^https:\/\/streamtape\.com\/e\/[A-Za-z0-9]+\/$/);
    assert.match(item.thumbnail, /^https:\/\/thumb\.tapecontent\.net\/thumb\//);
  assert.equal(item.recommendation_type, 'streamtape');
    assert.equal(item.api_url, undefined);
    assert.equal(item.source_code, undefined);
  }
});

test('Streamtape player URL contains only the registered file id', async () => {
  const sandbox = await loadRecommendations();
  const item = (await sandbox.SuggestRecommendations.load())[0];
  const playerUrl = sandbox.SuggestRecommendations.buildPlayerUrl(item);

  assert.equal(playerUrl, `streamtape-player.html?id=${encodeURIComponent(item.id)}`);
  assert.ok(!playerUrl.includes('/v/'));
  assert.ok(!playerUrl.includes('.mp4'));
});

test('suggest.js inserts cards into the homepage container and opens the official player', async () => {
  const opened = [];
  const elements = new Map();
  const makeElement = tagName => ({
    tagName: tagName.toUpperCase(),
    children: [],
    className: '',
    classList: { add() {}, remove() {} },
    listeners: {},
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this[name] = value; }
  });
  const suggestionContainer = makeElement('div');
  elements.set('suggestionResults', suggestionContainer);
  const sandbox = {
    URL,
    URLSearchParams,
    console,
    location: { href: 'https://jumeitianxia.com/' },
    window: { open: (...args) => opened.push(args) },
    document: {
      readyState: 'complete',
      baseURI: 'https://jumeitianxia.com/',
      getElementById(id) { return elements.get(id) || null; },
      createElement: makeElement
    },
    fetch: async () => ({
      ok: true,
      json: async () => [{
        id: 'demo123',
        title: 'Demo',
        thumbnail: 'https://thumb.tapecontent.net/thumb/demo123/demo.jpg',
        embed_url: 'https://streamtape.com/e/demo123/',
        recommendation_type: 'streamtape'
      }]
    })
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(await readFile(new URL('js/suggest.js', repoRoot), 'utf8'), sandbox, { filename: 'js/suggest.js' });
  await sandbox.SuggestRecommendations.inject();

  assert.equal(suggestionContainer.children.length, 1);
  const button = suggestionContainer.children[0].children[0];
  button.listeners.click();
  assert.deepEqual(opened[0], ['streamtape-player.html?id=demo123', '_blank', 'noopener']);
});

test('homepage loads the standalone suggestion plugin before app logic', async () => {
  const html = await readFile(new URL('index.html', repoRoot), 'utf8');
  assert.ok(html.indexOf('src="js/suggest.js"') < html.indexOf('src="js/app.js"'));
  assert.match(html, /id="suggestionResults"/);
  const manifest = JSON.parse(await readFile(new URL('suggest.json', repoRoot), 'utf8'));
  assert.ok(Array.isArray(manifest));
  assert.ok(manifest.length >= 1);
});

test('suggest.js owns homepage insertion and official Streamtape playback', async () => {
  const suggestSource = await readFile(new URL('js/suggest.js', repoRoot), 'utf8');
  assert.match(suggestSource, /suggestionResults/);
  assert.match(suggestSource, /streamtape-player\.html/);
  assert.match(suggestSource, /open\(playerUrl/);
  const appSource = await readFile(new URL('js/app.js', repoRoot), 'utf8');
  assert.ok(!appSource.includes('SuggestRecommendations'));
});

test('standalone Streamtape player embeds the provider iframe without DPlayer', async () => {
  const html = await readFile(new URL('streamtape-player.html', repoRoot), 'utf8');
  assert.match(html, /<iframe[^>]+id="streamtapeFrame"/i);
  assert.match(html, /item\.embed_url/);
  assert.match(html, /suggest\.js/);
  assert.ok(!html.includes('DPlayer'));
  assert.ok(!html.includes('hls.js'));
});
