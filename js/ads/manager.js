/**
 * Platform-agnostic ad slot coordinator.
 * Providers are intentionally isolated: one broken network/script must not
 * prevent another provider or the rest of the page from loading.
 */
export function createAdManager({ document: documentRef = globalThis.document, providers = {}, slots = {}, logger = console } = {}) {
    const activeProviders = new Map();
    const mountedSlots = new Set();

    function isSlotEligible(slotConfig, element) {
        const viewportWidth = Number((documentRef?.defaultView || globalThis).innerWidth) || 0;
        if (Number.isFinite(slotConfig.minViewport) && viewportWidth < slotConfig.minViewport) return false;
        if (Number.isFinite(slotConfig.maxViewport) && viewportWidth > slotConfig.maxViewport) return false;
        if (typeof slotConfig.eligible === 'function') {
            try {
                return slotConfig.eligible({ document: documentRef, element, viewportWidth });
            } catch (error) {
                logger?.warn?.(`[ads] slot eligibility check failed`, error);
                return false;
            }
        }
        return true;
    }

    async function init() {
        await Promise.all(Object.entries(providers).map(async ([name, provider]) => {
            if (!provider || provider.enabled === false) return;

            try {
                await provider.init?.({ document: documentRef, logger });
                activeProviders.set(name, provider);
            } catch (error) {
                logger?.warn?.(`[ads] ${name} provider initialization failed`, error);
            }
        }));
        return activeProviders;
    }

    async function mount(slotName) {
        if (mountedSlots.has(slotName)) return false;

        const slotConfig = slots[slotName] || {};
        const provider = activeProviders.get(slotConfig.provider);
        const elementId = slotConfig.elementId || slotName;
        const element = documentRef?.getElementById?.(elementId);
        if (!provider || !element || !isSlotEligible(slotConfig, element)) return false;

        try {
            await provider.mount?.(slotName, element, {
                document: documentRef,
                logger,
                config: slotConfig
            });
            mountedSlots.add(slotName);
            return true;
        } catch (error) {
            logger?.warn?.(`[ads] ${slotConfig.provider} failed to mount ${slotName}`, error);
            return false;
        }
    }

    async function mountAll() {
        for (const slotName of Object.keys(slots)) {
            await mount(slotName);
        }
    }

    async function destroy() {
        await Promise.all([...activeProviders.values()].map(async provider => {
            try {
                await provider.destroy?.({ document: documentRef, logger });
            } catch (error) {
                logger?.warn?.('[ads] provider cleanup failed', error);
            }
        }));
        mountedSlots.clear();
        activeProviders.clear();
    }

    return {
        init,
        mount,
        mountAll,
        destroy,
        activeProviders,
        mountedSlots
    };
}
