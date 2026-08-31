# 剧美天下国际化与地区视频源路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended). Steps use checkbox syntax for tracking.

**Goal:** 为剧美天下增加简体中文、繁体中文和 English 界面，并依据用户地区、内容语言和源健康状态选择默认视频源，同时保持现有中文用户和手动源选择兼容。

**Architecture:** 保持当前静态页面和经典脚本加载方式，在 js/i18n/ 提供消息字典与语言解析，在 js/source-routing.js 提供地区、源注册表查询和短期内存健康状态。首页、推荐、搜索和详情统一通过路由上下文传递 locale、region 与 sourceMode；页面只保留语义化数据属性和用户设置，不把地区判断写死在搜索函数中。

**Tech Stack:** 原生 JavaScript（浏览器全局脚本、无新增运行时依赖）、静态 HTML、CSS、Node 内置 node:test、GitHub Pages。

**Spec:** docs/superpowers/specs/2026-08-31-internationalization-region-routing-design.md

## Global Constraints

- 第一阶段只支持 zh-CN、zh-TW 和 en，未知 locale 回退到 en。
- 语言优先级为用户手动选择、localStorage、浏览器语言、English。
- 地区优先级为用户手动选择、localStorage、浏览器语言区域、语言区域组。
- 不自动翻译 vod_name、vod_content、vod_actor 等视频源数据。
- 不新增 IP 定位、指纹识别、密码读取、Cookie 读取或跨站追踪。
- 不凭空添加未经验证的国际视频源；现有不稳定源保留手动入口，但不进入地区默认聚合列表。
- 聚合搜索只能请求当前地区和语言匹配、已启用且具备搜索能力的源；请求失败必须隔离并按顺序回退。
- 现有 localStorage.currentApiSource、搜索历史、播放设置和广告设置必须继续有效。
- 每个任务都以失败测试开始，完成后运行相关测试并提交独立 commit。

## 文件结构与职责

- Create: js/i18n/messages.js — 三种 locale 的完整 UI 消息字典和显示名称。
- Create: js/i18n/index.js — locale 解析、浏览器语言解析、翻译、DOM 应用和 URL 参数读取；挂载 globalThis.LibretvI18n。
- Create: js/source-routing.js — 源注册表元数据、地区规则、路由选择、短期健康状态；挂载 globalThis.LibretvRouting。
- Modify: js/config.js — 为现有 API_SITES 增加语言、地区、优先级、能力和默认路由元数据，保留旧对象名和源 ID。
- Modify: js/api.js — 读取路由上下文、按地区过滤聚合搜索和推荐源、记录单次请求成功/失败、按 source code 保持详情请求一致。
- Modify: js/app.js — 初始化 locale/region/source mode，生成设置选项，调用翻译和路由函数，向搜索/推荐请求传递上下文。
- Modify: index.html — 增加语言/地区/源模式控件、data-i18n 标记、动态入口元数据与 hreflang。
- Modify: player.html — 增加语言标记、翻译播放器静态文案，并从 URL/localStorage 继承语言和地区上下文。
- Modify: about.html, privacy.html — 增加可翻译文案标记、语言元数据、hreflang 和新增本地偏好说明。
- Modify: css/styles.css — 为语言、地区和源状态控件提供响应式布局，避免小屏横向溢出。
- Modify: sitemap.xml — 保持现有页面 URL，并加入三种入口参数 URL 的可抓取声明；不伪造动态影片详情 URL。
- Create: tests/i18n-routing.test.js — 语言、地区、源路由、健康回退和旧设置迁移测试。
- Modify: tests/ads-html.test.js — 检查 i18n/routing 脚本顺序、语言元数据、hreflang 和隐私披露。
- Modify: tests/recommendation-cache.test.js only if cache keys need a locale/region namespace; otherwise leave unchanged and add a routing-specific cache test in tests/i18n-routing.test.js.

---

### Task 1: 建立可测试的 locale 与地区解析模块

**Files:**
- Create: tests/i18n-routing.test.js
- Create: js/i18n/messages.js
- Create: js/i18n/index.js
- Create: js/source-routing.js

