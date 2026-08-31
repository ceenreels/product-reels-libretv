import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../player.html', import.meta.url), 'utf8');
const robotsTxt = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const sitemapXml = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');

test('homepage publishes the JuicyAds verification meta tag', () => {
  assert.match(indexHtml, /<meta name="juicyads-site-verification" content="ca6903256a7a8f7d9985abf9ceab0a93">/);
});

test('pages load the platform-neutral ad entry point as a module', () => {
  for (const html of [indexHtml, playerHtml]) {
    assert.match(html, /<script type="module" src="js\/ads\.js"><\/script>/);
    assert.doesNotMatch(html, /<script src="https:\/\/closurenosy\.com/);
  }
});

test('robots allows crawlers to load assets needed to render the app', () => {
  assert.doesNotMatch(robotsTxt, /Disallow:\s*\/js\//);
  assert.doesNotMatch(robotsTxt, /Disallow:\s*\/css\//);
});

test('sitemap includes current deployment date and key public pages', () => {
  assert.match(sitemapXml, /<lastmod>2026-08-31<\/lastmod>/);
  assert.match(sitemapXml, /<loc>https:\/\/jumeitianxia\.com\/player\.html<\/loc>/);
  assert.match(sitemapXml, /<loc>https:\/\/jumeitianxia\.com\/watch\.html<\/loc>/);
});

test('homepage JuicyAds banner appears before recommendation cards for better viewability', () => {
  assert.ok(indexHtml.indexOf('id="ad-juicy-home-banner"') < indexHtml.indexOf('id="recommendationResults"'));
});
