# Contributing

Bug reports and focused pull requests are welcome. Chinese and English issue reports are both accepted. Include a reproducible example, your Zotero version, operating system, and provider/model. Do not submit API keys, login databases, reading sessions, or private PDFs.

## Local checks

Node.js 20+ is sufficient for the dependency-free checks and build:

```sh
npm run check
npm test
npm run build
```

Offline tests cover full-text chunking, coordinate matching, provider adapters, retries, cancellation, session invalidation, synthesis, translation caching, credentials, sidebar routing, and manifest validation. They do not make real model calls.

Keep Zotero platform adaptation in `src/zotero.js` and model protocol handling in `src/llm.js`. Add Chinese and English strings together in `content/locale.js`. Model output must be displayed as text, never executed as HTML. Do not skip pages or truncate the full-paper reading pipeline to satisfy a context budget.

## Optional interface checks

Install Playwright separately and ensure Microsoft Edge is available:

```sh
npm install --no-save --package-lock=false playwright
node scripts/ui-check.mjs
# Or pass the directory of an existing Playwright installation:
node scripts/ui-check.mjs /absolute/path/to/playwright
```

This check uses synthetic paper/model data in a browser, tests the sidebar at two widths, and writes `dist/sidebar-preview.png`. It does not test a live model or replace native Zotero verification.

## Optional native Zotero checks

Python 3 and an existing Zotero desktop installation are required:

```sh
python scripts/check-install.py --zotero /path/to/zotero --sidebar --timeout 45
```

The script starts the supplied executable in a separate headless instance with a temporary profile and empty data directory. It creates test PDFs, checks native controls and routing, then terminates only the test instance and removes temporary data. It does not install another Zotero application or use your regular library. Results are written under `dist/`. On Windows, run with Windows Python and a Windows executable path.

The native test injects its probe only into a temporary test copy of the XPI. Published installation packages do not contain the probe. Use a disposable library for any additional manual tests involving real credentials or model calls.

## Release preparation

1. Create a release branch such as `release/0.1.3` from `main`.
2. Set matching versions in `package.json` and `manifest.json`; update download filenames in both READMEs and add bilingual notes under `doc/releases/`.
3. Run source checks, offline tests, build, and applicable interface/native checks.
4. Run `npm run release:prepare`. It hashes the built XPI, generates `dist/SHA256SUMS`, and writes `updates.json` containing only the current version.
5. Review the source and generated manifest. Commit the manifest, merge the release branch into `main`, and tag that commit as `v<version>`.
6. Publish a GitHub Release for that tag, attaching the XPI and `SHA256SUMS`. Confirm the release hash matches the public update manifest.

Do not commit `dist/`, local data, secrets, or earlier installation packages. GitHub provides source archives from the release tag. Publication is an explicit maintainer action.
