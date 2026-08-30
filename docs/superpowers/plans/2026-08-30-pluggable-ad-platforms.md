# 可插拔双广告平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不影响现有播放器的前提下，让 Adsterra 与 JuicyAds 可同时运行并可独立启停。

**Architecture:** 用统一 manager 维护语义化广告 slot；Adsterra、JuicyAds 各自实现 provider adapter，页面只保留 slot 与验证 meta。JuicyAds 首期仅使用后台验证后可生成的 PopUnder，未来平台通过新增 adapter 接入。

**Tech Stack:** 原生 JavaScript ES modules、静态 HTML、Node 内置测试运行器、Chrome 页面验证。

**Spec:** `docs/superpowers/specs/2026-08-30-pluggable-ad-platforms-design.md`

## Global Constraints

- 不读取或写入浏览器 cookies、密码、localStorage 或 session stores。
- 任一广告 provider 失败不得阻塞另一个 provider、首页推荐或视频播放器。
- 同一 slot 只允许一次挂载；Popunder/Social Bar/Floater 使用服务型独立 slot。
- JuicyAds 不创建未知收费 zone；只有后台给出真实代码后才接入对应格式。

---

### Task 1: 建立 provider manager 的失败测试

**Files:**
- Create: `tests/ads-manager.test.js`
- Create: `package.json`

**Interfaces:**
- Test will import `js/ads/manager.js` and exercise `createAdManager({ providers, slots, document })`.

- [x] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdManager } from '../js/ads/manager.js';

test('one provider can be disabled without preventing another provider', async () => {
  const calls = [];
  const manager = createAdManager({
    document: null,
    providers: {
      adsterra: { enabled: false, init: () => calls.push('adsterra') },
      juicyads: { enabled: true, init: () => calls.push('juicyads') }
    },
    slots: {}
  });
  await manager.init();
  assert.deepEqual(calls, ['juicyads']);
});

test('provider errors are isolated and a slot is mounted once', async () => {
  const calls = [];
  const element = { dataset: {}, appendChild() {} };
  const manager = createAdManager({
    document: { getElementById: id => id === 'slot' ? element : null },
    providers: {
      broken: { enabled: true, init: () => { throw new Error('offline'); } },
      good: { enabled: true, init: () => calls.push('init-good'), mount: (slot, el) => calls.push(['mount', slot, el]) }
    },
    slots: { slot: { provider: 'good' } }
  });
  await manager.init();
  await manager.mountAll();
  await manager.mountAll();
  assert.deepEqual(calls, ['init-good', ['mount', 'slot', element]]);
});

```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `js/ads/manager.js` does not exist yet.

- [x] **Step 3: Write minimal implementation**

Create `createAdManager()` with isolated provider initialization, one-time slot mounting, and `destroy()` cleanup.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: manager tests PASS.

- [x] **Step 5: Commit**

Commit the manager, tests, and Node test script together.

### Task 2: Migrate Adsterra into its adapter

**Files:**
- Create: `js/ads/providers/adsterra.js`
- Create: `js/ads/config.js`

**Interfaces:**
- Produces `createAdsterraProvider(config)` and `getResponsiveBanner(viewportWidth)`.
- Mounts `ad-responsive-banner`, `ad-native-banner`, and `ad-square-banner`; service scripts load once during `init()`.

- [x] **Step 1: Add failing provider tests**

Cover responsive breakpoint selection and initialization against a DOM-like object with a read-only native `dataset` property.

- [x] **Step 2: Run `node --test tests/ads-manager.test.js` and observe the missing-module/dataset failure**
- [x] **Step 3: Implement the adapter**

Preserve the existing Anti-Adblock URLs and `atOptions` shape, guard duplicate scripts with `data-libretv-ad`, and never assign to the native `dataset` property itself.

- [x] **Step 4: Run the targeted test and then `npm test`**

Expected: all provider and manager tests PASS.

### Task 3: Add JuicyAds adapter and verification metadata

**Files:**
- Create: `js/ads/providers/juicyads.js`
- Modify: `index.html`

**Interfaces:**
- Produces `createJuicyAdsProvider(config)` with optional `popunderScriptSrc`, `popunderCode`, and per-slot snippets.
- Publishes the JuicyAds site verification meta for site ID `316626`.

- [x] **Step 1: Add failing tests for snippet loading and homepage metadata**
- [x] **Step 2: Run `npm test` and observe the missing metadata/module failures**
- [x] **Step 3: Implement snippet parsing for external and inline script tags, with no-op behavior when JuicyAds has not released code**
- [x] **Step 4: Run `npm test` and verify all tests pass**

### Task 4: Switch pages to the neutral bootstrap

**Files:**
- Create: `js/ads/bootstrap.js`
- Modify: `js/ads.js`
- Modify: `index.html`
- Modify: `player.html`

**Interfaces:**
- `startAds(document)` creates both providers from `ADS_CONFIG`, initializes them independently, and mounts configured slots.

- [x] **Step 1: Remove hard-coded Adsterra script tags from both pages**
- [x] **Step 2: Load `js/ads.js` as an ES module and retain compatibility export**
- [x] **Step 3: Run local static-server smoke test and verify service scripts and Adsterra slot scripts appear once**
- [x] **Step 4: Run `npm test`**

### Task 5: Verify JuicyAds and publish

**Files:**
- Modify: `js/ads/config.js` when JuicyAds returns verified code

- [x] **Step 1: Push the verification meta and adapter architecture to `ceenreels/product-reels-libretv`**
- [x] **Step 2: Use Chrome to click JuicyAds `Verify Website` and confirm the site becomes verified**
- [x] **Step 3: Read the released PopUnder code from JuicyAds and put only that exact snippet into `ADS_CONFIG`**
- [x] **Step 4: Re-run tests, publish the final change, and check the production homepage source**
