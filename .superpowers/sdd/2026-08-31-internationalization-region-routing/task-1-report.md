# Task 1 报告：Locale 与地区路由基础

## 已变更文件

- `tests/i18n-routing.test.js`：locale 与 region 解析测试。
- `js/i18n/messages.js`：`SUPPORTED_LOCALES`、`LOCALE_LABELS` 与中/英 UI 文案字典。
- `js/i18n/index.js`：locale 规范化、URL 参数读取、文案回退、DOM 应用及地区解析。
- `js/source-routing.js`：来源模式、地区/语言/能力过滤及回退来源纯函数。

## 设计决策

- 保持 classic script/globalThis 兼容，不使用 ES module 或新依赖。
- `resolveLocale` 优先显式存储值，其次浏览器语言，未知语言回退 `en`。
- `resolveRegion` 只接受 CN/TW/HK/SG/GLOBAL_EN/GLOBAL_ZH，显式地区优先，随后使用浏览器语言区域，最后按语言组回退。
- 路由模块从现有 `API_SITES` 读取 URL；可选元数据缺失时使用保守的中文默认值，且不会复制 API URL。
- 手动模式允许显式选择已知来源；自动模式排除禁用、非默认、无搜索能力或语言/地区不匹配的来源。

## 验证命令与输出

`node --test tests/i18n-routing.test.js`

```
✔ locale resolution prefers stored selection and falls back by language
✔ region resolution maps locale regions and language groups
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

`node --test tests/*.test.js`

```
ℹ tests 23
ℹ pass 23
ℹ fail 0
```

`git diff --check`：通过。

## concerns

- 现有 `API_SITES` 尚未携带完整语言/地区元数据；本任务提供默认推断，Task 2 可在注册表中补充显式字段与路由测试。
