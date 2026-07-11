# CloakScan brand assets

Ben's finalized brand kit for the v0.9.0 logo + wordmark refresh. These PNGs are the
reference/source of truth. Recreate the in-app logo as a clean **SVG** from them.

## Files
- **`logo-svg-ready.png`** - the build blueprint. Shows the flat mark in three variants
  (Full color, Mono dark, Mono mint) plus the icon construction: **shield outline +
  cloak swoosh + secure indicator (pill with three dots) = finished mark**. Build
  `ShieldLogo.tsx` as an SVG from the **Full color** variant.
- **`cloakscan-mark-glossy.png`** - the glossy/3D hero version of the mark. Use for
  large/marketing contexts and as the visual target for the app-icon tiles. Do not try
  to reproduce the gloss in the tiny in-app SVG.
- **`brand-sheet-app-icons.png`** - app-icon tiles at 512 / 180 / 32 for dark and light
  backgrounds (rounded-square). Reference for the generated icon set.
- **`brand-sheet-overview.png`** - logo sizes, wordmark, header lockup, and the palette.

## Wordmark — white "Cloak" + green "Scan"
Split the display wordmark into two colored spans. `aria-label="CloakScan"` on the
wrapper, `aria-hidden` on the parts, so screen readers read "CloakScan" once.
Use it for the **display wordmark only** (Header brand + AboutView `<h1>`), never in body prose.
- "Cloak" = `#F2F4F5` (near-white)
- "Scan" = `#34D399` (accent green)

## Palette
| Token | Hex | Use |
| --- | --- | --- |
| white | `#F2F4F5` | wordmark "Cloak", light text on dark |
| accent | `#34D399` | wordmark "Scan", shield, pill |
| accent-mid | `#10B981` | gradient mid-stop / secondary green |
| deep | `#137A6B` | swoosh depth / darker teal |
| bg | `#0D1112` | dark background, the redaction dots are punched out in this color |

Note: the app CSS currently uses `--text #e7ece9` and `--accent #34d399`. Align the
wordmark/logo to the brand hexes above; keep `--accent` (they already match).

## In-app logo notes
- Build `ShieldLogo.tsx` as a flat SVG matching the **Full color** variant in
  `logo-svg-ready.png`: mint shield outline, green cloak swoosh sweeping behind, and the
  secure-indicator pill with three dark dots. Keep `role="img"` + `aria-label="CloakScan logo"`
  and the `brand-mark` className; it must stay crisp at 24px.
- Regenerate app icons + favicon (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`)
  from a 1024px render of that SVG via `tauri icon`. If the glossy tiles in
  `brand-sheet-app-icons.png` are wanted as the shipped icons instead, export them as real
  512/180/32 PNGs into this folder and point `tauri icon` at the 512 version.
