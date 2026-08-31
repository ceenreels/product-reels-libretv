// 解析代理返回的JSON。Jina Reader 在 application/json 请求下会把原始
// 响应放进 data.content，并且部分 CMS 文本中的控制字符可能未被转义。
function repairJsonControlCharacters(value) {
    let result = '';
    let inString = false;
    let escaped = false;

    for (const char of value) {
        if (inString) {
            if (escaped) {
                result += char;
                escaped = false;
            } else if (char === '\\') {
                result += char;
                escaped = true;
            } else if (char === '"') {
                result += char;
                inString = false;
            } else if (char.charCodeAt(0) < 32) {
                const escapes = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f' };
                result += escapes[char] || `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
            } else {
                result += char;
            }
        } else {
            result += char;
            if (char === '"') inString = true;
        }
    }

    return result;
}

function parseJsonPayload(value) {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    try {
        return JSON.parse(text);
    } catch (error) {
        return JSON.parse(repairJsonControlCharacters(text));
    }
}

async function readApiResponse(response) {
    const raw = await response.text();
    const payload = parseJsonPayload(raw);

    if (payload && payload.data && typeof payload.data.content === 'string') {
        return parseJsonPayload(payload.data.content);
    }

    return payload;
}

function buildProxyUrl(targetUrl) {
    return `${PROXY_URL}${encodeURIComponent(targetUrl)}`;
}

function hasOwnApiSource(source) {
    return Object.prototype.hasOwnProperty.call(API_SITES, source);
}

function isEnabledApiSource(source) {
    return hasOwnApiSource(source) && API_SITES[source] && API_SITES[source].enabled !== false;
}

function getRoutingContext(url) {
    if (typeof LibretvRouting !== 'undefined' && LibretvRouting.getRequestContext) {
        return LibretvRouting.getRequestContext(url);
    }
    return { locale: url.searchParams.get('locale') || 'zh-CN', region: url.searchParams.get('region') || 'GLOBAL_ZH', sourceMode: url.searchParams.get('sourceMode') || 'region', selectedSource: url.searchParams.get('source') || '' };
}

function getSourcePlan(context) {
    if (typeof LibretvRouting !== 'undefined' && LibretvRouting.buildSourcePlan) return LibretvRouting.buildSourcePlan(context);
    return { primary: [], fallback: [] };
}

function markSourceSuccess(source) {
    if (typeof LibretvRouting !== 'undefined' && LibretvRouting.recordSourceSuccess) LibretvRouting.recordSourceSuccess(source);
}

function markSourceFailure(source) {
    if (typeof LibretvRouting !== 'undefined' && LibretvRouting.recordSourceFailure) LibretvRouting.recordSourceFailure(source);
}

function isValidCoverUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

// 苹果CMS的列表接口经常省略 vod_pic。详情接口仍会返回封面，
// 因此首页推荐在缺少封面时批量补查详情，而不是把空字段直接传给前端。
async function fetchRecommendationCovers(sourceCode, videoIds) {
    if (!isEnabledApiSource(sourceCode) || !videoIds.length) return new Map();

    const detailUrl = `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${videoIds.join(',')}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(API_REQUEST_TIMEOUT, 12000));

    try {
        const response = await fetch(buildProxyUrl(detailUrl), {
            headers: API_CONFIG.detail.headers,
            signal: controller.signal
        });
        if (!response.ok) return new Map();

        const data = await readApiResponse(response);
        const covers = new Map();
        if (!Array.isArray(data?.list)) return covers;
        data.list.forEach(item => {
            if (item?.vod_id && isValidCoverUrl(item.vod_pic)) {
                covers.set(String(item.vod_id), item.vod_pic.trim());
            }
        });
        return covers;
    } catch (error) {
        // 详情失败不应阻塞整个推荐列表，前端会显示稳定的占位封面。
        console.warn(`批量获取推荐封面失败(${sourceCode}):`, error);
        return new Map();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function enrichRecommendationCovers(items, sourceCode) {
    const pending = items.filter(item => !isValidCoverUrl(item.vod_pic) && item.vod_id);
    const covers = await fetchRecommendationCovers(sourceCode, pending.map(item => item.vod_id));
    pending.forEach(item => {
        const cover = covers.get(String(item.vod_id));
        if (cover) item.vod_pic = cover;
    });
    return items;
}

async function handleCustomRecommendations(customApi, page, context) {
    const urls = String(customApi || '').split(CUSTOM_API_CONFIG.separator)
        .map(value => value.trim()).filter(value => /^https?:\/\//i.test(value))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    if (!urls.length) throw new Error('使用自定义API时必须提供API地址');
    const all = [], usedSources = [];
    for (let i = 0; i < urls.length; i++) {
        const apiUrl = `${urls[i]}${API_CONFIG.recommendations.path}${page}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
        try {
            const response = await fetch(buildProxyUrl(apiUrl), { headers: API_CONFIG.search.headers, signal: controller.signal });
            if (!response.ok) throw new Error(`自定义推荐请求失败: ${response.status}`);
            const data = await readApiResponse(response);
            if (!data || !Array.isArray(data.list)) throw new Error('自定义推荐接口返回的数据格式无效');
            usedSources.push('custom');
            data.list.forEach(item => all.push({ ...item, source_name: `${CUSTOM_API_CONFIG.namePrefix}${i + 1}`, source_code: 'custom', api_url: urls[i] }));
        } catch (error) {
            console.warn(`自定义API ${i + 1} 推荐失败:`, error);
        } finally {
            clearTimeout(timeoutId);
        }
    }
    await enrichRecommendationCovers(all.slice(0, 12), 'custom');
    return JSON.stringify({ code: 200, list: all, routing: { locale: context.locale, region: context.region, requestedSources: ['custom'], usedSources: usedSources.length ? ['custom'] : [], fellBack: false } });
}

// 改进的API请求处理函数
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || '';
    const source = url.searchParams.get('source') || DEFAULT_API_SOURCE;
    const multipleApis = url.searchParams.get('multipleApis') === 'true';
    let attemptedRoutingSources = null;
    let routingUsedSources = [];
    let routingFellBack = false;
    
    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) {
                throw new Error('缺少搜索参数');
            }
            
            // 验证API和source的有效性
            if (source === 'custom' && !customApi) {
                throw new Error('使用自定义API时必须提供API地址');
            }
            const context = getRoutingContext(url);
            const hasExplicitSource = url.searchParams.has('source');
            if (source !== 'custom' && source !== 'aggregated' && !isEnabledApiSource(source) && (hasExplicitSource || (context.sourceMode !== 'aggregated' && context.sourceMode !== 'region'))) {
                throw new Error('无效或已禁用的API来源');
            }
            
            // 处理聚合搜索
            if (source === 'aggregated' || context.sourceMode === 'aggregated' || context.sourceMode === 'region') {
                if (context.sourceMode === 'custom') return await handleMultipleCustomSearch(searchQuery, customApi);
                if (source !== 'aggregated' && context.sourceMode === 'region' && context.selectedSource) {
                    // Explicit concrete source requests retain the legacy manual path below.
                } else {
                    return await handleAggregatedSearch(searchQuery, context);
                }
            }
            
            // 处理多个自定义API搜索
            if (source === 'custom' && multipleApis && customApi.includes(CUSTOM_API_CONFIG.separator)) {
                const customResult = JSON.parse(await handleMultipleCustomSearch(searchQuery, customApi));
                customResult.routing = { locale: context.locale, region: context.region, requestedSources: ['custom'], usedSources: customResult.list?.length ? ['custom'] : [], fellBack: false };
                return JSON.stringify(customResult);
            }
            
            const apiUrl = customApi
                ? `${customApi}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`
                : `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            
            // 添加超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
            
            try {
                const response = await fetch(buildProxyUrl(apiUrl), {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`API请求失败: ${response.status}`);
                }
                
                const data = await readApiResponse(response);
                
                // 检查JSON格式的有效性
                if (!data || !Array.isArray(data.list)) {
                    throw new Error('API返回的数据格式无效');
                }
                if (source !== 'custom') markSourceSuccess(source);
                
                // 添加源信息到每个结果
                data.list.forEach(item => {
                    item.source_name = source === 'custom' ? '自定义源' : API_SITES[source].name;
                    item.source_code = source;
                    // 对于自定义源，添加API URL信息
                    if (source === 'custom') {
                        item.api_url = customApi;
                    }
                });
                
                return JSON.stringify({
                    code: 200,
                    list: data.list || [],
                    routing: { locale: context.locale, region: context.region, requestedSources: [source], usedSources: [source], fellBack: false }
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (source !== 'custom' && isEnabledApiSource(source)) markSourceFailure(source);
                throw fetchError;
            }
        }

        if (url.pathname === '/api/recommendations') {
            const context = getRoutingContext(url);
            const requestedSource = url.searchParams.get('source') || DEFAULT_API_SOURCE;
            if (context.sourceMode === 'custom') {
                return await handleCustomRecommendations(customApi, Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1), context);
            }
            const plan = getSourcePlan({ ...context, capability: 'recommendations' });
            const routed = context.sourceMode === 'aggregated' || context.sourceMode === 'region';
            const hasExplicitSource = url.searchParams.has('source');
            if (hasExplicitSource && requestedSource !== 'aggregated' && !isEnabledApiSource(requestedSource)) throw new Error('无效或已禁用的API来源');
            if (!routed && !isEnabledApiSource(requestedSource)) throw new Error('无效或已禁用的API来源');
            const sourceCandidates = routed ? plan.primary.concat(plan.fallback) : [requestedSource];
            attemptedRoutingSources = sourceCandidates.slice();
            const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
            let sourceCode = '', data = null, emptyData = null, emptySource = '', emptyFellBack = false, fellBack = false, usedSources = [];
            for (let i = 0; i < sourceCandidates.length; i++) {
                const candidate = sourceCandidates[i];
                if (!isEnabledApiSource(candidate)) continue;
                try {
                    const detailUrl = `${API_SITES[candidate].api}${API_CONFIG.recommendations.path}${page}`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
                    let response;
                    try {
                        response = await fetch(buildProxyUrl(detailUrl), { headers: API_CONFIG.search.headers, signal: controller.signal });
                    } finally {
                        clearTimeout(timeoutId);
                    }
                    if (!response.ok) throw new Error(`推荐请求失败: ${response.status}`);
                    const payload = await readApiResponse(response);
                    if (!payload || !Array.isArray(payload.list)) throw new Error('推荐接口返回的数据格式无效');
                    markSourceSuccess(candidate);
                    if (!payload.list.length) { emptyData = payload; emptySource = candidate; emptyFellBack = routed && i >= plan.primary.length; continue; }
                    usedSources = [candidate];
                    routingUsedSources = usedSources.slice();
                    sourceCode = candidate; data = payload; fellBack = routed && i >= plan.primary.length; routingFellBack = fellBack;
                    break;
                } catch (error) {
                    markSourceFailure(candidate);
                }
            }
            if (!data && emptyData) {
                data = emptyData;
                sourceCode = emptySource;
                usedSources = [emptySource];
                fellBack = emptyFellBack;
                routingUsedSources = usedSources.slice();
                routingFellBack = fellBack;
            }
            if (!data) throw new Error('推荐内容加载失败');
            await enrichRecommendationCovers(data.list.slice(0, 12), sourceCode);
            data.list.forEach(item => { item.source_name = API_SITES[sourceCode].name; item.source_code = sourceCode; });
            return JSON.stringify({ code: 200, list: data.list, routing: { locale: context.locale, region: context.region, requestedSources: sourceCandidates, usedSources, fellBack } });
        }

        // 聚合搜索的详情处理 - 需要根据存储在数据中的源信息获取
        if (url.pathname === '/api/detail') {
            const context = getRoutingContext(url);
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'heimuer'; // 获取源代码
            
            if (!id) {
                throw new Error('缺少视频ID参数');
            }
            
            // 验证ID格式 - 只允许数字和有限的特殊字符
            if (!/^[\w-]+$/.test(id)) {
                throw new Error('无效的视频ID格式');
            }

            // 验证API和source的有效性
            if (sourceCode === 'custom' && !customApi) {
                throw new Error('使用自定义API时必须提供API地址');
            }
            
            if (sourceCode !== 'custom' && !isEnabledApiSource(sourceCode)) {
                throw new Error('无效或已禁用的API来源');
            }

            const detailUrl = customApi
                ? `${customApi}${API_CONFIG.detail.path}${id}`
                : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;
            
            // 添加超时处理
            const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
            
            try {
                const response = await fetch(buildProxyUrl(detailUrl), {
                    headers: API_CONFIG.detail.headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`详情请求失败: ${response.status}`);
                }
                
                // 由于现在返回的是JSON而不是HTML，我们需要解析JSON
                const data = await readApiResponse(response);
                
                // 检查返回的数据是否有效
                if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
                    throw new Error('获取到的详情内容无效');
                }
                if (sourceCode !== 'custom') markSourceSuccess(sourceCode);
                
                // 获取第一个匹配的视频详情
                const videoDetail = data.list[0];
                
                // 提取播放地址
                let episodes = [];
                
                if (videoDetail.vod_play_url) {
                    // 分割不同播放源
                    const playSources = videoDetail.vod_play_url.split('$$$');
                    
                    // 提取第一个播放源的集数（通常为主要源）
                    if (playSources.length > 0) {
                        const mainSource = playSources[0];
                        const episodeList = mainSource.split('#');
                        
                        // 从每个集数中提取URL
                        episodes = episodeList.map(ep => {
                            const parts = ep.split('$');
                            // 返回URL部分(通常是第二部分，如果有的话)
                            return parts.length > 1 ? parts[1] : '';
                        }).filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
                    }
                }
                
                // 如果没有找到播放地址，尝试使用正则表达式查找m3u8链接
                if (episodes.length === 0 && videoDetail.vod_content) {
                    const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                    episodes = matches.map(link => link.replace(/^\$/, ''));
                }
                
                return JSON.stringify({
                    code: 200,
                    episodes: episodes,
                    detailUrl: detailUrl,
                    routing: { locale: context.locale, region: context.region, requestedSources: [sourceCode], usedSources: [sourceCode], fellBack: false },
                    // 添加更多视频详情，以便前端展示
                    videoInfo: {
                        title: videoDetail.vod_name,
                        cover: videoDetail.vod_pic,
                        desc: videoDetail.vod_content,
                        type: videoDetail.type_name,
                        year: videoDetail.vod_year,
                        area: videoDetail.vod_area,
                        director: videoDetail.vod_director,
                        actor: videoDetail.vod_actor,
                        remarks: videoDetail.vod_remarks,
                        // 添加源信息
                        source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                        source_code: sourceCode
                    }
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (sourceCode !== 'custom' && isEnabledApiSource(sourceCode)) markSourceFailure(sourceCode);
                throw fetchError;
            }
        }

        throw new Error('未知的API路径');
    } catch (error) {
        console.error('API处理错误:', error);
        let routing;
        try {
            const context = getRoutingContext(url);
            let requestedSources = attemptedRoutingSources;
            if (!requestedSources) {
                const plan = context.sourceMode === 'custom' ? { primary: ['custom'], fallback: [] } : getSourcePlan({ ...context, capability: url.pathname === '/api/recommendations' ? 'recommendations' : 'search' });
                requestedSources = plan.primary.concat(plan.fallback);
            }
            routing = { locale: context.locale, region: context.region, requestedSources, usedSources: routingUsedSources, fellBack: routingFellBack };
        } catch (_) {}
        return JSON.stringify({
            code: 400,
            msg: error.message || '请求处理失败',
            list: [],
            episodes: [],
            ...(routing ? { routing } : {})
        });
    }
}

// 添加: 处理非凡影视详情的特殊函数
async function handleFFZYDetail(id, sourceCode) {
    try {
        // 构建详情页URL（使用配置中的detail URL而不是api URL）
        const detailUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
        
        // 获取详情页HTML
        const response = await fetch(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`详情页请求失败: ${response.status}`);
        }
        
        // 获取HTML内容
        const html = await response.text();
        
        // 非凡影视使用不同的正则表达式
        const ffzyPattern = /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
        let matches = html.match(ffzyPattern) || [];

        // 处理可能包含括号的链接
        matches = matches.map(link => {
            link = link.substring(1, link.length);
            const parenIndex = link.indexOf('(');
            return parenIndex > 0 ? link.substring(0, parenIndex) : link;
        });

        // 如果没有找到链接，尝试一个更通用的模式
        if (matches.length === 0) {
            const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
            matches = html.match(generalPattern) || [];
            matches = matches.map(link => {
                link = link.substring(1, link.length);
                const parenIndex = link.indexOf('(');
                return parenIndex > 0 ? link.substring(0, parenIndex) : link;
            });
        }
        
        // 提取可能存在的标题、简介等基本信息
        // 这些正则可能需要根据网站实际HTML结构调整
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';
        
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const descText = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleText,
                desc: descText,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (error) {
        console.error('非凡影视详情获取失败:', error);
        throw error;
    }
}

// 新增: 处理极速资源详情的特殊函数 - 类似非凡影视的处理方式
async function handleJisuDetail(id, sourceCode) {
    try {
        // 构建详情页URL（使用配置中的detail URL而不是api URL）
        const detailUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT);
        
        // 获取详情页HTML
        const response = await fetch(PROXY_URL + encodeURIComponent(detailUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`详情页请求失败: ${response.status}`);
        }
        
        // 获取HTML内容
        const html = await response.text();
        
        // 极速资源的正则表达式模式 - 类似非凡的处理方式
        const jisuPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
        let matches = html.match(jisuPattern) || [];

        // 处理链接
        matches = matches.map(link => {
            link = link.substring(1, link.length);
            const parenIndex = link.indexOf('(');
            return parenIndex > 0 ? link.substring(0, parenIndex) : link;
        });
        
        // 提取可能存在的标题、简介等基本信息
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';
        
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const descText = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleText,
                desc: descText,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (error) {
        console.error('极速资源详情获取失败:', error);
        throw error;
    }
}

// 新增: 处理聚合搜索
async function handleAggregatedSearch(searchQuery, context) {
    context = context || { locale: 'zh-CN', region: 'GLOBAL_ZH', sourceMode: 'aggregated', selectedSource: '' };
    const plan = getSourcePlan({ ...context, capability: 'search' });
    const requestedSources = plan.primary.concat(plan.fallback);
    if (!requestedSources.length) return JSON.stringify({ code: 200, list: [], msg: '没有可用的API源', routing: { locale: context.locale, region: context.region, requestedSources, usedSources: [], fellBack: false, noEligibleSources: true } });

    const fetchSource = async source => {
        try {
            const apiUrl = `${API_SITES[source].api}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(`${source}源搜索超时`)), 8000); });
            let response;
            try {
                response = await Promise.race([fetch(buildProxyUrl(apiUrl), { headers: API_CONFIG.search.headers }), timeoutPromise]);
            } finally {
                clearTimeout(timeoutId);
            }
            if (!response.ok) throw new Error(`${source}源请求失败: ${response.status}`);
            const data = await readApiResponse(response);
            if (!data || !Array.isArray(data.list)) throw new Error(`${source}源返回的数据格式无效`);
            markSourceSuccess(source);
            return data.list.map(item => ({ ...item, source_name: API_SITES[source].name, source_code: source }));
        } catch (error) {
            markSourceFailure(source);
            console.warn(`${source}源搜索失败:`, error);
            return [];
        }
    };
    let usedSources = [];
    const runLayer = async sources => {
        const pairs = await Promise.all(sources.map(async source => [source, await fetchSource(source)]));
        pairs.forEach(([source, results]) => { if (results.length) usedSources.push(source); });
        return pairs.flatMap(([, results]) => results);
    };
    let allResults = await runLayer(plan.primary);
    let fellBack = false;
    if (!allResults.length && plan.fallback.length) { fellBack = true; allResults = await runLayer(plan.fallback); }
    const uniqueResults = [];
    const seen = new Set();
    allResults.forEach(item => { const key = `${item.source_code}_${item.vod_id}`; if (!seen.has(key)) { seen.add(key); uniqueResults.push(item); } });
    uniqueResults.sort((a, b) => (a.vod_name || '').localeCompare(b.vod_name || '') || (a.source_name || '').localeCompare(b.source_name || ''));
    return JSON.stringify({ code: 200, list: uniqueResults, routing: { locale: context.locale, region: context.region, requestedSources, usedSources, fellBack, noEligibleSources: false } });
}

// 新增：处理多个自定义API源的聚合搜索
async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    // 解析自定义API列表
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => url.length > 0 && /^https?:\/\//.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    
    if (apiUrls.length === 0) {
        throw new Error('没有提供有效的自定义API地址');
    }
    
    // 为每个API创建搜索请求
    const searchPromises = apiUrls.map(async (apiUrl, index) => {
        try {
            const fullUrl = `${apiUrl}${API_CONFIG.search.path}${encodeURIComponent(searchQuery)}`;
            
            // 使用Promise.race添加超时处理
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`自定义API ${index+1} 搜索超时`)), 8000)
            );
            
            const fetchPromise = fetch(buildProxyUrl(fullUrl), {
                headers: API_CONFIG.search.headers
            });
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (!response.ok) {
                throw new Error(`自定义API ${index+1} 请求失败: ${response.status}`);
            }
            
            const data = await readApiResponse(response);
            
            if (!data || !Array.isArray(data.list)) {
                throw new Error(`自定义API ${index+1} 返回的数据格式无效`);
            }
            
            // 为搜索结果添加源信息
            const results = data.list.map(item => ({
                ...item,
                source_name: `${CUSTOM_API_CONFIG.namePrefix}${index+1}`,
                source_code: 'custom',
                api_url: apiUrl // 保存API URL以便详情获取
            }));
            
            return results;
        } catch (error) {
            console.warn(`自定义API ${index+1} 搜索失败:`, error);
            return []; // 返回空数组表示该源搜索失败
        }
    });
    
    try {
        // 并行执行所有搜索请求
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach(results => {
            if (Array.isArray(results) && results.length > 0) {
                allResults = allResults.concat(results);
            }
        });
        
        // 如果没有搜索结果，返回空结果
        if (allResults.length === 0) {
            return JSON.stringify({
                code: 200,
                list: [],
                msg: '所有自定义API源均无搜索结果'
            });
        }
        
        // 去重（根据vod_id和api_url组合）
        const uniqueResults = [];
        const seen = new Set();
        
        allResults.forEach(item => {
            const key = `${item.api_url || ''}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });
        
        return JSON.stringify({
            code: 200,
            list: uniqueResults,
        });
    } catch (error) {
        console.error('自定义API聚合搜索处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: '自定义API聚合搜索处理失败: ' + error.message,
            list: []
        });
    }
}

// 拦截API请求
(function() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? new URL(input, window.location.origin) : input.url;
        
        if (requestUrl.pathname.startsWith('/api/')) {
            try {
                const data = await handleApiRequest(requestUrl);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            } catch (error) {
                return new Response(JSON.stringify({
                    code: 500,
                    msg: '服务器内部错误',
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }
        }
        
        // 非API请求使用原始fetch
        return originalFetch.apply(this, arguments);
    };
})();

async function testSiteAvailability(source) {
    try {
        // 避免传递空的自定义URL
        const apiParams = source === 'custom' && customApiUrl
            ? '&customApi=' + encodeURIComponent(customApiUrl)
            : source === 'custom'
                ? '' // 如果是custom但没有URL，返回空字符串
                : '&source=' + source;
        
        // 如果是custom但没有URL，直接返回false
        if (source === 'custom' && !customApiUrl) {
            return false;
        }
        
        // 公共代理响应可能超过 5 秒，使用可控超时避免误报。
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SITE_STATUS_TEST_TIMEOUT);
        let response;
        try {
            response = await fetch('/api/search?wd=test' + apiParams, {
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
        
        // 检查响应状态
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        
        // 检查API响应的有效性
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (error) {
        console.error('站点可用性测试失败:', error);
        return false;
    }
}
