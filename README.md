# Typing Atlas

Multilingual keyboard drill lab for layouts, scripts, and muscle memory.

[Open the app](https://latifalbar.github.io/TypingAtlas/)

Typing Atlas is a browser-based practice app for learning keyboard layouts across languages and scripts. It focuses on structured drills, row-based practice, performance tracking, and Unicode-aware input handling so users can build reliable typing habits on a physical keyboard.

## What it is for

- Keyboard layout practice by row, side, and combined hand groups
- Script-aware drills for multilingual typing practice
- Progress tracking with WPM and strokes per second
- GitHub Pages-friendly deployment with no backend required

## Why it exists

Most typing tools assume a single Latin keyboard workflow. Typing Atlas is designed for layouts and scripts that need more deliberate practice, including non-Latin input patterns and layout-specific muscle memory.

## Current scope

- Browser-only frontend
- Layout selection and drill selection
- Unicode-aware grapheme scoring
- Session performance charting
- Public repo friendly structure

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

## Notes

- This project is intentionally focused on practice, not on being a virtual keyboard.
- The app is designed to be deployed as a static site.
- Layout packs and drill groups can be extended over time.
