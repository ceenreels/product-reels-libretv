(function (root) {
  var fallbackRules = { CN: ['ffzy','tyyszy','zy360','jisu'], TW: ['tyyszy','zy360'], HK: ['tyyszy','zy360'], SG: ['ffzy','tyyszy'], GLOBAL_EN: [], GLOBAL_ZH: [] };
  function sourceMap() {
    if (root.API_SITES) return root.API_SITES;
    try { return typeof API_SITES !== 'undefined' ? API_SITES : {}; } catch (_) { return {}; }
  }
  function info(id, site, index) {
    site = site || {};
    return { id:id, languages:site.languages || ['zh-CN'], regions:site.regions || ['CN','TW','HK','SG','GLOBAL_ZH'], priority: Number(site.priority) || (100-index), enabled: site.enabled !== false, defaultEligible: site.defaultEligible !== false, capabilities: site.capabilities || {search:true} };
  }
  function langMatch(src, locale) { var l = String(locale || 'en').toLowerCase().slice(0,2); return (src.languages || []).some(function(x){ return String(x).toLowerCase().slice(0,2) === l; }); }
  function getEligibleSources(opts) {
    opts = opts || {}; var map=sourceMap(), mode=opts.mode || 'region', selected=opts.selectedSource, ids=Object.keys(map);
    if (mode === 'manual') return selected && map[selected] ? [selected] : [];
    var rules = root.REGION_SOURCE_RULES || fallbackRules;
    try { if (typeof REGION_SOURCE_RULES !== 'undefined') rules = REGION_SOURCE_RULES; } catch (_) {}
    var preferred = rules[opts.region] || [];
    ids = ids.filter(function(id,i){ var s=info(id,map[id],i); return s.enabled && s.defaultEligible && s.capabilities.search !== false && langMatch(s,opts.locale) && (!s.regions || s.regions.indexOf(opts.region)>=0 || s.regions.indexOf('GLOBAL_EN')>=0 || s.regions.indexOf('GLOBAL_ZH')>=0); });
    ids.sort(function(a,b){ var pa=preferred.indexOf(a), pb=preferred.indexOf(b); if(pa>=0||pb>=0) return (pa<0?999:pa)-(pb<0?999:pb); return info(b,map[b],0).priority-info(a,map[a],0).priority; });
    return mode === 'region' ? ids.slice(0,1) : ids;
  }
  function getFallbackSources(opts) {
    opts=opts||{}; var map=sourceMap(), eligible=getEligibleSources({locale:opts.locale,region:opts.region,mode:'aggregated'}), all=Object.keys(map).filter(function(id){var s=info(id,map[id],0); return s.enabled&&s.defaultEligible&&s.capabilities.search!==false;});
    var same=all.filter(function(id){return langMatch(info(id,map[id],0),opts.locale)&&eligible.indexOf(id)<0;});
    var global=all.filter(function(id){var s=info(id,map[id],0); return (s.regions||[]).some(function(r){return /^GLOBAL_/.test(r);})&&eligible.indexOf(id)<0&&same.indexOf(id)<0;});
    return eligible.concat(same,global);
  }
  root.LibretvRouting={resolveSourceMode:function(o){o=o||{}; return o.storedMode==='manual'||o.storedMode==='aggregated'||o.storedMode==='region' ? o.storedMode : (o.storedSource ? 'manual' : 'region');},getEligibleSources:getEligibleSources,getFallbackSources:getFallbackSources};
})(globalThis);