**Interfaces:**
- LibretvI18n.resolveLocale({ storedLocale, browserLanguages }) -> zh-CN | zh-TW | en
- LibretvI18n.resolveRegion({ storedRegion, locale, browserLanguages }) -> string
- LibretvI18n.getUrlLocale(search) -> string | null
- LibretvI18n.t(key, locale, fallback) -> string
- LibretvI18n.apply(documentRef, locale) -> void
- LibretvRouting.resolveSourceMode({ storedMode, storedSource }) -> region | aggregated | manual
- LibretvRouting.getEligibleSources({ locale, region, mode, selectedSource }) -> string[]
- LibretvRouting.getFallbackSources({ locale, region }) -> string[]

- [ ] Step 1: Write the failing test

    import test from 'node:test';
    import assert from 'node:assert/strict';

    const loadScripts = async paths => {
      const { readFile } = await import('node:fs/promises');
      const vm = await import('node:vm');
      const sandbox = { console, URLSearchParams, globalThis: {} };
      sandbox.globalThis = sandbox;
      for (const path of paths) {
        const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
        vm.runInNewContext(source, sandbox, { filename: path });
      }
      return sandbox;
    };

    test('locale resolution prefers stored selection and falls back by language', async () => {
      const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
      assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: 'zh-TW', browserLanguages: ['en-US'] }), 'zh-TW');
      assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: '', browserLanguages: ['zh-HK'] }), 'zh-TW');
      assert.equal(sandbox.LibretvI18n.resolveLocale({ storedLocale: '', browserLanguages: ['fr-FR'] }), 'en');
    });

    test('region resolution maps locale regions and language groups', async () => {
      const sandbox = await loadScripts(['js/i18n/messages.js', 'js/i18n/index.js']);
      assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: '', locale: 'zh-TW', browserLanguages: ['zh-TW'] }), 'TW');
      assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: '', locale: 'en', browserLanguages: ['en-US'] }), 'GLOBAL_EN');
      assert.equal(sandbox.LibretvI18n.resolveRegion({ storedRegion: 'HK', locale: 'en', browserLanguages: ['en-US'] }), 'HK');
    });

- [ ] Step 2: Run the focused tests and verify they fail

Run: node --test tests/i18n-routing.test.js

Expected: FAIL because js/i18n/index.js does not yet expose LibretvI18n.

- [ ] Step 3: Implement the locale dictionary and parser

js/i18n/messages.js must define SUPPORTED_LOCALES, LOCALE_LABELS, and messages for every existing visible key, including search controls, settings, recommendation states, source status, player controls, errors, footer, about and privacy sections. js/i18n/index.js must normalize zh-CN, zh-SG, zh-HK, zh-TW, en-US, and en-GB; parse navigator.languages only when no explicit array is passed; read ?lang= without changing history; and expose t() with full-locale -> language-prefix -> English -> key fallback.

resolveRegion() must accept only configured region codes (CN, TW, HK, SG, GLOBAL_EN, GLOBAL_ZH), prefer an explicit stored code, derive CN/TW/HK/SG from browser locale, and otherwise return GLOBAL_EN for English or GLOBAL_ZH for Chinese.

- [ ] Step 4: Implement the source mode and route function shells

js/source-routing.js must read the global API_SITES object without duplicating API URLs. It must expose deterministic functions that filter enabled, defaultEligible, capabilities.search, locale language compatibility, and region compatibility. mode manual returns only selectedSource when valid; mode aggregated returns all eligible source IDs ordered by descending priority; mode region returns the same eligible IDs but keeps only the first preferred source for default single-source use. Unknown IDs are ignored.

getFallbackSources() must return same-language sources first, then global regional sources, then enabled global sources; it must never include defaultEligible false sources unless a later manual choice explicitly requests them.

- [ ] Step 5: Run the focused tests and commit the routing foundation

Run: node --test tests/i18n-routing.test.js

Expected: PASS for locale and region tests; route tests will be added in Task 2.

    git add js/i18n js/source-routing.js tests/i18n-routing.test.js
    git commit -m "feat: add locale and region routing foundation"

### Task 2: Enrich source metadata and test region eligibility

