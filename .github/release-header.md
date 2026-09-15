面向 DeepSeek Harness（DSH）的独立科幻驾驶舱主题。

## 安装

从 GitHub 安装：

```powershell
dsh plugin --profile web add "github:yunxiang1218/dsh-skin-deep-space-command-bridge"
```

或使用下方附件的离线安装包：

```powershell
dsh plugin --profile web add "<下载的 tgz 绝对路径>"
```

安装后在本 profile 的 `cordis.patch.yml` 中启用 `ui-skin-deep-space-command-bridge`（与其他整页皮肤互斥），然后重启 Harness。详见仓库 README。

本附件内的 `lib/client.js` 与 `skin.build.json` 记录的 SHA-256 一致，并与本标签的源码构建结果字节相同。

## 本版变更
