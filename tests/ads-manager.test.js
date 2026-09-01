import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdManager } from '../js/ads/manager.js';
import { createAdsterraProvider, getResponsiveBanner } from '../js/ads/providers/adsterra.js';
import { createJuicyAdsProvider } from '../js/ads/providers/juicyads.js';
import { ADS_CONFIG } from '../js/ads/config.js';

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

test('Adsterra uses a square creative for a desktop sidebar slot', async () => {
  const nodes = [];
  const documentRef = {
    defaultView: { innerWidth: 1440 },
    head: { appendChild(node) { nodes.push(node); } },
    body: { appendChild(node) { nodes.push(node); } },
    createElement: tag => {
      const node = { tagName: tag.toUpperCase(), dataset: {}, setAttribute() {} };
      Object.defineProperty(node, 'onload', {
        configurable: true,
        get() { return this._onload; },
        set(handler) { this._onload = handler; handler?.(); }
      });
      return node;
    }
  };
  const slot = {
    dataset: {},
    querySelector() { return null; },
    appendChild(node) { nodes.push(node); }
  };
  const provider = createAdsterraProvider({ enabled: true });
  await provider.init({ document: documentRef });
  await provider.mount('ad-responsive-banner', slot, {
    document: documentRef,
    config: { desktopFormat: 'square', desktopBreakpoint: 1280 }
  });
  assert.deepEqual(documentRef.defaultView.atOptions, {
    key: '96f20abe4e9e5d2c41ea6e4302114ad2',
    format: 'iframe',
    height: 250,
    width: 300,
    params: {}
  });
});

test('JuicyAds uses a desktop sidebar snippet variant when configured', async () => {
  const nodes = [];
  const documentRef = {
    defaultView: { innerWidth: 1440 },
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      dataset: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(node) { nodes.push(node); }
    })
  };
  const slot = { dataset: {}, appendChild(node) { nodes.push(node); }, querySelector() { return null; } };
  const provider = createJuicyAdsProvider({
    enabled: true,
    slotSnippets: {
      'ad-juicy-home-banner': {
        desktop: '<ins data-width="728" data-height="90"></ins>',
        sidebar: '<ins data-width="300" data-height="250"></ins>',
        mobile: '<ins data-width="300" data-height="50"></ins>'
      }
    }
  });
  await provider.init({ document: documentRef });
  await provider.mount('ad-juicy-home-banner', slot, {
    document: documentRef,
    config: { desktopVariant: 'sidebar', desktopBreakpoint: 1280 }
  });
  assert.equal(nodes[0].attributes['data-width'], '300');
  assert.equal(nodes[0].attributes['data-height'], '250');
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

test('JuicyAds places PopUnder code in the configured body target', async () => {
  const headScripts = [];
  const bodyScripts = [];
  const documentRef = {
    head: { appendChild: node => headScripts.push(node) },
    body: { appendChild: node => bodyScripts.push(node) },
    createElement: tag => ({ tagName: tag.toUpperCase(), dataset: {}, setAttribute() {} })
  };
  const provider = createJuicyAdsProvider({
    enabled: true,
    popunderPlacement: 'body',
    popunderCode: '<script src="https://juicy.example/pop.js"></script>'
  });
  await provider.init({ document: documentRef });
  assert.equal(headScripts.length, 0);
  assert.equal(bodyScripts.length, 1);
});

test('JuicyAds can place code in a dedicated top-of-body service slot', async () => {
  const serviceSlot = { appendChild: node => { serviceSlot.node = node; }, querySelector() { return null; } };
  const documentRef = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => ({ tagName: tag.toUpperCase(), dataset: {}, setAttribute() {} }),
    getElementById: id => id === 'ad-popunder' ? serviceSlot : null
  };
  const provider = createJuicyAdsProvider({
    enabled: true,
    popunderContainerId: 'ad-popunder',
    popunderCode: '<script src="https://juicy.example/pop.js"></script>'
  });
  await provider.init({ document: documentRef });
  assert.equal(serviceSlot.node.src, 'https://juicy.example/pop.js');
});

