# Task 3 report: API region routing

## RED

- Added the explicit request-context and source-plan tests from the brief.
- Initial focused run (`node --test tests/i18n-routing.test.js`) failed 2 tests because `getRequestContext` and `buildSourcePlan` were not implemented.

## GREEN

- Implemented normalized `LibretvRouting.getRequestContext(url)` with explicit URL parameters and page-only browser fallback.
- Implemented `LibretvRouting.buildSourcePlan(context)` with primary and fallback layers while keeping custom sources out of automatic routing.
- Refactored aggregated search to query only the plan, isolate source failures, record health only for valid responses, preserve source metadata, deduplicate by source code/video ID, and expose routing metadata.
- Refactored recommendations to try healthy primary sources before fallback sources and preserve source identity in returned cards.
- Updated app search/recommendation URLs to include locale, region, and source mode; detail requests continue using the rendered result's source code.
- Added focused tests for primary success, fallback routing, and isolated source failure.

Verification:

- `node --test tests/i18n-routing.test.js` — 15 passed.
- `npm test` — 36 passed.

## Concerns

- Existing regional metadata has no distinct fallback source for some Chinese regions (for example CN), so fallback metadata correctly reports no fallback when every eligible source fails.
- Recommendation cover enrichment remains best-effort and does not affect source health, matching the existing behavior.

## Review fix round 1

- Custom recommendation requests now use the supplied custom API list and retain manual-only source identity; custom search and recommendation responses (including empty results) include routing metadata.
- App-generated custom search/recommendation URLs now always carry locale, region, and sourceMode.
- Routing plans accept a capability selector; recommendation routing excludes search-only sources and records recommendation health outcomes.
- Fallback global tiers require language compatibility, with an explicit final global fallback retained for English when no English-labelled source exists.
- `index.html` now loads `js/source-routing.js` before `js/api.js`, restoring browser runtime routing.
- Added regression tests for custom recommendations/search metadata, capability filtering, fallback language safety, and static script order.
- Added failure-path coverage ensuring recommendation errors still return routing metadata.

Latest verification: `node --test tests/i18n-routing.test.js` — 20 passed.

## Review fix round 2

- Recommendation routing now snapshots attempted source IDs before health mutations, preserving accurate `requestedSources` on total failure; `usedSources` and `fellBack` reflect actual outcomes.
- Added regression coverage asserting failed primary sources remain present in failure metadata.
