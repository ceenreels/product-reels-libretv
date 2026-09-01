// NASA Image and Video Library adapter.
//
// The adapter intentionally has no dependency on the application runtime. It
// can be loaded as a regular script (window.NasaAdapter) or required by a
// CommonJS test/utility.
(function attachNasaAdapter(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.NasaAdapter = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNasaAdapter() {
    const API_BASE = 'https://images-api.nasa.gov';
    const ASSET_HOST = 'images-assets.nasa.gov';
    const SOURCE_CODE = 'nasa';
    const SOURCE_NAME = 'NASA';
    const DEFAULT_PAGE_SIZE = 20;
    const MAX_PAGE_SIZE = 100;

    function clampInteger(value, fallback, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function normalizeHttpUrl(value, options = {}) {
        if (typeof value !== 'string' || !value.trim()) return '';
        const source = value.trim();
        try {
            const parsed = new URL(source);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            // NASA still emits http links in collection/search responses. The
            // HTTPS asset endpoint is equivalent and avoids mixed-content
            // failures when the site is served from GitHub Pages.
            if (parsed.hostname === ASSET_HOST || parsed.hostname === 'images-api.nasa.gov') {
                parsed.protocol = 'https:';
            }
            const normalized = parsed.href;
            // Keep raw spaces from NASA collection manifests in episode URLs.
            // Browsers encode them when assigning video.src, while retaining
            // them here preserves the provider's canonical manifest spelling.
            if (options.preserveSpaces && parsed.hostname === ASSET_HOST && /\s/.test(source)) {
                return normalized.replace(/%20/g, ' ');
            }
            return normalized;
        } catch (_) {
            return '';
        }
    }

    // Encode the NASA id as UTF-8 bytes represented by hexadecimal characters.
    // Unlike encodeURIComponent this produces an id that is safe for DOM ids,
    // path segments, and the app's conservative /^[\w-]+$/ validation.
    function encodeUtf8Hex(value) {
        const encoded = encodeURIComponent(String(value));
        let result = '';
        for (let index = 0; index < encoded.length;) {
            if (encoded[index] === '%' && /^[0-9a-f]{2}$/i.test(encoded.slice(index + 1, index + 3))) {
                result += encoded.slice(index + 1, index + 3).toLowerCase();
                index += 3;
            } else {
                result += encoded.charCodeAt(index).toString(16).padStart(2, '0');
                index += 1;
            }
        }
        return result;
    }

    function decodeUtf8Hex(value) {
        if (typeof value !== 'string' || !value || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value)) return '';
        let encoded = '';
        for (let index = 0; index < value.length; index += 2) encoded += `%${value.slice(index, index + 2)}`;
        try {
            return decodeURIComponent(encoded);
        } catch (_) {
            return '';
        }
    }

    function toStableId(nasaId) {
        const value = String(nasaId == null ? '' : nasaId).trim();
        if (!value) return '';
        return `nasa_${encodeUtf8Hex(value)}`;
    }

    function fromStableId(stableId) {
        const value = String(stableId == null ? '' : stableId).trim();
        if (!/^nasa_[0-9a-f]+$/i.test(value)) return value;
        return decodeUtf8Hex(value.slice(5)) || value;
    }

    function buildSearchUrl(query, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        const url = new URL('/search', `${API_BASE}/`);
        url.searchParams.set('q', String(query == null ? '' : query).trim());
        url.searchParams.set('page', String(clampInteger(page, 1, 1, 100000)));
        url.searchParams.set('page_size', String(clampInteger(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)));
        url.searchParams.set('media_type', 'video');
        return url.href.replace(/\+/g, '%20');
    }

    function buildRecommendationsUrl(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        return buildSearchUrl('', page, pageSize);
    }

    function buildDetailUrl(identifierOrHref) {
        const value = identifierOrHref && typeof identifierOrHref === 'object'
            ? (identifierOrHref.href || identifierOrHref.detail_url || identifierOrHref.nasa_id || identifierOrHref.id)
            : identifierOrHref;
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        const absoluteUrl = normalizeHttpUrl(raw);
        if (absoluteUrl) return absoluteUrl;

        const nasaId = fromStableId(raw);
        const url = new URL(`/asset/${encodeURIComponent(nasaId)}`, `${API_BASE}/`);
        return url.href.replace(/\+/g, '%20');
    }

    function getCollectionUrl(payload) {
        const collection = payload && payload.collection && typeof payload.collection === 'object'
            ? payload.collection
            : payload;
        if (!collection || !Array.isArray(collection.items)) return '';
        const match = collection.items.find(item => {
            const data = firstDataRecord(item);
            return data && (!data.media_type || data.media_type === 'video') && item && item.href;
        });
        return match ? normalizeHttpUrl(match.href) : '';
    }

    function firstDataRecord(item) {
        if (!item || typeof item !== 'object') return null;
        if (Array.isArray(item.data)) return item.data.find(record => record && record.media_type === 'video') || item.data[0] || null;
        return item.data && typeof item.data === 'object' ? item.data : item;
    }

    function chooseThumbnail(links) {
        if (!Array.isArray(links)) return '';
        const candidates = links
            .map(link => ({ ...link, href: normalizeHttpUrl(link && link.href) }))
            .filter(link => link.href && (link.render === 'image' || link.rel === 'preview' || /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(link.href)));
        if (!candidates.length) return '';
        const by = predicate => candidates.find(predicate);
        return (by(link => link.rel === 'preview' && /~thumb\.(?:jpe?g|png|webp)(?:$|\?)/i.test(link.href))
            || by(link => /~medium\.(?:jpe?g|png|webp)(?:$|\?)/i.test(link.href))
            || by(link => link.rel === 'preview')
            || by(link => link.render === 'image')
            || candidates[0]).href;
    }

    function normalizeSearchResponse(payload) {
        const collection = payload && payload.collection && typeof payload.collection === 'object'
            ? payload.collection
            : payload;
        if (!collection || !Array.isArray(collection.items)) return [];

        const seen = new Set();
        return collection.items.reduce((result, item) => {
            const data = firstDataRecord(item);
            if (!data || (data.media_type && data.media_type !== 'video')) return result;
            const nasaId = String(data.nasa_id || '').trim();
            if (!nasaId) return result;
            const vodId = toStableId(nasaId);
            if (!vodId || seen.has(vodId)) return result;
            seen.add(vodId);

            const title = String(data.title || nasaId).trim();
            const description = String(data.description || '').trim();
            const date = String(data.date_created || '').trim();
            const detailUrl = buildDetailUrl(item && item.href ? item.href : nasaId);
            result.push({
                vod_id: vodId,
                vod_name: title,
                vod_pic: chooseThumbnail(item && item.links),
                vod_content: description,
                vod_blurb: description,
                vod_year: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
                vod_remarks: String(data.center || '').trim(),
                type_name: 'NASA Video',
                language: 'en',
                nasa_id: nasaId,
                media_type: 'video',
                detail_url: detailUrl,
                vod_detail_url: detailUrl,
                source_code: SOURCE_CODE,
                source_name: SOURCE_NAME,
                api_url: API_BASE
            });
            return result;
        }, []);
    }

    function renditionRank(url) {
        const pathname = (() => {
            try { return new URL(url).pathname.toLowerCase(); } catch (_) { return url.toLowerCase(); }
        })();
        if (/(?:~|[-_])medium\.mp4$/.test(pathname)) return 0;
        if (/(?:~|[-_])small\.mp4$/.test(pathname)) return 1;
        if (/(?:~|[-_])mobile\.mp4$/.test(pathname)) return 2;
        if (/(?:~|[-_])preview\.mp4$/.test(pathname)) return 3;
        if (/(?:~|[-_])large\.mp4$/.test(pathname)) return 4;
        if (/(?:~|[-_])orig(?:inal)?\.mp4$/.test(pathname)) return 5;
        return 6;
    }

    function renditionGroup(url) {
        try {
            const parsed = new URL(url);
            const pathname = parsed.pathname.replace(/(?:~|[-_])(?:orig(?:inal)?|large|medium|small|mobile|preview)\.mp4$/i, '.mp4');
            return `${parsed.origin}${pathname}`;
        } catch (_) {
            return url.replace(/(?:~|[-_])(?:orig(?:inal)?|large|medium|small|mobile|preview)\.mp4(?:$|\?)/i, '.mp4');
        }
    }

    function normalizeDetailResponse(payload) {
        const collection = Array.isArray(payload)
            ? payload
            : (payload && payload.collection && Array.isArray(payload.collection.items)
                ? payload.collection.items
                : (payload && Array.isArray(payload.collection) ? payload.collection : []));
        const groups = new Map();
        collection.forEach(entry => {
            const rawUrl = typeof entry === 'string' ? entry : entry?.href;
            const url = normalizeHttpUrl(rawUrl, { preserveSpaces: true });
            if (!url || !/\.mp4(?:$|\?)/i.test(url)) return;
            const key = renditionGroup(url);
            const current = groups.get(key);
            if (!current || renditionRank(url) < renditionRank(current)) groups.set(key, url);
        });
        return [...groups.values()];
    }

    function normalizeDetailMetadata(payload, id) {
        const collection = payload && payload.collection && Array.isArray(payload.collection.items)
            ? payload.collection.items
            : [];
        const image = collection
            .map(entry => normalizeHttpUrl(typeof entry === 'string' ? entry : entry?.href))
            .find(url => /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url));
        return {
            title: fromStableId(id),
            cover: image || ''
        };
    }

    return {
        BASE_URL: API_BASE,
        API_BASE_URL: API_BASE,
        SOURCE_CODE,
        SOURCE_NAME,
        apiBase: API_BASE,
        sourceCode: SOURCE_CODE,
        sourceName: SOURCE_NAME,
        buildSearchUrl,
        buildRecommendationsUrl,
        buildDetailUrl,
        getCollectionUrl,
        normalizeSearchResponse,
        normalizeDetailResponse,
        normalizeDetailMetadata,
        toStableId,
        fromStableId
    };
}));
