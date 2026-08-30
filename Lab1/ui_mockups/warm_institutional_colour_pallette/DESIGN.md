---
name: Warm Institutional
colors:
  surface: '#fff8f7'
  surface-dim: '#ffcecf'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0f0'
  surface-container: '#ffe9e9'
  surface-container-high: '#ffe1e1'
  surface-container-highest: '#ffdada'
  on-surface: '#40000c'
  on-surface-variant: '#524345'
  inverse-surface: '#620e1c'
  inverse-on-surface: '#ffedec'
  outline: '#857375'
  outline-variant: '#d7c1c4'
  surface-tint: '#8c4a58'
  primary: '#2a000c'
  on-primary: '#ffffff'
  primary-container: '#461220'
  on-primary-container: '#c17785'
  inverse-primary: '#ffb2bf'
  secondary: '#a93342'
  on-secondary: '#ffffff'
  secondary-container: '#ff7480'
  on-secondary-container: '#73061e'
  tertiary: '#1f0a02'
  on-tertiary: '#ffffff'
  tertiary-container: '#381f12'
  on-tertiary-container: '#ab8471'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffd9de'
  primary-fixed-dim: '#ffb2bf'
  on-primary-fixed: '#3a0817'
  on-primary-fixed-variant: '#703341'
  secondary-fixed: '#ffdada'
  secondary-fixed-dim: '#ffb3b5'
  on-secondary-fixed: '#40000c'
  on-secondary-fixed-variant: '#891a2c'
  tertiary-fixed: '#ffdbcb'
  tertiary-fixed-dim: '#e9bda9'
  on-tertiary-fixed: '#2d1509'
  on-tertiary-fixed-variant: '#5f4030'
  background: '#fff8f7'
  on-background: '#40000c'
  surface-variant: '#ffdada'
  deep-burgundy: '#461220'
  cinnabar: '#b23a48'
  salmon: '#fcb9b2'
  peach: '#fed0bb'
  surface-warm: '#fffcfb'
typography:
  display-lg:
    fontFamily: Public Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Public Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Public Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Public Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Public Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style

This design system is built for a professional, civic-minded environment that balances institutional authority with a sophisticated, warm personality. It moves away from the cold blues typically associated with government platforms, instead utilizing a rich palette of deep burgundy and peach to evoke a sense of heritage, warmth, and accessibility.

The design style is **Corporate / Modern**, emphasizing reliability and clarity. It draws inspiration from high-density, functional interfaces but softens the experience through a harmonious color story. The aesthetic response should be one of "Warm Precision"—feeling as official and trustworthy as a government portal, yet as refined and inviting as a luxury heritage brand. 

Whitespace is used strategically to maintain a sense of calm and order, ensuring that dense information remains legible and non-intimidating for all citizens.

## Colors

The color strategy is anchored by high-contrast pairings that ensure accessibility while maintaining a unique brand identity. 

- **Primary Brand & Surface:** **Deep Burgundy (#461220)** is the foundation. It is used for top-level navigation, primary headers, and high-contrast surfaces to provide institutional weight.
- **Primary Action:** **Cinnabar (#b23a48)** is the color of intent. It is reserved for primary buttons, active states, and critical highlights that require immediate user attention.
- **Secondary Surfaces:** **Peach (#fed0bb)** and **Salmon (#fcb9b2)** serve as soft container backgrounds and accents. These colors reduce the harshness of a purely white-and-gray interface, creating a "Warm Institutional" feel.
- **Neutral/Foundation:** Deep muted tones of the brand reds are used for borders and subtle text to maintain a monochromatic harmony.

The default mode is **Light**, utilizing a very subtle off-white **Surface Warm** to prevent eye strain on high-density pages.

## Typography

This design system utilizes **Public Sans** across all levels to maintain a neutral, accessible, and institutional tone. As a typeface designed specifically for government services, it ensures maximum legibility for a diverse user base.

Visual hierarchy is achieved through a structured scale where headings use heavier weights (SemiBold and Bold) to stand out against the high-contrast burgundy surfaces. Body text is kept clean and spacious. Label styles utilize slightly increased letter spacing and uppercase styling where appropriate to differentiate metadata from primary body content. On mobile devices, the headline scale is tightened to preserve screen real estate while maintaining a clear content structure.

## Layout & Spacing

The layout is built on a **12-column fixed grid** for desktop, ensuring content remains centered and readable on ultra-wide monitors, transitioning to a fluid model on smaller screens. 

- **Spacing Rhythm:** A strict 4px/8px base unit system is used to maintain mathematical consistency. 
- **Desktop:** 64px outer margins with a 24px gutter. Main content area is capped at 1200px for optimal line lengths.
- **Tablet:** 32px outer margins; cards typically span 6 columns (50% width).
- **Mobile:** 16px outer margins. The grid collapses to a single column, with vertical spacing increased between distinct sections to improve touch targets and visual breathing room.

## Elevation & Depth

Hierarchy is primarily established through **Tonal Layers** rather than shadows, echoing the flat, professional aesthetic of modern civic design.

- **Level 0 (Background):** The off-white `surface-warm` foundation.
- **Level 1 (Sub-containers):** Containers use the `Peach` or `Salmon` colors with no shadows to group related information.
- **Level 2 (Interactive/Floating):** Use a 1px border of `Deep Burgundy` at 10% opacity for cards. 
- **Active Elevation:** Only reserved for high-priority floating elements (like dropdowns or modals), using a soft, diffused shadow tinted with the primary burgundy: `0px 8px 24px rgba(70, 18, 32, 0.12)`.

This approach ensures the UI feels "grounded" and structurally sound.

## Shapes

The design system uses a **Soft (4px)** shape language. This subtle rounding provides a modern touch without sacrificing the "serious" nature of a civic-minded product.

- **Primary Components:** Buttons, input fields, and small cards use a consistent `0.25rem` (4px) radius.
- **Large Containers:** Modals or large dashboard cards use `rounded-lg` (8px) to soften their visual impact.
- **Interactive States:** Focus states should follow the 4px radius, with a 2px offset border in `Cinnabar` to ensure clear keyboard navigation.

## Components

- **Buttons:** 
  - *Primary:* Solid **Cinnabar (#b23a48)** with White text. Use 4px roundedness.
  - *Secondary:* Ghost style with a **Deep Burgundy** 1px border and text.
- **Input Fields:** Background is white with a 1px border in a muted red-gray. On focus, the border changes to **Cinnabar** with a soft peach glow. Labels are positioned above the field in `label-lg`.
- **Chips & Tags:** Use **Salmon (#fcb9b2)** backgrounds with **Deep Burgundy** text for high legibility.
- **Cards:** White or very light peach background. Headers within cards should use the `Deep Burgundy` text to anchor the content.
- **Lists:** Use a 1px divider in a very light burgundy tint. Leading icons or avatars should be encased in a **Peach** circle to provide a warm focal point.
- **Selection Controls:** Checkboxes and radio buttons use **Cinnabar** for the selected state to ensure high visibility against white backgrounds.