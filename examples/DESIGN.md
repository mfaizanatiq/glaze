---
version: alpha
name: DevFocus Dark
colors:
  primary: "#2665FD"
  secondary: "#475569"
  surface: "#0B1326"
  on-surface: "#DAE2FD"
  error: "#FFB4AB"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.05em
rounded:
  sm: 4px
  md: 8px
  lg: 12px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "#1E52D4"
    textColor: "{colors.on-surface}"
---

# DevFocus Dark

## Overview

A focused, minimal dark interface for a developer productivity tool. Clean lines, low visual noise, and high information density. The palette prioritizes legibility on long coding sessions while using a single accent blue for primary actions.

## Colors

- **Primary** (#2665FD): CTAs, active states, and key interactive elements
- **Secondary** (#475569): Supporting UI, chips, and secondary actions
- **Surface** (#0B1326): Page backgrounds
- **On-surface** (#DAE2FD): Primary text on dark backgrounds
- **Error** (#FFB4AB): Validation errors and destructive actions

## Typography

- **Headlines**: Inter, semi-bold — establish hierarchy without visual noise
- **Body**: Inter, regular, 14–16px — optimized for long-form reading
- **Labels**: Inter, medium, 12px, uppercase for section headers

## Layout

Use an 8px spacing rhythm. Group related content in cards with `lg` (24px) internal padding. Maintain generous vertical spacing between sections using `xl` (32px).

## Elevation & Depth

No heavy shadows. Depth is conveyed through **tonal layers** — surface backgrounds sit below elevated cards using border and background contrast rather than drop shadows.

## Shapes

Rounded corners at `md` (8px) for buttons and inputs. Cards may use `lg` (12px) for a softer container feel. Avoid mixing sharp and rounded corners in the same view.

## Components

### Buttons

Primary buttons use the brand blue fill with `rounded.md`. Reserve primary color for the single most important action per screen.

### Inputs

1px border with subtle surface-variant background. Use `body-md` typography for input text.

### Cards

No elevation — relies on border and background contrast against the surface layer.

## Do's and Don'ts

- Do use the primary color sparingly, only for the most important action
- Don't mix rounded and sharp corners in the same view
- Do maintain 4.5:1 contrast ratio for all text (WCAG AA)
- Do validate changes with `npx @google/design.md lint DESIGN.md`
