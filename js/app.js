// 全局变量
const storedApiSource = localStorage.getItem('currentApiSource');
// 旧版本默认的 json.heimuer.xyz 已失效，首次打开时迁移到可用源。
let currentApiSource = storedApiSource === 'heimuer'
    ? DEFAULT_API_SOURCE
    : (storedApiSource || DEFAULT_API_SOURCE);
let customApiUrl = localStorage.getItem('customApiUrl') || '';
let currentLocale = localStorage.getItem('libretv:locale') || localStorage.getItem('locale') || localStorage.getItem('currentLocale') || '';
let currentRegion = localStorage.getItem('libretv:region') || localStorage.getItem('region') || localStorage.getItem('currentRegion') || '';
let sourceMode = localStorage.getItem('libretv:sourceMode') || '';
// 添加当前播放的集数索引
let currentEpisodeIndex = 0;
// 添加当前视频的所有集数
let currentEpisodes = [];
// 添加当前视频的标题
let currentVideoTitle = '';
let currentVideoSource = currentApiSource;
// 新增全局变量用于倒序状态
let episodesReversed = false;

// 新增：解析多个自定义API源
let customApiUrls = [];
const RECOMMENDATION_CACHE_TTL = 6 * 60 * 60 * 1000;
const recommendationCache = typeof createRecommendationCache === 'function'
    ? createRecommendationCache()
    : null;

function parseCustomApiUrls() {
    if (!customApiUrl) return [];
    return customApiUrl.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => url.length > 0)
        .slice(0, CUSTOM_API_CONFIG.maxSources);
}

function populateApiSourceOptions() {
    const select = document.getElementById('apiSource');
    if (!select || typeof API_SITES === 'undefined') return;
    const selected = currentApiSource;
    select.innerHTML = '';
    [['region','regionalRecommendation'],['aggregated','aggregated'],['custom','customApi']].forEach(([value,key]) => {
        const option = document.createElement('option'); option.value = value; option.dataset.i18n = key; option.textContent = LibretvI18n?.t(key, currentLocale) || value; select.appendChild(option);
    });
    Object.entries(API_SITES).forEach(([id, site]) => {
        if (site && site.enabled === false) return;
        const option = document.createElement('option'); option.value = id; option.textContent = `${site.name || id} (${id})`; select.appendChild(option);
    });
    select.value = Array.from(select.options).some(o => o.value === selected) ? selected : (sourceMode === 'region' ? 'region' : DEFAULT_API_SOURCE);
}

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    const hasPersistedLocale = !!(localStorage.getItem('libretv:locale') || localStorage.getItem('locale') || localStorage.getItem('currentLocale'));
    if (!hasPersistedLocale && typeof LibretvI18n !== 'undefined') currentLocale = LibretvI18n.getUrlLocale(location.search) || currentLocale;
    currentLocale = (typeof LibretvI18n !== 'undefined' ? LibretvI18n.resolveLocale({storedLocale: currentLocale, browserLanguages: navigator.languages}) : (currentLocale || 'zh-CN'));
    currentRegion = (typeof LibretvI18n !== 'undefined' ? LibretvI18n.resolveRegion({storedRegion: currentRegion, locale: currentLocale, browserLanguages: navigator.languages}) : (currentRegion || 'GLOBAL_ZH'));
    if (!sourceMode) sourceMode = (storedApiSource && API_SITES[storedApiSource]) ? 'manual' : 'region';
    if (sourceMode === 'region' || sourceMode === 'aggregated' || sourceMode === 'custom') currentApiSource = sourceMode;
    if (sourceMode === 'manual' && !API_SITES[currentApiSource]) currentApiSource = DEFAULT_API_SOURCE;
    localStorage.setItem('libretv:locale', currentLocale); localStorage.setItem('libretv:region', currentRegion); localStorage.setItem('libretv:sourceMode', sourceMode);
    LibretvI18n?.apply(document, currentLocale);
    populateApiSourceOptions();
    updateMetadata();
    const localeEl=document.getElementById('localeSelect'), regionEl=document.getElementById('regionSelect'), modeEl=document.getElementById('sourceModeSelect');
    if(localeEl) localeEl.value=currentLocale; if(regionEl) regionEl.value=currentRegion; if(modeEl) modeEl.value=sourceMode;
    // 初始化时检查是否使用自定义接口
    if (currentApiSource === 'custom') {
        document.getElementById('customApiInput').classList.remove('hidden');
        document.getElementById('customApiUrl').value = customApiUrl;
        customApiUrls = parseCustomApiUrls();
    }

    // 设置 select 的默认选中值
    document.getElementById('apiSource').value = sourceMode === 'region' ? 'region' : currentApiSource;

    // 初始化显示当前站点代码
    document.getElementById('currentCode').textContent = currentApiSource;
    
    // 初始化显示当前站点状态（使用优化后的测试函数）
    const statusSource = (currentApiSource === 'region' || currentApiSource === 'aggregated')
        ? (LibretvRouting?.buildSourcePlan?.({locale: currentLocale, region: currentRegion, sourceMode:'region', capability:'search'})?.primary?.[0] || DEFAULT_API_SOURCE)
        : currentApiSource;
    updateSiteStatusWithTest(statusSource);

    // 首页加载热门推荐
    loadRecommendations();
    
    // 渲染搜索历史
    renderSearchHistory();
    
    // 设置黄色内容过滤开关初始状态
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.checked = localStorage.getItem('yellowFilterEnabled') === 'true';
    }
    
    // 设置广告过滤开关初始状态
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        adFilterToggle.checked = localStorage.getItem(PLAYER_CONFIG.adFilteringStorage) !== 'false'; // 默认为true
    }
    
    // 设置事件监听器
    setupEventListeners();
    updateRouteStatus();
});