test('JuicyAds banner snippets preserve the ins target and script attributes', async () => {
  const nodes = [];
  const documentRef = {
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => {
      const node = {
        tagName: tag.toUpperCase(),
        dataset: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { nodes.push(child); }
      };
      return node;
    }
  };
  const slot = {
    dataset: {},
    appendChild(node) { nodes.push(node); },
    querySelector() { return null; }
  };
  const provider = createJuicyAdsProvider({
    enabled: true,
    slotSnippets: {
      'ad-juicy-banner': '<script type="text/javascript" async src="https://poweredby.jads.co/js/jads.js"></script><ins id="1125773" data-width="300" data-height="250"></ins><script async>(adsbyjuicy = window.adsbyjuicy || []).push({\'adzone\':1125773});</script>'
    }
  });
  await provider.init({ document: documentRef });
  await provider.mount('ad-juicy-banner', slot, { document: documentRef });
  assert.deepEqual(nodes.map(node => node.tagName), ['SCRIPT', 'INS', 'SCRIPT']);
  assert.equal(nodes[0].attributes.async, '');
  assert.equal(nodes[0].attributes['<script'], undefined);
  assert.equal(nodes[1].attributes['data-width'], '300');
  assert.equal(nodes[1].attributes['data-height'], '250');
});

test('JuicyAds responsive banner chooses the mobile snippet on a narrow viewport', async () => {
  const nodes = [];
  const documentRef = {
    defaultView: { innerWidth: 390 },
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      dataset: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(node) { nodes.push(node); }
    })
  };
  const slot = { dataset: {}, appendChild(node) { nodes.push(node); }, querySelector() { return null; } };
  const provider = createJuicyAdsProvider({
    enabled: true,
    slotSnippets: {
      'ad-juicy-responsive-banner': {
        desktop: '<ins data-width="300" data-height="250"></ins>',
        mobile: '<ins data-width="300" data-height="50"></ins>'
      }
    }
  });
  await provider.init({ document: documentRef });
  await provider.mount('ad-juicy-responsive-banner', slot, { document: documentRef });
  assert.equal(nodes[0].attributes['data-height'], '50');
});

test('JuicyAds responsive banner chooses the desktop snippet on a wide viewport', async () => {
  const nodes = [];
  const documentRef = {
    defaultView: { innerWidth: 1280 },
    head: { appendChild() {} },
    body: { appendChild() {} },
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      dataset: {},
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      appendChild(node) { nodes.push(node); }
    })
  };
  const slot = { dataset: {}, appendChild(node) { nodes.push(node); }, querySelector() { return null; } };
  const provider = createJuicyAdsProvider({
    enabled: true,
    slotSnippets: {
      'ad-juicy-home-banner': {
        desktop: '<ins data-width="728" data-height="90"></ins>',
        mobile: '<ins data-width="300" data-height="50"></ins>'
      }
    }
  });
  await provider.init({ document: documentRef });
  await provider.mount('ad-juicy-home-banner', slot, { document: documentRef });
  assert.equal(nodes[0].attributes['data-width'], '728');
  assert.equal(nodes[0].attributes['data-height'], '90');
});

test('homepage JuicyAds desktop zone uses the newly created leaderboard zone', () => {
  const desktopSnippet = ADS_CONFIG.providers.juicyads.slotSnippets['ad-juicy-home-banner'].desktop;
  assert.match(desktopSnippet, /id="1125830"/);
  assert.match(desktopSnippet, /data-width="728"/);
  assert.match(desktopSnippet, /data-height="90"/);
});

test('homepage JuicyAds sidebar variant uses the 300x250 creative on desktop', () => {
  const sidebarSnippet = ADS_CONFIG.providers.juicyads.slotSnippets['ad-juicy-home-banner'].sidebar;
  assert.match(sidebarSnippet, /id="1125773"/);
  assert.match(sidebarSnippet, /data-width="300"/);
  assert.match(sidebarSnippet, /data-height="250"/);
  assert.equal(ADS_CONFIG.slots['ad-juicy-home-banner'].desktopVariant, 'sidebar');
});
