/*
 * Blender Open Movies PeerTube adapter.
 *
 * The application is served as static files, so this module deliberately has
 * no imports or runtime dependencies.  It publishes BlenderAdapter on the
 * global object and can therefore be loaded with a regular <script> tag or in
 * the VM used by the test suite.
 */
(function exposeBlenderAdapter(root) {
    'use strict';

    const BASE_URL = 'https://video.blender.org';
    const API_BASE_URL = `${BASE_URL}/api/v1`;
    const SOURCE_CODE = 'blender';
    const SOURCE_NAME = 'Blender PeerTube';
    const MAX_PAGE_SIZE = 100;

    function integerOr(value, fallback) {
        const number = Number.parseInt(value, 10);
        return Number.isFinite(number) ? number : fallback;
    }

    function pageStart(page, count) {
        const safePage = Math.max(1, integerOr(page, 1));
        const safeCount = Math.min(MAX_PAGE_SIZE, Math.max(1, integerOr(count, 20)));
        return { page: safePage, count: safeCount, start: (safePage - 1) * safeCount };
    }

    function buildSearchUrl(query, page = 1, count = 20) {
        const paging = pageStart(page, count);
        const params = new URLSearchParams();
        params.set('search', String(query ?? '').trim());
        params.set('start', String(paging.start));
        params.set('count', String(paging.count));
        params.set('sort', '-match');
        return `${API_BASE_URL}/search/videos?${params.toString()}`;
    }

    function buildRecommendationsUrl(page = 1, count = 20) {
        const paging = pageStart(page, count);
        const params = new URLSearchParams();
        params.set('start', String(paging.start));
        params.set('count', String(paging.count));
        params.set('sort', '-publishedAt');
        return `${API_BASE_URL}/videos?${params.toString()}`;
    }

    function buildDetailUrl(idOrUuid) {
        const value = idOrUuid && typeof idOrUuid === 'object'
            ? (idOrUuid.uuid ?? idOrUuid.id ?? idOrUuid.videoId)
            : idOrUuid;
        return `${API_BASE_URL}/videos/${encodeURIComponent(String(value ?? ''))}`;
    }

    function absoluteUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const parsed = new URL(value.trim(), BASE_URL);
            return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
        } catch (_) {
            return '';
        }
    }

    function candidateUrl(file) {
        if (typeof file === 'string') return file;
        if (!file || typeof file !== 'object') return '';
        return file.fileUrl || file.url || file.downloadUrl || file.src || '';
    }

    function isMp4File(file) {
        const url = candidateUrl(file);
        if (!url) return false;
        // PeerTube can expose audio-only MP4 renditions beside the playable
        // video files. An omitted hasVideo flag remains eligible for older
        // responses, but an explicit false must never become an episode.
        if (typeof file === 'object' && file && file.hasVideo === false) return false;
        const mimeType = typeof file === 'object' && file ? String(file.mimeType || file.type || '').toLowerCase() : '';
        if (mimeType) return mimeType === 'video/mp4' || mimeType.includes('video/mp4');
        return /\.mp4(?:[?#]|$)/i.test(url);
    }

    function resolutionScore(file) {
        if (!file || typeof file !== 'object') return 0;
        const resolution = file.resolution;
        const candidates = [resolution?.id, resolution?.height, file.height, file.videoHeight, file.bitrate];
        for (const value of candidates) {
            const score = Number(value);
            if (Number.isFinite(score) && score > 0) return score;
        }
        const match = candidateUrl(file).match(/(?:-|_|~)(\d{3,4})(?:p)?\.mp4(?:[?#]|$)/i);
        return match ? Number(match[1]) : 0;
    }

    function collectMp4Urls(video) {
        if (!video || typeof video !== 'object') return [];
        const files = [];
        if (Array.isArray(video.files)) files.push(...video.files);
        if (Array.isArray(video.streamingPlaylists)) {
            video.streamingPlaylists.forEach(playlist => {
                if (Array.isArray(playlist?.files)) files.push(...playlist.files);
            });
        }
        if (Array.isArray(video.media)) files.push(...video.media);
        [video.file, video.fileUrl, video.downloadUrl].forEach(file => {
            if (file) files.push(file);
        });

        const candidates = [];
        const seen = new Set();
        files.forEach(file => {
            if (!isMp4File(file)) return;
            const url = absoluteUrl(candidateUrl(file));
            if (!url || seen.has(url)) return;
            seen.add(url);
            candidates.push({ url, score: resolutionScore(file) });
        });
        candidates.sort((a, b) => b.score - a.score);
        return candidates.length ? [candidates[0].url] : [];
    }

    function toVideoItem(video) {
        if (!video || typeof video !== 'object') return null;
        const uuid = video.uuid ?? video.videoUuid ?? video.slug;
        const id = uuid ?? video.id ?? video.videoId;
        if (id === undefined || id === null || String(id).trim() === '') return null;

        const episodes = collectMp4Urls(video);
        const title = String(video.name ?? video.title ?? video.displayName ?? '').trim();
        const description = String(video.description ?? video.summary ?? '').trim();
        const thumbnailVariant = Array.isArray(video.thumbnails) ? video.thumbnails.find(entry => candidateUrl(entry)) : null;
        const thumbnail = absoluteUrl(
            video.thumbnailUrl || video.thumbnailPath || video.thumbnail || video.previewPath || video.preview || candidateUrl(thumbnailVariant)
        );
        const sourceId = video.id ?? video.videoId ?? uuid ?? id;

        return {
            vod_id: String(id),
            source_id: String(sourceId),
            vod_name: title,
            vod_pic: thumbnail,
            vod_content: description,
            vod_play_url: episodes.map((url, index) => `Episode ${index + 1}$${url}`).join('#'),
            source_code: SOURCE_CODE,
            source_name: SOURCE_NAME,
        };
    }

    function searchItems(payload) {
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.videos)) return payload.videos;
        if (Array.isArray(payload?.results)) return payload.results;
        return [];
    }

    function normalizeSearchResponse(payload) {
        const rawItems = searchItems(payload);
        const list = rawItems.map(toVideoItem).filter(Boolean);
        const totalValue = payload && typeof payload === 'object'
            ? (payload.total ?? payload.totalItems ?? payload.count)
            : undefined;
        const parsedTotal = integerOr(totalValue, list.length);
        return { code: 200, list, total: Math.max(0, parsedTotal) };
    }

    function detailItem(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.data && !Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.data)) return payload.data[0] || null;
        if (payload.video && typeof payload.video === 'object') return payload.video;
        return payload;
    }

    function normalizeDetailResponse(payload) {
        const video = detailItem(payload);
        const item = toVideoItem(video);
        const episodes = item ? item.vod_play_url.split('#').map(part => part.slice(part.indexOf('$') + 1)).filter(Boolean) : [];
        const normalized = {
            code: 200,
            episodes,
            videoInfo: {
                title: item?.vod_name || '',
                cover: item?.vod_pic || '',
                desc: item?.vod_content || '',
                source_name: SOURCE_NAME,
                source_code: SOURCE_CODE,
            },
        };
        if (item) {
            normalized.title = item.vod_name;
            normalized.cover = item.vod_pic;
            normalized.desc = item.vod_content;
            normalized.vod_name = item.vod_name;
            normalized.vod_pic = item.vod_pic;
            normalized.vod_content = item.vod_content;
        }
        return normalized;
    }

    const adapter = {
        BASE_URL,
        API_BASE_URL,
        SOURCE_CODE,
        SOURCE_NAME,
        buildSearchUrl,
        buildRecommendationsUrl,
        buildDetailUrl,
        collectMp4Urls,
        toVideoItem,
        normalizeSearchResponse,
        normalizeDetailResponse,
    };

    root.BlenderAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
