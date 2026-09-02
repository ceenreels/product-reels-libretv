# 国际视频源扩展与数量统计设计

## 状态

已获用户同意进入设计文档阶段；等待文档审阅后编写实施计划。

## 背景与目标

当前英文区域已经接入 Blender Open Movies 和 NASA Video Library，但国际源数量仍然偏少，且设置页没有告诉用户每个源的大致目录量和可播放量。下一阶段需要在不破坏现有多语言路由、推荐、播放器和广告结构的前提下，增加更多可验证的海外源，并把源规模和健康状态纳入统一配置。

目标：

1. 在现有 Blender、NASA 之外，接入至少一批经过实时验证的海外公开视频源；
2. 每个源都能按统一接口完成搜索、详情和播放地址生成；
3. 为每个源记录目录总量、可播放量或明确的数量估算类型；
4. 让英文用户优先获得英文源，其他语言在没有匹配源时使用英文源兜底；
5. 源数量、健康状态和统计失败不能阻塞首页、搜索或播放器；
6. 后续新增或撤出源时只修改注册表和适配器，不改核心搜索流程。

## 范围与非目标

### 范围

- 现有 Blender Open Movies 和 NASA Video Library 的统计元数据补齐；
- 评估并接入以下候选源中通过验证的源：
  - Internet Archive Movies；
  - PeerTube 网络聚合搜索；
  - Wikimedia Commons 视频；
- 新增源的语言、区域、能力、数量和健康状态元数据；
- 设置页展示源规模和最近更新时间；
- 单元测试、接口实测和 Playwright 页面验收。

### 非目标

- 不抓取需要登录、付费授权、验证码绕过或不明确允许嵌入播放的站点；
- 不把 YouTube、Vimeo、Dailymotion 等需要平台密钥或受限嵌入政策的站点作为本阶段默认源；
- 不把“搜索结果条数”冒充全站目录总量；
- 不翻译源站视频标题和简介；
- 不通过 Popunder、诱导点击或自动播放广告制造虚假播放量；
- 不新增 IP 定位、用户画像或跨站追踪。

## 候选源验证门槛

候选源只有在以下检查全部通过后才能加入 `enabled: true` 的自动路由：

1. 官方或公开 API 可访问，且允许当前静态站点请求或可由现有代理访问；
2. 搜索结果包含稳定的唯一 ID、标题和详情线索；
3. 详情接口可以得到至少一个 HTTPS 的 MP4、HLS 或官方 iframe 播放地址；
4. 播放地址在独立浏览器会话中可以加载，至少能确认媒体元素进入可播放状态或官方 iframe 成功加载；
5. API 返回的总量字段、分页字段和媒体格式字段能够被准确解释；
6. 连续两次健康检查不出现系统性超时、跨域错误或格式漂移；
7. 内容用途和授权信息足以支持公开索引/跳转，不把来源站点的限制隐藏起来。

验证未通过的候选源可以保留为 `enabled: false` 的候选配置，并在开发测试中记录原因，但不能进入用户的自动搜索计划。

## 推荐的源注册表

继续保留 `API_SITES` 的现有源 ID，新增源使用稳定的短 ID。源注册表至少包含：

```js
{
  code: 'archive',
  name: 'Internet Archive',
  adapter: 'archive',
  api: 'https://archive.org',
  languages: ['en'],
  regions: ['GLOBAL_EN'],
  priority: 80,
  enabled: true,
  defaultEligible: true,
  capabilities: {
    search: true,
    detail: true,
    playback: true,
    recommendations: true,
    stats: true
  },
  stats: {
    catalogCount: 0,
    playableCount: 0,
    countKind: 'authoritative',
    updatedAt: '',
    status: 'unknown'
  }
}
```

字段定义：

- `code`：持久化、详情 URL 和缓存使用的稳定标识；
- `name`：用户界面显示名；
- `adapter`：非 AppleCMS 源的适配器名称；
- `languages`：源内容主要语言；
- `regions`：适用国家/地区或全球区域组；
- `priority`：同语言、同区域源的排序优先级；
- `capabilities`：搜索、详情、播放、推荐和统计能力；
- `defaultEligible`：是否允许自动路由，手动选择仍受 `enabled` 和能力检查约束；
- `stats`：最近一次数量和健康检查快照。