**Files:**
- Modify: js/config.js
- Modify: js/source-routing.js
- Modify: tests/i18n-routing.test.js

**Interfaces:**
- API_SITES[source].languages: string[]
- API_SITES[source].regions: string[]
- API_SITES[source].priority: number
- API_SITES[source].capabilities: { search: boolean, detail: boolean, recommendations: boolean }
- API_SITES[source].defaultEligible: boolean
- REGION_SOURCE_RULES: Record<string, string[]>

- [ ] Step 1: Add failing eligibility and migration tests

    test('regional routing keeps only matching default-eligible sources', async () => {
      const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
      const result = sandbox.LibretvRouting.getEligibleSources({ locale: 'zh-CN', region: 'CN', mode: 'aggregated' });
      assert.ok(result.includes('ffzy'));
      assert.ok(result.includes('jisu'));
      assert.ok(!result.includes('cjhw'));
      assert.ok(!result.includes('dbzy'));
    });

    test('legacy concrete source selection becomes manual mode', async () => {
      const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
      assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: '', storedSource: 'ffzy' }), 'manual');
      assert.equal(sandbox.LibretvRouting.resolveSourceMode({ storedMode: '', storedSource: '' }), 'region');
    });

    test('English users fall back without pretending Chinese sources are English', async () => {
      const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
      const primary = sandbox.LibretvRouting.getEligibleSources({ locale: 'en', region: 'GLOBAL_EN', mode: 'aggregated' });
      const fallback = sandbox.LibretvRouting.getFallbackSources({ locale: 'en', region: 'GLOBAL_EN' });
      assert.deepEqual(primary, []);
      assert.ok(fallback.length > 0);
    });

- [ ] Step 2: Run the tests and verify the metadata assertions fail

Run: node --test tests/i18n-routing.test.js

Expected: FAIL because existing sources lack language, region, eligibility, and source mode metadata.

- [ ] Step 3: Add metadata without deleting existing source IDs

Extend each current source in js/config.js with languages, regions, priority, capabilities, enabled, and defaultEligible. Mark the currently verified stable sources (ffzy, tyyszy, ckzy, zy360, jisu) as default eligible. Keep heimuer, wolong, cjhw, and dbzy available for manual selection but set defaultEligible false until their health checks are successful. Add REGION_SOURCE_RULES for CN, TW, HK, SG, GLOBAL_ZH, and GLOBAL_EN; do not add an invented English API.

Use languages: ['zh-CN'] for the current Chinese sources and make the eligibility matcher treat all zh-* UI locales as the same Chinese language family while retaining zh-CN as the source content label. Show fallback content as source-provided Chinese rather than labeling it as English. When a verified English source is supplied later, adding one metadata object and one rule entry must be sufficient.

- [ ] Step 4: Add short-lived in-memory health functions

Implement recordSourceSuccess(source, now), recordSourceFailure(source, now), and isSourceHealthy(source, now) with a five-minute TTL. A failure only suppresses that source for the current route resolution; no health data is sent to a server or persisted with user identity. A success clears the failure state.

- [ ] Step 5: Run tests and commit source metadata

Run: node --test tests/i18n-routing.test.js

Expected: PASS.

    git add js/config.js js/source-routing.js tests/i18n-routing.test.js
    git commit -m "feat: add regional video source metadata"

### Task 3: Route API search, aggregation, recommendations, and fallback

**Files:**
- Modify: js/api.js
- Modify: js/app.js
- Modify: tests/i18n-routing.test.js

**Interfaces:**
- URL context parameters: locale, region, sourceMode, source
- LibretvRouting.getRequestContext(url) -> { locale, region, sourceMode, selectedSource }
- LibretvRouting.buildSourcePlan(context) -> { primary: string[], fallback: string[] }

