# Hale UI contrast measurements

Ratios use the WCAG relative-luminance formula, rounded to two decimals. Normal text is designed to exceed 4.5:1; large text and meaningful UI marks exceed 3:1. Leaf is reserved for icons, borders, large accents, and progress marks in the light theme.

## Light

| Foreground / background | Ratio | Use |
|---|---:|---|
| Forest `#244C37` / white `#FFFFFF` | 9.70:1 | Body text, headings, button text |
| Forest `#244C37` / soft white `#F7FBF7` | 9.29:1 | Text on the app background |
| Forest `#244C37` / pastel `#E6F3E7` | 8.47:1 | Text on secondary surfaces |
| Leaf `#5C906B` / white `#FFFFFF` | 3.71:1 | Icons and large accents only |
| Leaf `#5C906B` / pastel `#E6F3E7` | 3.24:1 | Icons, borders, and large accents |
| White `#FFFFFF` / Forest `#244C37` | 9.70:1 | Primary button label |
| Error `#8F281E` / white `#FFFFFF` | 8.43:1 | Error text and destructive action accents |

## Dark

| Foreground / background | Ratio | Use |
|---|---:|---|
| Sage text `#E6F3E7` / deep forest `#10251B` | 14.08:1 | Body text and headings |
| Sage text `#E6F3E7` / surface `#1A3526` | 11.60:1 | Text on cards and controls |
| Sage text `#E6F3E7` / forest-tint `#244C37` | 8.47:1 | Text on secondary surfaces |
| Leaf `#A9D2AE` / deep forest `#10251B` | 9.61:1 | Icons and key UI marks |
| Leaf `#A9D2AE` / surface `#1A3526` | 7.92:1 | Icons, borders, and large accents |
| Forest text `#10251B` / sage button fill `#DCEEDC` | 13.29:1 | Primary button label |
| Forest text `#10251B` / recording-stop fill `#FFB7AA` | 9.68:1 | Stop recording label |
| Error `#FFB7AA` / deep forest `#10251B` | 9.68:1 | Error text and recording state |

## High contrast — light

| Foreground / background | Ratio | Use |
|---|---:|---|
| Near-black green `#102B1B` / white `#FFFFFF` | 15.18:1 | All text and interactive outlines |
| Leaf `#155A32` / white `#FFFFFF` | 8.27:1 | Icons and focus/selection marks |
| White `#FFFFFF` / near-black green `#102B1B` | 15.18:1 | Primary button label |

## High contrast — dark

High contrast follows the operating system's light/dark preference; the user-facing switch remains “High contrast.”

| Foreground / background | Ratio | Use |
|---|---:|---|
| Sage `#E6F3E7` / deep green `#07190F` | 15.88:1 | All text and interactive outlines |
| Leaf/sage `#DCEEDC` / deep green `#07190F` | 14.98:1 | Icons and focus/selection marks |
| Deep green `#07190F` / sage button fill `#E6F3E7` | 15.88:1 | Primary button label |
| Error `#FFC0B6` / deep green `#07190F` | 11.66:1 | Error text and status |

Interactive controls use dark Forest/Leaf outlines, and high-contrast mode uses solid 2–3px outlines, underlined links, and 3px offset focus rings. Statuses pair text with an icon or other non-color cue. Disabled controls retain full text opacity.

## Verification note

These are token-pair measurements, not a browser audit of every rendered state. Check real pages with forced-colors/system contrast settings, browser zoom, and assistive technology during manual QA. The light-theme Sage border/fill token is used for secondary surfaces and dividers; interactive controls use Forest or Leaf contrast borders.
