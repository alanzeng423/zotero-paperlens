# Zotero PaperLens

[![Release](https://img.shields.io/github/v/release/alanzeng423/zotero-paperlens)](https://github.com/alanzeng423/zotero-paperlens/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**English** · [简体中文](doc/README-zhCN.md)

PaperLens is a Zotero plugin that reads a paper before translating selections. It creates a local reading session from the PDF's extractable text, identifies key passages, and explains selected text using the paper's research question, methods, findings, and terminology.

## Features

- **Complete text reading:** processes every extractable page in chunks, saves progress, and combines notes into a paper overview.
- **Contextual translation:** shows the translation alongside an explanation grounded in the paper, with terminology and clickable source passages when available.
- **Native highlights:** adds passages that can be uniquely located in the PDF as Zotero annotations. You can hide or show these highlights in the reader.
- **A session for each paper:** keeps reading notes and up to 100 translations per attachment locally; completed chunks can be reused after interruption.
- **Multiple providers:** OpenAI, Anthropic, DeepSeek, and custom OpenAI-compatible endpoints.
- **A compact reader sidebar:** native Zotero buttons, theme colors, and separate Chinese or English interface modes. Interface language and translation language are independent.

## Compatibility

The add-on targets **Zotero 9 and 10 desktop**. Native installation, sidebar interaction, and simple PDF extraction have been verified on **Windows with Zotero 10.0.6**. Zotero 9, macOS, and Linux have not yet been tested with a real application instance.

Text PDFs are supported. Scanned PDFs need OCR first. PaperLens does not analyze figures visually or export a translated PDF with the original layout. Model quality and text order in complex, multi-column papers still require evaluation with real papers and your chosen provider.

## Installation

1. Download **`zotero-paperlens-0.1.3.xpi`** from the [latest release](https://github.com/alanzeng423/zotero-paperlens/releases/latest).
2. In Zotero, open **Tools → Plugins**.
3. Open the gear menu and choose **Install Plugin From File…**.
4. Select the downloaded `.xpi` file.

Install the file in Zotero, rather than in your browser. Node.js and Python are only needed for development. Updates are supplied through the repository's `updates.json`; Zotero's plugin update settings control update checks. You can also install a newer XPI manually.

## Quick start

1. Open a paper's PDF in Zotero. Click **PaperLens** in the reader's right sidebar navigation, or open it from **Tools → PaperLens**.
2. In **Settings**, choose a provider, enter a model ID and API key, and save. Use **Test connection** to check the endpoint.
3. Set your translation language; the default is Simplified Chinese. Choose Chinese or English separately for the interface.
4. In **Paper**, click **Read full paper**. This sends the paper's text to the configured endpoint and may incur API charges. Reading starts only when you request it.
5. When the session is ready, review the overview and findings. Expand methods, limitations, notes, or the glossary as needed. Automatic highlights can be disabled before reading.
6. Select text in the PDF and click **Translate with paper context** in the selection popup. PaperLens opens **Translation** and uses the prepared session to translate and explain it.

The original selection, terms, additional inference, and sources are collapsible. Click a source page to navigate to the supporting passage. Previous results are available in **History**.

Stopping a reading job or encountering a network error preserves completed chunks. Reopen the same paper with the same settings and continue. Changing the paper, model, endpoint, translation language, or chunk settings requires a fresh reading session. Switching interface language does not.

**Hide highlights** changes their visibility in the local reader while keeping the annotations in Zotero. Your own annotations are unaffected. Plugin annotations carry the `PaperLens:AI` tag. Re-reading does not automatically remove annotations created by an earlier session.

Detached PDF reader windows use a separate PaperLens window because they do not have the main window's item sidebar.

## Providers

| Provider | API protocol | Default endpoint | Prefilled model |
| --- | --- | --- | --- |
| OpenAI | Chat Completions | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Anthropic | Messages | `https://api.anthropic.com/v1` | `claude-sonnet-4-6` |
| DeepSeek | Chat Completions | `https://api.deepseek.com` | `deepseek-chat` |
| Custom / local | OpenAI-compatible Chat Completions | `http://localhost:11434/v1` | `qwen3:8b` |

These are editable presets, not promises of model availability. Use a model ID available to your account. A custom endpoint must support Chat Completions and return the structured text requested by the plugin. The local preset does not install or start a model server.

Remote endpoints require HTTPS; HTTP is accepted for loopback addresses such as `localhost` and `127.0.0.1`. Enter a base endpoint rather than a complete `/chat/completions` or `/messages` URL, and do not put keys in URLs. Local services may use an empty API key.

Keys are stored through Zotero's Mozilla login manager, separately for each provider and endpoint. Leaving the key field blank preserves the saved key; the password field clears after saving. Use the advanced settings to remove a saved key.

## How context is built

PaperLens extracts page text and character coordinates from the Zotero PDF reader. It reads every text chunk, persists detailed notes, and uses hierarchical summarization to combine all notes for long papers. It does not stop at the abstract or silently discard later pages to fit one request.

For a translation, it combines the paper overview and glossary with relevant source chunks, prioritizing the current page. Retrieval uses local text relevance; there is no embedding service. Highlight passages must uniquely match text on the specified page before coordinates are used. Displayed source quotations must exist in the retrieved text. These checks establish source presence, not the correctness of a model's interpretation; check important claims against the paper.

## Data and privacy

- Requests go directly to the endpoint you configure. There is no PaperLens proxy or telemetry service.
- Full-paper reading sends extractable paper text to that endpoint. Translation requests include the selection, paper context, and relevant source excerpts. Provider retention and use of this data follow the provider's policies.
- Sessions are stored under your **Zotero data directory** at `paperlens/sessions/<libraryID>-<attachmentKey>.json`. They contain paper text, notes, summaries, translation history, and reported token usage. API keys are not included in sessions or ordinary plugin preferences.
- Sessions are local files and do not use Zotero Sync. Native Zotero annotations follow your Zotero synchronization settings.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| PaperLens is missing | Open a PDF, expand the right item sidebar, or use Tools → PaperLens. Check the plugin is enabled. |
| No text could be extracted | Run OCR on the PDF first. Images and scanned pages are not read as text. |
| Authentication or model error | Check the provider, base endpoint, saved key, and model access; then test the connection. |
| Reading stopped | Resume with the same paper and settings. Large papers need multiple API requests. |
| A passage is not highlighted | Ambiguous or unlocatable quotes are skipped; extraction order or layout may affect matching. |

Report reproducible issues in [GitHub Issues](https://github.com/alanzeng423/zotero-paperlens/issues). Include Zotero version, OS, provider/model, and steps. Remove API keys and private paper text from logs or screenshots.

## Development

Requires **Node.js 20 or newer**. The core build and offline tests have no npm dependencies.

```sh
git clone https://github.com/alanzeng423/zotero-paperlens.git
cd zotero-paperlens
npm run check
npm test
npm run build
```

Output: `dist/zotero-paperlens-0.1.3.xpi`. The XPI contains the add-on runtime and license; tests, documentation, and local data are excluded.

| Path | Responsibility |
| --- | --- |
| `bootstrap.js` | Add-on and window lifecycle |
| `src/core.js` | Chunking, text matching, PDF coordinates, retrieval |
| `src/llm.js` | Provider protocols, authentication, retries, cancellation |
| `src/session.js` | Reading sessions, synthesis, contextual translation |
| `src/zotero.js` | Reader, sidebar, annotations, credentials, storage |
| `content/` | Sidebar interface and Chinese/English strings |
| `tests/` | Offline regressions and native integration probe |
| `scripts/` | Checks, XPI packaging, optional integration checks |

See [CONTRIBUTING.md](CONTRIBUTING.md) for optional browser/native checks and release preparation. PDF extraction uses private Zotero reader interfaces, which may need adjustment when Zotero changes.

## License and acknowledgements

[MIT](LICENSE). PaperLens is an independent implementation. The interface and documentation organization draw inspiration from [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template) and [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate). Their source code is not bundled with this plugin.
