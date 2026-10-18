# Interface languages

Choose **Settings → General → Language**: Turkish, English, or the system language.
The preference is stored with application settings; a local cache applies it before
startup finishes. Unsupported system languages use English. Language changes
update the existing React tree without resetting the conversation or draft.

Use `t('Source text')` for interface text, or `t('Remove {name}', { name })` for
interpolation. Keep matching keys and placeholder names in `en.json` and `tr.json`.
Static label maps should retain source strings and call `t()` when rendering.
Protocol values, user content, code, paths, and model prompts stay unchanged.

React roots use `useI18n()` to subscribe to language changes; independently memoized
views can use the same hook. Non-React formatters can use `getLocale()` from
`core.ts`. Dates and numbers should follow that locale.

Run `npm run test:i18n` from the repository root. The tests cover catalog parity,
placeholder consistency, translation-call coverage, switching, and formatters.
