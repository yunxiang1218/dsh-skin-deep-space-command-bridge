# 深空指挥舰桥 · Deep Space Command Bridge

面向 **DeepSeek Harness（DSH）** 的独立科幻驾驶舱主题。任务屏、主控制台和 AI 核心屏由原生 DSH 节点驱动，舱外是连续的深空星景，整舱可转头、拉近和拉远。

**0.4.0 重做驾驶台造型**：纤细银色轮廓、通透主窗与简洁弧形台面，配合紧凑的深蓝玻璃工作屏。驾驶台保留 Image Gen 实际输出的 **1672×941** 像素，舱壁材质为 **1254×1254**；没有放大为 4K。设计依据、完整提示词入口与验收范围见 [本次重做记录](docs/cockpit-redesign-2026-09-17.md)。

外景默认使用 **4000 像素宽的天文原片**，取消原先多余的放大。展开右下角「飞行控制」，可在「舷窗影像」切换高清实景与原有艺术全景。巡航会沿平滑随机轨迹向上、下、左、右漂移；三窗、星点与跃迁光束共用同一偏移，驾驶台保持稳定。

[![CI](https://github.com/yunxiang1218/dsh-skin-deep-space-command-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/yunxiang1218/dsh-skin-deep-space-command-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![真实 DSH 运行截图](preview/bridge.png)

[抬头观景](preview/observation.png) · [转向与舱壁](preview/cabin-far.png) · [跃迁航速](preview/warp.png) · [三屏悬浮](preview/floating.png) · [0.2 版历史演示](preview/flight-demo.mp4)

> 本项目是社区第三方主题，**不是 DeepSeek 官方产品**，也与 NASA、ESA、CSA、STScI 无关。素材署名与商标说明见 [NOTICE](NOTICE) 与 [assets/resource/CREDIT.md](assets/resource/CREDIT.md)。

## 环境要求

- **DSH Desktop**（本主题针对已安装的官方 `0.1.2-rc.1` 开发与验证）
- 用于安装的 **git**；`dsh plugin` 通过 pnpm 安装，需要 `pnpm 10+`（DSH Desktop 自带的 `.desktop-bin` 垫片已包含）
- 浏览器需支持 DSH 所需的新 API，推荐当前版本的 Chromium/Edge

## 安装

### 方式一：从 GitHub 安装（推荐）

```powershell
dsh plugin --profile web add "github:yunxiang1218/dsh-skin-deep-space-command-bridge"
```

`dsh` 不在 PATH 时，用 DSH Desktop 自带的 Node 与 CLI 调用：

```powershell
$app = "$env:LOCALAPPDATA\Programs\DSH Desktop\resources\app\node_modules"
& "$app\node\bin\node.exe" "$app\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add "github:yunxiang1218/dsh-skin-deep-space-command-bridge"
```

命令会在目标 profile 中安装本包，并因为包内声明了 `dsh.bundle.patch` 而自动把 `@dsh-external/dsh-client-ui-skin-deep-space-command-bridge` 追加到 `dsh.profile.bundles`。

### 方式二：从本地目录安装（开发用）

```powershell
git clone https://github.com/yunxiang1218/dsh-skin-deep-space-command-bridge.git
cd dsh-skin-deep-space-command-bridge
npm ci
npm run build
dsh plugin --profile web add "<克隆目录的绝对路径>"
```

`lib/client.js` 与 `lib/index.js` 已随仓库提交，直接用目录安装即可加载；只有修改了 `src/` 才需要重新 `npm run build`。

### 方式三：离线安装包

```powershell
npm ci
npm run pack:theme          # 生成 dsh-external-dsh-client-ui-skin-deep-space-command-bridge-<version>.tgz
dsh plugin --profile web add "<tgz 的绝对路径>"
```

### 启用主题

在目标 profile（默认 `<DSH home>\profiles\web`）的 `cordis.patch.yml` 中启用本主题；整页皮肤之间应互斥：

```yaml
- id: ui-skin-maid-atelier
  disabled: true
- id: ui-skin-deep-space-command-bridge
  disabled: false
```

随后**重启 Harness**（DSH Desktop 窗口菜单 → 重启 Harness）。新增浏览器插件条目需要重启或全新启动宿主；已打开的页面不会热增插件。

### 卸载与回退

```powershell
dsh plugin --profile web remove @dsh-external/dsh-client-ui-skin-deep-space-command-bridge
```

只想临时换回原皮肤时不必卸载，把上文的两个开关对调并重启即可。

### 常见问题

- **路径被拆开或装错包**：`dsh plugin` 在 Windows 上经 shell 转发参数，含空格的路径需要额外一层引号（例如 `'"D:\my plugins\skin"'`），或直接把仓库克隆到不含空格的目录。
- **提示 `pnpm not found on PATH`**：把 DSH Desktop 的垫片目录 `%APPDATA%\dsh-desktop\harness\.desktop-bin` 加入 PATH，或自行安装 pnpm 10+。
- **安装后界面没变化**：确认已完成重启；若仍无变化，检查 `dsh.profile.bundles` 中是否已包含本包，以及 `cordis.patch.yml` 中行 id `ui-skin-deep-space-command-bridge` 未被禁用。

## 舰桥功能

- **MISSION PANEL**：保留原生工作区和历史对话树，补充当前任务摘要、最近 Agent 工具日志及工具成功写入的文件状态。
- **AI CORE PANEL**：直接显示和切换真实模型、Thinking 强度、Agent/Plan 模式，显示会话累计 Token 和上下文压力。
- **中央主屏**：原生聊天、输入、输出、附件、审批、设置与工作台继续由 DSH 负责。主题不发送聊天请求，不替换原生编辑器。
- **宇宙舷窗**：默认显示 Webb 船底座、Hubble 三角座、ESO M78 和 Webb 蛇夫座 ρ 的 4000 像素宽原片；也可切换回 Image Gen 的青金云海、紫蔷薇星系、冰蓝尘海、赤金星炉艺术全景（2172×724）。三窗显示同一连续画面，没有额外行星。原片未插值放大，合成图不代表真实天体空间关系；完整来源与提示词见 [素材记录](docs/universe-scenes-generation.md)。
- **飞行控制**：右下角展开/收起，默认收起。速度滑条在 0–100% 间连续调节，并标注缓慢、快速、极快三个区间；缓慢轻柔漂移，快速明显前进，极快产生蓝色跃迁通道与长光束。加减速、拖尾和辉光连续缓冲。首次启动默认缓慢巡航，模式、速度、视角及当前星域保存在浏览器中。
- **随机跃迁**：极快持续超过五个可见秒后，在其余星域中等概率随机选择一景。先完成图片解码，再用约 1.6 秒渐变衔接，随后自动返回快速。中途手动改变速度优先；页面隐藏时暂停计时，不会返回页面后突然跳过景色。
- **随机航向**：独立于手动转头，外景以随机二维路径移动，上下与左右具有相同幅度范围，转弯平滑缓冲；轨迹随航速加快，停泊减速后停止。减少动态效果和页面隐藏时暂停，恢复时不会跳到另一位置。
- **整舱观察**：按住小“转头”按钮拖动，控制整个船舱偏航/俯仰，各 ±60°；在舷窗空白区域或转头按钮上滚动鼠标，调整 0.7–1.6 的观察距离，同时改变人到驾驶台和舷窗的远近。原生聊天、菜单、工作屏内部滚动不改变视角；Ctrl/Meta 滚轮仍留给浏览器。方向键、加减键、Home 也可操作，独立浮窗保持稳定。
- **高舷窗与观景**：“抬头观景”将视线转向高舷窗，工作屏移到视野下方；“返回驾驶台”恢复默认姿态。转头及远景暴露的区域由具有金属加工细节的侧壁、顶棚与地板覆盖。
- **三屏悬浮**：各屏“悬浮/嵌回”按钮独立切换。桌面三屏按统一宽度分配，默认无重叠；窄屏分行排列。拖动悬浮屏标题栏可移动窗口，聚焦标题栏后方向键也可微调，嵌回再浮起保留本次位置。右下角“展开工作区/返回舰桥”切换主控制台。所有切换保留原生编辑器、草稿和事件；原生对话框仍保持可用。
- **驾驶舱材质与署名**：0.4.0 采用纤细银色轮廓、连续窗缘和简洁台面，移除叠加梁、成排螺栓和厚重装甲框；窗口遮罩与三屏透视坐标按新素材重新校准，工作屏使用细玻璃边缘。只在一个边角保留小型 `yunxiang` 署名，点开同一处即可查看照片来源。
- **动态细节与性能**：GPU/WebGL2 批量绘制 600 颗星和 180 条跃迁射线，Canvas 自动降级并支持 GPU 上下文恢复。取消旧 30 fps 软件上限；拖动按显示帧合并，仅更新变换，存储延后写入。停泊减速完成、页面隐藏或系统要求减少动态效果时暂停持续绘制。实际帧率取决于浏览器、显示刷新率和 GPU；无帧率上限不等于保证所有设备最低 144 fps。
- **高清换景**：照片在 Worker 中解码，分条上传 GPU 后混合；快速改变影像选择会取消旧准备任务。GPU 故障或可见页面持续没有上传进展时回退至已解码的 CSS 景色，保留正常聊天和飞行控制。

模型/推理选项完全来自当前会话的 DSH 模型目录。未提供的数据显示不可用，不生成虚构数值。文件状态表示当前已加载事件窗口内的成功工具写入，不等同于完整磁盘文件树。窄窗口把 AI 仪表堆叠在原生工作区下方，保留编辑区域宽度。

## 配色与 token 覆盖

座舱在明暗两种系统主题下都应呈现同一套深色外观，因此主题把官方主题中**所有按明暗取值不同的 token**（`--dsw-alias-*`、`--dsw-specific-*`、思考区渐变蒙版等）以及主题工作室可覆盖的全部颜色 token 都显式钉死为座舱配色，共 82 项，明暗取值一致。

这一点很关键：行内 `code` 使用的是 `--dsw-alias-markdown-inline-code`。皮肤若未覆盖它，该 token 会回落到官方的亮色取值（近白 `#ebeef2`），而座舱文字是浅色的，就会出现“白底浅字”看不清。现在行内 code 为深藏青底 `#22384a` + 浅色字 `#e5edf1`（对比度约 9:1），代码块、引用、标签、气泡、侧栏悬停、下拉菜单、滚动条、告警底色等同类 token 一并覆盖。

若在此基础上定制配色，建议保持“明暗两态同值”，否则系统主题切换时会出现同类错配。实现见 `src/client/palette.js`。

## 兼容性

当前适配目标为 DSH `0.1.2-rc.1`，在已安装的官方运行环境上验证。第三方皮肤与不同版本的布局选择器可能需要重新验证；`skin.json` 中的 `dshCompatibility` 不是可靠的版本闸门，请以实际安装的代码为准。

主题应与其他整页皮肤互斥启用，通过 profile 的 `cordis.patch.yml` 开关切换，不需要修改其他皮肤的文件。若同时启用「主题工作室」（`dsh-theme-plugin`），其推导出的 token 会与皮肤叠加；本主题已覆盖其全部颜色 token，因此座舱配色不会被改写。

## 开发与检查

```powershell
npm ci
npm run build          # 生成 lib/client.js 与 lib/index.js
npm test               # 相机、屏幕拖动、跃迁状态、原生节点与生命周期测试
npx playwright install chromium
npm run test:browser   # 在已安装的官方 DSH 宿主上做真实界面检查
npm run preview        # 独立预览（默认 127.0.0.1:43130），使用本机 DSH 运行时
node tests/screen-docking.browser.mjs # 独立三屏布局/拖动浏览器检查
node tests/space-particles.browser.mjs # GPU/Canvas A/B 与 context loss/recovery
node tests/space-background.browser.mjs # 高清纹理、像素混合、取消与故障回退
node scripts/host-smoke.mjs --hardware --headed # 独立有窗口高刷新率检查
```

构建产物 `lib/client.js` 是官方 `window.__ModuleLoader__.load` 工厂格式，CSS 与背景素材随包内嵌；`lib/index.js` 为宿主入口（仅导出空的 `apply`）。浏览器检查与预览都使用独立的 `DSH_HOME`（位于 `test-results/`），不会读取或改写桌面的会话、凭据或皮肤配置。

真实宿主检查会把报告写入 `test-results/real-host-*/report.json`，涵盖加载、停用后刷新恢复、重新启用与截图结果。该目录包含本地 DSH profile 与会话数据，**不随仓库发布**，请在本地运行后自行查看。

真实宿主检查涵盖工作区、新建会话、草稿保留、模型/Thinking/Agent/Plan 切换、原生设置、整舱转向、滚轮远近、观景、连续速度、随机跃迁、三屏同时浮动与拖动、响应式布局及停用/重启主题。检查不发送真实模型推理请求，模型选项切换不代表已验证模型生成。当前 74 项单元测试、完整 DSH 运行结果和性能限制见 [0.4.0 验证记录](docs/verification-0.4.0.md)。按作者最新要求，以日常操作基本流畅、允许偶发轻微掉帧为验收标准；不承诺每帧最低 144 fps。

### 发布流程

发布由标签驱动，无需手工打包或上传附件：

```powershell
# 1. 更新 package.json 的版本号与 CHANGELOG.md，提交并推送
# 2. 打标签并推送（标签名必须与 package.json 的版本号一致）
git tag v0.4.0
git push origin v0.4.0
```

推送 `v*` 标签会触发 `.github/workflows/release.yml`：在 GitHub 的 runner 上安装依赖、校验标签与版本号一致、构建、校验提交的 `lib/` 与源码构建结果一致、运行单元测试，然后打包并创建 Release（发布说明为安装说明 + 自动生成的变更列表，附件为可直接安装的 tgz）。任一步骤失败都不会发布。

## 目录结构

```
src/client/index.js            界面装配与生命周期（含 token 释放与节点回收）
src/client/palette.js          座舱调色板：82 项 token，明暗同值
src/client/bridge.css          舰桥视觉样式
src/client/cockpit-screens.css 三屏透视投影与悬浮几何
src/client/host-adapter.js     读取原生 DSH 服务
src/client/space-environment.js 共享星景、连续航速与偏好持久化
src/client/space-particles.js   WebGL2 星点/跃迁射线与 Canvas 回退
src/client/space-background.js  Worker 解码与高清背景分条上传、GPU 混合
src/client/flight-drift.js      平滑随机二维航行轨迹
src/client/space-controls.css  紧凑飞行控制与星景图层
src/client/cabin-finish.css    材质细节与单一角部署名
src/client/cabin-camera.js     整舱相机与舱室几何
src/client/screen-docking.js   屏幕投影与独立悬浮
scripts/build.mjs              内联 CSS/素材并生成官方工厂格式包
scripts/preview.mjs            独立预览宿主
scripts/host-smoke.mjs         真实宿主检查
assets/resource                素材与署名（素材替换入口）
docs/                          插件契约、预览、素材生成与需求记录
```

## 素材与署名

当前沿用 0.3.0 的四种星景，以用户提供的参考照片，以及 Webb“宇宙悬崖”`weic2205a`、Hubble 三角座星系 `heic1901a`、ESO M78 `eso1105a` 和 Webb 蛇夫座 ρ `weic2316a` 为素材，使用 Image Gen 重新构图与延展。0.4.0 的驾驶台与钛合金壁面另以 Image Gen 重新生成，采用工具实际输出尺寸，不使用 API 后备通道或放大补足原生分辨率。完整署名见 [素材目录](assets/resource/CREDIT.md) 与 [四景素材来源](assets/resource/scenes/CREDIT.md)；新版提示词、尺寸和哈希见 [重做记录](docs/cockpit-redesign-2026-09-17.md)，四景提示词和哈希见 [四景生成记录](docs/universe-scenes-generation.md)。旧版背景与舱体制作记录保留在 [美术制作记录](docs/artwork-generation.md)。

观测照片不适用本项目的 MIT 软件许可，仍受其原始使用条款约束。`docs/design-reference.png` 是设计阶段的概念参考图（含 DeepSeek 标识），DeepSeek 名称与标识归其权利人所有。

发布包（`npm pack` 与 Release 附件）只包含运行时产物、预览图与署名文档，不含原始观测照片等素材源文件；需要在本地替换宇宙背景或查看原图时请克隆仓库，流程见 [assets/resource/README.md](assets/resource/README.md)。

## 许可

软件部分以 [MIT](LICENSE) 许可发布。
