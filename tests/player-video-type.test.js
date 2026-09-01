import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('player detects native MP4 and HLS playback types', async () => {
  const source = await readFile(new URL('../js/player-utils.js', import.meta.url), 'utf8');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'js/player-utils.js' });
  assert.equal(sandbox.LibretvPlayerUtils.detectVideoType('https://cdn.example/video.mp4?token=1'), 'normal');
  assert.equal(sandbox.LibretvPlayerUtils.detectVideoType('https://cdn.example/master.m3u8#live'), 'hls');
  assert.equal(sandbox.LibretvPlayerUtils.detectVideoType('https://cdn.example/watch/123'), 'auto');
});

test('player page loads video type detection before initializing DPlayer', async () => {
  const html = await readFile(new URL('../player.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="js/player-utils.js"') < html.indexOf('function initPlayer'));
  assert.match(html, /detectVideoType\(playableVideoUrl\)/);
});
