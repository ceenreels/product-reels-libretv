# 可插拔双广告平台设计

## 目标

让剧美天下同时支持 Adsterra 与 JuicyAds，并为未来的 AdSense 等平台保留清晰的接入边界；任一平台加载失败、停用或移除时，不阻塞其他平台和视频播放。

## 架构

广告逻辑由 `js/ads/manager.js` 统一编排，平台代码分别位于 `js/ads/providers/`。配置只描述平台是否启用、可使用的广告位和平台凭据/代码；页面只提供语义化 slot 容器，不直接知道某个平台的脚本细节。

每个平台适配器实现 `init(context)`、`mount(slotName, element, context)` 和可选的 `destroy()`。管理器按 slot 注册表调用启用的平台；同一 DOM slot 默认只由一个 provider 挂载，服务型广告（Popunder、Social Bar/Floater）使用独立 slot，避免互相覆盖。异常被隔离并记录到控制台，不影响其他适配器。

## JuicyAds 范围

先完成网站验证 meta，并接入后台实际可生成的 PopUnder 代码；Banner/Floater 只在 JuicyAds 后台验证后提供真实代码时接入，不猜测或伪造 zone。这样不会误创建收费广告位，也不会把不存在的代码部署到线上。

## 验证

测试覆盖：平台独立启停、失败隔离、slot 只挂载一次、JuicyAds verification meta 存在。线上用 Chrome 检查首页源码、JuicyAds 验证状态和广告脚本是否插入；广告网络可能因浏览器拦截或返回策略不生成 iframe，这属于平台运行时现象而不是页面架构错误。
