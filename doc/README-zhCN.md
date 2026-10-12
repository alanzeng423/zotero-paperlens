# Zotero PaperLens

[![最新版本](https://img.shields.io/github/v/release/alanzeng423/zotero-paperlens)](https://github.com/alanzeng423/zotero-paperlens/releases/latest)
[![MIT 许可证](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

[English](../README.md) · **简体中文**

PaperLens 是一款先读论文、再结合全文翻译选文的 Zotero 插件。它从 PDF 可提取的文字建立本地阅读 session，找出重点，并结合论文的研究问题、方法、结论和术语解释你选中的内容。

## 功能

- **完整阅读文字**：分段处理每一页可提取的正文，保存进度，再综合成论文概述。
- **上下文翻译**：提供译文和结合全文的解释，可展开术语、推断与能跳转到原文页的依据。
- **原生高亮**：将能在 PDF 中唯一定位的重点写入 Zotero 标注，支持在阅读器中隐藏或显示。
- **每篇论文独立 session**：本机保存阅读笔记和每篇最多 100 条翻译记录，中断后可复用已完成的分段。
- **多种模型服务**：支持 OpenAI、Anthropic、DeepSeek，以及自定义 OpenAI 兼容接口。
- **简洁的阅读侧栏**：使用 Zotero 原生按钮和主题颜色，可选择中文或英文界面；界面语言与翻译语言分别设置。

## 兼容性

目标为 **Zotero 9 / 10 桌面版**。已在 **Windows、Zotero 10.0.6** 验证原生安装、侧栏交互和简单 PDF 文字提取。Zotero 9、macOS 和 Linux 暂未通过真实应用测试。

支持文字型 PDF。扫描论文需要先 OCR；暂不对图片、图表进行视觉分析，也不导出保留原排版的译文 PDF。真实模型效果以及复杂双栏论文的文字顺序，需要结合实际论文和所选服务进一步评估。

## 安装

1. 从[最新 Release](https://github.com/alanzeng423/zotero-paperlens/releases/latest) 下载 **`zotero-paperlens-0.1.4.xpi`**。
2. 在 Zotero 中打开「**工具 → 插件**」。
3. 点击齿轮菜单，选择「**从文件安装插件…**」。
4. 选择下载的 `.xpi` 文件。

请在 Zotero 中安装，不要在浏览器中安装。日常使用不需要 Node.js 或 Python。仓库的 `updates.json` 提供插件更新信息，更新检查遵循 Zotero 的插件设置；也可以手动安装新版 XPI。

## 开始使用

1. 在 Zotero 打开论文 PDF，点击右侧导航中的 **PaperLens**，或从「工具 → PaperLens」打开。
2. 在「**设置**」选择服务商，填写模型 ID 和 API Key，保存后可点击「测试连接」。
3. 设置翻译语言，默认为简体中文；界面语言可单独选择中文或英文。
4. 在「**论文**」点击「**读取全文**」。论文文字会发送给设置的服务，可能产生 API 费用；阅读只在你主动启动时进行。
5. 阅读完成后查看概述与主要发现，按需展开方法、局限、笔记和术语表。读取前可以关闭自动高亮。
6. 在 PDF 中选择文字，点击选文弹窗里的「**结合全文翻译**」。侧栏会切换到「**翻译**」，使用已建立的 session 生成译文和解释。

原文、术语、进一步推断和引文默认折叠；点击引文页码可跳到对应页。已有结果可在「**记录**」查看。

停止读取或网络失败后，已完成的分段会保留。使用同一篇论文和相同设置可以继续读取。论文、模型、服务地址、翻译语言或分段设置改变后需要重新建立 session；切换界面语言不会触发重读。

「**隐藏高亮**」只改变本机阅读器中的显示，标注仍保留在 Zotero 中，用户自己的标注不受影响。插件标注带有 `PaperLens:AI` 标签；重新读取不会自动删除之前 session 创建的标注。

脱离主窗口的独立 PDF 阅读窗口没有主窗口的文献侧栏，因此使用独立的 PaperLens 窗口。

## 模型服务

| 服务 | 接口协议 | 默认服务地址 | 预填模型 |
| --- | --- | --- | --- |
| OpenAI | Chat Completions | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Anthropic | Messages | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| DeepSeek | Chat Completions | `https://api.deepseek.com` | `deepseek-flash` |
| 自定义 / 本地服务 | OpenAI 兼容 Chat Completions | `http://localhost:11434/v1` | `qwen3:8b` |

DeepSeek 的阅读笔记与上下文翻译使用非思考 JSON 模式，输出预算至少为 8,192 tokens。结果被截断时，插件会提高预算重试一次，上限为 32,768 tokens，并将两次响应计入用量。半截结果不会保存为已完成的阅读。

预填值可以修改，不代表服务商始终提供这些模型。请填写账号实际可用的模型 ID。自定义接口需要支持 Chat Completions，并返回插件要求的结构化文字。本地预设不会安装或启动模型服务器。

远程服务必须使用 HTTPS；`localhost`、`127.0.0.1` 等回环地址允许 HTTP。填写服务根地址，不要填完整的 `/chat/completions` 或 `/messages` 路径，也不要把密钥写进 URL。本地服务可以留空 API Key。

密钥通过 Zotero 的 Mozilla 登录管理器保存，按服务商和地址分别存储。密码框保存后会清空；留空表示保留已保存的密钥。「高级」设置中可以删除当前服务的密钥。

## 全文理解如何工作

插件从 Zotero PDF 阅读器获取每页的文字与字符坐标，对全部文字分段阅读并保存详细笔记。长论文通过分层综合合并全部笔记，不会只读摘要，也不会为适应单次请求预算直接截掉后半篇。

翻译时，插件将整体理解、术语表与相关原文片段一起提供给模型，并优先考虑当前页。相关片段通过本机文字相关性检索，不依赖 embedding 服务。重点必须能在指定页唯一匹配后才会写入高亮；显示的引文必须存在于检索到的原文中。这些检查确认原文存在，不证明模型解释正确，重要结论仍应回到论文核对。

## 数据与隐私

- 插件直接请求你配置的服务地址，没有 PaperLens 中转服务器或遥测服务。
- 全文阅读会发送论文中可提取的文字；翻译请求包含选文、论文理解和相关原文。服务如何保留或使用这些数据，取决于服务商政策。
- Session 保存在 **Zotero 数据目录**下的 `paperlens/sessions/<libraryID>-<attachmentKey>.json`，包含原文、笔记、整体理解、翻译记录及服务返回的 token 用量。密钥不写入 session 或普通插件偏好。
- Session 是本机文件，不通过 Zotero Sync 同步。原生高亮标注遵循 Zotero 的同步设置。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 找不到 PaperLens | 先打开 PDF，展开右侧文献面板，或从「工具 → PaperLens」打开；检查插件是否启用。 |
| 无法提取正文 | 先对 PDF 进行 OCR，扫描页和图片不会被直接读取为文字。 |
| 认证或模型报错 | 检查服务商、根地址、已保存密钥和模型权限，再测试连接。 |
| 读取中断 | 保持论文和设置不变后继续；长论文需要多次 API 请求。 |
| 某段没有高亮 | 无法唯一定位的引文会被跳过，复杂排版和提取顺序也可能影响匹配。 |

可以在 [GitHub Issues](https://github.com/alanzeng423/zotero-paperlens/issues) 反馈可复现的问题。请附上 Zotero 版本、操作系统、服务商 / 模型与复现步骤，提交日志或截图前删除密钥及私人论文内容。

## 开发

需要 **Node.js 20 或以上**。核心构建与离线测试没有 npm 依赖。

```sh
git clone https://github.com/alanzeng423/zotero-paperlens.git
cd zotero-paperlens
npm run check
npm test
npm run build
```

输出为 `dist/zotero-paperlens-0.1.4.xpi`。安装包只包含插件运行资源和许可证，不包含测试、文档或本地数据。

| 路径 | 内容 |
| --- | --- |
| `bootstrap.js` | 插件与窗口生命周期 |
| `src/core.js` | 分段、原文匹配、PDF 坐标、检索 |
| `src/llm.js` | 服务协议、认证、重试与取消 |
| `src/session.js` | 阅读 session、全文综合和翻译 |
| `src/zotero.js` | 阅读器、侧栏、标注、凭证与存储 |
| `content/` | 侧栏界面与中英文字符串 |
| `tests/` | 离线回归和原生集成检查脚本 |
| `scripts/` | 检查、打包与可选集成验证 |

可选界面 / 原生测试和发布步骤见 [CONTRIBUTING.md](../CONTRIBUTING.md)。PDF 提取使用 Zotero 私有阅读器接口，Zotero 改动接口时可能需要更新适配。

## 许可证与致谢

采用 [MIT 许可证](../LICENSE)。PaperLens 为独立实现，界面与文档组织参考了 [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) 和 [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate)，安装包不包含这两个项目的源码。
