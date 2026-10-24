# Frontend rules

This is the canonical frontend rulebook for Xeck. Keep documentation in English. Product copy may remain localized through the translation catalogs.

The visual direction is a calm, warm-neutral workspace: a distinct stone-toned sidebar rail, a soft ivory working surface, and clear field/card layers. Keep large surfaces free of blue casts and avoid stark whites or blacks. The user chooses one of eight curated accents (olive, clay, ochre, forest, azure, violet, rose, or teal); give each accent a matched light/dark pair and keep it out of large surfaces. Use tone, spacing, and typography to establish hierarchy.

## Design tokens and Tailwind

- Use Tailwind CSS v4 and the tokens defined in `web/src/styles/theme.css`. Put shared CSS in `web/src/styles/`; do not introduce a second styling system.
- Define colors only in `theme.css`. Components and other stylesheets must use semantic tokens rather than hex, RGB, or locally invented palettes.
- Use the same token names in both themes. Add a light and dark value for every new theme-dependent color. Components must not branch on the active theme.
- Use the existing type scale: `text-nano` (10px), `text-micro` (11px), `text-small` (12px), `text-ui` (13px), `text-body` (14px), `text-lead` (15px), `text-brand` (16px), `text-large` (17px), `text-heading` (22px), and `text-display` (40px). Display size is only for the empty-chat question and the XeckBot page title. In CSS, use the corresponding custom property. Do not use arbitrary text sizes such as `text-[13px]`.
- Use `rounded-tile` (8px), `rounded-control` (10px), `rounded-row` (12px), and `rounded-card` (14px). Small badges may use `rounded-full`; do not introduce arbitrary radius values.
- Reuse control and spacing tokens: `h-control` (34px), `size-control-sm` (28px), `px-control-pad` (12px), `min-h-row` (40px), `px-gutter` (24px), and `mb-section` (32px). Use `gap-2` for an 8px row gap.
- When adding a utility token, update the relevant `tailwind-merge` groups in `web/src/lib/cn.ts`. Text size and text color utilities must coexist without removing one another.
- Modify the existing component or CSS rule that owns a behavior. Avoid duplicate selectors, accumulating overrides, and a new stylesheet for each small change.

## Surfaces and visual hierarchy

- Do not add decorative borders, rings, dividers, shadows, gradients, glow, blur, glass panels, or `backdrop-filter`.
- Separate regions with background tone, spacing, and font weight. Adjacent neutral surfaces should differ gently, approximately 1.05-1.10 in contrast; this is a surface hierarchy guideline, not a text readability target.
- Fit the application panels edge to edge. Do not wrap the shell in a rounded outer frame or add gutters between its main panels.
- Use `bg-field` for inputs, `bg-chip` for cards and menus, and `bg-user` for message bubbles. Treat the current token definitions as the source for exact palette values; do not duplicate palette tables in components.
- Use `bg-chat-active` for selected rows and cards. Selected segments and tabs may use `bg-accent` with `text-on-accent`. A selected theme tile uses the soft selected tone, an accent icon, and semibold text.
- Transparency is limited to the `bg-scrim` overlay and token-defined hover or selection fills. Panels remain opaque.
- `track` is a soft fill for progress tracks and disabled controls, not a decorative separator. A switch uses `control` for its off track and `knob` for its thumb.
- Exceptions to the border-free rule are functional symbols such as checkboxes, arrows, loading spinners, color-swatch selection marks, and the keyboard focus indicator.

## Accent, semantic colors, and contrast

- Use one user-selected `accent`; the default is Deep blue. Do not tint large surfaces with it.
- Reserve accent for the send button, enabled switches, logo badge, project icon, selected-row tint, and selected segments, tabs, or theme tiles.
- Standard primary actions use `bg-primary`, not an accent fill. Destructive actions use the danger tokens. Reserve warning and danger colors for their semantic purpose.
- Pair filled controls with `text-on-primary`, `text-on-accent`, or `text-on-danger` as appropriate. Text must reach at least 4.5:1 contrast on every supported surface and state. Controls and meaningful graphical marks must reach at least 3:1 against adjacent surfaces.
- Keep terminal, ANSI, diff, syntax, context-meter, and window-close palettes as named tokens in `theme.css`.
- Provider logos may use their own brand colors through `--color-brand-*`. Keep those colors inside the provider marks; do not spread them into navigation, cards, or settings categories. Add a provider token and its `web/src/ui/provider-icons.tsx` mark together, with readable light and dark variants.
- Navigation and settings icons are otherwise neutral. Do not add a separate decorative color for every category.

