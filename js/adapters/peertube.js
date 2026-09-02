// PeerTube network search adapter.
//
// Search is delegated to the public Sepia Search index. Detail requests
// are sent to the originating PeerTube instance, because UUIDs are only
// unique within that instance's API namespace.
(function attachPeerTubeAdapter(root) {
    'use strict';

    const SEARCH_BASE_URL = 'https://sepiasearch.org';
    const SOURCE_CODE = 'peertube';
    const SOURCE_NAME = 'PeerTube Network';
    const DEFAULT_PAGE_SIZE = 20;
    const MAX_PAGE_SIZE = 100;

    function clampInteger(value, fallback, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function pageArgs(page, pageSize) {
        const size = clampInteger(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
        const number = clampInteger(page, 1, 1, 1000000);
        return { page: number, pageSize: size, start: (number - 1) * size };
    }

    function buildSearchUrl(query, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        const paging = pageArgs(page, pageSize);
        const url = new URL('/api/v1/search/videos', `${SEARCH_BASE_URL}/`);
        url.searchParams.set('search', String(query == null ? '' : query).trim());
        url.searchParams.set('start', String(paging.start));
        url.searchParams.set('count', String(paging.pageSize));
        url.searchParams.set('sort', '-match');
        return url.href;
    }

    function buildRecommendationsUrl(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        const paging = pageArgs(page, pageSize);
        const url = new URL('/api/v1/search/videos', `${SEARCH_BASE_URL}/`);
        // Sepia Search requires a non-empty search term. "video" is a
        // broad, deterministic query used only for the recommendation feed;
        // search results still use the user's exact query above.
        url.searchParams.set('search', 'video');
        url.searchParams.set('start', String(paging.start));
        url.searchParams.set('count', String(paging.pageSize));
        url.searchParams.set('sort', '-publishedAt');
        return url.href;
    }

    function normalizeHost(value) {
        let host = String(value ?? '').trim();
        if (!host) return '';
        try {
            if (/^https?:\/\//i.test(host)) host = new URL(host).hostname;
        } catch (_) {
            return '';
        }
        host = host.replace(/^https?:\/\//i, '').split('/')[0].trim().toLowerCase();
        return /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? host : '';
    }

    function sourceParts(value) {
        if (value && typeof value === 'object') {
            const host = normalizeHost(value.host || value.instance || value.url || value.origin);
            const uuid = String(value.uuid || value.videoUuid || value.id || '').trim();
            return { host, uuid };
        }
        const raw = String(value ?? '').trim();
        if (!raw) return { host: '', uuid: '' };
        const encoded = raw.match(/^peertube_(.+?)__(.+)$/);
        if (encoded) return { host: normalizeHost(decodeStablePart(encoded[1])), uuid: decodeStablePart(encoded[2]) };
        const pair = raw.match(/^([^/:]+(?::\d+)?)::(.+)$/);
        if (pair) return { host: normalizeHost(pair[1]), uuid: pair[2] };
        try {
            const url = new URL(raw);
            const segments = url.pathname.split('/').filter(Boolean);
            const uuid = segments[segments.length - 1] || '';
            return { host: normalizeHost(url.hostname), uuid };
        } catch (_) {
            return { host: '', uuid: raw };
        }
    }

    // API ids are passed through the site's conservative /^[\\w-]+$/ check.
    // Keep host/UUID information lossless while escaping punctuation such as
    // dots and colons into two hexadecimal characters.
    function encodeStablePart(value) {
        return encodeURIComponent(String(value ?? ''))
            .replace(/_/g, '_5f')
            .replace(/\./g, '_2e')
            .replace(/%([0-9a-f]{2})/gi, '_$1')
            .replace(/~/g, '_7e');
    }

    function decodeStablePart(value) {
        const escaped = String(value ?? '').replace(/_([0-9a-f]{2})/gi, (_, hex) => `%${hex}`);
        try { return decodeURIComponent(escaped); } catch (_) { return String(value ?? ''); }
    }

    function buildDetailUrl(value) {
        const parts = sourceParts(value);
        if (!parts.host || !parts.uuid) return '';
        return `https://${parts.host}/api/v1/videos/${encodeURIComponent(parts.uuid)}`;
    }

    function safeHttpUrl(value, fallbackHost = '') {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const parsed = new URL(value.trim(), fallbackHost ? `https://${fallbackHost}/` : `${SEARCH_BASE_URL}/`);
            return parsed.protocol === 'https:' ? parsed.href : '';
        } catch (_) {
            return '';
        }
    }

    function isPlayableUrl(value) {
        if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) return false;
        const url = safeHttpUrl(value);
        if (!url) return false;
        if (/(?:^|[\\/_-])audio(?:[-_.]|$)/i.test(new URL(url).pathname)) return false;
        return /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(url);
    }

    function itemHost(item) {
        return normalizeHost(item?.host || item?.instance || item?.instanceHost || item?.origin || item?.account?.host || item?.channel?.host || item?.channel?.account?.host || item?.video?.host || item?.video?.instance || item?.url || item?.videoUrl);
    }

    function itemUuid(item) {
        const direct = String(item?.uuid || item?.videoUuid || item?.video?.uuid || item?.video?.videoUuid || item?.shortUUID || item?.video?.shortUUID || '').trim();
        if (direct) return direct;
        const sourceUrl = item?.url || item?.videoUrl || item?.video?.url || '';
        try {
            const segments = new URL(sourceUrl).pathname.split('/').filter(Boolean);
            return String(segments[segments.length - 1] || '').trim();
        } catch (_) {
            return '';
        }
    }

    function itemId(item) {
        const host = itemHost(item);
        const uuid = itemUuid(item) || String(item?.id ?? '').trim();
        if (!host || !uuid) return '';
        return `peertube_${encodeStablePart(host)}__${encodeStablePart(uuid)}`;
    }

    function thumbnail(item, host) {
        const raw = item?.thumbnailPath || item?.thumbnailUrl || item?.thumbnail || item?.previewPath || item?.previewUrl || '';
        return safeHttpUrl(raw, host);
    }

    function mediaCandidates(item, host) {
        const result = [];
        if (Array.isArray(item?.files)) result.push(...item.files);
        if (Array.isArray(item?.media)) result.push(...item.media);
        if (Array.isArray(item?.streamingPlaylists)) {
            item.streamingPlaylists.forEach(playlist => {
                const playlistUrl = playlist?.playlistUrl || playlist?.url || playlist?.fileUrl;
                if (playlistUrl) result.push({ ...playlist, fileUrl: playlistUrl, mimeType: playlist?.mimeType || 'application/x-mpegURL' });
                if (Array.isArray(playlist?.files)) result.push(...playlist.files);
            });
        }
        const normalized = result.map(file => {
            if (typeof file === 'string') return { url: safeHttpUrl(file, host), file: {} };
            const raw = file?.fileUrl || file?.url || file?.downloadUrl || file?.src || '';
            return { url: safeHttpUrl(raw, host), file: file || {} };
        }).filter(entry => {
            const mime = String(entry.file?.mimeType || entry.file?.mimetype || entry.file?.type || '').toLowerCase();
            if (entry.file?.hasVideo === false || mime.startsWith('audio/')) return false;
            return entry.url && isPlayableUrl(entry.url);
        });
        const seen = new Set();
        return normalized.filter(entry => {
            if (seen.has(entry.url)) return false;
            seen.add(entry.url);
            return true;
        });
    }

    function toVideoItem(item) {
        if (!item || typeof item !== 'object') return null;
        const host = itemHost(item);
        const uuid = itemUuid(item);
        const vodId = itemId(item);
        if (!vodId || !host || !uuid) return null;
        const media = mediaCandidates(item, host);
        const title = String(item.name || item.title || item.displayName || uuid).trim();
        const description = String(item.description || item.summary || '').trim();
        return {
            vod_id: vodId,
            vod_name: title,
            vod_pic: thumbnail(item, host),
            vod_content: description,
            vod_play_url: media.map((entry, index) => `Episode ${index + 1}$${entry.url}`).join('#'),
            source_code: SOURCE_CODE,
            source_name: SOURCE_NAME,
            language: String(item.language?.id || item.language || 'en').slice(0, 8),
            detail_url: buildDetailUrl(vodId),
            instance_host: host,
            video_uuid: uuid,
            api_url: SEARCH_BASE_URL
        };
    }

    function normalizeSearchResponse(payload) {
        const items = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.videos) ? payload.videos : []));
        const list = items.map(toVideoItem).filter(Boolean);
        const rawTotal = payload?.total ?? payload?.totalItems ?? payload?.count;
        const total = Number(rawTotal);
        return { code: 200, list, total: Number.isFinite(total) ? Math.max(0, total) : list.length };
    }

    function normalizeDetailResponse(payload, id) {
        const item = payload?.data && !Array.isArray(payload.data) ? payload.data : (payload?.video && typeof payload.video === 'object' ? payload.video : payload);
        const parts = sourceParts(id);
        const host = itemHost(item) || parts.host;
        const uuid = itemUuid(item) || parts.uuid;
        const media = mediaCandidates(item, host);
        const title = String(item?.name || item?.title || uuid || '').trim();
        const cover = thumbnail(item, host);
        const desc = String(item?.description || item?.summary || '').trim();
        return {
            code: 200,
            episodes: media.map(entry => entry.url),
            title,
            cover,
            desc,
            vod_name: title,
            vod_pic: cover,
            vod_content: desc,
            videoInfo: { title, cover, desc, source_name: SOURCE_NAME, source_code: SOURCE_CODE }
        };
    }

    function normalizeDetailMetadata(payload, id) {
        const item = payload?.data && !Array.isArray(payload.data) ? payload.data : (payload?.video && typeof payload.video === 'object' ? payload.video : payload);
        const parts = sourceParts(id);
        const host = itemHost(item) || parts.host;
        const uuid = itemUuid(item) || parts.uuid;
        return {
            title: String(item?.name || item?.title || uuid || '').trim(),
            cover: thumbnail(item, host),
            desc: String(item?.description || item?.summary || '').trim()
        };
    }

    async function responseJson(response) {
        if (response && typeof response.json === 'function') return response.json();
        return JSON.parse(await response.text());
    }

    async function getStats({ signal } = {}) {
        const fetchFn = root.fetch || (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) throw new Error('fetch unavailable');
        try {
            const response = await fetchFn(buildSearchUrl('', 1, 1), { signal, headers: { Accept: 'application/json' } });
            if (!response?.ok) throw new Error(`PeerTube stats request failed: ${response?.status || 0}`);
            const payload = await responseJson(response);
            const rawTotal = payload?.total ?? payload?.totalItems ?? payload?.count ?? payload?.data?.total;
            const catalogCount = Number(rawTotal);
            if (!Number.isFinite(catalogCount)) throw new Error('PeerTube stats total missing');
            return {
                catalogCount: Math.max(0, catalogCount),
                playableCount: null,
                countKind: 'estimated',
                updatedAt: new Date().toISOString(),
                sampleSize: 0,
                status: 'available'
            };
        } catch (error) {
            return {
                catalogCount: null,
                playableCount: null,
                countKind: 'unavailable',
                updatedAt: new Date().toISOString(),
                sampleSize: 0,
                status: 'error',
                error: error?.message || 'stats unavailable'
            };
        }
    }

    const adapter = {
        BASE_URL: SEARCH_BASE_URL,
        API_BASE_URL: SEARCH_BASE_URL,
        SOURCE_CODE,
        SOURCE_NAME,
        buildSearchUrl,
        buildRecommendationsUrl,
        buildDetailUrl,
        normalizeSearchResponse,
        normalizeDetailResponse,
        normalizeDetailMetadata,
        getStats,
        isPlayableUrl
    };

    root.PeerTubeAdapter = adapter;
    root.VIDEO_SOURCE_ADAPTERS = root.VIDEO_SOURCE_ADAPTERS || {};
    root.VIDEO_SOURCE_ADAPTERS.peertube = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
