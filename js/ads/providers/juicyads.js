function copyAttributes(node, openingTag) {
    const attributeSource = openingTag.replace(/^<|>$/g, '');
    const attributes = attributeSource.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g);
    for (const match of attributes) {
        const [, name, doubleQuoted, singleQuoted, bare] = match;
        if (name === 'script' || name === 'ins') continue;
        const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
        node.setAttribute?.(name, value);
    }
}

function appendJuicySnippet(documentRef, container, snippet, key) {
    if (!documentRef || !snippet) return false;
    if (container?.querySelector?.(`script[data-libretv-ad^="${key}"]`)) return false;

    const target = container || documentRef.head || documentRef.body;
    const tokens = snippet.match(/<script\b[^>]*>[\s\S]*?<\/script>|<ins\b[^>]*>\s*<\/ins>/gi) || [];
    let index = 0;
    for (const token of tokens) {
        const openingTag = token.match(/^<[^>]+>/)?.[0] || '';
        const isScript = /^<script\b/i.test(token);
        const tagName = isScript ? 'script' : 'ins';
        const node = documentRef.createElement(tagName);
        copyAttributes(node, openingTag);
        if (isScript) {
            const src = openingTag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
            if (src) node.src = src;
            else node.textContent = token.replace(/^<script\b[^>]*>|<\/script>$/gi, '');
        }
        if (node.dataset) node.dataset.libretvAd = `${key}-${index++}`;
        else node.setAttribute?.('data-libretv-ad', `${key}-${index++}`);
        target?.appendChild(node);
    }
    return tokens.length > 0;
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
            const configuredTarget = settings.popunderContainerId
                ? documentRef.getElementById?.(settings.popunderContainerId)
                : null;
            const popunderTarget = configuredTarget || (settings.popunderPlacement === 'body'
                ? documentRef.body
                : documentRef.head);
            if (settings.popunderScriptSrc) {
                appendJuicySnippet(documentRef, popunderTarget, `<script src="${settings.popunderScriptSrc}"></script>`, 'juicyads-popunder');
            }
            if (settings.popunderCode) {
                appendJuicySnippet(documentRef, popunderTarget, settings.popunderCode, 'juicyads-popunder-code');
            }
        },

        async mount(slotName, element, context = {}) {
            if (!element || element.dataset?.libretvAdProvider === 'juicyads') return;
            const doc = context.document || documentRef || globalThis.document;
            let snippet = settings.slotSnippets?.[slotName];
            if (snippet && typeof snippet === 'object') {
                const viewportWidth = (doc?.defaultView || globalThis).innerWidth || 0;
                const breakpoint = Number.isFinite(snippet.breakpoint) ? snippet.breakpoint : 520;
                snippet = viewportWidth < breakpoint ? snippet.mobile : snippet.desktop;
            }
            if (doc && snippet) appendJuicySnippet(doc, element, snippet, `juicyads-${slotName}`);
            if (element.dataset) element.dataset.libretvAdProvider = 'juicyads';
        },

        async destroy() {
            documentRef = null;
            initialized = false;
        }
    };
}
