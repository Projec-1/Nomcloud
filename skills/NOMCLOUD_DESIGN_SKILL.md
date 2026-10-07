# Nomcloud Design Skill

This skill teaches AI agents (and human contributors) how to design and implement new features in Nomcloud that align with the existing product language, component system, and accessibility standards.

This skill is a synthesis of:
- **frontend-design-pro** — Professional design workflows for production UI
- **impeccable** — Anti-slop detection and design quality gates
- **design-taste-frontend** — Direction inference and visual consistency
- **frontend-agent-skills** (9 sub-skills) — Accessibility, design systems, forms, navigation, components, and UX fundamentals

## 1. Nomcloud Product Context

**Product:** School management platform (Administrator, Teacher, Parent dashboards)

**Stack:** React 18 + TypeScript + Tailwind CSS + Lucide React icons

**Key Attributes:**
- Premium SaaS aesthetic (not playful, not minimal)
- Multilingual support (English, Somali, Arabic RTL)
- Role-based dashboards with shared component language
- Realistic mock backend in React Context
- Accessibility built-in (no afterthought)

## 2. Design Workflow: Shape → Build → Verify

### Phase 1: Shape (Design first)
Before writing code, ask these questions:

1. **Context clarity:** Where does this live? What role uses it? (Admin/Teacher/Parent/Marketing?)
2. **Pattern match:** Does this reuse an existing component from `src/components/ui/`?
3. **Visual hierarchy:** What is the primary action? What can recede?
4. **State clarity:** What states does this have? (loading, error, success, empty, disabled)
5. **Multilingual fit:** Will this work in English, Somali, and Arabic?
6. **RTL resilience:** Do text-heavy layouts remain balanced in RTL?
7. **Accessibility baseline:** What ARIA roles, labels, and keyboard flows are needed?

