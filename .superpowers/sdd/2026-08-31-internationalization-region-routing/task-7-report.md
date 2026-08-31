# Task 7 回归、浏览器 smoke 与文档报告

日期：2026-09-01
工作树：`feature/internationalization-region-routing-agent4`
基线：`b3dfdce`

## 变更摘要

- `readme.md` 新增三种 locale、地区路由、`GLOBAL_EN` 中文源回退、健康 TTL、`enabled`/`defaultEligible` 区别和新来源接入验证说明。
- `index.html` 为 `apiSource`、`customApiUrl` 的 label 补齐 `for` 关联。
- `js/ui.js` 让设置面板展开/关闭时同步 `aria-hidden`。
- `tests/ads-html.test.js` 增加上述可访问性契约，并用 TDD 完成红-绿验证。

## 自动化回归

先执行基线要求的完整测试：

```text
npm test
```

结果：`60` tests，`60` pass，`0` fail，`0` skipped。

为标签关联和设置面板 aria 状态新增测试后，先运行：

```text
node --test tests/ads-html.test.js
```

新增断言在代码修复前为 RED（`20` tests，`19` pass，`1` fail），修复后为 GREEN（`20` pass，`0` fail）。

其余最终检查：

```text
node --check js/ui.js   # exit 0
node --check js/app.js  # exit 0
git diff --check         # exit 0
```

## 本地静态服务器与 HTTP 检查

服务器以以下命令启动，工作目录为本工作树：

```text
python3 -m http.server 4173
```

以下入口均返回 HTTP `200 text/html`：

- `http://127.0.0.1:4173/?lang=zh-CN`
- `http://127.0.0.1:4173/?lang=zh-TW`
- `http://127.0.0.1:4173/?lang=en`
- `http://127.0.0.1:4173/player.html?lang=en`
- `http://127.0.0.1:4173/privacy.html?lang=en`

静态 grep 确认首页含 `localeSelect`、`regionSelect`、`sourceModeSelect`、`hreflang="en"`、`js/i18n/index.js`、JuicyAds/Adsterra 锚点；播放器含 `source_code`、`pageLocale` 和语言入口；隐私页含语言/地区与 `localStorage` 说明。

## 浏览器真实可见验证

浏览器技能可用，使用 Chrome 扩展连接并只读取页面可见 DOM、截图和控制台日志；没有读取 cookies、密码、profile 或跨站追踪数据。

### 入口与路由

- `?lang=zh-CN`：可见 `html lang="zh-CN"`、简体文案、`路由状态: zh-CN · CN · region`，推荐卡片加载成功。
- `?lang=zh-TW`：手动选择繁体并切换 `TW` 后，可见 `html lang="zh-TW"`、`影片搜尋`、`路由狀態: zh-TW · TW · region`，推荐卡片加载成功。`?lang=` 按设计只是入口提示；已有持久化选择会优先。
- `?lang=en`：选择 `en` + `GLOBAL_EN` 后，可见 English UI、`Route status: en · GLOBAL_EN · region · Using fallback sources`。当前实现以备用来源提示报告无英文主源；推荐仍显示中文源站标题，未出现 English 视频来源标签，符合“视频数据保持源文案”的约束。

### 搜索、详情、播放和广告

- 在 `zh-CN`/`CN`/`aggregated` 下搜索“海”，页面显示 20 条结果，来源徽章均为 `CK资源`。控制台同时记录 `tyyszy` 非 JSON 响应、`ffzy`/`zy360`/`jisu` 超时，但成功结果仍显示，证明单源失败不会清空其他源。
- 搜索结果第一张卡片的可见 `onclick` 为 `showDetails('11159','一缕柔情欲海花','ckzy')`；详情弹窗标题为 `一缕柔情欲海花(CK资源)`，第 1 集按钮保留 `source='ckzy'`。
- 播放器新标签 URL 含 `source_code=ckzy&locale=zh-CN&region=CN`，播放器 `html lang="zh-CN"`、标题保持源站中文文本，视频媒体成功建立 blob URL。
- 首页 JuicyAds/Adsterra 锚点各出现一次（`ad-popunder`、`ad-responsive-banner`、`ad-juicy-home-banner`、`ad-native-banner`、`ad-square-banner`）；播放器的响应式、方形和 JuicyAds 锚点也各出现一次。

一次推荐卡点击首先被 JuicyAds popunder 导航到外部 Chaturbate 页面；该外部页面未被当作应用详情或播放器验证，随后返回本地页并改用搜索结果完成详情/播放器检查。这是广告副作用，不是应用路由结果。

### 持久化与移动端

- 控件切换后 reload 可见 `locale=zh-CN`、`region=CN`、`sourceMode=aggregated` 仍保留，搜索历史仍显示“海”，广告/内容过滤设置没有被清除。
- Chrome 扩展的高层 viewport `set()` 没有改变实际尺寸，因此按浏览器技能允许的 CDP 能力临时设置 `390x844` 进行检查，并在结束前清除覆盖。`innerWidth=390`、`document.scrollWidth=390`。
- 390px 首页：搜索框、推荐网格、JuicyAds/Adsterra 容器均在 `left=16/right=374` 内；无页面横向溢出。播放器：`#player` 为 `358px` 宽，广告容器均在视口内，无横向溢出。
- 四个首页 select 均有对应 label（包括本轮修复的 `apiSource`）；按钮 `tabIndex=0`。设置面板打开后 `aria-hidden="false"`，关闭后恢复 `aria-hidden="true"`。

## 部署边界与顾虑

- 本任务未 push、merge 或 deploy；没有授权进行 Pages 线上发布，因此未声称生产入口、Pages workflow 或私有广告后台已验证。线上验证应在获准部署后再执行。
- 第三方源在本地 smoke 中出现超时或非 JSON 响应，这是当前网络/源可用性观察；自动化路由会隔离失败并按健康 TTL 回退。源健康 TTL 为 5 分钟。
- 当前注册表没有经过验证的英文、日文、韩文或其他国际源；`GLOBAL_EN` 的行为是显示回退状态并使用健康全球中文源，不将视频标成英文。

## 提交

提交哈希见任务交接信息；本报告与实现一并提交。