function updateRouteStatus(fallback) {
    const el=document.getElementById('routeStatus'); if(!el) return;
    const label = typeof LibretvI18n !== 'undefined' ? LibretvI18n.t('routeStatus', currentLocale, 'Route') : 'Route';
    el.textContent = `${label}: ${currentLocale} · ${currentRegion} · ${sourceMode}${fallback ? ' · ' + (LibretvI18n?.t('fallback', currentLocale, 'fallback')) : ''}`;
}
function updateMetadata() {
    const title = LibretvI18n?.t('siteTitle', currentLocale, 'Video search') || 'Video search';
    const descText = LibretvI18n?.t('siteDescription', currentLocale, LibretvI18n?.t('recommendationDescription', currentLocale, title)) || title;
    document.title = title;
    const desc = document.querySelector('meta[name="description"]'); if (desc) desc.content = descText;
    const og = document.querySelector('meta[property="og:title"]'); if (og) og.content = document.title;
    const ogd = document.querySelector('meta[property="og:description"]'); if (ogd) ogd.content = descText;
    const tw = document.querySelector('meta[property="twitter:title"]'); if (tw) tw.content = document.title;
    const twd = document.querySelector('meta[property="twitter:description"]'); if (twd) twd.content = descText;
}

let recommendationPage = 1;
const RECOMMENDATION_PAGE_SIZE = 12;

function buildRecommendationCacheKey({ locale, region, sourceMode, selectedSource, customApiUrl: customUrl, plan, page }) {
    const primary = Array.isArray(plan?.primary) ? plan.primary : [];
    const fallback = Array.isArray(plan?.fallback) ? plan.fallback : [];
    const orderedPlan = [...primary, '|', ...fallback].join(',');
    const sourcePlan = [sourceMode, selectedSource, orderedPlan, customUrl || '']
        .map(value => encodeURIComponent(String(value || '')))
        .join('|');
    return `libretv:recommendations:${encodeURIComponent(locale || '')}:${encodeURIComponent(region || '')}:${sourcePlan}:page:${Number(page) || 1}`;
}

function getLegacyRecommendationSources({ source, sourceMode: mode, plan }) {
    const candidates = [];
    const add = value => {
        if (value && !candidates.includes(value)) candidates.push(value);
    };
    if (mode === 'manual' && source && source !== 'region' && source !== 'aggregated' && source !== 'custom') add(source);
    if (typeof API_SITES !== 'undefined' && API_SITES[source]) add(source);
    (plan?.primary || []).forEach(add);
    (plan?.fallback || []).forEach(add);
    if (mode === 'custom') add('custom');
    add(DEFAULT_API_SOURCE);
    return candidates;
}

function getPageRoutingParams(sourceOverride) {
    const source = sourceOverride || currentApiSource;
    const mode = sourceMode || (source === 'custom' ? 'custom' : source === 'aggregated' ? 'aggregated' : 'manual');
    let locale = currentLocale, region = currentRegion;
    try {
        const storedLocale = localStorage.getItem('libretv:locale') || localStorage.getItem('locale') || localStorage.getItem('currentLocale') || currentLocale || '';
        const storedRegion = localStorage.getItem('libretv:region') || localStorage.getItem('region') || localStorage.getItem('currentRegion') || currentRegion || '';
        locale = (typeof LibretvI18n !== 'undefined' && LibretvI18n.resolveLocale)
            ? LibretvI18n.resolveLocale({ storedLocale, browserLanguages: navigator.languages }) : (storedLocale || locale);
        region = (typeof LibretvI18n !== 'undefined' && LibretvI18n.resolveRegion)
            ? LibretvI18n.resolveRegion({ storedRegion, locale, browserLanguages: navigator.languages }) : (storedRegion || region);
    } catch (_) {}
    const params = new URLSearchParams({ locale, region, sourceMode: mode });
    if (mode === 'manual') params.set('source', source);
    if (mode === 'custom') params.set('source', 'custom');
    return params.toString();
}

