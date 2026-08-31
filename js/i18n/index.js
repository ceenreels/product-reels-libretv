(function (root) {
  var supported = root.SUPPORTED_LOCALES || ['zh-CN', 'zh-TW', 'en'];
  var messages = root.MESSAGES || {};
  function normalize(value) {
    if (!value) return null;
    var v = String(value).replace('_', '-').toLowerCase();
    if (v === 'zh-tw' || v === 'zh-hk') return 'zh-TW';
    if (v === 'zh-cn' || v === 'zh-sg' || v === 'zh') return 'zh-CN';
    if (v === 'en' || v === 'en-us' || v === 'en-gb') return 'en';
    return null;
  }
  function langs(input) {
    if (Array.isArray(input)) return input;
    if (root.navigator) return root.navigator.languages || [root.navigator.language];
    return [];
  }
  function resolveLocale(opts) {
    opts = opts || {};
    return normalize(opts.storedLocale) || langs(opts.browserLanguages).map(normalize).find(Boolean) || 'en';
  }
  function resolveRegion(opts) {
    opts = opts || {};
    var valid = { CN:1, TW:1, HK:1, SG:1, GLOBAL_EN:1, GLOBAL_ZH:1 };
    var storedRegion = String(opts.storedRegion || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(valid, storedRegion)) return storedRegion;
    var list = langs(opts.browserLanguages);
    for (var i = 0; i < list.length; i++) {
      var m = String(list[i] || '').match(/^[^-_]+[-_]([A-Za-z]{2})/);
      if (m && Object.prototype.hasOwnProperty.call(valid, m[1].toUpperCase())) return m[1].toUpperCase();
    }
    var locale = normalize(opts.locale) || resolveLocale(opts);
    return locale === 'en' ? 'GLOBAL_EN' : 'GLOBAL_ZH';
  }
  function getUrlLocale(search) {
    try { return normalize(new URLSearchParams(search || '').get('lang')); } catch (_) { return null; }
  }
  function t(key, locale, fallback) {
    var loc = normalize(locale) || locale;
    return (messages[loc] && messages[loc][key]) || (loc && messages[loc.slice(0,2)] && messages[loc.slice(0,2)][key]) || (messages.en && messages.en[key]) || (fallback != null ? fallback : key);
  }
  function apply(documentRef, locale) {
    var doc = documentRef || root.document; if (!doc || !doc.querySelectorAll) return;
    var nodes = doc.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'), locale);
    var placeholders = doc.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) placeholders[j].setAttribute('placeholder', t(placeholders[j].getAttribute('data-i18n-placeholder'), locale));
    var labels = doc.querySelectorAll('[data-i18n-aria-label]');
    for (var k = 0; k < labels.length; k++) labels[k].setAttribute('aria-label', t(labels[k].getAttribute('data-i18n-aria-label'), locale));
    if (doc.documentElement) doc.documentElement.lang = normalize(locale) || 'en';
  }
  root.LibretvI18n = { SUPPORTED_LOCALES: supported, LOCALE_LABELS: root.LOCALE_LABELS, MESSAGES: messages, normalizeLocale: normalize, resolveLocale: resolveLocale, resolveRegion: resolveRegion, getUrlLocale: getUrlLocale, t: t, apply: apply };
})(globalThis);
