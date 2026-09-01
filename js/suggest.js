// 站长自定义推荐清单加载器。
// suggest.json 位于站点根目录；这里不注册 API 源，也不参与搜索。
(function (root) {
    let cachedLoad = null;

    function manifestUrl() {
        const base = root.document?.baseURI || root.location?.href || 'https://jumeitianxia.com/';
        return new URL('suggest.json', base).href;
    }

    function normalizeItem(value) {
        if (!value || value.recommendation_type !== 'streamtape') return null;

        const id = String(value.id || '').trim();
        const title = String(value.title || '').trim();
        const embedUrl = String(value.embed_url || '').trim();
        const thumbnail = String(value.thumbnail || '').trim();

        if (!/^[A-Za-z0-9]+$/.test(id) || !title) return null;
        if (embedUrl !== `https://streamtape.com/e/${id}/`) return null;
        if (thumbnail && !/^https:\/\/thumb\.tapecontent\.net\/thumb\//i.test(thumbnail)) return null;

        return {
            id,
            title,
            thumbnail,
            embed_url: embedUrl,
            recommendation_type: 'streamtape'
        };
    }

    async function load() {
        if (cachedLoad) return cachedLoad;

        cachedLoad = fetch(manifestUrl(), {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        }).then(async response => {
            if (!response.ok) throw new Error(`suggest.json 请求失败: ${response.status}`);
            const payload = await response.json();
            const values = Array.isArray(payload) ? payload : payload?.items;
            if (!Array.isArray(values)) throw new Error('suggest.json 格式无效');
            return values.map(normalizeItem).filter(Boolean);
        }).catch(error => {
            cachedLoad = null;
            console.warn('加载推荐清单失败:', error);
            return [];
        });

        return cachedLoad;
    }

    function isItem(item) {
        return Boolean(normalizeItem(item));
    }

    function buildPlayerUrl(item) {
        const normalized = normalizeItem(item);
        return normalized ? `streamtape-player.html?id=${encodeURIComponent(normalized.id)}` : '';
    }

    function fallbackCover(title) {
        const label = String(title || 'Streamtape').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]).slice(0, 18);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><text x="200" y="320" fill="#fff" font-family="sans-serif" font-size="28" text-anchor="middle">${label}</text></svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function createCard(item) {
        const card = root.document.createElement('article');
        card.className = 'recommendation-card card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02]';

        const button = root.document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left';
        button.addEventListener('click', () => {
            const playerUrl = buildPlayerUrl(item);
            if (playerUrl) root.window?.open(playerUrl, '_blank', 'noopener');
        });

        const cover = root.document.createElement('div');
        cover.className = 'relative aspect-[2/3] overflow-hidden bg-[#222]';
        const image = root.document.createElement('img');
        const fallback = fallbackCover(item.title);
        image.src = item.thumbnail || fallback;
        image.alt = `${item.title} cover`;
        image.loading = 'lazy';
        image.className = 'w-full h-full object-cover';
        image.onerror = () => {
            if (image.src !== fallback) image.src = fallback;
        };
        cover.appendChild(image);

        const content = root.document.createElement('div');
        content.className = 'p-3';
        const badge = root.document.createElement('span');
        badge.className = 'inline-flex items-center rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] text-blue-200';
        badge.textContent = 'Streamtape';
        const title = root.document.createElement('h3');
        title.className = 'font-medium text-sm line-clamp-2 min-h-[2.5rem] mt-1';
        title.textContent = item.title;
        const meta = root.document.createElement('p');
        meta.className = 'text-xs text-gray-500 mt-2 truncate';
        meta.textContent = 'Streamtape';
        content.append(badge, title, meta);

        button.append(cover, content);
        card.appendChild(button);
        return card;
    }

    async function inject() {
        const container = root.document?.getElementById('suggestionResults');
        if (!container) return [];

        const items = await load();
        container.replaceChildren();
        if (!items.length) {
            container.classList.add('hidden');
            return items;
        }

        container.classList.remove('hidden');
        items.forEach(item => container.appendChild(createCard(item)));
        return items;
    }

    root.SuggestRecommendations = { load, inject, isItem, buildPlayerUrl, findById: async id => (await load()).find(item => item.id === String(id || '')) || null };

    if (root.document) {
        const start = () => inject().catch(error => console.warn('插入站长推荐失败:', error));
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
        else start();
    }
})(globalThis);