async function loadRecommendations() {
    const area = document.getElementById('recommendationArea');
    const container = document.getElementById('recommendationResults');
    if (!area || !container) return;

    const source = currentApiSource === 'custom' || currentApiSource === 'aggregated'
        ? DEFAULT_API_SOURCE
        : currentApiSource;
    const plan = (typeof LibretvRouting !== 'undefined' && LibretvRouting.buildSourcePlan) ? LibretvRouting.buildSourcePlan({locale: currentLocale, region: currentRegion, sourceMode, selectedSource: currentApiSource, capability:'recommendations'}) : {primary:[], fallback:[]};
    const cacheKey = buildRecommendationCacheKey({
        locale: currentLocale,
        region: currentRegion,
        sourceMode,
        selectedSource: currentApiSource,
        customApiUrl,
        plan,
        page: recommendationPage
    });

    area.classList.remove('hidden');
    container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">${LibretvI18n?.t('recommendationLoading', currentLocale, 'Loading recommendations...')}</div>`;

    let recommendationFallback = false;
    try {
        const routeSource = currentApiSource === 'aggregated' ? 'aggregated' : source;
        const routeMode = sourceMode || (currentApiSource === 'custom' ? 'custom' : routeSource);
        const routeParams = getPageRoutingParams(routeSource);
        const query = new URLSearchParams(routeParams);
        query.set('sourceMode', routeMode);
        if (routeMode === 'custom') query.set('source', 'custom');
        if (routeMode === 'custom' && customApiUrl) query.set('customApi', customApiUrl);
        query.set('page', recommendationPage);
        const response = await fetch(`/api/recommendations?${query.toString()}`);
        const data = await response.json();
        recommendationFallback = data?.routing?.fellBack === true;

        if (!response.ok || data.code === 400 || !Array.isArray(data.list)) {
            throw new Error(data.msg || '推荐内容加载失败');
        }

        const items = data.list.slice(0, RECOMMENDATION_PAGE_SIZE);
        recommendationCache?.save(cacheKey, items); updateRouteStatus(recommendationFallback);
        renderRecommendations(items);
    } catch (error) {
        console.error('加载推荐内容失败:', error);
        let cachedItems = recommendationCache?.read(cacheKey, RECOMMENDATION_CACHE_TTL);
        let legacyCacheSource = '';
        if (!cachedItems?.length) {
            for (const candidate of getLegacyRecommendationSources({ source, sourceMode, plan })) {
                const legacyItems = recommendationCache?.read(candidate, RECOMMENDATION_CACHE_TTL);
                if (legacyItems?.length) {
                    cachedItems = legacyItems;
                    legacyCacheSource = candidate;
                    break;
                }
            }
        }
        if (cachedItems?.length) {
            renderRecommendations(cachedItems, { legacySource: legacyCacheSource }); updateRouteStatus(recommendationFallback);
            return;
        }
        container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">${LibretvI18n?.t('recommendationError', currentLocale, 'Recommendations unavailable')}</div>`;
        updateRouteStatus(recommendationFallback);
    }
}

function renderRecommendations(items, options = {}) {
    const container = document.getElementById('recommendationResults');
    if (!container) return;
    const legacySource = options.legacySource || currentApiSource;

    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">${LibretvI18n?.t('noRecommendations', currentLocale, 'No recommendations')}</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'recommendation-card card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02]';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left';
        button.addEventListener('click', () => {
            showDetails(String(item.vod_id || ''), item.vod_name || '未知视频', item.source_code || legacySource);
        });

        const cover = document.createElement('div');
        cover.className = 'relative aspect-[2/3] overflow-hidden bg-[#222]';
        const image = document.createElement('img');
        const fallbackCover = createRecommendationFallbackCover(item.vod_name);
        const remoteCover = item.vod_pic && /^https?:\/\//i.test(item.vod_pic)
            ? item.vod_pic
            : fallbackCover;
        image.src = remoteCover;
        image.alt = item.vod_name ? `${item.vod_name}封面` : '视频封面';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.className = 'w-full h-full object-cover';
        image.onerror = () => {
            if (image.src !== fallbackCover) image.src = fallbackCover;
        };
        cover.appendChild(image);

        const content = document.createElement('div');
        content.className = 'p-3';
        const title = document.createElement('h3');
        title.className = 'font-medium text-sm line-clamp-2 min-h-[2.5rem]';
        title.textContent = item.vod_name || '未知视频';
        const meta = document.createElement('p');
        meta.className = 'text-xs text-gray-500 mt-2 truncate';
        meta.textContent = item.vod_remarks || item.vod_year || '点击查看详情';
        content.append(title, meta);

        button.append(cover, content);
        card.appendChild(button);
        container.appendChild(card);
    });
}

