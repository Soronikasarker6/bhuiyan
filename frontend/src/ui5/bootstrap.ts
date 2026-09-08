/**
 * One-time UI5 Web Components setup — must be the very first import reached
 * anywhere in the app (it is `main.tsx`'s first line). UI5's feature/asset
 * registration has to run before any module imports an actual UI5 component;
 * importing this after one has already run is too late (confirmed against
 * `@ui5/webcomponents-react`'s own shipped `CLAUDE.md`).
 *
 * `Assets.js` registers CLDR locale data (date/number formatting for
 * `DatePicker`), theming assets, and i18n text for UI5's own component
 * chrome (a Dialog's "Close" label, a Table's "no data" text, …) — the app's
 * own copy stays exactly as written elsewhere, this only covers UI5's
 * built-in strings. Every individual component (`Button`, `Input`, `Table`,
 * …) already registers its own custom element the moment *it* is imported —
 * there is no separate "install every component" step.
 *
 * Icons are handled differently, and deliberately not bulk-imported here:
 * UI5's own internal chrome icons (a Dialog's close icon, a DatePicker's
 * calendar icon) resolve through UI5's own internal dynamic imports and need
 * nothing from this file. This app's own iconography stays lucide-react
 * (see the architecture plan) — `@ui5/webcomponents-icons/dist/AllIcons.js`
 * was tried here and measured at over 1MB of JS for icons this app doesn't
 * use, so it was removed. A named icon import (e.g.
 * `import addIcon from '@ui5/webcomponents-icons/dist/add.js'`) would only
 * be added here if a specific UI5 `Icon` component is ever used directly.
 */
import '@ui5/webcomponents-react/dist/Assets.js'
