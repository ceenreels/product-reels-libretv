# Task 6 报告：推荐缓存隔离与来源身份

## Status

已完成。

## 实现摘要

- 推荐缓存接受带有 `libretv:recommendations:` 前缀的完整 opaque key，同时继续兼容 source-only key，并避免重复命名空间。
- 首页推荐 key 按 locale、region、source mode、当前选中源、顺序化 primary/fallback source plan、自定义 API 地址和 page 隔离。
- 网络请求失败时仍先读取新路由 key，再按候选源读取旧 source-only 缓存，避免部署后丢失旧推荐。
- 推荐卡优先使用 item.source_code 打开详情；旧缓存缺少 source_code 时仅对该卡使用对应 legacy source，不覆盖新缓存中的来源身份。

## 验证

- `node --test tests/recommendation-cache.test.js tests/i18n-routing.test.js`：27 tests passed
- `node --check js/app.js`：passed
- `npm test`：56 tests passed

## 顾虑

- 旧 source-only 缓存没有来源元数据，只能按当前路由的候选源顺序推断来源；新写入缓存始终保留 API 返回的 `source_code`。
- 推荐缓存仍是浏览器 localStorage 短期缓存，不新增网络追踪或视频源。