function createRecommendationFallbackCover(title) {
    const label = String(title || '精彩推荐')
        .replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character])
        .slice(0, 18);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" role="img" aria-label="${label}">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#312e81"/><stop offset="1" stop-color="#be185d"/></linearGradient></defs>
        <rect width="400" height="600" fill="url(#g)"/>
        <circle cx="330" cy="100" r="150" fill="#fff" opacity=".12"/>
        <circle cx="55" cy="540" r="190" fill="#000" opacity=".16"/>
        <text x="200" y="330" fill="#fff" font-family="sans-serif" font-size="28" text-anchor="middle">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// 带有超时和缓存的站点可用性测试
async function updateSiteStatusWithTest(source) {
    // 显示加载状态
    document.getElementById('siteStatus').innerHTML = '<span class="text-gray-500">●</span> 测试中...';
    
    // 自定义API源特殊处理 - 测试所有提供的API
    if (source === 'custom') {
        const urls = parseCustomApiUrls();
        if (urls.length === 0) {
            updateSiteStatus(false);
            document.getElementById('siteStatus').innerHTML = '<span class="text-gray-500">●</span> 未设置API';
            return;
        }
        
        // 测试所有API并返回可用的数量
        const results = await Promise.all(
            urls.map(url => testCustomApiUrl(url))
        );
        
        const availableCount = results.filter(r => r).length;
        if (availableCount > 0) {
            updateSiteStatus(true);
            document.getElementById('siteStatus').innerHTML = 
                `<span class="text-green-500">●</span> ${availableCount}/${urls.length} 可用`;
        } else {
            updateSiteStatus(false);
            document.getElementById('siteStatus').innerHTML = 
                `<span class="text-red-500">●</span> 全部不可用`;
        }
        return;
    }
    
    // 检查缓存中是否有有效的测试结果
    const cacheKey = `siteStatus_${source}_${customApiUrl || ''}`;
    const cachedResult = localStorage.getItem(cacheKey);
    
    if (cachedResult) {
        try {
            const { isAvailable, timestamp } = JSON.parse(cachedResult);
            // 只复用短期内成功的结果；失败结果不能长期阻塞用户切换数据源。
            if (isAvailable && Date.now() - timestamp < SITE_STATUS_CACHE_EXPIRY) {
                updateSiteStatus(isAvailable);
                return;
            }
            localStorage.removeItem(cacheKey);
        } catch (e) {
            // 忽略解析错误，继续测试
            console.error('缓存数据解析错误:', e);
        }
    }
    
    // 使用 Promise.race 添加超时处理
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('测试超时')), SITE_STATUS_TEST_TIMEOUT + 1000)
        );
        
        const testPromise = testSiteAvailability(source);
        const isAvailable = await Promise.race([testPromise, timeoutPromise]);
        
        // 更新UI状态
        updateSiteStatus(isAvailable);
        
        // 只缓存成功结果，避免一次网络抖动让站点长期显示不可用。
        if (isAvailable) {
            localStorage.setItem(cacheKey, JSON.stringify({
                isAvailable: true,
                timestamp: Date.now()
            }));
        } else {
            localStorage.removeItem(cacheKey);
        }
    } catch (error) {
        console.error('站点测试错误:', error);
        updateSiteStatus(false);
    }
}

// 新增：测试单个自定义API URL
async function testCustomApiUrl(url) {
    if (!url) return false;
    
    // 验证URL格式
    if (CUSTOM_API_CONFIG.validateUrl && !/^https?:\/\/.+/.test(url)) {
        return false;
    }
    
    // 检查缓存
    if (CUSTOM_API_CONFIG.cacheResults) {
        const cacheKey = `api_test_${url}`;
        const cachedResult = localStorage.getItem(cacheKey);
        if (cachedResult) {
            try {
                const { isAvailable, timestamp } = JSON.parse(cachedResult);
                if (Date.now() - timestamp < CUSTOM_API_CONFIG.cacheExpiry) {
                    return isAvailable;
                }
            } catch (e) {
                console.error('缓存解析错误:', e);
            }
        }
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(), 
            CUSTOM_API_CONFIG.testTimeout
        );
        
        // 使用wd=test为参数进行简单搜索测试
        const response = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(url), {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const result = response.ok;
        
        // 缓存结果
        if (CUSTOM_API_CONFIG.cacheResults) {
            localStorage.setItem(`api_test_${url}`, JSON.stringify({
                isAvailable: result,
                timestamp: Date.now()
            }));
        }
        
        return result;
    } catch (e) {
        console.error(`自定义API测试失败(${url}):`, e);
        return false;
    }
}

