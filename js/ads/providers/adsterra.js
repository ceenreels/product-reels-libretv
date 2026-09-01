const DEFAULT_ADSTERRA_CONFIG = {
    serviceScripts: {
        popunder: 'https://closurenosy.com/1e/b9/a6/1eb9a62a6a4cb9cd25813b4d2c1341de.js',
        socialBar: 'https://closurenosy.com/b7/58/b0/b758b0306a71fb06846e2cfd07fc471e.js'
    },
    nativeBanner: {
        src: 'https://closurenosy.com/5ab709ddd4bc614f52a6cbd02931be38/invoke.js',
        containerId: 'container-5ab709ddd4bc614f52a6cbd02931be38'
    },
    banners: {
        wide: {
            width: 728,
            height: 90,
            key: 'df2b98674c7ec5c8b8322b6e8868010c',
            src: 'https://closurenosy.com/df2b98674c7ec5c8b8322b6e8868010c/invoke.js'
        },
        medium: {
            width: 468,
            height: 60,
            key: '2aa63bd3cd82c57f83a502262b245a01',
            src: 'https://closurenosy.com/2aa63bd3cd82c57f83a502262b245a01/invoke.js'
        },
        mobile: {
            width: 320,
            height: 50,
            key: '5e8661f13409efe73463c18b6d6f277a',
            src: 'https://closurenosy.com/5e8661f13409efe73463c18b6d6f277a/invoke.js'
        },
        square: {
            width: 300,
            height: 250,
            key: '96f20abe4e9e5d2c41ea6e4302114ad2',
            src: 'https://closurenosy.com/96f20abe4e9e5d2c41ea6e4302114ad2/invoke.js'
        },
        // The 160px rail slots are created in Adsterra, but their generated
        // snippets must be copied into this config before they can load.
        verticalTall: {
            width: 160,
            height: 600,
            key: null,
            src: null
        },
        verticalShort: {
            width: 160,
            height: 300,
            key: null,
            src: null
        }
    }
};

export function getResponsiveBanner(viewportWidth = globalThis.innerWidth || 0) {
    if (viewportWidth >= 900) return { width: 728, height: 90 };
    if (viewportWidth >= 520) return { width: 468, height: 60 };
    return { width: 320, height: 50 };
}

function appendScript(container, documentRef, src, key, attributes = {}) {
    if (!container || !documentRef?.createElement || !src) return null;
    const existing = container.querySelector?.(`script[data-libretv-ad="${key}"]`);
    if (existing) return existing;

    const script = documentRef.createElement('script');
    script.src = src;
    if (script.dataset) script.dataset.libretvAd = key;
    else script.setAttribute?.('data-libretv-ad', key);
    Object.entries(attributes).forEach(([name, value]) => {
        if (value === true) script.setAttribute?.(name, '');
        else if (value !== false && value != null) script.setAttribute?.(name, value);
    });
    container.appendChild(script);
    return script;
}

function loadBanner(container, documentRef, ad, key) {
    if (!container || !ad?.src || !ad?.key) return Promise.resolve(false);
    if (container.querySelector?.(`script[data-libretv-ad="${key}"]`)) return Promise.resolve(false);

    const win = documentRef?.defaultView || globalThis;
    win.atOptions = {
        key: ad.key,
        format: 'iframe',
        height: ad.height,
        width: ad.width,
        params: {}
    };

    return new Promise(resolve => {
        const script = appendScript(container, documentRef, ad.src, key);
        if (!script) return resolve(false);
        let settled = false;
        let timeoutId = null;
        const finish = success => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(success === true);
        };
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        timeoutId = setTimeout(() => finish(false), 8000);
        if (settled) clearTimeout(timeoutId);
    });
}

function configuredBanner(settings, viewportWidth, slotConfig = {}) {
    if (slotConfig.format && settings.banners[slotConfig.format]) {
        return settings.banners[slotConfig.format];
    }

    const desktopBreakpoint = Number.isFinite(slotConfig.desktopBreakpoint)
        ? slotConfig.desktopBreakpoint
        : 1280;
    const desktopFormat = slotConfig.desktopFormat;
    if (desktopFormat && viewportWidth >= desktopBreakpoint && settings.banners[desktopFormat]) {
        return settings.banners[desktopFormat];
    }

    const responsive = getResponsiveBanner(viewportWidth);
    if (responsive.width === 728) return settings.banners.wide;
    if (responsive.width === 468) return settings.banners.medium;
    return settings.banners.mobile;
}

export function createAdsterraProvider(config = {}) {
    const settings = {
        ...DEFAULT_ADSTERRA_CONFIG,
        ...config,
        serviceScripts: { ...DEFAULT_ADSTERRA_CONFIG.serviceScripts, ...(config.serviceScripts || {}) },
        nativeBanner: { ...DEFAULT_ADSTERRA_CONFIG.nativeBanner, ...(config.nativeBanner || {}) },
        banners: { ...DEFAULT_ADSTERRA_CONFIG.banners, ...(config.banners || {}) }
    };
    let documentRef = null;
    let bannerQueue = Promise.resolve();

    return {
        enabled: settings.enabled !== false,

        async init(context = {}) {
            documentRef = context.document || globalThis.document;
            if (!documentRef) return;
            appendScript(documentRef.head, documentRef, settings.serviceScripts.popunder, 'adsterra-popunder');
            appendScript(documentRef.body, documentRef, settings.serviceScripts.socialBar, 'adsterra-social-bar');
        },

        async mount(slotName, element, context = {}) {
            if (!element || element.dataset?.libretvAdProvider === 'adsterra') return;
            const doc = context.document || documentRef || globalThis.document;
            if (!doc) return;

            if (slotName === 'ad-native-banner') {
                let nativeContainer = doc.getElementById?.(settings.nativeBanner.containerId);
                if (!nativeContainer) {
                    nativeContainer = doc.createElement('div');
                    nativeContainer.id = settings.nativeBanner.containerId;
                    element.appendChild(nativeContainer);
                }
                appendScript(element, doc, settings.nativeBanner.src, 'adsterra-native-banner', {
                    async: true,
                    'data-cfasync': 'false'
                });
            } else {
                const viewportWidth = (doc.defaultView || globalThis).innerWidth || 0;
                let selected;
                if (context.config?.format) {
                    selected = configuredBanner(settings, viewportWidth, context.config);
                } else if (slotName === 'ad-square-banner') {
                    selected = settings.banners.square;
                } else {
                    selected = configuredBanner(settings, viewportWidth, context.config || {});
                }
                bannerQueue = bannerQueue.then(() => loadBanner(element, doc, selected, `adsterra-${slotName}`));
                const loaded = await bannerQueue;
                if (loaded && element.dataset) element.dataset.libretvAdLoaded = 'true';
            }
            if (element.dataset) element.dataset.libretvAdProvider = 'adsterra';
        },

        async destroy() {
            documentRef = null;
            bannerQueue = Promise.resolve();
        }
    };
}
