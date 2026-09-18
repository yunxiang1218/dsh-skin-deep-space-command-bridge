# 更换宇宙背景

1. 将你有权使用的高清 JPEG、PNG 或 WebP 放到本目录或 `scenes/` 子目录。
2. 修改 `scenes/manifest.json` 的 `scenes` 数组。每景需有唯一 `id`、相对本目录的 `file`、`label`、`credit` 与 `source`；可选 `detailFile`、`photoLabel`、`detailWidth`、`detailHeight` 指定默认高清原片。缺少 `detailFile` 时两种模式使用同一张图片。同步更新 `scenes/CREDIT.md`，至少保留两景以支持随机跃迁。
3. 在工程目录运行 `npm run build`，然后重启独立预览。

当前四景是 2172×724 的艺术合成图：青金云海、紫蔷薇星系、冰蓝尘海、赤金星炉。保留生成器实际像素，不用放大尺寸冒充新增细节。原始素材、完整生成说明见 `scenes/CREDIT.md` 和 `docs/universe-scenes-generation.md`。旧 `background.json` 和旧合成图保留作历史资料，不再控制默认场景。

0.4.0 默认改为使用 `scenes/sources/` 下对应的四张 4000 像素宽天文原片。右下角「飞行控制 → 舷窗影像」可选择高清实景或保留的艺术全景。背景只保留 4% 的边缘余量，不再额外缩放，减少不必要的裁切和放大；随机轨迹限制在横纵各 ±3%，不会露出背景边缘。原片的具体像素尺寸见 `scenes/manifest.json`。
构建器将图片内嵌进插件，运行时无需联网，不依赖不受 DSH 支持的 `/plugins/.../assets` 路径。
三个舷窗通过遮罩共同显示一张连续星景，没有行星图层。速度滑条连续控制巡航效果，标示缓慢、快速和极快三个区间。极快持续超过五秒后，在其余景色中等概率随机选择，解码后平滑换景，再自动回到快速。

0.4.0 当前使用 `cockpit-frame-v3.png`（1672×941）与 `cabin-titanium-v3.png`（1254×1254）。新驾驶台采用纤细银色窗缘、通透主窗、浅弧形台面和大块平整材质，舱壁只保留少量细接缝。移除叠加梁、螺栓堆料与厚重黑色装甲框。两张 PNG 保留内置 Image Gen 的实际输出，没有经 API 重新生成或放大为 4K。完整提示词见 [cockpit-v3-generation.json](cockpit-v3-generation.json)，实际尺寸、哈希与重做说明见 [本次记录](../../docs/cockpit-redesign-2026-09-17.md)。

SVG 遮罩覆盖舷窗和驾驶台两个贴图分段，三屏坐标按新素材重新校准。三个工作屏由真实 UI 透视嵌合，可分别悬浮、拖动和嵌回，使用细玻璃边缘和紧凑面板。图片只提供装饰，不包含聊天按钮、文本或假仪表数据。原始 `cockpit-frame.png`、0.3.0 的 `cockpit-frame-v2.png` 及 `cabin-titanium.png` 保留作历史素材，不再是当前构建入口。

“观察距离”与拖动视角使用统一船舱相机，同步控制舷窗、驾驶台和嵌合屏幕，外景景深不受距离控制；悬浮屏幕保持稳定。`cabin-titanium-v3.png` 用于侧墙、顶棚和地板，四面实体舱室在转头和远景时填充周边。首次启动默认缓慢巡航，飞行与视角偏好在浏览器中保存。速度和跃迁辉光约 2.4 秒达到新目标的 95%；停泊经过减速后停止绘制。控制面板默认收起。

更换驾驶台图片时，需要在 `scripts/build.mjs` 更新图片入口，同时校准 `src/client/index.js` 的窗口遮罩与 `src/client/screen-docking.js` 的屏幕四角坐标；船舱几何由 `src/client/cabin-camera.js` 管理。重建后应在真实宿主复查嵌屏可读性、三窗连续景色和转头边界；0.3.0 的验证记录仅作为历史基线。