// 设置事件监听器
function setupEventListeners() {
    document.getElementById('localeSelect')?.addEventListener('change', e => { currentLocale=e.target.value; localStorage.setItem('libretv:locale',currentLocale); LibretvI18n?.apply(document,currentLocale); populateApiSourceOptions(); updateMetadata(); updateRouteStatus(); resetSearchArea(); recommendationPage=1; loadRecommendations(); });
    document.getElementById('regionSelect')?.addEventListener('change', e => { currentRegion=e.target.value; localStorage.setItem('libretv:region',currentRegion); updateRouteStatus(); resetSearchArea(); recommendationPage=1; loadRecommendations(); });
    document.getElementById('sourceModeSelect')?.addEventListener('change', e => {
        sourceMode = e.target.value;
        const api = document.getElementById('apiSource');
        if (sourceMode === 'region' || sourceMode === 'aggregated' || sourceMode === 'custom') currentApiSource = sourceMode;
        else if (!API_SITES[currentApiSource]) {
            const plan = LibretvRouting?.buildSourcePlan?.({locale: currentLocale, region: currentRegion, sourceMode:'region', capability:'search'});
            currentApiSource = plan?.primary?.[0] || DEFAULT_API_SOURCE;
        }
        if (api) api.value = currentApiSource;
        document.getElementById('customApiInput')?.classList.toggle('hidden', sourceMode !== 'custom');
        if (sourceMode === 'custom') { const input = document.getElementById('customApiUrl'); if (input) input.value = customApiUrl; }
        localStorage.setItem('libretv:sourceMode', sourceMode); localStorage.setItem('currentApiSource', currentApiSource);
        document.getElementById('currentCode').textContent = currentApiSource;
        updateRouteStatus(); resetSearchArea(); recommendationPage=1; loadRecommendations();
    });
    // API源选择变更事件
    document.getElementById('apiSource').addEventListener('change', async function(e) {
        currentApiSource = e.target.value;
        if (currentApiSource === 'region') { sourceMode='region'; document.getElementById('customApiInput')?.classList.add('hidden'); localStorage.setItem('libretv:sourceMode',sourceMode); localStorage.setItem('currentApiSource', currentApiSource); updateRouteStatus(); resetSearchArea(); recommendationPage=1; loadRecommendations(); return; }
        sourceMode = currentApiSource === 'aggregated' ? 'aggregated' : currentApiSource === 'custom' ? 'custom' : 'manual';
        localStorage.setItem('libretv:sourceMode', sourceMode); const modeEl=document.getElementById('sourceModeSelect'); if(modeEl) modeEl.value=sourceMode;
        const customApiInput = document.getElementById('customApiInput');
        
        if (currentApiSource === 'custom') {
            customApiInput.classList.remove('hidden');
            customApiUrl = document.getElementById('customApiUrl').value;
            localStorage.setItem('customApiUrl', customApiUrl);
            customApiUrls = parseCustomApiUrls();
            // 自定义接口不立即测试可用性
            document.getElementById('siteStatus').innerHTML = '<span class="text-gray-500">●</span> 待测试';
        } else {
            customApiInput.classList.add('hidden');
            // 非自定义接口立即测试可用性
            showToast('正在测试站点可用性...', 'info');
            updateSiteStatusWithTest(currentApiSource);
        }
        
        localStorage.setItem('currentApiSource', currentApiSource);
        document.getElementById('currentCode').textContent = currentApiSource;
        
        // 清理搜索结果并重置搜索区域
        resetSearchArea();
        recommendationPage = 1;
        loadRecommendations();
    });

    // 自定义接口输入框事件 - 更新为支持多个API
    document.getElementById('customApiUrl').addEventListener('blur', async function(e) {
        customApiUrl = e.target.value;
        localStorage.setItem('customApiUrl', customApiUrl);
        
        if (currentApiSource === 'custom' && customApiUrl) {
            showToast('正在测试API可用性...', 'info');
            customApiUrls = parseCustomApiUrls();
            
            // 测试所有配置的API
            if (customApiUrls.length > 0) {
                updateSiteStatusWithTest('custom');
                recommendationPage = 1;
                loadRecommendations();
            } else {
                document.getElementById('siteStatus').innerHTML = 
                    '<span class="text-gray-500">●</span> 未设置API';
                showToast('请输入至少一个有效的API地址', 'warning');
            }
        }
    });

    // 回车搜索
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            search();
        }
    });

    // 点击外部关闭设置面板
    document.addEventListener('click', function(e) {
        const panel = document.getElementById('settingsPanel');
        const settingsButton = document.querySelector('button[onclick="toggleSettings(event)"]');
        
        if (!panel.contains(e.target) && !settingsButton.contains(e.target) && panel.classList.contains('show')) {
            panel.classList.remove('show');
        }
    });
    
    // 新增：黄色内容过滤开关事件绑定
    const yellowFilterToggle = document.getElementById('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function(e) {
            localStorage.setItem('yellowFilterEnabled', e.target.checked);
        });
    }
    
    // 新增：广告过滤开关事件绑定
    const adFilterToggle = document.getElementById('adFilterToggle');
    if (adFilterToggle) {
        adFilterToggle.addEventListener('change', function(e) {
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, e.target.checked);
        });
    }
}

