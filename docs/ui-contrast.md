# Hale UI contrast measurements

Ratios use the WCAG relative-luminance formula, rounded to two decimals. The values below are measured from the current CSS tokens in `apps/web/src/app/globals.css`. Normal text pairs target at least 4.5:1; large text and meaningful UI marks target at least 3:1.

## Light

| Foreground / background | Ratio | Use |
|---|---:|---|
| Forest `#244C37` / soft background `#F7FBF7` | 9.29:1 | Body text and headings |
| Forest `#244C37` / white `#FFFFFF` | 9.70:1 | Text on cards and controls |
| Forest `#244C37` / pastel `#E6F3E7` | 8.47:1 | Text on secondary surfaces |
| Leaf `#5C906B` / white `#FFFFFF` | 3.71:1 | Large accents and icons |
| Leaf `#5C906B` / pastel `#E6F3E7` | 3.24:1 | Large accents and icons |
| White `#FFFFFF` / Forest `#244C37` | 9.70:1 | Primary button label |
| Border `#DCEEDC` / white `#FFFFFF` | 1.21:1 | Subtle card and divider edge; not a sole status cue |

## Dark

| Foreground / background | Ratio | Use |
|---|---:|---|
| Text `#E6EFE9` / background `#0E1411` | 15.87:1 | Body text and headings |
| Text `#E6EFE9` / surface `#151D19` | 14.64:1 | Text on cards and controls |
| Text `#E6EFE9` / secondary surface `#1C2621` | 13.26:1 | Text on secondary surfaces |
| Muted `#A3B3AA` / background `#0E1411` | 8.51:1 | Supporting text and focus ring |
| Leaf `#7FB08E` / background `#0E1411` | 7.55:1 | Accents and icons |
| Forest `#0E1411` / sage button fill `#8CC29B` | 9.15:1 | Primary button label |
| Error `#FFB4A5` / background `#0E1411` | 10.94:1 | Error text and recording state |

## High contrast — light

High contrast defaults to the light scheme. A Light/Dark scheme selector appears beneath the High contrast choice.

| Foreground / background | Ratio | Use |
|---|---:|---|
| Black `#000000` / white `#FFFFFF` | 21.00:1 | All text and outlines |
| White `#FFFFFF` / deep green `#00331A` | 14.11:1 | Primary button label |

## High contrast — dark

| Foreground / background | Ratio | Use |
|---|---:|---|
| White `#FFFFFF` / black `#000000` | 21.00:1 | All text and outlines |
| Dark `#000000` / white `#FFFFFF` | 21.00:1 | Primary button label |
| Mint `#A8F0BE` / black `#000000` | 15.87:1 | Accents and icons |

High-contrast themes use 2px solid borders, underlined links, 3px offset focus rings, no shadows or animation, and full-opacity disabled text. Standard light borders are intentionally subtle, so status and selection are also conveyed with labels, icons, and surface changes.

## Family editorial text and button tokens

The family web uses color mixes of the existing palette to soften copy and keep small accent labels above AA; these do not introduce new hues.

| Theme | Derived muted copy | Copy ratio on background / surface | Derived accent ink | Ink ratio on background / surface |
|---|---|---:|---|---:|
| Light | `#527261` | 5.10:1 / 4.66:1 | `#437154` | 5.39:1 / 4.92:1 |
| Dark | `#B6BFB9` | 9.89:1 / 8.26:1 | `#ADCCB7` | 10.74:1 / 8.97:1 |
| High contrast light | `#383838` | 11.73:1 / 11.73:1 | `#001C0E` | 17.91:1 / 17.91:1 |
| High contrast dark | `#C7C7C7` | 12.42:1 / 12.42:1 | `#CFF7DB` | 17.98:1 / 17.98:1 |

Family primary button gradient endpoints use accent-to-Forest mixes and retain AA contrast: white on `#437154` / `#406E51` is 5.63:1 / 5.89:1 in Light; dark Forest `#0E1411` on `#ADCCB7` / `#B2D0BC` is 10.74:1 / 11.22:1 in Dark. High-contrast buttons stay solid, with 17.91:1 or better label contrast.

## Verification note

These are token-pair measurements, not a manual browser/assistive-technology audit of every rendered state. The offline Playwright matrix checks all routes at 360px, 768px, and 1440px across four themes and four text sizes; manual keyboard, screen-reader, forced-colors, and browser-zoom checks remain listed in `docs/ui-manual-qa.md`.
