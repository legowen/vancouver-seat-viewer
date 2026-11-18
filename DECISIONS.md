# Decisions

One line each: the decision, then why. Newest at the bottom of each section.

## Process and tooling

- The build spec is saved as `docs/spec.md` — the reviewer agent and later sessions need it to check requirements.
- Vendored 8 of the 13 `cloudai-x/threejs-skills` (MIT) and Anthropic's `frontend-design` skill (Apache-2.0) into `.claude/skills/` — they fit this build (three.js r186 API changes, UI design guidance); the other five three.js skills cover things this app does not use.
- Did not use the `webapp-testing` skill — it needs Python Playwright; `scripts/smoke.cjs` does the same job with Node Playwright and no extra install.
- The setup commit was pushed to `main` first, before the milestones — the first branch pushed to an empty GitHub repo becomes its default branch, and GitHub Pages only deploys from the default branch out of the box.
- The three project agents were run as general-purpose subagents told to follow their `.claude/agents/*.md` file — agent files created mid-session are not registered until the next session starts.
- `npm run lint` runs ESLint and `prettier --check` together — one command to satisfy "lint must pass"; `data/` and `.claude/` are excluded from Prettier so seat rows stay one per line and vendored skills stay untouched.
- Playwright is not a devDependency; `npm run smoke` skips itself when Playwright is missing — keeps `npm ci` small and CI independent of a browser download.

## Data

- JSON under `data/` is bundled at build time with `import.meta.glob` instead of fetched at run time — no loading states or failed requests on a static host, and it is still validated with zod when the app starts.
- A broken data file never crashes the app: it becomes a readable notice next to the theatre or auditorium it belongs to — required by "show a readable error if a file is invalid".
- The details of a data-file error (`rows[2].seats[5]: seat 7 appears twice…`) stay in English under a translated title — they are for whoever edits the JSON and quote JSON paths; the importer and `npm test` print the same text.
- Schemas are strict (unknown keys are errors) — a typo such as `rowSpacing` instead of `rowSpacing_m` should not silently fall back to a default.
- `type` defaults to `standard`, `entrance` to `front-left`, `verified` to `false` when left out — fewer things to type by hand; `entrance` accepts `front-left`, `front-right`, `back-left`, `back-right`.
- Added an optional `"placeholder": true` flag to the auditorium schema — lets the UI show a translated "Sample layout" badge, since the placeholder's English name is not translated.
- Each row is centred on the screen's centre line, and one `null` is one seat width — matches how seat maps are drawn and needs no extra fields; shift a row with leading or trailing `null`s.
- Each theatre has exactly one placeholder; Brentwood and Marine Gateway get the VIP layout — the spec says ONE per theatre and names those two for VIP.
- `theatre.json` must list exactly the auditorium files in its folder (enforced by `tests/data-files.test.ts`), but the app still shows an unlisted file after the listed ones — strict in CI, forgiving while editing.
- Default dimensions by type and size class live in `src/config/defaults.ts`; room-shell sizes that are not in the JSON (side aisles, back walkway, ceiling) live there too under `ROOM` — one place to tune, as the spec asks.
- The compact seat-map parser and `npm run import:auditorium` were built in Milestone 1 rather than 6 — the placeholder files were generated with the parser, and the importer shares `src/data/importer.ts` with the editor page.
- In the compact format an aisle (`|`) is two seat widths by default and blocks are aligned so aisles run straight — a one-seat-wide aisle looks wrong in 3D; both are options of the parser.
- The compact parser normalises full-width punctuation and digits (NFKC) — Korean and Chinese keyboards type `：` and `｜` by default.

## Internationalisation

- Locale files are discovered with `import.meta.glob('./locales/*.json')` and each carries its own switcher label in `meta.languageName` — adding `zh-Hant.json` needs no code change.
- Any `zh-*` browser language falls back to `zh-Hans` until `zh-Hant.json` exists — Simplified Chinese serves a Traditional Chinese reader better than English.
- Choosing a language in the switcher removes `?lang=` from the URL — otherwise the parameter would override the saved choice on the next reload.
- No web font is downloaded; Noto Sans KR / SC are named in the font stack after the system fonts — every current phone and desktop OS ships a good Korean and Chinese system font, and the slices of a CJK web font are a heavy download for a fallback that is rarely used.
- Plurals use `<key>.one` / `<key>.other` pairs chosen with `Intl.PluralRules` — English needs them; Korean and Chinese simply repeat the same string.

## Trailers

- `data/movies.json` ships with only oEmbed-verified entries, which is none (`[]`) — the build environment blocks `youtube.com`, so no id could be verified, and the spec forbids unverified ids.
- Pasting a YouTube URL is the main path on the trailer screen while the list is empty — required by the spec for this case.
- Unverified search results go to `data/movie-candidates.json`, which the app never loads; `npm run verify:trailers -- --promote` checks each one through oEmbed and moves the passing ones into `movies.json` — so the list can be filled with one command from a machine that can reach YouTube.
- `movies.json` entries use `{ id, title, youtubeId, channel, verifiedOn }` — the spec gives two shapes; this is the later, more specific one.
- `verify:trailers` accepts a channel only if it is on the official-channel list in `scripts/trailers.ts` (studio and distributor channels, including their official UK and Canadian channels) — oEmbed's `author_name` is the only signal, and a fixed list keeps aggregators out.
- Dropped the "Avengers: Doomsday" candidate — the watch URL and the channel name came from two different search results, so the upload could not be tied to an official channel.

## Design

- Visual direction: a dim auditorium — indigo darkness, warm sconce light for actions, velvet red for seats; system fonts only, sentence case, no decorative motion — chosen from the subject and from the brief's font requirement, following the `frontend-design` skill.
- The theatre list is a listings board (name, dotted leader, area) rather than a grid of cards — it reads like a cinema listing and keeps seven long names scannable on a phone.
