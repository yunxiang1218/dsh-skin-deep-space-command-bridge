# 真实 DSH 独立预览

在本项目目录运行：

```powershell
npm run build
npm run preview
```

终端会显示当前预览进程的认证地址。复制完整地址到浏览器即可打开。默认仅监听 `127.0.0.1:43130`，不自动弹出浏览器；按 `Ctrl+C` 停止。

需要由命令自动打开浏览器时：

```powershell
npm run preview -- --open
```

需要另一个端口时：

```powershell
npm run preview -- --port 43131
```

`--port 0` 让系统选择空闲端口。固定端口便于保留浏览器内的主题视角、显示设置等偏好。

## 配置与数据位置

预览直接调用本机已安装的 DSH Desktop Node 与官方 CLI，使用这个项目内的独立目录：

```text
test-results/preview-harness/
  profiles/web/package.json
  profiles/web/cordis.patch.yml
  profiles/web/node_modules/@dsh-external/dsh-client-ui-skin-deep-space-command-bridge
  ...DSH 创建的设置与会话数据
```

预览配置只加载官方 `dsh-base`、`dsh-web-app` 和本项目主题。主题包通过目录联接指向当前工作区。已有桌面应用配置、女仆皮肤和登录凭据不会被复制或修改。

普通浏览器没有 DSH Desktop 的原生文件夹选择桥接，因此预览和自动检查额外使用各自目录里的 `browser-preview.patch.yml`，禁用自动选择器并组合官方网页目录浏览器。点击“添加工作区”后可在网页里选择本项目目录等路径。这份启动覆盖仅用于预览，不进入主题发布包，也不改变桌面应用的原生选择方式。

预览内新增的工作区、会话和 DSH 设置会留在该目录，下次运行可以继续使用。它启动的是真实 DSH 界面和服务；未配置模型时会显示实际的未配置状态，不会生成虚构回复。查看布局、切换视角及操作主题设置无需发送模型请求。

修改主题代码后重新执行 `npm run build`，停止并重新运行 `npm run preview`，再刷新预览页。宿主会缓存构建产物快照，仅刷新浏览器不一定读到新构建。

预览专用的 `profiles/web/cordis.patch.yml` 会保留。可以在其中启用或禁用独立主题进行对比：

```yaml
- id: ui-skin-deep-space-command-bridge
  disabled: true
```

将其改回 `disabled: false` 可重新启用。修改后刷新页面以读取新的浏览器插件列表；该操作仅影响预览进程。当前安装的 DSH `0.1.2-rc.1` 不在已打开页面中热增删插件条目。

## 自定义 DSH Desktop 安装位置

默认从 `%LOCALAPPDATA%\Programs\DSH Desktop\resources` 查找运行环境。安装在其他位置时，设置资源目录：

```powershell
$env:DSH_DESKTOP_RESOURCES = 'D:\Apps\DSH Desktop\resources'
npm run preview
```

资源目录应包含 `app\node_modules\node\bin\node.exe` 和 `app\node_modules\@deepseek-ai\dsh\lib\bin.js`。该预览脚本面向当前 Windows DSH Desktop 分发结构。

自动化真实宿主检查使用 `npm run test:browser`，会为每次运行建立不同的 `test-results/real-host-*` 目录；与可持续使用的预览数据目录分开。