- [ ] Step 1: Add failing tests for API route context and source isolation

    test('request context is explicit and does not depend on a global user country', async () => {
      const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
      const url = new URL('https://jumeitianxia.com/api/search?locale=zh-TW&region=TW&sourceMode=aggregated');
      assert.deepEqual(sandbox.LibretvRouting.getRequestContext(url), {
        locale: 'zh-TW', region: 'TW', sourceMode: 'aggregated', selectedSource: ''
      });
    });

    test('source plan has primary and fallback layers', async () => {
      const sandbox = await loadScripts(['js/config.js', 'js/source-routing.js']);
      const plan = sandbox.LibretvRouting.buildSourcePlan({ locale: 'en', region: 'GLOBAL_EN', sourceMode: 'aggregated' });
      assert.deepEqual(plan.primary, []);
      assert.ok(plan.fallback.length > 0);
    });

- [ ] Step 2: Run the tests and verify route-context failures

Run: node --test tests/i18n-routing.test.js

Expected: FAIL because request context and fallback source plans are not implemented.

- [ ] Step 3: Implement explicit request context parsing

Update js/source-routing.js to validate URL parameters, resolve missing values using the current browser context only when called from the page, and return normalized values. Update js/app.js so every /api/search and /api/recommendations URL includes locale, region, and sourceMode; a manually selected source additionally includes source.

- [ ] Step 4: Refactor handleAggregatedSearch() to use the source plan

Replace the Object.keys(API_SITES) scan with buildSourcePlan(). Request only primary sources in parallel. If all primary sources return no usable results or fail, request the ordered fallback layer once. Every request must call recordSourceSuccess only after a valid JSON list, call recordSourceFailure for non-2xx/invalid JSON/timeout, and keep source_code and source_name on every item. Continue deduplicating by source_code + vod_id.

- [ ] Step 5: Apply the same plan to recommendations and details

Recommendations must select the first healthy primary source, then fallback source, instead of returning to fixed DEFAULT_API_SOURCE for regional or aggregated mode. For custom mode, use the existing custom API list/recommendations path and never mix it into regional routing. Details must continue to use the result's source_code; it must never switch source because the user's current region changed after a card was rendered. Custom sources remain manual-only and are not injected into regional aggregation.

- [ ] Step 6: Add localized route-state messages and run API tests

Expose a response field routing with { locale, region, requestedSources, usedSources, fellBack }. Use it only for local UI status messages; never expose private health timestamps. Add tests for primary success, primary failure with fallback, and one-source failure not blocking another.

Run: node --test tests/i18n-routing.test.js

Expected: PASS.

    git add js/api.js js/app.js js/source-routing.js tests/i18n-routing.test.js
    git commit -m "feat: route search and recommendations by region"

### Task 4: Add language, region, and source-mode controls to the homepage

**Files:**
- Modify: index.html
- Modify: js/app.js
- Modify: css/styles.css
- Modify: tests/ads-html.test.js

**Interfaces:**
- Storage keys: libretv:locale, libretv:region, libretv:sourceMode
- DOM IDs: localeSelect, regionSelect, sourceModeSelect, apiSource, routeStatus
- LibretvI18n.apply(document, locale) updates all data-i18n, data-i18n-placeholder, and data-i18n-aria-label nodes.

- [ ] Step 1: Add failing static HTML assertions

    test('homepage exposes locale, region, source mode, and SEO language links', () => {
      assert.match(indexHtml, /id="localeSelect"/);
      assert.match(indexHtml, /id="regionSelect"/);
      assert.match(indexHtml, /id="sourceModeSelect"/);
      assert.match(indexHtml, /hreflang="zh-CN"/);
      assert.match(indexHtml, /hreflang="zh-TW"/);
      assert.match(indexHtml, /hreflang="en"/);
    });

- [ ] Step 2: Run the targeted test and verify it fails

Run: node --test tests/ads-html.test.js

Expected: FAIL because the controls and hreflang links do not exist.

- [ ] Step 3: Add controls and translation markers

Add three settings controls before the existing source select. localeSelect offers zh-CN, zh-TW, and en; regionSelect offers CN, TW, HK, SG, GLOBAL_ZH, and GLOBAL_EN; sourceModeSelect offers region recommendation, aggregated search, and manual source. Keep the existing apiSource options and add a localized “use regional recommendation” option without changing old source values.

Mark all static homepage text with stable message keys. Keep aria-label values translated by LibretvI18n.apply(). Add a routeStatus element that reports the selected locale, region, source mode, and whether the last request used fallback sources.

