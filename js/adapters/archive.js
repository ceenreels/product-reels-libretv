// Internet Archive Movies adapter.
//
// The adapter only talks to Internet Archive's public JSON endpoints. It is
// intentionally dependency-free so it can be loaded by the static site before
// js/api.js and by the Node VM test harness.
(function attachArchiveAdapter(root) {
    'use strict';

    const API_BASE_URL = 'https://archive.org';
    const SOURCE_CODE = 'archive';
    const SOURCE_NAME = 'Internet Archive';
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
        const term = String(query == null ? '' : query).trim();
        const q = term ? `mediatype:movies AND (${term})` : 'mediatype:movies';
        const url = new URL('/advancedsearch.php', `${API_BASE_URL}/`);
        url.searchParams.set('q', q);
        ['identifier', 'title', 'description', 'year', 'creator'].forEach(field => url.searchParams.append('fl[]', field));
        url.searchParams.set('rows', String(paging.pageSize));
        url.searchParams.set('start', String(paging.start));
        url.searchParams.set('output', 'json');
        return url.href;
    }

    function buildRecommendationsUrl(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        return buildSearchUrl('', page, pageSize);
    }

    function identifierFrom(value) {
        if (value && typeof value === 'object') {
            return value.identifier ?? value.id ?? value.itemId ?? '';
        }
        return value ?? '';
    }

    function buildDetailUrl(value) {
        const identifier = String(identifierFrom(value)).trim();
        if (!identifier) return '';
        return `${API_BASE_URL}/metadata/${encodeURIComponent(identifier)}`;
    }

    function safeHttpUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        if (!/^https:\/\//i.test(value.trim())) return '';
        try {
            const parsed = new URL(value.trim());
            return parsed.protocol === 'https:' ? parsed.href : '';
        } catch (_) {
            return '';
        }
    }

    function isPlayableUrl(value) {
        const url = safeHttpUrl(value);
        if (!url) return false;
        return /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(url);
    }

    function itemIdentifier(item) {
        return String(item?.identifier ?? item?.id ?? '').trim();
    }

    function itemTitle(item, identifier) {
        return String(item?.title ?? item?.name ?? identifier ?? '').trim();
    }

    function itemDescription(item) {
        const description = item?.description ?? item?.abstract ?? item?.summary ?? '';
        return String(description).trim();
    }

    function thumbnailUrl(identifier) {
        return identifier ? `${API_BASE_URL}/services/img/${encodeURIComponent(identifier)}` : '';
    }

    function normalizeSearchResponse(payload) {
        const response = payload?.response && typeof payload.response === 'object' ? payload.response : payload;
        const docs = Array.isArray(response?.docs) ? response.docs : [];
        const list = docs.map(item => {
            const identifier = itemIdentifier(item);
            if (!identifier) return null;
            return {
                vod_id: identifier,
                vod_name: itemTitle(item, identifier),
                vod_pic: thumbnailUrl(identifier),
                vod_content: itemDescription(item),
                vod_year: String(item?.year ?? '').trim(),
                vod_play_url: '',
                source_code: SOURCE_CODE,
                source_name: SOURCE_NAME,
                language: 'en',
                detail_url: buildDetailUrl(identifier),
                api_url: API_BASE_URL
            };
        }).filter(Boolean);
        const total = Number(response?.numFound ?? response?.total ?? list.length);
        return { code: 200, list, total: Number.isFinite(total) ? Math.max(0, total) : list.length };
    }

    function fileUrl(identifier, file) {
        const raw = file?.name ?? file?.file ?? '';
        if (!identifier || typeof raw !== 'string' || !raw.trim()) return '';
        return `${API_BASE_URL}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(raw.trim())}`;
    }

    function fileIsPlayable(file) {
        if (!file || typeof file !== 'object' || file.private) return false;
        const name = String(file.name ?? file.file ?? '').trim();
        const format = String(file.format ?? '').toLowerCase();
        const mime = String(file.mimetype ?? file.mimeType ?? file.type ?? '').toLowerCase();
        if (!name) return false;
        if (mime.startsWith('audio/')) return false;
        if (/\.(?:mp4|webm|m3u8)$/i.test(name)) {
            if (/\.(?:m3u8)$/i.test(name)) return true;
            return mime.startsWith('video/') || /mpeg-?4|h\.264|webm|video/i.test(format) || !mime;
        }
        return mime === 'video/mp4' || mime === 'video/webm' || /mpeg-?4|webm/i.test(format);
    }

    function fileScore(file) {
        const name = String(file?.name ?? '').toLowerCase();
        const format = String(file?.format ?? '').toLowerCase();
        const size = Number(file?.size) || 0;
        const extensionScore = /\.mp4$/i.test(name) ? 1000000000000 : /\.webm$/i.test(name) ? 500000000000 : 0;
        const derivativePenalty = /(?:_?\d+kb|_?thumb|_?sample|_?preview|_?low|_?small)/i.test(name) ? 100000000000 : 0;
        const formatScore = /mpeg-?4|h\.264/i.test(format) ? 1000000 : 0;
        return extensionScore + formatScore + size - derivativePenalty;
    }

    function playableFiles(payload, identifier) {
        const files = Array.isArray(payload?.files) ? payload.files : [];
        const candidates = files
            .filter(fileIsPlayable)
            .map(file => ({ file, url: safeHttpUrl(fileUrl(identifier, file)) }))
            .filter(entry => entry.url && isPlayableUrl(entry.url));
        candidates.sort((a, b) => fileScore(b.file) - fileScore(a.file));
        return candidates.length ? [candidates[0].url] : [];
    }

    function normalizeDetailResponse(payload, id) {
        const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : payload;
        const identifier = itemIdentifier(metadata) || String(identifierFrom(id)).trim();
        const episodes = playableFiles(payload, identifier);
        const title = itemTitle(metadata, identifier);
        const cover = thumbnailUrl(identifier);
        const desc = itemDescription(metadata);
        return {
            code: 200,
            episodes,
            title,
            cover,
            desc,
            vod_name: title,
            vod_pic: cover,
            vod_content: desc,
            videoInfo: {
                title,
                cover,
                desc,
                year: String(metadata?.year ?? '').trim(),
                source_name: SOURCE_NAME,
                source_code: SOURCE_CODE
            }
        };
    }

    function normalizeDetailMetadata(payload, id) {
        const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : payload;
        const identifier = itemIdentifier(metadata) || String(identifierFrom(id)).trim();
        return {
            title: itemTitle(metadata, identifier),
            cover: thumbnailUrl(identifier),
            desc: itemDescription(metadata),
            year: String(metadata?.year ?? '').trim()
        };
    }

    async function responseJson(response) {
        if (response && typeof response.json === 'function') return response.json();
        const raw = await response.text();
        return JSON.parse(raw);
    }

    async function getStats({ signal } = {}) {
        const url = buildSearchUrl('', 1, 1);
        const fetchFn = root.fetch || (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) throw new Error('fetch unavailable');
        try {
            const response = await fetchFn(url, { signal, headers: { Accept: 'application/json' } });
            if (!response?.ok) throw new Error(`Internet Archive stats request failed: ${response?.status || 0}`);
            const payload = await responseJson(response);
            const rawTotal = payload?.response?.numFound ?? payload?.numFound ?? payload?.response?.total;
            const catalogCount = Number(rawTotal);
            if (!Number.isFinite(catalogCount)) throw new Error('Internet Archive stats total missing');
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
        BASE_URL: API_BASE_URL,
        API_BASE_URL,
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

    root.ArchiveAdapter = adapter;
    root.VIDEO_SOURCE_ADAPTERS = root.VIDEO_SOURCE_ADAPTERS || {};
    root.VIDEO_SOURCE_ADAPTERS.archive = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
