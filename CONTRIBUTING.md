# Contributing to Typing Atlas

Typing Atlas is easiest to extend through layout packs. A layout pack teaches the app what a physical keyboard should show, how drills should split by hand, and which characters should be practiced.

## Good first contributions

- Verify an existing keyboard layout against a real operating system layout
- Add a new language or keyboard layout
- Improve layout documentation and references
- Report browser, OS, or IME input behavior that breaks drills
- Improve README examples for new contributors

## Add a keyboard layout

1. Open `src/data/layouts.ts`.
2. Add a new layout entry.
3. Define visible key labels for each physical key.
4. Set the writing direction with `direction: 'ltr'` or `direction: 'rtl'`.
5. Set `handSplitAfter` for row 1, row 2, and row 3.
6. Add characters to `practicePath`.
7. Run `npm run build`.
8. Open a pull request with the layout reference you used.

## Layout data checklist

Each layout should include:

- `id`: stable URL-safe identifier, for example `ar-windows-101`
- `name`: readable display name
- `locale`: language or locale code
- `direction`: `ltr` or `rtl`
- `description`: short explanation of the layout
- `rows`: physical keyboard rows with `code`, `label`, and optional `width`
- `handSplitAfter`: left/right hand split points for row 1, row 2, and row 3
- `practicePath`: characters used by generated drills

## Physical key codes

Use physical keyboard codes such as:

- `KeyQ`, `KeyW`, `KeyE`
- `KeyA`, `KeyS`, `KeyD`
- `KeyZ`, `KeyX`, `KeyC`
- `Digit1`, `Digit2`, `Digit3`
- `Semicolon`, `Quote`, `BracketLeft`, `BracketRight`
- `Space`

The `code` value describes the physical key. The `label` value is what the user sees when that layout is active.

## Hand split guidance

`handSplitAfter` describes how many letter keys belong to the left hand for each typing row.

Example:

```ts
handSplitAfter: [5, 5, 5]
```

This means:

- Row 1 uses 5 keys for the left hand, then the rest for the right hand
- Row 2 uses 5 keys for the left hand, then the rest for the right hand
- Row 3 uses 5 keys for the left hand, then the rest for the right hand

For Arabic and other RTL layouts, the visual reading direction may be right-to-left, but the split should still reflect the physical keyboard hand zones.

## References

When adding a layout, prefer references that match what users actually enable on their computer:

- Operating system keyboard layout documentation
- CLDR keyboard data
- Vendor keyboard layout diagrams
- Screenshots from OS keyboard viewers
- Widely used national keyboard layout standards

Avoid guessing key placement from memory. Incorrect layout data makes drills harmful because users learn the wrong muscle memory.

## Before opening a pull request

Run:

```bash
npm run build
```

Then include:

- The layout name
- The language or locale
- The operating system or standard used as reference
- Notes about RTL, IME, dead keys, or special input behavior
- Screenshots if the visual keyboard mapping changed

