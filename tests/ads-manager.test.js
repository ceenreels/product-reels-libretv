import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdManager } from '../js/ads/manager.js';
import { createAdsterraProvider, getResponsiveBanner } from '../js/ads/providers/adsterra.js';
import { createJuicyAdsProvider } from '../js/ads/providers/juicyads.js';

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
    logger: { warn() {} },
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

test('Adsterra chooses a mobile banner for a narrow viewport', () => {
  assert.deepEqual(getResponsiveBanner(390), { width: 320, height: 50 });
  assert.deepEqual(getResponsiveBanner(1280), { width: 728, height: 90 });
});

test('JuicyAds provider can load a verified script without requiring a DOM slot', async () => {
  const scripts = [];
  const documentRef = {
    head: { appendChild: node => scripts.push(node) },
    createElement: tag => ({ tagName: tag.toUpperCase(), dataset: {}, setAttribute() {} })
  };
  const provider = createJuicyAdsProvider({
    enabled: true,
    popunderScriptSrc: 'https://juicy.example/pop.js'
  });
  await provider.init({ document: documentRef });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://juicy.example/pop.js');
});

test('Adsterra initializes with a native DOM dataset property', async () => {
  const documentRef = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => {
      const script = { tagName: tag.toUpperCase(), setAttribute() {} };
      Object.defineProperty(script, 'dataset', {
        configurable: false,
        get: () => ({})
      });
      return script;
    }
  };
  const provider = createAdsterraProvider({ enabled: true });
  await assert.doesNotReject(() => provider.init({ document: documentRef }));
});
