import { createAdManager } from './manager.js';
import { ADS_CONFIG } from './config.js';
import { createAdsterraProvider } from './providers/adsterra.js';
import { createJuicyAdsProvider } from './providers/juicyads.js';

export async function startAds(documentRef = globalThis.document) {
    if (!documentRef) return null;

    const manager = createAdManager({
        document: documentRef,
        providers: {
            adsterra: createAdsterraProvider(ADS_CONFIG.providers.adsterra),
            juicyads: createJuicyAdsProvider(ADS_CONFIG.providers.juicyads)
        },
        slots: ADS_CONFIG.slots
    });
    globalThis.LibretvAds = manager;
    await manager.init();
    await manager.mountAll();

    // Keep the desktop rails opt-in: until both real 160px creatives load,
    // the existing inline placements remain available as a safe fallback.
    const leftRail = documentRef.getElementById?.('ad-home-left-rail');
    const rightRail = documentRef.getElementById?.('ad-home-right-rail');
    const root = documentRef.documentElement;
    if (root?.classList) {
        root.classList.toggle('homepage-left-vertical-ready', leftRail?.dataset?.libretvAdLoaded === 'true');
        root.classList.toggle('homepage-right-vertical-ready', rightRail?.dataset?.libretvAdLoaded === 'true');
        root.classList.toggle(
            'homepage-vertical-ads-ready',
            leftRail?.dataset?.libretvAdLoaded === 'true' && rightRail?.dataset?.libretvAdLoaded === 'true'
        );
    }
    return manager;
}

if (globalThis.document) {
    const boot = () => { void startAds(globalThis.document); };
    if (globalThis.document.readyState === 'loading') {
        globalThis.document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
}
