# 0.3.0 验证记录

在项目现有代码上开发。验证使用项目 `test-results/` 下的独立 DSH profile，不读取桌面会话/凭据，不发送模型推理请求。未修改 DSH 核心与 maid-atelier 文件。

## 功能与视觉

- 构建为官方 DSH module-loader 插件，运行素材嵌入 `lib/client.js`，无需外网加载。
- 61 项单元测试通过，覆盖相机和矩阵、原生编辑器/草稿保持、三屏拖动、轮滚隔离、连续航速、跃迁计时、随机选择、解码失败、隐藏暂停、减少动态效果与卸载。反复操作浮窗时，其层级保持有界，不会盖住原生对话框。
- 独立 Chromium 在 390、900、1100、1366、1536、1920、2560 宽度检查三浮窗默认边界及不重叠；真实指针拖动、键盘控制、原生固定定位弹窗保持可用。
- 真实 DSH 检查包括工作区、新会话、未发送草稿、模型/Thinking/Agent/Plan 切换、设置、视角和远近、三屏同时悬浮、场景解码、自动跃迁、主题停用与重新加载。
- 逐张查看四景，以及嵌屏、三屏浮起、抬头、左右极限转头和远距离截图。侧窗下角与主窗共享景色；外景照片不代表真实天体空间关系。
- Chromium 像素检查连续三次换景的中间帧，确认每次都实际混合两幅图像。四景图层常驻，切换时不再解析长图片 URL。

最终完整宿主报告为 `test-results/real-host-O9FXoP/report.json`：`success=true`，页面错误和失败请求均为空。极快模式 5026.4 ms 后开始换景，6609.8 ms 完成，淡变持续 1583.4 ms；窗口画面覆盖率始终为 1，随后返回快速。发布预览图取自这次运行。

前一次 `real-host-RNBzcf` 在最后的 profile watcher 停用阶段超时，未出现页面或网络错误；不改代码原样重跑后完整通过。保留这次失败记录，不将一次重试通过视为已修复宿主文件监听的偶发问题。

## 性能测量的范围

测试机有 NVIDIA RTX 4090 Laptop GPU，系统报告的显示刷新率为 240 Hz。隔离测试通过 `--use-angle=d3d11 --enable-gpu` 确认使用实际 NVIDIA D3D11。这些参数只传给测试进程，不修改用户浏览器设置。

| 比较项 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 船舱拖动，同 120 步的样式计算累计 | 390.17 ms | 32.32 ms |
| 完整宿主跃迁，动画回调 p95 | 1.90 ms | 0.20 ms |
| 完整宿主跃迁，headless 回调频率中位数 | 30.03 fps | 59.88 fps |
| 独立 1080p 粒子模块，硬件 Canvas/WebGL 回调 p95 | 1.10 ms | 0.20 ms |

来源为本地 `test-results/real-host-7BPUv7/report.json`、`real-host-NLgcdh/report.json` 和 `space-particles-hardware/report.json`。前两次完整宿主测试还改变了软件/硬件 GPU 条件，因此整组提升不能全部归因于 WebGL 代码；独立模块 A/B 使用相同硬件条件。原始报告保留环境信息及逐项统计。

最终构建在相同硬件参数下重跑的结果：

| 阶段 | 动画回调 CPU p95 | 回调最大耗时 | 样式计算累计 |
| --- | ---: | ---: | ---: |
| 三屏悬浮拖动 | 0.10 ms | 0.20 ms | 9.517 ms |
| 跃迁与随机换景 | 0.20 ms | 0.30 ms | 18.483 ms |
| 船舱视角拖动 | 0.20 ms | 0.20 ms | 30.511 ms |

三个阶段都没有观测到 long task。该表来自 `real-host-O9FXoP`；各阶段时长不同，样式计算累计只用于同一动作的前后比较。

常规 headless 浏览器约以 60 Hz 调度。回调 p95 小于 144 Hz 的 6.94 ms 时间预算，只能说明 CPU 路径的开销；它不能证明真实显示器呈现每一帧都达到 144 fps。后台/被遮挡窗口还会被浏览器限速。完整 DSH 的前台最低 144 fps 尚未验收，不作保证。

随后补做了有窗口、标准垂直同步检查（`test-results/headed-host-WcOpMg/report.json`），完整功能通过。RTX 4090 / 240 Hz 显示环境下，三个阶段的 rAF 帧间隔 p95 均为 4.3 ms，约 240 Hz；拖窗、跃迁、船舱转头的最大间隔分别为 4.3、4.5、8.7 ms。没有关闭垂直同步、解除帧率上限或修改浏览器全局设置。这个结果验证了高刷新率下的动画调度，但转头出现一次超过 6.94 ms 的间隔，不能宣称每帧均达到 144 fps，也不是物理显示呈现测量。

更长的检查保存在 `test-results/headed-frame-trace-xwINl0`：完整功能通过，跃迁采样约 6.6 秒、转头采样约 5 秒，采集到了 Chrome `Display::DrawAndSwap`、`Display::FrameDisplayed` 和 DXGI `Present`，trace 无数据丢失。精简统计见同目录 `frame-summary.json`。这些证据用于区分浏览器动画回调与合成提交；仍然存在少数超过 6.94 ms 的间隔。Playwright 默认携带防后台节流参数，显式测试参数未关闭垂直同步；测试结束关闭独立浏览器与宿主。

## 复现

```powershell
npm run build
npm test
node tests/screen-docking.browser.mjs
node tests/space-particles.browser.mjs
node scripts/host-smoke.mjs --hardware
node scripts/host-smoke.mjs --hardware --headed # 有窗口，标准垂直同步
```

粒子测试还验证 WebGL context loss 后切换 Canvas，以及上下文恢复后重建 GPU 资源。`--uncapped` 只用于吞吐测量，不能当成显示刷新率的证据。真实浏览器、长对话、多文件和实际模型生成负载应另行持续观察。
