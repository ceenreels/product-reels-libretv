# Task 5 报告：公共页面国际化与 SEO

## Status

完成播放器、关于页、隐私页及首页 SEO 元数据国际化。

## TDD 证据

- RED：先在 `tests/ads-html.test.js` 增加公共页面语言元数据/翻译标记测试；运行 `node --test tests/ads-html.test.js`，播放器缺少 `hreflang="en"`，测试按预期失败。
- GREEN：补齐页面标记、语言选择器、i18n 脚本、元数据 bootstrap、隐私披露与 sitemap 语言入口后，聚焦测试通过。

## 实现摘要

- `player.html` 读取 URL/localStorage 的 locale、region、sourceMode，并保留 URL 中的 `source_code`；集数与标题仍使用源站数据。
- `about.html`、`privacy.html` 加载 `messages.js`/`index.js`，提供三语文案、语言选择器及稳定 canonical/hreflang（含 x-default）。
- 首页补充 x-default 与本地 metadata bootstrap。
- 隐私页明确语言、地区、来源模式及来源偏好仅保存在设备 localStorage，不上传本站；未宣称 IP 国家识别。
- sitemap 增加 `?lang=zh-CN`、`?lang=zh-TW`、`?lang=en`，沿用 `2026-08-31`。
- 因现有字典缺少公共页文案键，扩展 `js/i18n/messages.js`（范围外修改，原因：为页面翻译提供必要键）。

## 测试

- `node --test tests/ads-html.test.js tests/i18n-routing.test.js`：38 passed。
- `npm test`：51 passed。

