import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const playerHtml = await readFile(new URL('../player.html', import.meta.url), 'utf8');
const streamtapePlayerHtml = await readFile(new URL('../streamtape-player.html', import.meta.url), 'utf8');
const robotsTxt = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const sitemapXml = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');
const stylesCss = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const privacyHtml = await readFile(new URL('../privacy.html', import.meta.url), 'utf8');
const aboutHtml = await readFile(new URL('../about.html', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const uiJs = await readFile(new URL('../js/ui.js', import.meta.url), 'utf8');

test('all public pages expose language metadata and privacy mentions locale preferences', () => {
  for (const html of [indexHtml, playerHtml, aboutHtml, privacyHtml]) {
    assert.match(html, /hreflang="en"/);
    assert.match(html, /data-i18n/);
  }
  assert.match(privacyHtml, /语言|地区|locale|region/i);
});

test('homepage exposes locale, region, source mode, and SEO language links', () => {
  assert.match(indexHtml, /id="localeSelect"/);
  assert.match(indexHtml, /id="regionSelect"/);
  assert.match(indexHtml, /id="sourceModeSelect"/);
  assert.match(indexHtml, /hreflang="zh-CN"/);
  assert.match(indexHtml, /hreflang="zh-TW"/);
  assert.match(indexHtml, /hreflang="en"/);
});

test('homepage marks static copy and aria labels for all locales', () => {
  assert.match(indexHtml, /data-i18n="settings"/);
  assert.match(indexHtml, /data-i18n="chooseSource"/);
  assert.match(indexHtml, /data-i18n="recommendations"/);
  assert.match(indexHtml, /data-i18n-placeholder="searchPlaceholder"/);
  assert.match(indexHtml, /data-i18n-aria-label="searchButton"/);
  assert.match(indexHtml, /data-i18n-aria-label="closeSettings"/);
  assert.match(indexHtml, /data-i18n-aria-label="closeModal"/);
  assert.match(indexHtml, /data-i18n-aria-label="ad"/);
});

test('homepage select and custom URL labels are associated for accessibility', () => {
  assert.match(indexHtml, /<label[^>]+for="apiSource"[^>]*>/);
  assert.match(indexHtml, /<label[^>]+for="customApiUrl"[^>]*>/);
});

test('settings panel aria-hidden follows its expanded state', async () => {
  const vm = await import('node:vm');
  const state = { expanded: false, ariaHidden: 'true' };
  const panel = {
    classList: {
      toggle(name) { assert.equal(name, 'show'); state.expanded = !state.expanded; },
      contains(name) { return name === 'show' && state.expanded; }
    },
    setAttribute(name, value) { if (name === 'aria-hidden') state.ariaHidden = value; }
  };
  const sandbox = { document: { getElementById(id) { assert.equal(id, 'settingsPanel'); return panel; } } };
  vm.runInNewContext(uiJs, sandbox, { filename: 'js/ui.js' });
  sandbox.toggleSettings({ stopPropagation() {} });
  assert.equal(state.ariaHidden, 'false');
  sandbox.toggleSettings();
  assert.equal(state.ariaHidden, 'true');
});

test('homepage source controls are populated from API_SITES at startup', () => {
  assert.match(appJs, /populateApiSourceOptions\s*\(\)/);
  assert.match(appJs, /Object\.entries\(API_SITES\)/);
  assert.match(appJs, /localStorage\.setItem\(['"]currentApiSource['"]/);
});

test('routing context and recommendation cache include persisted controls and source plan', () => {
  assert.match(appJs, /getItem\(['"]libretv:locale['"]\).*getItem\(['"]locale['"]/s);
  assert.match(appJs, /getItem\(['"]libretv:region['"]\).*getItem\(['"]region['"]/s);
  assert.match(appJs, /selectedSource\s*:\s*currentApiSource/);
  assert.match(appJs, /customApiUrl/);
  assert.match(appJs, /data\??\.routing\?\.fellBack/);
});

test('recommendation fallback status tracks response metadata on errors and cache hits', () => {
  assert.match(appJs, /let\s+recommendationFallback\s*=\s*false/);
  assert.match(appJs, /recommendationFallback\s*=\s*data\??\.routing\?\.fellBack\s*===\s*true/);
  assert.match(appJs, /updateRouteStatus\(recommendationFallback\)/);
  assert.doesNotMatch(appJs, /updateRouteStatus\(true\)/);
});

test('metadata updates all localized social fields', () => {
  assert.match(appJs, /meta\[property="og:description"\]/);
  assert.match(appJs, /meta\[property="twitter:title"\]/);
  assert.match(appJs, /meta\[property="twitter:description"\]/);
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

test('Streamtape player exposes the same ad slots and shared entry point as the default player', () => {
  for (const slotId of ['ad-popunder', 'ad-responsive-banner', 'ad-square-banner', 'ad-juicy-player-banner', 'ad-social-bar']) {
    assert.match(streamtapePlayerHtml, new RegExp(`id="${slotId}"`));
  }
  assert.match(streamtapePlayerHtml, /<script type="module" src="js\/ads\.js"><\/script>/);
  assert.doesNotMatch(streamtapePlayerHtml, /<script src="https:\/\/closurenosy\.com/);
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

test('homepage ad slots live in the side rails instead of the recommendation content', () => {
  const recommendationStart = indexHtml.indexOf('<section id="recommendationArea"');
  const recommendationEnd = indexHtml.indexOf('</section>', recommendationStart);
  assert.ok(recommendationStart > 0);
  assert.ok(recommendationEnd > recommendationStart);
  for (const slotId of ['ad-square-banner', 'ad-native-banner', 'ad-responsive-banner', 'ad-juicy-home-banner']) {
    const slotIndex = indexHtml.indexOf(`id="${slotId}"`);
    assert.ok(slotIndex < recommendationStart || slotIndex > recommendationEnd);
  }
});

test('desktop homepage places banner and square ads in side rails around the search area', () => {
  const layoutStart = indexHtml.indexOf('id="homepageSearchLayout"');
  const searchStart = indexHtml.indexOf('id="searchArea"');
  assert.ok(layoutStart >= 0);
  assert.ok(searchStart > layoutStart);
  assert.ok(indexHtml.indexOf('id="homepageLeftAd"') > layoutStart);
  assert.ok(indexHtml.indexOf('id="homepageRightAd"') > layoutStart);
  assert.ok(indexHtml.indexOf('id="ad-square-banner"') > layoutStart);
  assert.ok(indexHtml.indexOf('id="ad-responsive-banner"') > layoutStart);
  assert.match(stylesCss, /\.homepage-search-layout\s*\{/);
  assert.match(stylesCss, /@media\s*\(min-width:\s*1280px\)/);
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

test('playback links preserve each result source code across episodes', () => {
  assert.match(appJs, /function\s+playVideo\s*\(url,\s*vod_name,\s*episodeIndex\s*=\s*0,\s*sourceCode/);
  assert.match(appJs, /player\.html\?url=.*source_code=/);
  assert.match(appJs, /renderEpisodes\(vod_name,\s*sourceCode\)/);
  assert.match(appJs, /playVideo\(prevUrl,\s*currentVideoTitle,\s*prevIndex,\s*currentVideoSource\)/);
  assert.match(appJs, /playVideo\(nextUrl,\s*currentVideoTitle,\s*nextIndex,\s*currentVideoSource\)/);
});

test('homepage loads i18n scripts before all business scripts', () => {
  assert.ok(indexHtml.indexOf('src="js/i18n/messages.js"') < indexHtml.indexOf('src="js/ui.js"'));
  assert.ok(indexHtml.indexOf('src="js/i18n/index.js"') < indexHtml.indexOf('src="js/source-routing.js"'));
  assert.ok(indexHtml.indexOf('src="js/i18n/index.js"') < indexHtml.indexOf('src="js/api.js"'));
});

test('player routes visible failures through localized source-aware messages', () => {
  assert.match(playerHtml, /LibretvI18n\.t/);
  assert.match(playerHtml, /sourceError/);
  assert.doesNotMatch(playerHtml, /document\.title\s*=\s*currentVideoTitle\s*\+\s*' - 剧美天下播放器'/);
  assert.match(playerHtml, /function\s+i18nText|LibretvI18n\.t\(['"]sourceError/);
  assert.match(playerHtml, /LibretvI18n\.t\(['"]playerTitle/);
});