// 重置搜索区域
function resetSearchArea() {
    // 清理搜索结果
    document.getElementById('results').innerHTML = '';
    document.getElementById('searchInput').value = '';
    
    // 恢复搜索区域的样式
    document.getElementById('searchArea').classList.add('flex-1');
    document.getElementById('searchArea').classList.remove('mb-8');
    document.getElementById('resultsArea').classList.add('hidden');
    const recommendationArea = document.getElementById('recommendationArea');
    if (recommendationArea) {
        recommendationArea.classList.remove('hidden');
    }
    
    // 确保页脚正确显示，移除相对定位
    const footer = document.querySelector('.footer');
    if (footer) {
        footer.style.position = '';
    }
}

// 搜索功能
async function search() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        showToast('请输入搜索内容', 'info');
        return;
    }
    
    showLoading();
    
    try {
        let apiParams;
        
        // 处理自定义API源
        if (currentApiSource === 'custom') {
            // 获取可能包含多个API的字符串
            customApiUrl = document.getElementById('customApiUrl').value.trim();
            localStorage.setItem('customApiUrl', customApiUrl);
            
            if (!customApiUrl) {
                showToast('请先设置自定义API地址', 'warning');
                hideLoading();
                return;
            }
            
            // 检查是否有多个API (存在逗号)
            if (customApiUrl.includes(CUSTOM_API_CONFIG.separator)) {
                apiParams = '&customApi=' + encodeURIComponent(customApiUrl) + '&' + getPageRoutingParams('custom') + '&multipleApis=true';
            } else {
                apiParams = '&customApi=' + encodeURIComponent(customApiUrl) + '&' + getPageRoutingParams('custom');
            }
        } else {
            apiParams = '&' + getPageRoutingParams(currentApiSource);
        }
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT + 5000);
        
        const response = await fetch('/api/search?wd=' + encodeURIComponent(query) + apiParams, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (data.code === 400) {
            showToast(data.msg || '搜索失败，请检查网络连接或更换数据源', 'error');
            hideLoading();
            return;
        }
        
        // 保存搜索历史
        saveSearchHistory(query);
        
        // 处理搜索结果过滤：如果启用了黄色内容过滤，则过滤掉分类含有"伦理片"或"色情片"的项目
        const yellowFilterEnabled = localStorage.getItem('yellowFilterEnabled') === 'true';
        let results = data.list;
        if (yellowFilterEnabled) {
            const banned = ['伦理片', '色情片','福利视频','福利片'];
            results = results.filter(item => {
                const typeName = item.type_name || '';
                return !banned.some(keyword => typeName.includes(keyword));
            });
        }
        
        // 显示结果区域，调整搜索区域
        document.getElementById('searchArea').classList.remove('flex-1');
        document.getElementById('searchArea').classList.add('mb-8');
        document.getElementById('resultsArea').classList.remove('hidden');
        document.getElementById('recommendationArea').classList.add('hidden');
        
        const resultsDiv = document.getElementById('results');
        
        // 如果没有结果
        if (!results || results.length === 0) {
            resultsDiv.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <svg class="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 class="mt-2 text-lg font-medium text-gray-400">没有找到匹配的结果</h3>
                    <p class="mt-1 text-sm text-gray-500">请尝试其他关键词或更换数据源</p>
                </div>
            `;
            hideLoading();
            return;
        }

        // 添加XSS保护，使用textContent和属性转义
        resultsDiv.innerHTML = results.map(item => {
            const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
            const safeName = (item.vod_name || '').toString()
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            const sourceInfo = item.source_name ? 
                `<span class="bg-[#222] text-xs px-2 py-1 rounded-full">${item.source_name}</span>` : '';
            const sourceCode = item.source_code || currentApiSource;
            
            // 添加API URL属性，用于详情获取
            const apiUrlAttr = item.api_url ? 
                `data-api-url="${item.api_url.replace(/"/g, '&quot;')}"` : '';
            
            // 重新设计的卡片布局 - 支持更好的封面图显示
            const hasCover = item.vod_pic && item.vod_pic.startsWith('http');
            
            // 不同的布局设计 - 桌面端使用横向布局，减小卡片尺寸
            return `
                <div class="card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full" 
                     onclick="showDetails('${safeId}','${safeName}','${sourceCode}')" ${apiUrlAttr}>
                    <div class="md:flex">
                        <!-- 封面图区域 - 调整高度更紧凑 -->
                        ${hasCover ? `
                        <div class="md:w-1/4 relative overflow-hidden">
                            <div class="w-full h-40 md:h-full">
                                <img src="${item.vod_pic}" alt="${safeName}" 
                                     class="w-full h-full object-cover transition-transform hover:scale-110" 
                                     onerror="this.onerror=null; this.src='https://via.placeholder.com/300x450?text=无封面'; this.classList.add('object-contain');" 
                                     loading="lazy">
                                <div class="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent opacity-60"></div>
                            </div>
                        </div>` : ''}
                        
                        <!-- 内容区域 - 减小内边距 -->
                        <div class="p-3 flex flex-col flex-grow ${hasCover ? 'md:w-3/4' : 'w-full'}">
                            <div class="flex-grow">
                                <h3 class="text-lg font-semibold mb-2 line-clamp-2">${safeName}</h3>
                                
                                <!-- 添加影片元数据 - 使用原始彩色标签样式，但减小间距 -->
                                <div class="flex flex-wrap gap-1 mb-2">
                                    ${(item.type_name || '').toString().replace(/</g, '&lt;') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-blue-500 text-blue-300">
                                          ${(item.type_name || '').toString().replace(/</g, '&lt;')}
                                      </span>` : ''}
                                    ${(item.vod_year || '') ? 
                                      `<span class="text-xs py-0.5 px-1.5 rounded bg-opacity-20 bg-purple-500 text-purple-300">
                                          ${item.vod_year}
                                      </span>` : ''}
                                </div>
                                <p class="text-gray-400 text-xs line-clamp-2">
                                    ${(item.vod_remarks || '暂无介绍').toString().replace(/</g, '&lt;')}
                                </p>
                            </div>
                            
                            <!-- 底部元信息区域 - 减小上边距 -->
                            <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-800">
                                ${sourceInfo ? `<div>${sourceInfo}</div>` : '<div></div>'}
                                <div>
                                    <span class="text-xs text-gray-500 flex items-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        点击播放
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('搜索错误:', error);
        if (error.name === 'AbortError') {
            showToast('搜索请求超时，请检查网络连接', 'error');
        } else {
            showToast('搜索请求失败，请稍后重试', 'error');
        }
    } finally {
        hideLoading();
    }
}