源统计不直接写入每次部署的固定数字，而由适配器的 `getStats()` 在客户端按需获取并缓存。静态注册表中的 `stats` 只作为首次加载前的空状态或上一次构建快照。

## 统一适配器接口

每个非 AppleCMS 源适配器都提供以下函数：

```js
{
  buildSearchUrl(query, page, pageSize),
  buildRecommendationsUrl(page, pageSize),
  buildDetailUrl(id),
  normalizeSearchResponse(payload),
  normalizeDetailResponse(payload, id),
  getStats({ signal }),
  isPlayableUrl(url)
}
```

返回的视频对象继续使用当前页面已经消费的字段：

- `vod_id`；
- `vod_name`；
- `vod_pic`；
- `vod_content`；
- `vod_play_url`；
- `source_code`；
- `source_name`。

`vod_play_url` 只能包含 HTTPS 的 MP4、HLS 或明确的官方 iframe 地址。适配器必须过滤音频-only 文件、下载链接、登录链接和不支持浏览器播放的文件。

`getStats()` 返回：

```js
{
  catalogCount: 123456,
  playableCount: 45678,
  countKind: 'authoritative', // authoritative | estimated | unavailable
  updatedAt: '2026-09-02T00:00:00.000Z',
  sampleSize: 100,
  status: 'available'
}
```

当源只能返回目录总量而不能精确计算可播放量时，`playableCount` 为 `null`，`countKind` 必须为 `estimated` 或 `unavailable`，UI 显示“可播放量未提供/估算”，不得显示为精确数字。

## 数量统计策略

统计分为三层：

1. **目录总量**：优先使用官方 API 的 `total`、`numFound` 或等价字段；
2. **可播放量**：优先使用 API 的媒体格式过滤结果，不能直接得到时对固定数量分页结果采样并标记为估算；
3. **健康状态**：独立记录 API 请求是否成功、最近错误和检查时间。

统计请求必须是懒加载的：

- 首页不等待统计接口；
- 用户打开设置面板或展开源列表时再获取统计；
- 每个源统计缓存 6 小时；
- 统计失败只显示“暂不可用”，不改变搜索路由的可用状态；
- 源连续搜索/详情失败才由路由健康机制暂时降权或跳过。

大规模聚合源（例如 PeerTube 网络）显示“聚合目录量”，并同时显示统计时间和估算标识，避免让用户误解为某一个实例的精确库存。

## 候选源的适配方向

### Internet Archive Movies

- 使用 Advanced Search 获取影视类条目和 `numFound`；
- 使用 item metadata 获取文件列表；
- 只选择公开 HTTPS MP4 或官方可嵌入播放文件；
- 详情 URL 使用稳定的 item identifier；
- `catalogCount` 使用搜索结果总量，`playableCount` 根据文件格式过滤或采样估算。

### PeerTube 网络聚合

- 优先选择公开的 PeerTube 搜索服务或官方聚合接口；
- 结果必须保留实例、视频 UUID 和直接媒体文件信息；
- 对每条结果过滤实例不可达、登录保护和音频-only 文件；
- 统计显示为聚合服务返回的总量或估算值；
- 单个实例失败不能阻塞其他结果。

### Wikimedia Commons 视频

- 使用 MediaWiki API 搜索视频文件并读取文件信息；
- 只保留明确的媒体文件 URL，优先 WebM/MP4 中浏览器兼容格式；
- 用文件页或稳定标题生成详情信息；
- 统计显示为分类/API 查询总量，不能把分类条目数直接写成可播放量。

以上三个候选源不是无条件全部启用，必须先通过“候选源验证门槛”。如果某个源的授权、播放或 API 稳定性不达标，则保留现有已验证源并跳过该候选源。

## 路由和回退

`buildSourcePlan()` 继续成为搜索、推荐和设置页的唯一入口：

1. 手动模式只使用用户明确选择且启用的源；
2. 区域推荐先筛选语言、地区、能力和健康状态，再按优先级选择主源；
3. 聚合模式并行请求当前语言/地区匹配的源；
4. 主源无结果或失败时，按同语言源回退；
5. 当前语言没有可用源时，使用 `GLOBAL_EN` 英文源；
6. 英文用户永不自动回退到中文源；
7. 统计失败不等同于源搜索失败，不得触发“无可用视频源”。

