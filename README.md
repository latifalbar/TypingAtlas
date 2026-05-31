# Typing Atlas

Multilingual keyboard drill lab for layouts, scripts, and muscle memory.

[Open the app](https://latifalbar.github.io/TypingAtlas/)

Typing Atlas is a browser-based practice app for learning keyboard layouts across languages and scripts. It focuses on structured drills, row-based practice, performance tracking, and Unicode-aware input handling so users can build reliable typing habits on a physical keyboard.

The project is intentionally not a virtual keyboard. It is a training tool for people who want to learn where letters live on a real keyboard layout, then repeat those movements until the layout becomes familiar.

## What it is for

- Keyboard layout practice by row, side, and combined hand groups
- Script-aware drills for multilingual typing practice
- Progress tracking with WPM and strokes per second
- GitHub Pages-friendly deployment with no backend required

## How it works

Typing Atlas starts from a layout pack. Each layout defines the visible key labels, physical key codes, writing direction, hand split points, and the characters used for drills.

From that layout data, the app generates practice groups such as:

- Row 1, left
- Row 1, right
- Row 2, left
- Row 2, right
- Row 3, left
- Row 3, right
- Left
- Right
- Left+Right

During a drill, the app shows the target sequence, highlights the next key on the keyboard preview, compares input by Unicode grapheme clusters, and records speed as WPM and strokes per second.

## Why it exists

Most typing tools assume a single Latin keyboard workflow. Typing Atlas is designed for layouts and scripts that need more deliberate practice, including non-Latin input patterns and layout-specific muscle memory.

## Current scope

- Browser-only frontend
- Layout selection and drill selection
- Unicode-aware grapheme scoring
- RTL layout support, currently demonstrated with Arabic (101)
- Session performance charting
- Public repo friendly structure

## Supported layouts

Current built-in layouts include:

- Arabic (101)
- German (QWERTZ)
- English (QWERTY)
- Russian (ЙЦУКЕН)

Arabic (101) is included as the first right-to-left layout. It demonstrates RTL drill rendering, Arabic key labels, and hand split mapping for a common Arabic keyboard layout.

Russian (ЙЦУКЕН) is included as a Cyrillic layout for practicing the standard Russian keyboard arrangement on a physical QWERTY keyboard.

More languages and keyboard layouts can be added over time. The app is designed so new layout packs can be contributed without rewriting the drill engine.

## Adding another language or layout

New languages are added by defining a new layout entry in `src/data/layouts.ts`.

Each layout needs:

- `id`: stable URL-safe identifier, for example `ar-windows-101`
- `name`: display name shown in the app
- `locale`: language or locale code, for example `ar`, `de`, or `en`
- `direction`: `ltr` or `rtl`
- `description`: short explanation of the layout
- `rows`: physical keyboard rows with `code`, `label`, and optional `width`
- `handSplitAfter`: split points for row 1, row 2, and row 3
- `practicePath`: characters used for generated drills

The `code` value should describe the physical key, such as `KeyQ`, `KeyW`, `Semicolon`, or `BracketLeft`. The `label` value is what the user sees and practices for the selected layout.

Example shape:

```ts
{
  id: 'example-layout',
  name: 'Example Layout',
  locale: 'xx',
  direction: 'ltr',
  description: 'Short description of the layout.',
  rows: [
    [{ code: 'Digit1', label: '1' }],
    [{ code: 'KeyQ', label: 'q' }],
    [{ code: 'KeyA', label: 'a' }],
    [{ code: 'KeyZ', label: 'z' }],
    [{ code: 'Space', label: 'Space', width: 5.6 }],
  ],
  handSplitAfter: [5, 5, 5],
  practicePath: ['q', 'a', 'z'],
}
```

When adding a real layout, prefer documented platform layouts such as Windows keyboard layouts, CLDR keyboard data, or widely used OS layout references. This keeps the app useful for people practicing against the keyboard layout they actually have enabled.

## URL structure

Typing Atlas uses hash routes so it can run reliably on GitHub Pages without a backend rewrite rule.

- `#menu`
- `#layout/ar-windows-101`
- `#drill/ar-windows-101/row-1-left`
- `#layout/ru-jcuken`
- `#drill/ru-jcuken/row-1-left`

## Running locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

1. Push changes to the `main` branch.
2. In the GitHub repository, open **Settings → Pages**.
3. Set **Source** to **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will build and deploy automatically on every push to `main`.

## Acknowledgements

Typing Atlas is inspired by the focused drill experience of
[Steno Jig](https://github.com/JoshuaGrams/steno-jig) by Joshua Grams.

Typing Atlas does not aim to be a steno trainer. It adapts the idea of
minimal, repeatable keyboard drills for multilingual keyboard layout practice.

## Notes

- This project is intentionally focused on practice, not on being a virtual keyboard.
- The app is designed to be deployed as a static site.
- Layout packs and drill groups can be extended over time.
- Browser input behavior can vary by operating system, active keyboard layout, and IME settings.
