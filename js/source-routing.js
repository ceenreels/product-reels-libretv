(function (root) {
  var fallbackRules = { CN: ['ffzy','tyyszy','zy360','jisu'], TW: ['tyyszy','zy360'], HK: ['tyyszy','zy360'], SG: ['ffzy','tyyszy'], GLOBAL_EN: [], GLOBAL_ZH: [] };
  var HEALTH_TTL = 5 * 60 * 1000;
  var health = Object.create(null);
  function sourceMap() {
    if (root.API_SITES) return root.API_SITES;
    try { return typeof API_SITES !== 'undefined' ? API_SITES : {}; } catch (_) { return {}; }
  }
  function info(id, site, index) {
    site = site || {};
    return { id:id, languages:site.languages || ['zh-CN'], regions:site.regions || ['CN','TW','HK','SG','GLOBAL_ZH'], priority: Number(site.priority) || (100-index), enabled: site.enabled !== false, defaultEligible: site.defaultEligible === true, capabilities: site.capabilities || {search:true} };
  }
  function langMatch(src, locale) { var l = String(locale || 'en').toLowerCase().slice(0,2); return (src.languages || []).some(function(x){ return String(x).toLowerCase().slice(0,2) === l; }); }
  function regionMatch(src, region) { return (src.regions || []).some(function(r){ return r === region || /^GLOBAL_/.test(r); }); }
  function nowValue(now) { return typeof now === 'number' ? now : Date.now(); }
  function recordSourceSuccess(source, now) { if (!source) return; health[source] = { ok: true, at: nowValue(now) }; }
  function recordSourceFailure(source, now) { if (!source) return; health[source] = { ok: false, at: nowValue(now) }; }
  function isSourceHealthy(source, now) {
    var state = health[source];
    if (!state) return true;
    if (nowValue(now) - state.at >= HEALTH_TTL) { delete health[source]; return true; }
    return state.ok !== false;
  }
  function getEligibleSources(opts) {
    opts = opts || {}; var map=sourceMap(), mode=opts.mode || 'region', selected=opts.selectedSource, capability=opts.capability || 'search', ids=Object.keys(map);
    if (mode === 'manual') return selected && map[selected] ? [selected] : [];
    var rules = root.REGION_SOURCE_RULES || fallbackRules;
    try { if (typeof REGION_SOURCE_RULES !== 'undefined') rules = REGION_SOURCE_RULES; } catch (_) {}
    var preferred = rules[opts.region] || [];
    ids = ids.filter(function(id,i){ var s=info(id,map[id],i); return s.enabled && s.defaultEligible && isSourceHealthy(id, opts.now) && s.capabilities[capability] !== false && langMatch(s,opts.locale) && regionMatch(s, opts.region); });
    ids.sort(function(a,b){ var pa=preferred.indexOf(a), pb=preferred.indexOf(b); if(pa>=0||pb>=0) return (pa<0?999:pa)-(pb<0?999:pb); return info(b,map[b],0).priority-info(a,map[a],0).priority; });
    return mode === 'region' ? ids.slice(0,1) : ids;
  }
  function getFallbackSources(opts) {
    opts=opts||{}; var map=sourceMap(), capability=opts.capability || 'search', eligible=getEligibleSources({locale:opts.locale,region:opts.region,mode:'aggregated',now:opts.now,capability}), all=Object.keys(map).filter(function(id){var s=info(id,map[id],0); return s.enabled&&s.defaultEligible&&isSourceHealthy(id, opts.now)&&s.capabilities[capability]!==false;});
    var same=all.filter(function(id){var s=info(id,map[id],0); return langMatch(s,opts.locale)&&regionMatch(s, opts.region)&&eligible.indexOf(id)<0;});
    var global=all.filter(function(id){var s=info(id,map[id],0); return (s.regions||[]).some(function(r){return /^GLOBAL_/.test(r);})&&langMatch(s,opts.locale)&&eligible.indexOf(id)<0&&same.indexOf(id)<0;});
    var finalGlobal = opts.locale === 'en' ? all.filter(function(id){var s=info(id,map[id],0); return (s.regions||[]).some(function(r){return /^GLOBAL_/.test(r);})&&eligible.indexOf(id)<0&&same.indexOf(id)<0&&global.indexOf(id)<0;}) : [];
    return eligible.concat(same,global,finalGlobal);
  }
  function normalizeLocale(value) {
    if (root.LibretvI18n && typeof root.LibretvI18n.normalizeLocale === 'function') return root.LibretvI18n.normalizeLocale(value);
    var v = String(value || '').replace('_', '-').toLowerCase();
    if (v === 'zh-tw' || v === 'zh-hk') return 'zh-TW';
    if (v === 'zh-cn' || v === 'zh-sg' || v === 'zh') return 'zh-CN';
    if (v === 'en' || v === 'en-us' || v === 'en-gb') return 'en';
    return null;
  }
  function browserContext() {
    var locale = null, region = null;
    try {
      var storedLocale = root.localStorage && (root.localStorage.getItem('locale') || root.localStorage.getItem('currentLocale'));
      var storedRegion = root.localStorage && (root.localStorage.getItem('region') || root.localStorage.getItem('currentRegion'));
      locale = normalizeLocale(storedLocale);
      if (root.LibretvI18n && typeof root.LibretvI18n.resolveLocale === 'function') locale = locale || root.LibretvI18n.resolveLocale({ browserLanguages: root.navigator && root.navigator.languages });
      if (root.LibretvI18n && typeof root.LibretvI18n.resolveRegion === 'function') region = root.LibretvI18n.resolveRegion({ storedRegion: storedRegion || '', locale: locale, browserLanguages: root.navigator && root.navigator.languages });
    } catch (_) {}
    return { locale: locale || 'zh-CN', region: region || (locale === 'en' ? 'GLOBAL_EN' : 'GLOBAL_ZH') };
  }
  function getRequestContext(input) {
    var params;
    try { params = input && input.searchParams ? input.searchParams : new URL(input || '', root.location && root.location.href || 'https://jumeitianxia.com').searchParams; } catch (_) { params = new URLSearchParams(''); }
    var browser = browserContext();
    var locale = normalizeLocale(params.get('locale')) || browser.locale;
    var validRegions = { CN:1, TW:1, HK:1, SG:1, GLOBAL_EN:1, GLOBAL_ZH:1 };
    var regionParam = String(params.get('region') || '').toUpperCase();
    var region = validRegions[regionParam] ? regionParam : browser.region;
    var map = sourceMap();
    var rawMode = String(params.get('sourceMode') || '').toLowerCase();
    var source = String(params.get('source') || '');
    var sourceKnown = source && Object.prototype.hasOwnProperty.call(map, source) && source !== 'custom' && source !== 'aggregated';
    var sourceMode = ['aggregated','region','manual','custom'].indexOf(rawMode) >= 0 ? rawMode : (source === 'custom' ? 'custom' : source === 'aggregated' ? 'aggregated' : sourceKnown ? 'manual' : 'region');
    return { locale: locale, region: region, sourceMode: sourceMode, selectedSource: sourceMode === 'manual' && sourceKnown ? source : '' };
  }
  function buildSourcePlan(context) {
    context = context || {};
    var mode = context.sourceMode || 'region';
    if (mode === 'custom') return { primary: [], fallback: [] };
    if (mode === 'manual') {
      var selected = getEligibleSources({ mode: 'manual', selectedSource: context.selectedSource });
      return { primary: selected, fallback: [] };
    }
    var capability = context.capability || 'search';
    var primary = getEligibleSources({ locale: context.locale, region: context.region, mode: mode, capability: capability });
    var fallback = getFallbackSources({ locale: context.locale, region: context.region, capability: capability });
    fallback = fallback.filter(function(id) { return primary.indexOf(id) < 0; });
    if (mode === 'region' && primary.length > 1) primary = primary.slice(0, 1);
    return { primary: primary, fallback: fallback };
  }
  root.LibretvRouting={resolveSourceMode:function(o){o=o||{}; var map=sourceMap(); if (o.storedMode==='manual'||o.storedMode==='aggregated'||o.storedMode==='region') return o.storedMode; return (o.storedSource && Object.prototype.hasOwnProperty.call(map,o.storedSource)) ? 'manual' : 'region';},getEligibleSources:getEligibleSources,getFallbackSources:getFallbackSources,recordSourceSuccess:recordSourceSuccess,recordSourceFailure:recordSourceFailure,isSourceHealthy:isSourceHealthy,getRequestContext:getRequestContext,buildSourcePlan:buildSourcePlan};
})(globalThis);