每次搜索和推荐响应继续返回：

```js
{
  routing: {
    locale,
    region,
    requestedSources,
    usedSources,
    fellBack,
    noEligibleSources
  }
}
```

## 设置页展示

现有源选择下拉框继续保留稳定的 `value=code`。新增源状态面板或选项说明，展示：

```text
Internet Archive · English · 目录 1.2M · 可播放约 430K · 2 小时前检查
PeerTube Network · English · 聚合目录 8.4M · 可播放量估算 · Available
NASA Video Library · English · 目录 35K · 可播放 35K · 1 小时前检查
```

显示规则：

- `authoritative` 使用“目录 N / 可播放 N”；
- `estimated` 使用“约 N”或“估算”；
- `unavailable` 使用“数量暂不可用”；
- `status=error` 显示错误状态，但仍允许用户手动重试；
- 统计加载中的源不能阻塞搜索框和首页推荐。

## 错误隔离与安全

- 适配器异常只影响当前源；
- JSON 结构不符合预期时标记源失败，不把异常对象渲染进页面；
- 所有媒体 URL 经过 `http/https`、域名和媒体类型检查；
- 统计响应设置超时和 AbortController；
- 不把未验证的外部 URL 拼接进 inline JavaScript；
- 不把第三方页面文本当作系统指令执行；
- 公开页面继续显示第三方内容来源和免责声明。

## 文件边界

预计修改或新增：

- `js/config.js`：注册新源、语言/地区、能力和统计初始状态；
- `js/adapters/archive.js`：Internet Archive 适配器；
- `js/adapters/peertube.js`：PeerTube 聚合适配器；
- `js/adapters/wikimedia.js`：Wikimedia Commons 适配器；
- `js/api.js`：统一适配器统计请求、结果标准化和错误隔离；
- `js/source-routing.js`：扩展能力过滤和英文回退验证；
- `js/app.js`：设置页源统计懒加载、状态文案和数量展示；
- `index.html`、`player.html`：必要的源统计容器和本地化标签；
- `tests/*`：适配器、统计、路由、渲染和回退测试。

不改动：

- `suggest.js` 和 `suggest.json` 的 Streamtape 推荐协议；
- 广告平台配置和广告位布局；
- 用户现有 `localStorage` 键名和播放器 URL 参数协议。

## 验收标准

### 自动化

- `npm test` 全部通过；
- 每个新增适配器至少覆盖 URL 构建、搜索标准化、详情标准化、播放地址过滤和统计解析；
- 路由测试证明英文用户只请求英文源；
- 回退测试证明无匹配语言源时使用英文源；
- 统计失败测试证明搜索和推荐仍能正常返回；
- 现有广告、Streamtape 推荐和播放器测试保持通过。

### Playwright

- 首页显示站长推荐和动态国际推荐；
- 设置页能切换 `en / GLOBAL_EN / region`；
- 至少两个新增海外源能在界面搜索出结果；
- 至少一个新增源能打开详情并进入播放器；
- 至少一个新增源的媒体元素进入可播放状态或官方 iframe 成功加载；
- 设置页能看到数量、估算标识和更新时间；
- 统计接口延迟/失败不阻塞搜索；
- 未屏蔽广告环境下单独记录 Popunder 跳转，不把广告跳转误判为源功能通过。

## 分阶段交付

### 阶段一：源盘点

- 实时请求三个候选源的搜索、详情、播放和数量接口；
- 输出每个源的目录量、可播放量、统计类型、失败原因和授权/嵌入限制；
- 只将通过门槛的源列入实施清单。

### 阶段二：适配器与注册表

- 按统一接口实现通过验证的适配器；
- 更新路由和英文源规则；
- 完成单元测试和静态代码检查。

### 阶段三：数量面板和线上验收

- 增加设置页统计展示和 6 小时缓存；
- 使用 Playwright 完成真实页面验证；
- 部署到 GitHub Pages 后复核线上搜索、详情、播放和统计状态。