// 显示详情 - 修改函数接受sourceCode参数和API URL
async function showDetails(id, vod_name, sourceCode = currentApiSource) {
    if (!id) {
        showToast('视频ID无效', 'error');
        return;
    }
    
    showLoading();
    try {
        // 构建API参数
        let apiParams = '';
        
        // 处理自定义API源 - 如果有api_url参数，优先使用
        if (sourceCode === 'custom') {
            // 查找结果中包含api_url的项目
            const apiUrl = event.currentTarget?.getAttribute('data-api-url');
            
            if (apiUrl) {
                apiParams = '&customApi=' + encodeURIComponent(apiUrl);
            } else {
                // 回退到使用第一个可用的自定义API
                const urls = parseCustomApiUrls();
                if (urls.length > 0) {
                    apiParams = '&customApi=' + encodeURIComponent(urls[0]);
                } else {
                    showToast('无可用的自定义API', 'error');
                    hideLoading();
                    return;
                }
            }
            
            apiParams += '&source=custom';
        } else {
            apiParams = '&source=' + sourceCode;
        }
        
        const response = await fetch('/api/detail?id=' + encodeURIComponent(id) + apiParams);
        
        const data = await response.json();
        
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalContent = document.getElementById('modalContent');
        
        // 显示来源信息
        const sourceName = data.videoInfo && data.videoInfo.source_name ? 
            ` <span class="text-sm font-normal text-gray-400">(${data.videoInfo.source_name})</span>` : '';
        
        modalTitle.innerHTML = (vod_name || '未知视频') + sourceName;
        currentVideoTitle = vod_name || '未知视频';
        
        // 保存当前源码以便后续操作
        currentApiSource = sourceCode;
        currentVideoSource = sourceCode;
        
        if (data.episodes && data.episodes.length > 0) {
            // 安全处理集数URL
            const safeEpisodes = data.episodes.map(url => {
                try {
                    // 确保URL是有效的并且是http或https开头
                    return url && (url.startsWith('http://') || url.startsWith('https://'))
                        ? url.replace(/"/g, '&quot;')
                        : '';
                } catch (e) {
                    return '';
                }
            }).filter(url => url); // 过滤掉空URL
            
            // 保存当前视频的所有集数
            currentEpisodes = safeEpisodes;
            episodesReversed = false; // 默认正序
            modalContent.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button onclick="toggleEpisodeOrder()" class="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clip-rule="evenodd" />
                        </svg>
                        <span>倒序排列</span>
                    </button>
                </div>
                <div id="episodesGrid" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    ${renderEpisodes(vod_name, sourceCode)}
                </div>
            `;
        } else {
            modalContent.innerHTML = '<p class="text-center text-gray-400 py-8">没有找到可播放的视频</p>';
        }
        
        modal.classList.remove('hidden');
    } catch (error) {
        console.error('获取详情错误:', error);
        if (error.name === 'AbortError') {
            showToast('获取详情超时，请检查网络连接', 'error');
        } else {
            showToast('获取详情失败，请稍后重试', 'error');
        }
    } finally {
        hideLoading();
    }
}

// 更新播放视频函数，修改为在新标签页中打开播放页面
function playVideo(url, vod_name, episodeIndex = 0, sourceCode = currentVideoSource || currentApiSource) {
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }
    
    // 保存当前状态到localStorage，让播放页面可以获取
    localStorage.setItem('currentVideoTitle', currentVideoTitle);
    localStorage.setItem('currentEpisodeIndex', episodeIndex);
    localStorage.setItem('currentEpisodes', JSON.stringify(currentEpisodes));
    localStorage.setItem('episodesReversed', episodesReversed);
    currentVideoSource = sourceCode || currentApiSource;
    
    // 构建播放页面URL，传递必要参数
    const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(vod_name)}&index=${episodeIndex}&source_code=${encodeURIComponent(currentVideoSource)}&locale=${encodeURIComponent(currentLocale)}&region=${encodeURIComponent(currentRegion)}&sourceMode=${encodeURIComponent(sourceMode)}`;
    
    // 在新标签页中打开播放页面
    window.open(playerUrl, '_blank');
}

// 播放上一集
function playPreviousEpisode() {
    if (currentEpisodeIndex > 0) {
        const prevIndex = currentEpisodeIndex - 1;
        const prevUrl = currentEpisodes[prevIndex];
        playVideo(prevUrl, currentVideoTitle, prevIndex, currentVideoSource);
    }
}

// 播放下一集
function playNextEpisode() {
    if (currentEpisodeIndex < currentEpisodes.length - 1) {
        const nextIndex = currentEpisodeIndex + 1;
        const nextUrl = currentEpisodes[nextIndex];
        playVideo(nextUrl, currentVideoTitle, nextIndex, currentVideoSource);
    }
}

// 处理播放器加载错误
function handlePlayerError() {
    hideLoading();
    showToast('视频播放加载失败，请尝试其他视频源', 'error');
}

// 新增辅助函数用于渲染剧集按钮（使用当前的排序状态）
function renderEpisodes(vodName, sourceCode = currentVideoSource || currentApiSource) {
    const episodes = episodesReversed ? [...currentEpisodes].reverse() : currentEpisodes;
    return episodes.map((episode, index) => {
        // 根据倒序状态计算真实的剧集索引
        const realIndex = episodesReversed ? currentEpisodes.length - 1 - index : index;
        return `
            <button id="episode-${realIndex}" onclick="playVideo('${episode}','${vodName.replace(/"/g, '&quot;')}', ${realIndex}, '${String(sourceCode || '').replace(/'/g, '&#39;')}')"
                    class="px-4 py-2 bg-[#222] hover:bg-[#333] border border-[#333] rounded-lg transition-colors text-center episode-btn">
                第${realIndex + 1}集
            </button>
        `;
    }).join('');
}

// 新增切换排序状态的函数
function toggleEpisodeOrder() {
    episodesReversed = !episodesReversed;
    // 重新渲染剧集区域，使用 currentVideoTitle 作为视频标题
    const episodesGrid = document.getElementById('episodesGrid');
    if (episodesGrid) {
        episodesGrid.innerHTML = renderEpisodes(currentVideoTitle, currentVideoSource);
    }
    
    // 更新按钮文本和箭头方向
    const toggleBtn = document.querySelector('button[onclick="toggleEpisodeOrder()"]');
    if (toggleBtn) {
        toggleBtn.querySelector('span').textContent = episodesReversed ? '正序排列' : '倒序排列';
        const arrowIcon = toggleBtn.querySelector('svg');
        if (arrowIcon) {
            arrowIcon.style.transform = episodesReversed ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    }
}
