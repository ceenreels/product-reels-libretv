import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../player.html', import.meta.url), 'utf8');
const robotsTxt = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const sitemapXml = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
const stylesCss = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const privacyHtml = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');

test('homepage exposes locale, region, source mode, and SEO language links', () => {
  assert.match(indexHtml, /id="localeSelect"/);
  assert.match(indexHtml, /id="regionSelect"/);
  assert.match(indexHtml, /id="sourceModeSelect"/);
  assert.match(indexHtml, /hreflang="zh-CN"/);
  assert.match(indexHtml, /hreflang="zh-TW"/);
  assert.match(indexHtml, /hreflang="en"/);
});

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

test('JuicyAds responsive slots reserve the rendered ad height instead of a shared 250px height', () => {
  assert.match(stylesCss, /\.ad-juicy-responsive-banner\s*\{[^}]*min-height:\s*90px/);
  assert.match(stylesCss, /#ad-juicy-player-banner\s*\{[^}]*min-height:\s*250px/);
  assert.match(stylesCss, /@media\s*\(max-width:\s*519px\)[\s\S]*#ad-juicy-home-banner[\s\S]*min-height:\s*50px/);
  assert.match(stylesCss, /@media\s*\(max-width:\s*519px\)[\s\S]*#ad-juicy-player-banner[\s\S]*min-height:\s*50px/);
});

test('privacy page discloses third-party advertising and local storage accurately', () => {
  assert.doesNotMatch(privacyHtml, /不收集任何个人数据|不会限制访问|不会存储或追踪用户信息/);
  assert.match(privacyHtml, /第三方广告|Cookie|localStorage|本地存储/i);
});

test('homepage loads the recommendation cache before app startup and uses a bounded stale fallback', () => {
  assert.ok(indexHtml.indexOf('src="js/recommendation-cache.js"') < indexHtml.indexOf('src="js/app.js"'));
  assert.match(appJs, /createRecommendationCache/);
  assert.match(appJs, /read\(cacheKey,\s*RECOMMENDATION_CACHE_TTL\)/);
});
