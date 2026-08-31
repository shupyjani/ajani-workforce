# Ajani product design system

## Principles

Ajani's interface is calm, editorial, and operationally precise. Deep navy creates a dependable product frame; warm paper and sand keep dense information humane; teal communicates brand continuity; and gold is reserved for small signals. Status never depends on colour alone.

The system is deliberately implemented with CSS custom properties and small typed React primitives. It does not introduce a styling framework or a general-purpose component package without consumers.

## Naming and company attribution

The formal product name is "Ajani Workforce Platform"; interface navigation, breadcrumbs, and route titles use the short form "Ajani Workforce". Ajani Workforce is a genuine Ajani Healthcare product currently in pre-production. Company relationship and status are communicated as restrained text — "An Ajani Healthcare product", "Pre-production product", "Synthetic scenarios" — rather than large or repeated disclaimers. "Fictional" and "synthetic" describe only the preview's organisations, scenarios and records, never the product's existence or intended future use.

## Semantic tokens

`apps/web/src/index.css` is the source of truth for tokens.

| Category | Roles |
| --- | --- |
| Colour | Strong, standard, and muted ink; canvas, surface, subtle, and inverse surfaces; standard and strong borders; brand and accent roles; success, warning, danger, and information foreground/background pairs; focus colour. |
| Typography | System sans-serif body stack, repository-safe serif display stack, six fluid or fixed text sizes, tight display and readable body line heights. |
| Spacing | A 4px-rooted scale from `--space-1` through `--space-16`. |
| Sizing | Narrow and wide content bounds, desktop sidebar and top-bar sizes, and a 44px practical touch target. |
| Shape | Small, medium, large, and pill radii with subtle, card, and overlay elevation levels. |
| Focus | A high-contrast 3px focus ring with offset, applied through `:focus-visible`. |
| Motion | Fast and base durations with one standard easing curve; transitions and animations collapse under reduced-motion preference. |
| Breakpoints | Wide desktop above 1100px, compact tablet from 781–1100px, mobile below 781px, and narrow-data layout below 561px. |

The application sets `color-scheme: light` so operating-system theme settings cannot create an unreviewed alternate theme.

## Reusable patterns

- Buttons and text links provide primary, secondary, destructive, compact, full-width, disabled, hover, and focus behaviour. Destructive shift cancellation also requires textual acknowledgement.
- Fields pair explicit labels with hints, `aria-invalid`, and announced field-level errors.
- Badges combine text with neutral, success, warning, danger, or information styling.
- Alerts distinguish information, warning, error, and success with icons and text.
- Shift discovery cards, fact lists, eligibility panels, schedule cards, structured lists, timelines, coverage bars, empty states, error states, and skeletons share the same spacing and surface language.
- Semantic tables remain tables in the DOM and become labelled record cards on narrow screens.
- The shared dialog supports centred dialogs, mobile drawers, and notification panels with modal semantics, focus containment, Escape dismissal, outside-click dismissal, scroll locking, and focus restoration.
- Pagination exposes labelled previous and next controls and a current-page announcement.
- Toasts use polite status semantics for session feedback and service recovery.

## Public landing page

`/` renders a standalone public page (`apps/web/src/pages/LandingPage.tsx`) that does not use the authenticated `AppShell`. It reuses the same tokens, `BrandMark`, `Badge`, `Dialog`, and button/card primitives as the application shell rather than introducing a separate styling system.

- The header bar uses `--color-surface-inverse` (matching the sidebar) as a consistent brand anchor between the public page and the application shell. Buttons placed directly on it use `.button--secondary`, not `.button--primary`, because the primary button's dark background is not readable against the same dark navy.
- Section content below the header returns to the light canvas/surface palette used throughout the rest of the product, with dark `.landing-tableau__card--dark` panels used sparingly as accents, mirroring `.editorial-hero`.
- The mobile menu reuses the existing `Dialog` `variant="drawer"` rather than a new pattern.
- Status disclosure (`Pre-production product`, `Synthetic preview data`) uses the existing `Badge` tones (`information`, `neutral`) rather than new colours.

## Responsive shell

At desktop widths, a full sidebar shows the current preview role, descriptive navigation, and clean-room context. At tablet widths, it contracts to a stable icon rail while links retain accessible names. Below 781px, navigation moves to a touch-friendly drawer and the account control becomes compact. Wide data grids collapse, actions become full-width where useful, and tables become labelled cards below 561px. The minimum supported canvas is 320px.

## Accessibility expectations

- One skip link precedes all application controls.
- Sidebar, top bar, status region, and main content use semantic landmarks or labels.
- Every icon-only button has an accessible name; decorative icons are hidden from assistive technology.
- Route changes move focus to main content after client-side navigation, without bypassing the skip link on initial load.
- Dialogs and drawers restore focus, contain Tab navigation, and close with Escape.
- Loading, errors, validation, conflict recovery, service recovery, and success feedback use appropriate live-region or alert semantics. Mutation feedback receives programmatic focus after completion.
- Controls target at least 44px where practical, and focus is never communicated by colour alone.
- Reduced-motion preference disables meaningful animation loops and collapses transition durations.

Component tests cover Worker discovery/schedule/timesheets, Manager coverage/assignment/shift/timesheet routes, and Administrator compliance detail/oversight routes. Production-browser tests add representative axe WCAG A/AA scans, desktop and 390 × 844 mobile overflow checks, keyboard activation, dialog focus/Escape restoration, route focus and movement, live feedback, and reduced-motion behavior. Confirmation flows announce pending, conflict, error and success states and preserve native date, time and select controls. Forms retain visible labels, bounded native inputs, reasons for destructive or negative decisions, disabled duplicate submission, and text-first status. Automated checks supplement; they do not replace manual keyboard, zoom, contrast, screen-reader, and physical-device review before any real service.

## Assets and licensing

The Ajani brand mark, visual system, and `apps/web/public/ajani-social-preview.svg` are repository-authored assets created from the same documented tokens and geometric language. The SVG is the human-readable source of truth and contains only ordinary XML/SVG structure and accessibility metadata. No remote fonts or imagery are loaded. `lucide-react` 1.34.0 supplies icons under the ISC licence. React Router 7.18.2 is licensed under MIT and supplies navigation behaviour rather than visual assets.

The SVG is not referenced as an Open Graph image because SVG support varies across link-unfurl services and this pre-production preview has no canonical absolute URL. A later deployment task may use a deterministic local renderer to produce a reviewed raster derivative and add absolute social metadata. No rendering or hosting configuration is included yet.
