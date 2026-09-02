# International Source Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add multiple verified overseas video sources with language-aware routing, playable normalization, and lazy source-size/health statistics without changing existing ad, Streamtape recommendation, or player URL protocols.

**Architecture:** Keep `API_SITES` as the registry and give each non-AppleCMS source a focused adapter under `js/adapters/`. `js/source-routing.js` remains the single planner for search and recommendations, while `js/api.js` exposes adapter requests and a cached `/api/source-stats` response. The settings drawer renders source metadata and asynchronously refreshes statistics only when opened.

**Tech Stack:** Vanilla JavaScript loaded by static HTML, Node built-in test runner, public HTTPS JSON APIs, Jina proxy only for legacy AppleCMS sources.

**Spec:** `docs/superpowers/specs/2026-09-02-international-source-catalog-design.md`

## Global Constraints

- Preserve existing `suggest.js`/`suggest.json`, ad provider configuration, localStorage keys, and player URL parameters.
- Only enable sources that pass the spec's API, stable ID, HTTPS playback, browser loading, count interpretation, and repeated health checks.
- Use `catalogCount`, `playableCount`, `countKind`, `updatedAt`, `sampleSize`, and `status`; statistics are non-blocking and cached for 6 hours.
- English is the cross-language fallback; an English locale must never route to Chinese sources.
- Filter audio-only, download-only, login-protected, non-HTTP(S), and unsupported media URLs.
- Adapter failures and statistics failures are isolated per source and never block search, recommendations, or playback.

---

### Task 1: Verify candidate source APIs and define adapter contracts

**Files:**
- Create: `docs/superpowers/research/2026-09-02-international-source-validation.md`
- Test: `tests/international-source-adapters.test.js`

**Interfaces:**
- The research record names the exact public API endpoints, response fields, playback URL policy, count semantics, and enablement decision for Archive, PeerTube, and Wikimedia.
- Tests import adapters through `globalThis.VIDEO_SOURCE_ADAPTERS`-compatible scripts and define the required `buildSearchUrl`, `buildRecommendationsUrl`, `buildDetailUrl`, `normalizeSearchResponse`, `normalizeDetailResponse`, `getStats`, and `isPlayableUrl` behavior.

- [ ] **Step 1: Write failing adapter contract tests**

  Add fixtures for one valid and one invalid item per candidate. Assert URL construction, stable `vod_id`, source metadata, HTTPS playable episodes, and stats shape. Assert that unsupported audio/download URLs are excluded.

- [ ] **Step 2: Run the focused tests and verify they fail because adapters are absent**

  Run: `node --test tests/international-source-adapters.test.js`

  Expected: FAIL with missing adapter files or adapter exports.

- [ ] **Step 3: Probe the three official APIs**

  Use read-only `curl` requests against the documented search, detail/media, and count endpoints. Record timestamps, response examples, CORS/proxy behavior, and whether a browser can load at least one media URL. Do not add a source to `enabled: true` if any gate fails.

- [ ] **Step 4: Save the validation record**

  Write concrete endpoint URLs and observed count/playability semantics to `docs/superpowers/research/2026-09-02-international-source-validation.md`; mark each source `enabled`, `candidate-only`, or `rejected` with the reason.

- [ ] **Step 5: Commit the research and failing tests**

  Run `git add docs/superpowers/research/2026-09-02-international-source-validation.md tests/international-source-adapters.test.js && git commit -m "test: define international source adapter contracts"`.

### Task 2: Implement Internet Archive adapter

**Files:**
- Create: `js/adapters/archive.js`
- Modify: `js/config.js`
- Test: `tests/international-source-adapters.test.js`

**Interfaces:**
- `ArchiveAdapter` exposes `buildSearchUrl(query, page, pageSize)`, `buildRecommendationsUrl(page, pageSize)`, `buildDetailUrl(identifier)`, `normalizeSearchResponse(payload)`, `normalizeDetailResponse(payload, id)`, `getStats({ signal } = {})`, and `isPlayableUrl(url)`.
- Normalized items contain `vod_id`, `vod_name`, `vod_pic`, `vod_content`, `vod_play_url`, `source_code: 'archive'`, and `source_name`.

- [ ] **Step 1: Extend tests with Archive fixtures and stats parsing assertions**
- [ ] **Step 2: Run `node --test tests/international-source-adapters.test.js` and observe the Archive assertions fail**
- [ ] **Step 3: Implement minimal Archive JSON API adapter**

  Use Advanced Search with `output=json`, `fl[]=identifier`, `fl[]=title`, `fl[]=description`, `fl[]=year`, and `rows/start`; item metadata requests use `https://archive.org/metadata/<identifier>`. Select only HTTPS `.mp4` files with video MIME/format and omit derivative/download-only files. Treat `response.numFound` as authoritative catalog count and sample metadata files for an estimated playable count when needed.

- [ ] **Step 4: Run focused tests and then `npm test`**
- [ ] **Step 5: Commit with `git add js/adapters/archive.js js/config.js tests/international-source-adapters.test.js && git commit -m "feat: add Internet Archive video adapter"`**

### Task 3: Implement PeerTube network adapter

**Files:**
- Create: `js/adapters/peertube.js`
- Modify: `js/config.js`
- Test: `tests/international-source-adapters.test.js`

**Interfaces:**
- `PeerTubeAdapter` exposes the same seven functions and returns `source_code: 'peertube'`.
- Result IDs retain the instance hostname plus UUID so details can be requested from the correct instance.

