# SHE-VALLEY — Design System Specification

> **Positioning:** Accessible Premium  
> **Direction:** Minimal, Warm, Dignified, Modern, Mobile-First, Bilingual (`bn` & `en`)  
> **Anti-Patterns Avoided:** Neon colors, excessive pink, visual clutter, flash-sale countdown spam, pill badge clutter, thick left accent borders.

---

## 1. Color Architecture (60–30–10 Balance)

| Token | Hex | Contrast on Ivory | Usage |
| :--- | :--- | :--- | :--- |
| **Warm Ivory** (`--color-brand-ivory`) | `#F7F1EB` | Base | 60% Primary page canvas |
| **Elevated Ivory** (`--color-brand-ivory-elevated`) | `#FBF8F5` | Surface | 30% Cards, modals, form fields |
| **Muted Sand** (`--color-brand-ivory-muted`) | `#EFE6DD` | Surface | Subtle secondary areas & skeletons |
| **Hairline Border** (`--color-brand-border`) | `#E4D8CE` | Divider | 1px card, input, and table borders |
| **Deep Burgundy** (`--color-brand-burgundy`) | `#6E1F35` | ~9.8:1 (white text) | 10% Primary CTAs, active tabs, focus rings |
| **Burgundy Hover** (`--color-brand-burgundy-hover`) | `#58172A` | ~11.6:1 | Primary button hover state |
| **Charcoal** (`--color-brand-charcoal`) | `#252225` | ~13.9:1 | Primary ink & headings |
| **Charcoal Muted** (`--color-brand-charcoal-muted`) | `#575056` | ~6.8:1 | Hints, metadata, captions |
| **Muted Rose** (`--color-brand-rose`) | `#B87A88` | Accent | Editorial highlights & subtle borders |
| **Dusty Nude** (`--color-brand-nude`) | `#DEC8BF` | Accent | Tactile warmth & swatch accents |

### Semantic Status Pairings (Accessible Color + Label/Icon)
- **Success:** `#1F5E43` on `#ECF5F0`
- **Warning:** `#8A5314` on `#FBF3E7`
- **Error:** `#991B2E` on `#FCECEF`
- **Info:** `#3B4254` on `#EFF1F5`

---

## 2. Typography & Bilingual Script Support

- **Display Serif:** `Cormorant Garamond` paired with `Noto Sans Bengali` for editorial headings (`text-wrap: balance`).
- **Body Sans-Serif:** `Plus Jakarta Sans` paired with `Noto Sans Bengali` for crisp English and Bengali legibility (`15px–16px`, `line-height: 1.58` EN / `1.68` BN).
- **Tabular Monospace:** `JetBrains Mono` with `tabular-nums` for BDT prices, order IDs, SKUs, and tables.

---

## 3. Layout, Spacing, Radius & Elevation

- **Container Widths:** `sm` (`768px`), `md` (`1024px`), `lg` (`1200px`), `full` (`1440px`) with `px-4 sm:px-6 lg:px-8`.
- **Responsive Breakpoints:** Mobile-first (`< 640px`), `sm` (`640px`), `md` (`768px`), `lg` (`1024px`), `xl` (`1280px`).
- **Border Radius Scale:** `sm` (`6px`), `md` (`8px`), `lg` (`12px`), `xl` (`16px`). Inner radius respects `r_inner = r_outer - padding`.
- **Elevation:** Single-level soft shadow (`--shadow-soft`) or `1px` hairline border—never nested cards inside cards.
- **Touch Targets:** Interactive controls enforce minimum `44px` height on touch viewports (`min-h-11`).

---

## 4. Component Inventory (Command 01)

All primitives live in `src/components/ui/`, `src/components/layout/`, and `src/components/feedback/`:
- **Actions & Form Inputs:** `Button` (`primary`, `secondary`, `ghost`, `danger`), `Input`, `Textarea`, `Select`, `Checkbox`, `Radio` / `RadioGroup`, `FormField`.
- **Surfaces & Navigation:** `Card`, `Badge`, `Modal`, `Dropdown`, `Breadcrumb`, `Table`, `ResponsiveContainer`, `TopBar`.
- **Feedback & States:** `Toast` (+ `useToast`), `Alert`, `Skeleton`, `LoadingIndicator`, `EmptyState`, `ErrorBoundary`.
