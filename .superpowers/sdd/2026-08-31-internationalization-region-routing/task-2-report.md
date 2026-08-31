# Task 2 report: Enrich source metadata and test region eligibility

## RED

Command: `node --test tests/i18n-routing.test.js`

Result: expected failures observed before implementation (2 failing tests): regional eligibility included `cjhw`; English primary assertion exposed the cross-realm VM array comparison. The latter test assertion was normalized to `primary.length === 0` while preserving behavior.

## GREEN

Commands:

- `node --test tests/i18n-routing.test.js`
- `node --test`

Results: focused suite 7/7 passed; full suite 28/28 passed.

## Changes

- Added languages, regions, priority, capabilities, enabled/defaultEligible metadata to every existing API source in `js/config.js`.
- Added `REGION_SOURCE_RULES` for CN, TW, HK, SG, GLOBAL_ZH, and GLOBAL_EN without changing source IDs.
- Added five-minute in-memory source health tracking (`recordSourceSuccess`, `recordSourceFailure`, `isSourceHealthy`) and applied health suppression to eligibility/fallback routing.
- Added regional eligibility, legacy migration, and English fallback tests in `tests/i18n-routing.test.js`.

## Concerns

- English fallback intentionally returns source-provided Chinese content; no English API is invented.
- Health state is process-memory only and expires after five minutes; it is not persisted or transmitted.

## Review fix round 1

### RED

Added regressions for incompatible-region fallback leakage and unannotated-source automatic eligibility. Focused test run: 2 failures (the region-limited source leaked into TW fallback; missing `defaultEligible` was treated as eligible). Health behavior test passed against the existing implementation.

### GREEN

Updated fallback filtering to require region compatibility or a `GLOBAL_*` region, changed missing `defaultEligible` to conservative false for automatic routing, and retained manual selection. Added health coverage for failure suppression, success recovery, and the exact five-minute expiry boundary.

Commands: `node --test tests/i18n-routing.test.js` and `node --test`.

Results: focused 10/10 passed; full suite 31/31 passed.
