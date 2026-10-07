# Nom Cloud Design Skills

This document defines the design system and product conventions for Nom Cloud so new features match the existing product instead of drifting into a different visual language.

The goal is not to create a separate design framework. The goal is to preserve the system that already exists in this repository: premium, clear, multilingual, role-aware, and fast to prototype.

## 1. Design intent

Nom Cloud is a premium school-management product with a polished SaaS feel. The design direction is intentionally restrained:

- Clear information hierarchy
- Spacious layout and generous whitespace
- Strong contrast and readable typography
- Easy navigation across admin, teacher, and parent flows
- Multilingual support with Arabic RTL behavior
- Brandable experiences for each school
- Functional UI over decorative complexity

The system should feel like a premium product prototype, not a noisy marketing site and not a generic dashboard template.

## 2. Core design principles

### Premium but practical
Use clean surfaces, strong spacing, crisp borders, and readable typography. Avoid visual noise, heavy gradients, or overly playful interactions.

### Clear communication first
Every screen should make the user instantly understand:
- what they are looking at
- what action is available
- what state the system is in
- what the next step is

### Consistent component language
Use the existing component structure rather than inventing new patterns. If a thing is shared across screens, put it in the design system layer instead of duplicating the same markup in ad hoc places.

### Multilingual by default
All new UI should be designed with translation in mind. Strings should be added through the existing language pattern, not hardcoded in components when a shared translation path exists.

### RTL-aware layout
Arabic screens must remain readable and visually balanced. Any layout change should preserve left-to-right and right-to-left behavior.

### Role-aware clarity
Different roles have different needs. The UI should feel tailored to Admin, Teacher, and Parent flows, but still keep a shared product language across the app.

## 3. Existing system structure

The design system is already organized in this repository.

### Component layers
- `src/components/ui/` = reusable primitives
- `src/components/layout/` = shell and global layout pieces
- `src/components/dashboard/` = role-specific app widgets and dashboards
- `src/components/marketing/` = landing-page and marketing blocks

This separation exists for a reason: shared primitives belong in `ui`, app-specific building blocks belong in `dashboard`, and marketing-only pieces belong in `marketing`.

### Styling approach
This project uses Tailwind CSS with component-driven UI. New UI should follow the existing Tailwind pattern instead of introducing custom CSS modules, inline style-heavy implementations, or a second styling system.

### State and data model
The app already centralizes state in the React context layer (`src/context/`) and keeps the mock backend pattern in `DataContext`. New UI should work with this pattern and avoid creating disconnected local state for shared data unless there is a clear reason.

## 4. Design system rules for new work

### Rule 1: Start from the existing primitive layer
If a new UI element is reused across multiple pages, it should be added to `src/components/ui/`.

Examples:
- Buttons
- Inputs
- Selects
- Modals
- Tabs
- Cards
- Table cells
- Avatars
- Switches

Do not build one-off UI in a feature page if it will be reused elsewhere.

### Rule 2: Keep layout patterns consistent
Use the established layout conventions already present in the app shell, dashboards, and marketing pages.

Common patterns to preserve:
- clear page headers
- dialog-like actions and modals when an action requires context
- consistent card surfaces
- spacing rhythm based on the existing design language
- predictable navigation hierarchy

### Rule 3: Keep app UI and marketing UI visually aligned
The marketing site and the product dashboard should feel like the same brand, even when they serve different purposes.

Examples:
- The product should not become overly playful compared to marketing.
- The marketing site should not become a totally different visual universe than the app.
- The same product trust and clarity should appear across both.

### Rule 4: Respect the brand and role context
When adding a feature, make sure it matches the current context:
- Admin screens can be more data-intensive
- Parent screens should feel reassuring and simple
- Teacher screens should support tasks and classroom flow
- Marketing screens should be polished and persuasive, not merely functional

### Rule 5: Preserve the language system
If a new interface is added, it must support English, Somali, and Arabic unless a feature is intentionally language-limited. Do not add strings directly without checking the translation pattern used in the app.

### Rule 6: Keep accessibility in the default path
New components should preserve accessibility by default:
- proper semantic elements
- visible focus states
- readable contrast
- sufficient labels and instructions
- keyboard support
- screen-reader friendly structure

### Rule 7: Prefer simplicity over novelty
Do not add decorative effects when a clean, clear solution already exists. This project intentionally avoids heavy animation libraries and unnecessary complexity.

## 5. New feature checklist

Before merging or adding a feature, confirm the following:

- It uses the existing component structure where appropriate
- It follows the repo's Tailwind-based styling pattern
- It matches the visual tone of the existing product
- It does not create a disconnected design language
- It supports the role-specific context
- It works in the multilingual system
- It respects the Arabic RTL layout
- It preserves accessibility and keyboard usability
- It integrates cleanly with the existing data context and mock backend pattern

## 6. Recommended naming and placement

When creating a new feature or component, place it according to its responsibility:

- Shared UI primitive → `src/components/ui/`
- App-shell or page scaffold → `src/components/layout/`
- Multi-user dashboard widget → `src/components/dashboard/`
- Marketing feature block → `src/components/marketing/`
- Business logic / mock data integration → `src/context/`, `src/data/`, `src/services/`

Avoid placing one-off UI code directly inside page components when it has reusable value.

## 7. Design quality bar

The design bar for Nom Cloud is:

- polished enough for a premium SaaS prototype
- straightforward enough for real product use
- clear enough for multilingual and role-based navigation
- functional enough to support the demo workflow without feeling fake
- consistent enough that different contributors can extend it without breaking the product identity

## 8. Practical rule for contributors

If you are unsure where a new UI belongs, ask:

1. Is this a reusable primitive? → add to `src/components/ui/`
2. Is this part of the app shell or global layout? → add to `src/components/layout/`
3. Is this for the authenticated app experience? → add to `src/components/dashboard/`
4. Is this for the public marketing site? → add to `src/components/marketing/`
5. Is this just one page-specific feature with no reuse? → keep it local, but still follow the same visual rules

This is the simplest way to keep the product consistent as the codebase grows.

## 9. Summary

Nom Cloud already has a strong frontend direction: premium SaaS styling, clear structure, multilingual support, role-based dashboards, and a simple Tailwind-driven system.

The goal of this design skill is simple: keep all new additions aligned to that direction so the product feels like one system, not a collection of disconnected screens.

Any new feature should be designed to match the existing product experience, not introduce a different aesthetic or separate design standard.