- [ ] Step 4: Initialize and persist controls without clearing unrelated preferences

In DOMContentLoaded, read the new storage keys, resolve browser defaults, apply the locale before loading recommendations, populate source options from API_SITES, and load recommendations through the route context. Changing locale or region updates html lang, title/description/Open Graph text, route status, recommendation cache key, and visible messages; it clears only search results and reloads recommendations. Do not clear search history, playback settings, ad settings, or custom API URLs.

When an old currentApiSource is a valid concrete source and no new mode is saved, set sourceMode to manual. When no old source exists, use region mode. The aggregated mode must never silently include manually disabled unstable sources.

- [ ] Step 5: Add responsive styling and run tests

Use the existing dark theme, stack controls below 520px, and ensure select controls have max-width: 100%. Run:

    node --test tests/ads-html.test.js tests/i18n-routing.test.js

Expected: PASS.

    git add index.html js/app.js css/styles.css tests/ads-html.test.js
    git commit -m "feat: add homepage language and region controls"

### Task 5: Localize player, about, privacy, and SEO metadata

**Files:**
- Modify: player.html
- Modify: about.html
- Modify: privacy.html
- Modify: index.html
- Modify: sitemap.xml
- Modify: tests/ads-html.test.js

**Interfaces:**
- Every page includes js/i18n/messages.js and js/i18n/index.js before page scripts.
- player.html reads lang, region, and sourceMode from URL/localStorage but keeps the episode source_code passed by the result.

- [ ] Step 1: Add failing metadata and privacy tests

    test('all public pages expose language metadata and privacy mentions locale preferences', () => {
      for (const html of [indexHtml, playerHtml, aboutHtml, privacyHtml]) {
        assert.match(html, /hreflang="en"/);
        assert.match(html, /data-i18n/);
      }
      assert.match(privacyHtml, /语言|地区|locale|region/i);
    });

- [ ] Step 2: Run the test and verify it fails

Run: node --test tests/ads-html.test.js

Expected: FAIL because no page has the new language links.

- [ ] Step 3: Mark player controls and static pages for translation

Add translation markers to player navigation, loading/error states, episode controls, autoplay, return-home link, about copy, privacy headings, local storage text, third-party advertising text, and footer links. Add a small language selector on player/about/privacy that writes libretv:locale and returns to the same page with ?lang= when changed.

Use the existing source name and video title as data, not dictionary entries. Player error messages must say whether the source itself failed and preserve the existing “try another source” action.

- [ ] Step 4: Add SEO links and localized metadata

Add hreflang links for zh-CN, zh-TW, en, and x-default to all public pages. Keep canonical URLs stable and use the locale query parameter only as an entry hint. Add a small inline metadata bootstrap before page content that reads ?lang= and updates title, description, og:title, and og:description without navigating or fetching an external service. Add ?lang=zh-CN, ?lang=zh-TW, and ?lang=en entries to sitemap.xml with the same last modification date as the current deployment.

- [ ] Step 5: Update privacy disclosure and run static tests

State that language, region, source mode, and source preference may be stored in browser localStorage, remain on the device, and are not uploaded by the site. Do not claim that the site knows a user's actual IP country. Run:

    node --test tests/ads-html.test.js tests/i18n-routing.test.js

Expected: PASS.

    git add player.html about.html privacy.html index.html sitemap.xml tests/ads-html.test.js
    git commit -m "feat: localize public pages and SEO metadata"

### Task 6: Integrate recommendation caching and preserve source identity

**Files:**
- Modify: js/recommendation-cache.js
- Modify: js/app.js
- Modify: tests/recommendation-cache.test.js
- Modify: tests/i18n-routing.test.js

**Interfaces:**
- Cache key format: libretv:recommendations:<locale>:<region>:<source-plan>:<page>
- createRecommendationCache().save(key, items) and .read(key, maxAgeMs) remain backward compatible with existing source-only keys.

