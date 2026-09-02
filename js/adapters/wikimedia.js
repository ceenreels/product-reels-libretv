// Wikimedia Commons video-file adapter.
//
// Commons exposes a public MediaWiki API. Search returns file pages while
// imageinfo supplies the direct media URL and a thumbnail for the card.
(function attachWikimediaAdapter(root) {
    'use strict';

    const API_BASE_URL = 'https://commons.wikimedia.org/w/api.php';
    const SOURCE_CODE = 'wikimedia';
    const SOURCE_NAME = 'Wikimedia Commons';
    const DEFAULT_PAGE_SIZE = 20;
    const MAX_PAGE_SIZE = 50;
    const MEDIA_HOSTS = new Set(['commons.wikimedia.org', 'upload.wikimedia.org', 'www.wikimedia.org']);

    function clampInteger(value, fallback, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function pageArgs(page, pageSize) {
        const size = clampInteger(pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
        const number = clampInteger(page, 1, 1, 1000000);
        return { page: number, pageSize: size, offset: (number - 1) * size };
    }

    function buildSearchUrl(query, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        const paging = pageArgs(page, pageSize);
        const term = String(query == null ? '' : query).trim();
        const url = new URL(API_BASE_URL);
        url.searchParams.set('action', 'query');
        url.searchParams.set('format', 'json');
        url.searchParams.set('formatversion', '2');
        url.searchParams.set('generator', 'search');
        url.searchParams.set('gsrsearch', term ? `incategory:Videos ${term}` : 'incategory:Videos');
        url.searchParams.set('gsrnamespace', '6');
        url.searchParams.set('gsrlimit', String(paging.pageSize));
        if (paging.offset > 0) url.searchParams.set('gsroffset', String(paging.offset));
        url.searchParams.set('prop', 'imageinfo');
        url.searchParams.set('iiprop', 'url|mime|size|thumburl|extmetadata');
        url.searchParams.set('iiurlwidth', '640');
        url.searchParams.set('origin', '*');
        return url.href.replace(/\+/g, '%20');
    }

    function buildRecommendationsUrl(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
        return buildSearchUrl('', page, pageSize);
    }

    function titleFrom(value) {
        if (value && typeof value === 'object') return String(value.title || value.name || value.id || '').trim();
        return String(value ?? '').trim();
    }

    function buildDetailUrl(value) {
        const title = titleFrom(value);
        if (!title) return '';
        const url = new URL(API_BASE_URL);
        url.searchParams.set('action', 'query');
        url.searchParams.set('format', 'json');
        url.searchParams.set('formatversion', '2');
        url.searchParams.set('titles', title);
        url.searchParams.set('prop', 'imageinfo');
        url.searchParams.set('iiprop', 'url|mime|size|thumburl|extmetadata');
        url.searchParams.set('iiurlwidth', '640');
        url.searchParams.set('origin', '*');
        return url.href.replace(/\+/g, '%20');
    }

    function safeMediaUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const parsed = new URL(value.trim());
            if (parsed.protocol !== 'https:' || !MEDIA_HOSTS.has(parsed.hostname.toLowerCase())) return '';
            return parsed.href;
        } catch (_) {
            return '';
        }
    }

    function isPlayableUrl(value) {
        const url = safeMediaUrl(value);
        return Boolean(url && /\.(?:mp4|webm|ogv|m3u8)(?:$|[?#])/i.test(url));
    }

    function mediaRank(info) {
        const mime = String(info?.mime || '').toLowerCase();
        const url = String(info?.url || '').toLowerCase();
        if (mime === 'video/mp4' || /\.mp4(?:$|[?#])/.test(url)) return 0;
        if (mime === 'video/webm' || /\.webm(?:$|[?#])/.test(url)) return 1;
        if (mime === 'video/ogg' || /\.ogv(?:$|[?#])/.test(url)) return 2;
        return 3;
    }

    function chooseMedia(imageInfo) {
        if (!Array.isArray(imageInfo)) return null;
        const candidates = imageInfo.map(info => ({
            info: info || {},
            url: safeMediaUrl(info?.url || info?.descriptionurl || '')
        })).filter(entry => entry.url && isPlayableUrl(entry.url));
        candidates.sort((a, b) => mediaRank(a.info) - mediaRank(b.info));
        return candidates[0] || null;
    }

    function chooseThumbnail(imageInfo) {
        if (!Array.isArray(imageInfo)) return '';
        for (const info of imageInfo) {
            const thumb = safeMediaUrl(info?.thumburl || '');
            if (thumb) return thumb;
        }
        return '';
    }

    function pageEntries(payload) {
        const pages = payload?.query?.pages;
        if (Array.isArray(pages)) return pages;
        if (pages && typeof pages === 'object') return Object.values(pages);
        return [];
    }

    function descriptionFrom(info) {
        const ext = info?.extmetadata || {};
        const raw = ext.ImageDescription?.value || ext.ObjectName?.value || '';
        return String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function toVideoItem(page) {
        if (!page || typeof page !== 'object') return null;
        const title = titleFrom(page.title);
        if (!title) return null;
        const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo : [];
        const media = chooseMedia(imageInfo);
        // File pages without a browser-compatible rendition are still omitted
        // from search cards so users never open a dead detail page.
        if (!media) return null;
        const info = media.info;
        const description = descriptionFrom(info);
        return {
            vod_id: title,
            vod_name: title.replace(/^File:/i, ''),
            vod_pic: chooseThumbnail(imageInfo),
            vod_content: description,
            vod_play_url: `Episode 1$${media.url}`,
            source_code: SOURCE_CODE,
            source_name: SOURCE_NAME,
            language: 'en',
            detail_url: buildDetailUrl(title),
            file_title: title,
            api_url: API_BASE_URL
        };
    }

    function normalizeSearchResponse(payload) {
        const list = pageEntries(payload).map(toVideoItem).filter(Boolean);
        const rawTotal = payload?.query?.searchinfo?.totalhits ?? payload?.query?.searchinfo?.total ?? payload?.total;
        const total = Number(rawTotal);
        return { code: 200, list, total: Number.isFinite(total) ? Math.max(0, total) : list.length };
    }

    function normalizeDetailResponse(payload, id) {
        const page = pageEntries(payload)[0] || {};
        const title = titleFrom(page.title) || titleFrom(id);
        const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo : [];
        const media = chooseMedia(imageInfo);
        const cover = chooseThumbnail(imageInfo);
        const desc = descriptionFrom(imageInfo[0]);
        return {
            code: 200,
            episodes: media ? [media.url] : [],
            title: title.replace(/^File:/i, ''),
            cover,
            desc,
            vod_name: title.replace(/^File:/i, ''),
            vod_pic: cover,
            vod_content: desc,
            videoInfo: {
                title: title.replace(/^File:/i, ''),
                cover,
                desc,
                source_name: SOURCE_NAME,
                source_code: SOURCE_CODE
            }
        };
    }

    function normalizeDetailMetadata(payload, id) {
        const page = pageEntries(payload)[0] || {};
        const title = titleFrom(page.title) || titleFrom(id);
        const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo : [];
        return {
            title: title.replace(/^File:/i, ''),
            cover: chooseThumbnail(imageInfo),
            desc: descriptionFrom(imageInfo[0])
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
            if (!response?.ok) throw new Error(`Wikimedia stats request failed: ${response?.status || 0}`);
            const payload = await responseJson(response);
            const rawTotal = payload?.query?.searchinfo?.totalhits ?? payload?.query?.searchinfo?.total;
            const catalogCount = Number(rawTotal);
            if (!Number.isFinite(catalogCount)) throw new Error('Wikimedia stats total missing');
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

    root.WikimediaAdapter = adapter;
    root.VIDEO_SOURCE_ADAPTERS = root.VIDEO_SOURCE_ADAPTERS || {};
    root.VIDEO_SOURCE_ADAPTERS.wikimedia = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
