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

## Seat metrics and the 3D view

- The off-axis angle is measured in the horizontal plane, `atan(|x| / z)` — the spec's "line to the screen centre vs. the screen normal" also counts height, which would label front-row seats with a "side angle" verdict; height is covered by the separate look-up angle.
- The best seat (where the seat map starts) is the lowest score of band rank, then side angle, then distance from a 50° viewing angle, then look-up angle — a central prime seat wins, as the reference UX expects.
- The seated camera keeps an 80° horizontal field of view on every device, and caps the vertical field at 95° on tall phones — the screen then takes the same share of the display for the same seat everywhere, so seats can be compared.
- The bottom card shifts the camera's aim point with a view offset instead of tilting the camera — the camera still aims at the screen centre (as the spec says) but the centre appears in the middle of the uncovered area.
- Frames are rendered on demand (the loop stops when nothing moves) — a still seated view then costs no battery on a phone.
- About 60 % of seats in the rows in front look taken, drawn from a generator seeded with the auditorium and seat ids — the same people sit in the same places whichever seat you pick; the viewer's row and the rows behind stay empty (out of sight once seated, and the walk-in path stays clear).
- Seats, steps, sconces and heads are InstancedMeshes; seat and head shapes are boxes and spheres merged into one geometry each — about 20 draw calls for a whole room.
- Lighting is a hemisphere fill plus one point light standing in for the screen; the sconce glows are additive textured planes, not lights — every real light adds cost to every lit pixel on a phone.
- Until the seat map exists (Milestone 3), its route shows the auditorium page with a "Take this seat" button for the best seat — so Milestone 2 has a working path into the 3D view.
- On short screens (landscape phones, height ≤ 500 px) the seated view's card starts folded and drops the mini map — otherwise it would cover most of the 3D view.
- A lost WebGL context waits up to 6 s for the browser to restore it before showing the "can't show the 3D view" message — phones drop contexts under memory pressure and usually give them back.
- The 3D stage has `role="application"` — screen readers then pass the arrow keys through for looking around.

## Trailer step and seat map

- The trailer picker lives at the auditorium's own route (`#/t/<theatre>/<auditorium>`), before the seat map — the spec's flow is theatre → auditorium → trailer → seat; the Milestone 2 best-seat card is gone because the seat map now starts on the best seat.
- A pasted link must be one of the four forms in the spec (watch, youtu.be, shorts, embed; with or without `https://`, `www.` or `m.`); bare ids, live links, playlists and other hosts are rejected — the spec says to reject anything else.
- The paste field is a text field with `inputmode="url"` and no browser validation — so links copied without `https://` are accepted.
- The seat map is an ARIA grid with one tab stop (the selected seat): arrow keys move, Home/End go to the ends of the row, Enter takes the seat — the APG grid pattern, with seat labels "Row K, Seat 23, Prime".
- A tap in a gap selects the nearest seat within 1.5 seat widths, and four nudge buttons move by one seat or row — seats are only about 10 px wide on a 360 px phone.
- Moving up or down a row picks the closest seat sideways, and on a tie the one further from the centre — so moving along the ends of the rows stays at the ends on both sides.
- Bands also differ in shape, not only colour: a dot on prime seats, a slash through seats to avoid.
- The selected seat is written into the address with `history.replaceState` — Back from the 3D view and a reload return to it, without adding a history entry per tap.
- The seat card sticks to the bottom of the screen on phones, and the "Take this seat" button drops to its own full-width line when it would not fit next to the arrows.
- Movie thumbnails in the trailer list load straight from `i.ytimg.com`; one that fails to load is removed instead of showing a broken image.
- The seat card is built once and only its texts change, so a pressed arrow button keeps keyboard focus; while the card sticks to the bottom, `scroll-padding-bottom` keeps a focused or nudged seat from hiding under it, and on short screens (≤ 500 px tall) the card scrolls with the page instead of sticking.
- Windows contrast themes (forced colours) get seats with borders and system colours, and the selection and focus as outlines — otherwise the map would be blank there.
- A seat changed by a tap or an arrow button is announced through a live region (`seatmap.status`); a seat reached with the arrow keys is read from its own label with the verdict as its description, so nothing is read twice.
- `seatmap.status` was translated by the main agent instead of the i18n-translator agent — the agent hit the account's usage limit, and it is one short string.

## Walk-in

- The avatar goes from the door along the front walkway (past the screen) or the back cross-aisle to the side aisle on the seat's side, then up or down that aisle, side-steps along the row facing the screen, and sits — the spec's path, using whichever side aisle is nearer the seat.
- The walking part is squeezed into 2.6–4.1 s whatever the room size, then sitting (0.6 s) and the camera settling (1.1 s, overlapping) — the whole walk-in stays within 4–6 s as specified; on long paths the avatar runs (steps capped at 3.4 a second, leaning forward) instead of walking at an impossible stride.
- The follow camera stays behind (towards the back of the room) and above the avatar and looks at it with the screen beyond — the room, the audience and the screen stay in view; it then blends into the seated pose (position lerp + quaternion slerp).
- The avatar and the arrow over the target seat hide as soon as the camera comes within 1.4 m — the camera never passes through them.
- Escape first skips the walk-in, and only a second Escape leaves for the seat map; Replay walk is not offered with reduced motion, where the view always starts seated.
- The screen shows the trailer's `hqdefault.jpg` letterboxed to the screen's shape, loaded with `crossOrigin = "anonymous"`; if it does not load within 8 s or cannot be used as a texture, the plain glowing screen stays.

## Trailer on the screen

- The trailer plays in the official embed created by the YouTube IFrame Player API (`YT.Player` with host `youtube-nocookie.com` and the spec's player parameters); "Tap for sound" calls `unMute()`. If the API script does not load within 6 s, the embed is created directly with the spec's URL and the same API commands are sent to it as messages — the protocol the API script itself uses.
- The iframe is placed with CSS3DRenderer on the screen plane in a layer under the transparent WebGL canvas; the screen mesh draws transparent pixels (no blending) so the video shows through while the heads in front are drawn over it.
- The iframe is mounted 250 ms after the camera is seated, removed while a walk is replayed and when the view is left; the screen turns transparent only once the player is ready, so the poster stays until then.
- While the video is mounted, the WebGL canvas lets taps through, so YouTube's own controls work; dragging outside the video still turns the view.
- The 16:9 trailer is shown whole with side bars on a wide screen by default (as a cinema shows a flat trailer on a scope screen); "Fill screen" crops it instead.
- Fallback — the poster plus an "Open trailer" link to YouTube in a new tab — after 12 s without a ready player, on errors 101/150/153 (the uploader blocks embedding), when CSS 3D transforms are missing, or by hand ("Video not showing?"); the player is then removed so it cannot keep playing out of sight.
- The browser smoke test replaces YouTube with local stubs (the IFrame API, the embed and the thumbnail), so it runs offline and checks both the API path and the message path.

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
