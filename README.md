# Translation preview — VS Code extension for @les3dev/i18n

VS Code extension that shows translated values inline for [`@les3dev/i18n`](https://github.com/les3dev/i18n) calls in Svelte and TypeScript files.

## Features

- **Inline previews** — Translated values appear as decorations next to each `i18n.t()`, `i18n.translate()`, and `locals.translate()` call
- **Locale switcher** — Switch the preview locale at any time via the command palette
- **Click to navigate** — Click on any translation call to jump to that key in the locale file
- **Hover to inspect** — Hover over a decorated call to see the translation key
- **Auto-refresh** — Decorations update live as you edit your locale files or source code
- **Cursor-aware** — The decoration hides on the line you are currently editing so it never obscures what you type

## Requirements

Your project must use [`@les3dev/i18n`](https://github.com/les3dev/i18n) and follow the locale file layout it expects:

```
packages/shared/src/i18n/locales/en.ts
packages/shared/src/i18n/locales/fr.ts
```

## Commands

All commands are available from the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                         | Description                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `i18n: Change locale`           | Pick which locale to display in inline previews                                           |
| `i18n: Reload translations`     | Force-reload locale files without restarting VS Code                                      |
| `i18n: Open translation source` | Jump to the selected key in the locale file (also triggered by clicking a decorated call) |

## Settings

| Setting               | Type             | Default | Description                     |
| --------------------- | ---------------- | ------- | ------------------------------- |
| `i18n-preview.locale` | `"en"` \| `"fr"` | `"en"`  | Locale used for inline previews |

## How it works

The extension scans open `.svelte` and `.ts` files for the following call patterns:

```ts
i18n.t('key'); // Svelte context helper
locals.translate('key'); // SvelteKit server locals
i18n.translate('en', 'key'); // Direct translate call with explicit locale
i18n.translate(locale, 'key'); // Direct translate call with variable locale (uses selected locale)
```

Each match is decorated with the resolved translation value before the call. The call itself is visually collapsed so the decoration acts as a readable label. On the line where your cursor sits, the original source is shown instead.

Clicking a decorated call opens the corresponding locale file and scrolls to the exact line for that key.
