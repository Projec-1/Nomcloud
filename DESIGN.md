# Nom Cloud interface system

## Direction

**School Register** is a shared visual language for school operations and platform administration. Clear headings, aligned records, concise status labels, and direct actions help staff scan real work without forcing every surface into a table.

The public site uses editorial product storytelling and existing school photography. Authenticated workspaces prioritize daily tasks, readable records, and role-specific navigation.

## Foundations

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Canvas | `#f7f8f6` | `#171917` | Page background |
| Surface | `#ffffff` | `#202320` | Main content surfaces and controls |
| Muted surface | `#f0f2ef` | `#292d29` | Secondary grouping |
| Text | `#222321` | `#f3f4f1` | Primary content |
| Muted text | `#555954` | `#b8bcb6` | Supporting content |
| Border | `rgba(34, 35, 33, 0.12)` | `rgba(243, 244, 241, 0.12)` | Subtle separation |
| Accent | `#c9471b` | `#c9471b` | Primary actions and brand emphasis |

The design uses DM Sans for interface copy and Space Grotesk for display headings. The shared radius is 10px. Elevation is communicated with spacing and borders, not drop shadows. Status colors remain semantic and always accompany readable status text.

### Operator Center

The Operator Center keeps the Nom Cloud orange accent (`#c9471b`) and uses its own scoped glass surfaces; do not extend these treatments to school workspaces. Keep the highest-frequency sections in the floating primary navigation and organize remaining modules in the grouped “More” menu. Use warm peach/orange reflections sparingly on layered neutral glass, capsule navigation/actions/filters, and progressively stronger shell, panel, control, and popover surfaces with independently tuned light and dark values. Maintain clear table and form contrast, preserve every route, and make glass opaque when reduced transparency is requested.

## Layout and components

- Use existing shared primitives such as `Button`, `Input`, `Select`, `Badge`, `Modal`, `EmptyState`, `ResourceGate`, `PageHeader`, and `StatCard`.
- Prefer intrinsic grid and flex layouts, `min-width: 0`, wrapping labels, and responsive 44px-or-larger controls.
- Use two columns for compact related summaries on narrow screens when that preserves legibility; keep tables horizontally scrollable within their own region.
- Reserve tables for comparable records. Use lists for activity, messages for conversations, and detail views for individual records.
- Use Phosphor icons consistently. Give icon-only buttons an accessible name and state.

## States and interaction

Keep loading, empty, denied, error, success, selected, disabled, and destructive states explicit. Do not use color alone to communicate a state. Preserve existing route behavior, school branding, language selection, Arabic RTL, authentication, and Supabase data flows.

## Motion

Motion follows the same School Register language: calm, clear and subordinate to school work.

- Use scroll reveals, text entrances, number rolls and network illustrations on public storytelling surfaces when they clarify hierarchy or explain the product.
- Keep authenticated dashboards, financial workflows and the Operator Center restrained. Use short fades for route continuity, clear state transitions for dialogs and drawers, and near-imperceptible press feedback.
- Use the existing `--nc-motion-ease`, `--nc-motion-ease-out` and duration tokens. Prefer opacity, transforms and limited clipping; do not animate layout dimensions outside disclosure components.
- Stagger only related content, with short offsets. Keep input, navigation and scrolling available while motion runs.
- Morph the mobile navigation mark between menu and close states. Keep the Nom Cloud wordmark and logo artwork recognizable.
- Keep optional sound off the interaction path; do not introduce sound unless it has a meaningful user-controlled preference.
- Honor `prefers-reduced-motion` with static positioning and brief opacity/color feedback. Honor reduced transparency by making translucent chrome solid.
- Do not add looping decorative motion or sound to operational screens. Treat sample data as sample data, including in animated counters.

## Scope and ownership

The system covers public and authentication surfaces, Administrator, Teacher, and Parent workspaces, and the separate platform Operator Center. There is no authenticated Student workspace in the existing route map. Backend behavior, authorization, database access, and routes are not design-system concerns and must remain unchanged.

Update this document when a shared token or component contract changes. Prefer improving the shared primitive over adding one-off page styles.
