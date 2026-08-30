import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../player.html', import.meta.url), 'utf8');

test('homepage publishes the JuicyAds verification meta tag', () => {
  assert.match(indexHtml, /<meta name="juicyads-site-verification" content="ca6903256a7a8f7d9985abf9ceab0a93">/);
});

test('pages load the platform-neutral ad entry point as a module', () => {
  for (const html of [indexHtml, playerHtml]) {
    assert.match(html, /<script type="module" src="js\/ads\.js"><\/script>/);
    assert.doesNotMatch(html, /<script src="https:\/\/closurenosy\.com/);
  }
});