- [ ] **Step 1: Add PeerTube fixtures for search, detail, media filtering, and aggregated stats**
- [ ] **Step 2: Run the focused test and verify it fails before implementation**
- [ ] **Step 3: Implement against a public PeerTube search endpoint selected in Task 1**

  Preserve instance and UUID in IDs, normalize direct MP4/HLS or official embed URLs, reject inaccessible/login-only instances and audio-only files, and label network totals as `estimated` unless the API explicitly provides an authoritative aggregate.

- [ ] **Step 4: Run focused tests and `npm test`**
- [ ] **Step 5: Commit with `git add js/adapters/peertube.js js/config.js tests/international-source-adapters.test.js && git commit -m "feat: add PeerTube network adapter"`**

### Task 4: Implement Wikimedia Commons video adapter

**Files:**
- Create: `js/adapters/wikimedia.js`
- Modify: `js/config.js`
- Test: `tests/international-source-adapters.test.js`

**Interfaces:**
- `WikimediaAdapter` exposes the same seven functions and returns `source_code: 'wikimedia'`.
- Search IDs are stable MediaWiki titles encoded for detail requests.

- [ ] **Step 1: Add MediaWiki search/fileinfo fixtures and filtering assertions**
- [ ] **Step 2: Run the focused test and verify it fails before implementation**
- [ ] **Step 3: Implement MediaWiki API adapter**

  Search `namespace=6` files with `srsearch=incategory:Videos`, request imageinfo URL/MIME/size, prefer browser-compatible WebM/MP4 URLs, and use the file title as the stable ID. Use the API's search total as authoritative catalog count; report playable count as estimated from the returned sample unless a category count endpoint provides an exact value.

- [ ] **Step 4: Run focused tests and `npm test`**
- [ ] **Step 5: Commit with `git add js/adapters/wikimedia.js js/config.js tests/international-source-adapters.test.js && git commit -m "feat: add Wikimedia video adapter"`**

### Task 5: Register adapters, route languages, and harden API isolation

**Files:**
- Modify: `js/config.js`
- Modify: `js/source-routing.js`
- Modify: `js/api.js`
- Modify: `index.html`
- Test: `tests/international-sources.test.js`, `tests/routing-hardening.test.js`

**Interfaces:**
- `API_SITES` includes Archive, PeerTube, and Wikimedia metadata with `capabilities.stats: true` and initial empty stats.
- `REGION_SOURCE_RULES.GLOBAL_EN` orders Blender, Archive, PeerTube, Wikimedia, NASA.
- Adapter scripts load before `js/api.js` in `index.html`.
- `handleApiRequest('/api/search')` and `/api/recommendations` use adapters through the existing source plan, with per-source failure isolation and explicit English fallback.

- [ ] **Step 1: Add routing tests for English priority, non-English English fallback, and stats failure isolation**
- [ ] **Step 2: Run the focused routing tests and verify the new expectations fail**
- [ ] **Step 3: Register sources and scripts, then wire adapter stats hooks without changing legacy AppleCMS paths**
- [ ] **Step 4: Run `npm test` and inspect the complete output**
- [ ] **Step 5: Commit with `git add js/config.js js/source-routing.js js/api.js index.html tests/international-sources.test.js tests/routing-hardening.test.js && git commit -m "feat: route international video sources by locale"`**

### Task 6: Add lazy `/api/source-stats` caching and settings UI

**Files:**
- Modify: `js/api.js`
- Modify: `js/app.js`
- Modify: `index.html`
- Modify: `js/i18n/messages.js`
- Test: `tests/international-sources.test.js`, `tests/frontend-hardening.test.js`

**Interfaces:**
- `handleApiRequest('/api/source-stats?source=<code>')` returns `{ code: 200, source, stats }` or a non-blocking `{ code: 200, source, stats: { countKind: 'unavailable', status: 'error' } }` result.
- Browser cache key is `libretv:sourceStats:<source>` with a 6-hour expiry and never changes existing localStorage keys.
- Settings panel contains `#sourceStatsList`, populated only when the panel opens; each row shows name, languages, catalog count, playable count/estimate, status, and relative update time.

- [ ] **Step 1: Add tests proving stats are lazy, cached for 6 hours, and failures do not affect search**
- [ ] **Step 2: Run focused tests and verify they fail before implementation**
- [ ] **Step 3: Implement API stats endpoint, per-source timeout, and browser cache**
- [ ] **Step 4: Render localized settings rows with loading/error/estimated states**
- [ ] **Step 5: Run `npm test` and `git diff --check`**
- [ ] **Step 6: Commit with `git add js/api.js js/app.js index.html js/i18n/messages.js tests/international-sources.test.js tests/frontend-hardening.test.js && git commit -m "feat: show lazy international source statistics"`**

### Task 7: Browser verification and deployment

**Files:**
- Modify: none unless verification finds a regression.
- Evidence: `/tmp/ceenreels-international-*.png` and Playwright output outside the repository.

- [ ] **Step 1: Start the static site using the existing local workflow and record the exact URL**
- [ ] **Step 2: Use the available Browser skill; if unavailable or invocation fails, use the already-approved Playwright fallback and record the reason**
- [ ] **Step 3: Verify desktop and mobile homepage identity, non-blank content, no framework overlay, and console health**
- [ ] **Step 4: Exercise English routing, search results from at least two added sources, one detail/player flow, and settings statistics**
- [ ] **Step 5: Verify one media element reaches playable state or an official iframe loads**
- [ ] **Step 6: Run `npm test`, `git diff --check`, inspect `git status --short`, then push the main branch and confirm GitHub Pages deployment status**

