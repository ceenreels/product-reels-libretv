function appendJuicySnippet(documentRef, container, snippet, key) {
    if (!documentRef || !snippet) return false;
    if (container?.querySelector?.(`script[data-libretv-ad^="${key}"]`)) return false;

    const externalScripts = [...snippet.matchAll(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi)];
    externalScripts.forEach(([, src], index) => {
        const script = documentRef.createElement('script');
        script.src = src;
        if (script.dataset) script.dataset.libretvAd = `${key}-${index}`;
        else script.setAttribute?.('data-libretv-ad', `${key}-${index}`);
        (container || documentRef.head || documentRef.body)?.appendChild(script);
    });

    const inlineScripts = [...snippet.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    inlineScripts.forEach(([, code], index) => {
        if (!code.trim()) return;
        const script = documentRef.createElement('script');
        script.textContent = code;
        if (script.dataset) script.dataset.libretvAd = `${key}-inline-${index}`;
        else script.setAttribute?.('data-libretv-ad', `${key}-inline-${index}`);
        (container || documentRef.head || documentRef.body)?.appendChild(script);
    });
    return externalScripts.length > 0 || inlineScripts.some(([, code]) => code.trim());
}

export function createJuicyAdsProvider(config = {}) {
    const settings = { enabled: true, slotSnippets: {}, ...config };
    let documentRef = null;
    let initialized = false;

    return {
        enabled: settings.enabled !== false,

        async init(context = {}) {
            documentRef = context.document || globalThis.document;
            if (!documentRef || initialized) return;
            initialized = true;
            if (settings.popunderScriptSrc) {
                appendJuicySnippet(documentRef, documentRef.head, `<script src="${settings.popunderScriptSrc}"></script>`, 'juicyads-popunder');
            }
            if (settings.popunderCode) {
                appendJuicySnippet(documentRef, documentRef.head, settings.popunderCode, 'juicyads-popunder-code');
            }
        },

        async mount(slotName, element, context = {}) {
            if (!element || element.dataset?.libretvAdProvider === 'juicyads') return;
            const doc = context.document || documentRef || globalThis.document;
            const snippet = settings.slotSnippets?.[slotName];
            if (doc && snippet) appendJuicySnippet(doc, element, snippet, `juicyads-${slotName}`);
            if (element.dataset) element.dataset.libretvAdProvider = 'juicyads';
        },

        async destroy() {
            documentRef = null;
            initialized = false;
        }
    };
}
