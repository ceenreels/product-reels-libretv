(function attachRecommendationCache(root) {
    const keyPrefix = 'libretv:recommendations:';

    function createRecommendationCache(storage = root?.localStorage, now = () => Date.now()) {
        function keyFor(source) {
            return `${keyPrefix}${String(source || '').trim()}`;
        }

        return {
            save(source, items) {
                if (!storage || !source || !Array.isArray(items) || items.length === 0) return false;
                try {
                    storage.setItem(keyFor(source), JSON.stringify({ savedAt: now(), items }));
                    return true;
                } catch (error) {
                    return false;
                }
            },

            read(source, maxAgeMs) {
                if (!storage || !source || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return null;
                try {
                    const raw = storage.getItem(keyFor(source));
                    if (!raw) return null;
                    const payload = JSON.parse(raw);
                    if (!payload || !Number.isFinite(payload.savedAt) || !Array.isArray(payload.items)) return null;
                    if (now() - payload.savedAt > maxAgeMs) return null;
                    return payload.items;
                } catch (error) {
                    return null;
                }
            }
        };
    }

    root.createRecommendationCache = createRecommendationCache;
})(globalThis);