- [ ] Step 1: Add failing cache namespace tests

    test('recommendation cache separates locale and region plans', () => {
      const storage = new Map();
      const adapter = { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) || null };
      const cache = createRecommendationCache(adapter, () => 1000);
      cache.save('zh-CN:CN:ffzy:page:1', [{ vod_id: 1 }]);
      assert.deepEqual(cache.read('zh-CN:CN:ffzy:page:1', 100), [{ vod_id: 1 }]);
      assert.equal(cache.read('en:GLOBAL_EN:page:1', 100), null);
    });

- [ ] Step 2: Run the test and verify it fails

Run: node --test tests/recommendation-cache.test.js tests/i18n-routing.test.js

Expected: FAIL because the current cache key accepts only a source string and the new test uses a route key.

- [ ] Step 3: Make the cache key opaque and route-aware

Keep the cache module's public save(source, items) and read(source, maxAgeMs) signatures, but allow the caller to pass the complete route key. Update app.js to use locale, region, ordered source IDs, and page in the key. Preserve read compatibility for existing libretv:recommendations:<source> entries so current users do not lose cached recommendations during deployment.

- [ ] Step 4: Preserve source code on every recommendation card

Ensure recommendation cards call showDetails(id, title, item.source_code) and that fallback cached items retain source_code. If an old cached item lacks a source code, use the current selected source only for that card and show the source status as legacy cache.

- [ ] Step 5: Run tests and commit cache integration

Run: node --test tests/recommendation-cache.test.js tests/i18n-routing.test.js

Expected: PASS.

    git add js/recommendation-cache.js js/app.js tests/recommendation-cache.test.js tests/i18n-routing.test.js
    git commit -m "feat: namespace recommendations by locale and region"

### Task 7: Full regression, local browser smoke test, and deployment verification

**Files:**
- Modify: tests/ads-html.test.js only for final assertions discovered during smoke testing.
- Modify: readme.md with the supported locales, region routing behavior, and instructions for adding a verified source.

**Interfaces:**
- No new public runtime interface; this task verifies the interfaces from Tasks 1–6.

- [ ] Step 1: Run the complete automated suite

Run: npm test

Expected: all existing ad, recommendation-cache, and new i18n/routing tests PASS.

- [ ] Step 2: Start a local static server and test three entry points

Run: python3 -m http.server 4173.

Check manually in a browser:

1. http://127.0.0.1:4173/?lang=zh-CN renders simplified Chinese, uses the CN route, and loads recommendations.
2. http://127.0.0.1:4173/?lang=zh-TW renders traditional Chinese and uses the TW/HK route.
3. http://127.0.0.1:4173/?lang=en renders English UI, reports that no English source is registered, then uses the documented global Chinese fallback without labeling the video as English.
4. Switching language/region persists after reload and does not remove search history or playback settings.
5. Aggregated search makes requests only to the displayed eligible source list; one failed source does not blank successful results.
6. Recommendation cards preserve source code and open the matching detail endpoint.
7. Player page retains the selected locale while displaying source-provided video text unchanged.
8. Existing JuicyAds and Adsterra slots still mount once.

- [ ] Step 3: Inspect mobile layout and accessibility

Use a 390px viewport to confirm controls fit, all select labels are associated, translated buttons remain keyboard reachable, and no ad or player container overflows horizontally.

- [ ] Step 4: Verify production after Pages deployment

After pushing to main, wait for the Pages workflow, then check:

    gh run list --repo ceenreels/product-reels-libretv --workflow pages.yml --limit 1
    curl -fsSL https://jumeitianxia.com/ | rg 'localeSelect|regionSelect|hreflang="en"|js/i18n/index.js'
    curl -fsSL https://jumeitianxia.com/privacy.html | rg '语言|地区|localStorage'

The production check must confirm deployed files and HTTP 200 responses; it must not claim that a private ad dashboard or browser-only behavior was verified if Chrome is unavailable.

- [ ] Step 5: Document source onboarding and commit final verification

Update readme.md with the exact metadata fields required for a new source, the requirement to verify search/detail/playback before setting defaultEligible: true, and the fallback behavior when no matching source exists. Run git diff --check, npm test, and commit:

    git add readme.md tests
    git diff --check
    npm test
    git commit -m "docs: document international source routing"