### Phase 2: Build
- Use existing component primitives from `src/components/ui/`
- Follow Tailwind class structure (no custom CSS unless unavoidable)
- Place the new component in the right layer (ui/, dashboard/, layout/, or marketing/)
- Add strings to `src/data/translations.ts` if they're reused
- Use React Context for shared state (don't create disconnected local state)

### Phase 3: Verify
Before merge, confirm:
- Visual consistency with existing product screens
- Responsive behavior across breakpoints
- Keyboard navigation (Tab, Arrow keys, Enter, Escape)
- Screen reader labels and announcements
- No hardcoded strings; all UI copy goes through translation system
- Works in RTL (test Arabic language mode)
- Accessible color contrast (WCAG AA minimum)

## 3. Component Architecture

### Layer 1: UI Primitives (`src/components/ui/`)
Reusable, single-purpose components. Examples:

- **Button** — primary, secondary, ghost, link variants; size and loading states
- **Input** — text, email, password, number; with validation states
- **Select** — dropdown with keyboard support
- **Modal** — accessible dialog; handles focus management
- **Tabs** — semantic tab patterns with keyboard control
- **Card** — content container with consistent padding/border
- **Avatar** — user icon with fallback
- **Switch** — accessible toggle
- **Table** — semantic table with sortable headers, pagination
- **Toasts** — temporary notifications (success, error, info, warning)

**When to add here:** Reused across 2+ pages or roles.

### Layer 2: Layout (`src/components/layout/`)
Structural pieces shared across the whole app:

- **PublicLayout** — header + footer for marketing pages
- **DashboardShell** — sidebar + topbar + content area
- **AuthLayout** — login/signup page frame
- **PageHeader** — consistent title, breadcrumb, action buttons
- **SEO** — meta tags for pages

**When to add here:** Part of the app shell or structure.

### Layer 3: Dashboard Widgets (`src/components/dashboard/`)
Multi-user, role-specific features:

- **AttendanceMarker** — mark present/absent
- **GradeBook** — student grades grid
- **TimetableGrid** — class schedule
- **MessagesPanel** — parent-teacher messages
- **AnnouncementsBoard** — school updates
- **HomeworkBoard** — homework assignment list

**When to add here:** Feature used by authenticated users across multiple pages.

### Layer 4: Marketing Blocks (`src/components/marketing/`)
Landing page only; features like:

- **Reveal** — scroll-triggered animations
- **HoverText** — interactive text effects
- **TiltCard** — 3D hover tilt
- **FaqAccordion** — expandable Q&A

**When to add here:** Marketing site only; does not belong in the app.

## 4. Styling Rules (Tailwind-First)

### Color palette (inferred from existing UI)
- **Primary**: Use Tailwind's blue family (trust, professional)
- **Accent**: Amber or teal (alerts, highlights)
- **Neutral**: Gray family (text, borders, backgrounds)
- **Semantic**: Green (success), Red (error/destructive), Yellow (warning), Blue (info)

### Spacing rhythm
- Buttons, inputs: 8px padding
- Cards, sections: 16px to 24px padding
- Page sections: 32px gaps
- Whitespace > density (premium feel, not cramped)

### Typography
- Headings: System font stack (no serif)
- Body text: System font stack (readability first)
- Hierarchy: Use weight (font-semibold, font-bold) and size (text-sm, text-base, text-lg)

### Borders and radius
- Buttons, inputs: Subtle border (gray-300)
- Cards: 8px radius (not overly rounded)
- Modals: 12px radius
- Small elements: 4px radius

### Shadows and depth
- Card hover: soft shadow (shadow-md)
- Modals: stronger shadow (shadow-lg)
- No neon glows, no double shadows

### Dark mode
- Nomcloud supports dark mode globally
- Use Tailwind's `dark:` prefix for dark variants
- Test both light and dark modes before shipping

## 5. Accessibility Baseline

Every new component **must** include:

### Semantic HTML
```tsx
// Good
<button type="button" aria-label="Close modal">×</button>
<input type="email" aria-label="Email address" required />
<nav aria-label="Main navigation">...</nav>

// Bad
<div onClick={...}>Close</div>
<input placeholder="email" />
<div>Main navigation</div>
```

### Focus management
- All interactive elements are keyboard accessible
- Visible focus indicator (usually browser default or Tailwind's focus:ring)
- Tab order is logical (top-to-bottom, left-to-right)
- Modal closes with Escape key

### ARIA labels
```tsx
// Use aria-label for icon-only buttons
<button aria-label="Delete item">🗑️</button>

// Use aria-describedby for helper text
<input aria-describedby="email-help" type="email" />
<small id="email-help">We'll never share your email.</small>

// Use aria-live for dynamic updates
<div aria-live="polite" aria-atomic="true">{message}</div>
```

### Color contrast
- Text on background: minimum 4.5:1 ratio (WCAG AA)
- Use tools: Chromium DevTools, WebAIM contrast checker

### Resilience
- Works at 200% zoom
- Works with browser text-size increase
- Works with RTL layout
- No information lost in reduced-motion mode

## 6. Forms, Inputs & Checkout

### Field grouping
Group related fields in sections. Don't dump all inputs on one page.

```tsx
<fieldset>
  <legend>Personal Information</legend>
  <Input label="First Name" />
  <Input label="Last Name" />
</fieldset>

<fieldset>
  <legend>Address</legend>
  <Input label="Street" />
  <Input label="City" />
</fieldset>
```

### Validation behavior
- Validate on **blur** (not keystroke)
- Show error message **below** the field
- Use `aria-invalid="true"` and `aria-describedby` for screen readers

```tsx
<Input
  type="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? "email-error" : undefined}
  onBlur={validate}
/>
{hasError && <ErrorMessage id="email-error">{error}</ErrorMessage>}
```

### Checkout/payment flows
- Progress indicator (step 1/3, step 2/3, etc.)
- Clear next/back buttons
- Don't auto-submit on Enter (user should click button)
- Show order summary throughout
- Confirm before final submission

## 7. Navigation & Information Architecture

### Hierarchy over flatness
Don't list every page in a hamburger menu. Group by task.

```
Admin Dashboard
├── Dashboard (overview, quick actions)
├── School Management
│   ├── Students
│   ├── Teachers
│   ├── Classes
├── Academic
│   ├── Attendance
│   ├── Grades
│   ├── Homework
├── Finance
│   ├── Fees
│   ├── Payments
│   ├── Reports
└── Settings
```

### Breadcrumbs for depth
When a page is 3+ levels deep, show breadcrumbs.

```
Admin / Finance / Payments / Student Fees
```

### Predictable navigation
- Primary action always on the right (or top)
- Secondary actions in a menu
- Destructive actions (Delete, Logout) are harder to hit

## 8. Error Handling & States

### Error messages (not generic blobs)
```
❌ Bad:   "Something went wrong."
✓ Good:  "We couldn't save your changes because the file is too large. Try one under 10MB."

❌ Bad:   "Invalid input."
✓ Good:  "Email address must include an @ symbol (e.g., you@school.edu)."
```

### Empty states (not blank pages)
Show what this section is for and how to populate it.

```tsx
<EmptyState 
  icon={<BookOpen />}
  title="No homework assigned yet."
  description="Assignments you create will appear here."
  action={<Button>Create Homework</Button>}
/>
```

### Loading states
- Show skeleton or spinner
- Disable form inputs during submission
- Never leave user in a gray zone

### Success feedback
- Toast notification (non-blocking)
- Or inline confirmation with a checkmark
- Auto-dismiss after 3-5 seconds

## 9. Multilingual & RTL Checklist

### Before shipping:
1. All strings run through `useLanguage().t('key')` (not hardcoded)
2. Test in Arabic (RTL) mode:
   - Text alignment flips correctly
   - Icons stay on correct side
   - Form inputs stay usable
   - Modals and overlays work
3. No assumptions about text length (English is short; Somali is longer)
4. Font styling works in all three languages

### Common RTL issues to avoid:
- Hardcoded `margin-left` → use Tailwind's logical properties (`ms-`, `me-`)
- Icons on the left → consider `flex-row-reverse` in RTL
- Images of text → translate or provide alternative

## 10. Responsive Design

### Breakpoints (Tailwind defaults)
- `sm: 640px` — small phones
- `md: 768px` — tablets
- `lg: 1024px` — desktops
- `xl: 1280px` — large desktops

### Mobile-first approach
```tsx
<div className="block md:flex"> {/* Block on mobile, flex on tablet+ */}
  <Sidebar className="w-full md:w-64" />
  <Content className="flex-1" />
</div>
```

### Touch targets
- Buttons: minimum 44×44px (mobile friendly)
- Links: minimum 44px tall
- Spacing: don't crowd touch targets

## 11. Motion & Animation

### Use sparingly
- Scroll-reveal: OK (subtle, on marketing site)
- Hover effects: OK (feedback)
- Bounce/elastic easing: avoid (dated feeling)
- Heavy 3D transforms: avoid (distracting)

### CSS-only (preferred)
```tsx
// Good: CSS transitions
<button className="hover:bg-gray-100 transition-colors duration-200" />

// Avoid: animation libraries (adds bundle size)
```

### Reduced motion
Respect user's motion preferences:
```tsx
// Disable animation if user prefers reduced motion
<div className="animate-pulse motion-safe:animate-pulse" />
```

## 12. Anti-Patterns to Avoid

### Visual noise
- ❌ Purple-to-blue gradients (overused, generic)
- ❌ Gradient overlays on every image
- ❌ Neon glows or drop shadows on text
- ❌ Transparent backgrounds with blurred content
- ✓ Clean surfaces, strong contrast, readable text

### Layout blunders
- ❌ Single-column layout on desktop (wastes space)
- ❌ 80+ character line length (hard to read)
- ❌ Cramped padding (< 8px)
- ❌ Images that stretch distorted
- ✓ Use available space, generous breathing room

### Interaction issues
- ❌ Click handlers on `<div>` without keyboard support
- ❌ Modals without Escape to close
- ❌ Forms that submit on Enter without warning
- ❌ Loading states without indication
- ✓ Full keyboard support, clear feedback

### Copy issues
- ❌ "Get Started" buttons with no context
- ❌ "Click Here" links (not descriptive)
- ❌ All-caps text blocks (hard to read)
- ❌ Jargon without explanation
- ✓ Action verbs, clear descriptions, sentence case

## 13. Feature Checklist Before Merge

Use this checklist when adding anything new to Nomcloud:

- [ ] Visual design matches existing product (no new aesthetic introduced)
- [ ] Component is placed in the correct folder (ui/, dashboard/, etc.)
- [ ] All reusable elements are extracted to `src/components/ui/`
- [ ] Styling uses Tailwind, not custom CSS
- [ ] Works in light and dark mode
- [ ] Responsive behavior tested (mobile, tablet, desktop)
- [ ] All UI copy is in `src/data/translations.ts` (English, Somali, Arabic)
- [ ] Arabic RTL mode tested and visually balanced
- [ ] Keyboard navigation works (Tab, Arrow keys, Enter, Escape)
- [ ] Focus indicators are visible
- [ ] Form fields have `aria-label` or associated `<label>` elements
- [ ] Modals/overlays have focus management
- [ ] Error messages are descriptive, not generic
- [ ] Empty states guide the user
- [ ] Loading states are indicated
- [ ] Success feedback is provided
- [ ] Accessibility contrast checked (WCAG AA minimum)
- [ ] Works with screen readers (test with browser AT)
- [ ] No hardcoded strings (all translatable)
- [ ] No one-off styles (use Tailwind classes)
- [ ] Component props are TypeScript-strict
- [ ] README added if component is complex

## 14. How to Use This Skill

### For AI agents:
When asked to add a feature, the agent should:
1. Read this skill to understand the architecture
2. Follow the Shape → Build → Verify workflow
3. Reference the component layer structure
4. Check the accessibility baseline
5. Run the pre-merge checklist
6. Ensure multilingual/RTL support

### For humans:
- Keep this skill in the repo root for reference
- Link to this from CONTRIBUTING.md
- Update it when product direction changes
- Add new patterns as they emerge

## 15. Connecting to External Skills

This skill synthesizes guidance from:

1. **frontend-design-pro** (PGraeff)
   - Professional design workflow
   - UI-copy filtering
   - Responsive & accessibility verification
   - Framework-specific patterns

2. **impeccable** (pbakaus)
   - Anti-slop detection (59 deterministic rules)
   - Design quality gates
   - Product context (`PRODUCT.md`)
   - Live browser iteration

3. **design-taste-frontend** (tenacityinc)
   - Direction inference from brief
   - Audit-first redesign
   - Anti-template guidance

4. **frontend-agent-skills** (hueyexe) — 9 sub-skills:
   - **accessibility-inclusive-design** — Keyboard, ARIA, resilient layouts
   - **design-systems-frontend-architecture** — Components, tokens, governance
   - **forms-inputs-checkout** — Validation, error states, checkout flows
   - **information-architecture-navigation** — Hierarchy, taxonomy, wayfinding
   - **interaction-patterns-components** — Pattern selection, state management
   - **ui-visual-composition** — Hierarchy, spacing, typography, color, depth
   - **ux-research-discovery-testing** — Lightweight research, testing, synthesis
   - **ux-usability-foundations** — Affordances, feedback, constraints, recall
   - **ux-writing-content-design** — Microcopy, labels, CTAs, empty states

When specific guidance is needed, refer to the sub-skill category above.

---

**Last Updated:** October 2026  
**For:** Nomcloud Frontend (React 18 + TypeScript + Tailwind + Lucide)  
**By:** Integrated from multiple open-source design skills