## Shared controls

- Use `BUTTON.secondary`, `BUTTON.ghost`, `BUTTON.primary`, `BUTTON.danger`, and the `ICON_BUTTON` variants from `web/src/ui/button-styles.ts`.
- Keep class-based button sizing in the owning rule in `web/src/styles/components.css`. Use at most one visually dominant primary action in a view.
- Use `TextField` for single-line inputs rather than a bare input. Use `width="wide"` for the standard 16rem field, `width="block"` for full width, and `bare` when a parent owns the field surface. Field height comes from the field token: 36px normally and 40px on touch devices.
- Use `EditableField` for provider and model values that start as read-only rows. Clicking the value or edit icon enters editing; Enter or blur saves, Escape cancels. Mask secrets through the display value. Do not add a separate Save button for this pattern.
- Use `react-textarea-autosize` for the composer with 1-8 rows. Use `web/src/ui/Textarea.tsx` for settings and dialogs, normally 3-12 rows. Do not implement a second `scrollHeight` resizing loop.
- Textareas have no manual resize handle. Keep scrollbars thin with transparent tracks.
- Respect the configured Enter-to-send setting. When enabled, Enter sends and Shift+Enter inserts a line break. Never send while an IME composition is active.
- Use named imports from `lucide-react`. Keep wrappers in `web/src/ui/icons.tsx` thin, normally 18px with a 1.75 stroke. Custom SVG is limited to the Xeck logo, context-meter ring, and provider marks.

## Settings layout

- Group related rows in `SettingCard`. Use the chip surface, a semibold muted `.setting-label`, and 24px between cards through the gutter token.
- Use medium-weight row labels and muted descriptions. Standard row padding is 10px vertically and 16px horizontally; use the group spacing token between related content.
- Label-and-field rows use a two-column layout: an 11rem label column and a field column up to 28rem. Stack these columns on narrow screens.
- Switch and action-button rows retain their label-left, control-right arrangement. Model-list rows use the existing 40px rhythm.

## Keyboard, focus, and feedback

- Use semantic buttons, inputs, and labels. Give icon-only buttons accessible names and expose disabled, selected, expanded, loading, and error states where applicable.
- Keyboard focus must remain visible. Use a 2px ink outline rather than a shadow. For composite controls, place it on the owning container using `:has(...:focus-visible)` or the existing focus-within pattern; use an inward offset where an outer outline would be clipped.
- Menus must support keyboard focus, arrow-key navigation, Escape, and focus return to their trigger. Do not make a critical action accessible only by hover.
- Keep hover and color transitions restrained, normally 160-180ms with ease timing. Preserve the shared background/color transitions unless a component has a specific reason to override them.
- Verify loading, empty, error, and disabled states alongside the normal state. Keep product feedback in the user's selected language through the existing translation catalogs.

## Responsive and touch behavior

- Preserve the `max-lg:` breakpoint and the `hover-none:` variant, which covers `(hover: none), (pointer: coarse)`.
- Project rows have one always-visible More button on every device. It opens actions such as new chat, rename, and delete. Chat-row menus use the same pattern. Do not replace it with a hidden hover-only button group or shrink the name to reveal actions.
- Open menus below their trigger when space allows; flip them above when needed and cap their height to the visible viewport.
- Keep the shell's named `group/shell` distinct from row groups so row actions do not inherit shell-wide hover or focus state.
- On touch devices, icon-button utilities are 36px, regular buttons are at least 36px, rows are at least 44px, and project cards are 56px. Existing class-based 28px icon buttons receive a 44px hit area through responsive styles.
- Check narrow layouts, long labels, scrolling, and keyboard navigation in both themes. Do not break existing touch targets while changing desktop layouts.

## Documentation and review

- Write repository documentation, comments added as documentation, and rule pages in English. Localized UI text and translation fixtures are separate from documentation.
- Link to tracked public documentation only. Do not publish references or relative links to private local notes.
- Review a frontend change in both themes and at a narrow viewport. Run the relevant build and checks; state clearly when visual or interaction verification has not been performed.
