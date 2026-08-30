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
