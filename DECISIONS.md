# Decisions

Choices made where the brief left room, one line each: the decision, then why.

## Tooling

- TypeScript is pinned to 6.0.x rather than 7 — `typescript-eslint` 8 does not support TypeScript 7 yet.
- The UI is plain TypeScript with a small `h()` DOM helper and no framework — there are six screens and no shared reactive state, so a framework would add weight without removing code.
- Routing uses the URL hash (`#/t/<theatre>/…`) — it works on GitHub Pages with no server rewrites, and every screen stays linkable.
- `npm run lint` runs ESLint and then `prettier --check` — one command covers both tools named in the brief.
- `.gitattributes` forces LF line endings — Windows checkouts would otherwise fail the Prettier check that CI runs on Linux.

## Data

- Data files are bundled at build time as raw text and validated when the app starts — it keeps the site fully static, and a broken file shows a readable message in the app instead of failing the build.
- A file that fails validation is skipped and listed on the home screen; the rest of the app keeps working — one bad auditorium should not hide the others.
- Every auditorium file in a theatre's folder is loaded automatically; `theatre.json`'s `auditoriums` list only sets the display order — adding an auditorium becomes a single file drop.
- Schema objects are strict about unknown fields — a typo such as `rowSpacing` is reported instead of being silently replaced by a default.
- An auditorium's `id` must equal its file name and its `theatreId` must equal its folder — it keeps links stable and catches copy-paste mistakes.
- `data/movies.json` entries are `{ id, title, youtubeId, channel, verifiedOn }` — the brief shows two shapes and the detailed one is the one the verification script needs.
- Added optional auditorium fields `rowAlign` (`center` by default), `placeholder` and `names`, and theatre fields `names` and `areaNames` — real rows are not always centred, sample layouts need a translatable label, and the brief asks for optional per-locale display names.
- Brentwood's four rooms are named by format ("3D Full Recliner", "Full Recliner A–C") — the booking site shows no hall numbers, so rename them when the numbers are known.
- Maps without seat numbers are numbered 1, 2, 3 … from the left of each row, wheelchair spaces are gaps and companion seats are seats — the numbers cannot match a ticket, and the notes say so.
- A pair of VIP recliners takes two slots with no gap slot between pairs — it is the grid the booking site draws, and an aisle slot would stretch each pair apart by a whole seat.
- The data test now only requires that some placeholder auditoriums exist — samples are replaced theatre by theatre, so a fixed count of seven would fail on the first real map.
- Place names (`areaNames`) are filled in for Korean and Chinese; theatre names are left in English — areas have well-known local spellings, theatre names are proper nouns.

## Languages

- Locale files are flat JSON with dotted keys — `keyof typeof en` then gives a complete, typed list of keys.
- Locales are discovered from `src/i18n/locales/*.json` — adding `zh-Hant.json` is the only step needed for Traditional Chinese.
- Readers whose browser asks for Traditional Chinese get Simplified until `zh-Hant` exists — it is closer to what they want than English.
- Choosing a language in the switcher removes `?lang=` from the address — otherwise the parameter would override the saved choice on the next reload.
- Messages are phrased to avoid plural forms ("Auditoriums: 3") — it keeps the three locale files structurally identical.
- The app title is translated, while theatre and auditorium names stay in English — the title is a description, the others are names.
- No web font is downloaded; Noto Sans KR / SC are named in the font stack as fallbacks — every target platform ships Korean and Chinese system fonts, and it keeps the site light and private.

## Seat metrics and ratings

- World coordinates: x to the viewer's right, y up from the floor in front of row 1, z away from the screen — one frame shared by the metrics and the 3D scene, so they cannot disagree.
- `firstRowDistance_m` is measured to the eyes of someone in the first row, and every slot in a row (seat or gap) is one `seatWidth_m` wide — the simplest reading of the schema that still turns aisles into real space.
- The off-axis angle is measured in the horizontal plane — height is already covered by the vertical angle, and the "strong side angle" verdict is about sitting to the side.
- The vertical angle to the top uses the distance to the screen plane — it is the steepest look-up along the top edge for seats within the screen width, and matches the viewing-angle formula.
- The side-angle downgrade (> 25°) stops at "Meh" — "Avoid" is kept for seats that break a hard limit, so its verdict always names the reason.
- When a seat breaks several hard limits the verdict names neck strain first, then "turn your head", then the side angle — the order people tend to feel them.
- Size thresholds differ by type (standard: medium from 150 seats, large from 280; VIP: 50 and 90) — recliners fit about a third as many seats into the same room.
- The suggested seat is the one in the best available band that is closest to the centre line and to a 50° viewing angle — the middle of the "Prime" band.

## 3D view

- The camera keeps a fixed 75° horizontal field of view, narrowing only when a tall phone would need more than 90° vertically — a constant field of view keeps screen sizes comparable from seat to seat.
- Trailers and stills are drawn as a 16:9 picture centred on the screen, as tall as the screen — how flat content is shown on a scope screen.
- Heads appear only in the rows in front of the chosen seat, about 60% of seats, picked by a hash of the auditorium id and seat key — those are the only heads visible from the seat, and the crowd stays the same on every visit.
- Seats, heads, sconces and step lights are instanced meshes, and all textures are drawn on canvases at runtime — a 400-seat room stays at a handful of draw calls with no model or image files.
- Frames are rendered only when something changes — the seated view is mostly still, so this saves battery on phones.

## Seat map

- Seats are HTML buttons placed at the same left-to-right positions as in the 3D model — screen readers get real buttons with labels, and the 2D and 3D layouts cannot disagree.
- One seat is tabbable at a time; arrow keys move the selection (up = towards the screen), Home/End jump along the row, and Enter on the selected seat sits down — the usual keyboard pattern for a 2D picker.
- A tap that lands between seats picks the nearest seat within one seat width — seats can be as small as 11 px on a 360 px phone.
- The selected seat is kept in the address (`?seat=K-23`) — reloading or coming back with "Change seat" returns to it.
- On phones the seat card sticks to the bottom of the screen — "Take this seat" stays within reach while the map scrolls.
- Auditorium cards show a thumbnail of the seat map coloured by band — it helps match the room to the map seen when booking.

## Walk-in

- The avatar takes the side aisle nearer the seat, crossing the front (or back) of the room first when the door is on the other side, then side-steps along the row facing the screen — it matches how people actually reach a seat and keeps the route out of the seats.
- Walking time is held between 2.8 and 4.4 s, plus 1.4 s to sit, so every walk lasts 4.2–5.8 s; long walks in big rooms simply go faster.
- Each row's step starts just behind the seat backs of the row in front (0.65 row spacings ahead of the eyes) — the legroom then sits on the step, which is what the avatar walks along.
- The follow camera tries angles around "directly behind" and uses the first one inside the room — right after the door, "behind" is usually inside a wall.
- Under `prefers-reduced-motion` the view opens already seated and "Replay walk" is hidden; Escape or "Skip" ends the walk at any time, and focus moves into the 3D view when the Skip button disappears.
- The avatar is a round mascot holding popcorn rather than a person — it stays cute and avoids picking anyone's appearance.

## Trailers and video

- `data/movies.json` holds 9 trailers verified on 2026-11-19, each uploaded by the studio's or distributor's own channel (Lionsgate Movies, Warner Bros., Paramount Pictures, Walt Disney Animation Studios, Netflix, Universal Pictures, Marvel Studios Canada, GODZILLA OFFICIAL by TOHO) — the brief allows official channels only.
- Where the newest trailer was only found on aggregator channels, the studio's own teaser or earlier trailer was used instead — the channel rule matters more than which cut it is.
- Focker-In-Law was left out: the only studio upload found was on a regional Paramount channel, not Universal's — when in doubt, leave it out.
- Uploads by theatre chains (including Cineplex's own channel) were not used — they are neither studios nor distributors, and this app is unaffiliated with Cineplex.
- `npm run verify:trailers` also fails when a video's uploader no longer matches the recorded `channel` — it catches a video being swapped for a re-upload.
- The player is our own iframe with the exact privacy-enhanced embed URL from the brief plus `enablejsapi` and `origin`, then wrapped by the IFrame Player API — the URL stays as specified and "Tap for sound" can still unmute through the API (falling back to the player's postMessage protocol if the API script is blocked).
- The screen only turns see-through once the player has loaded; until then the still frame stays on it — a slow player never shows a black hole in the screen.
- The player mounts 0.4 s after the camera is seated and still, and is removed on "Replay walk" or when leaving the view — no video plays while the avatar walks.
- The fallback (still frame plus "Open trailer") is used when CSS 3D transforms are unsupported, when the player reports an error (removed, private or not embeddable), when it has not loaded after 15 s, or with `?fallback=1` in the view URL.
- The WebGL canvas ignores pointer events — drags anywhere outside the picture still turn the view, and clicks on the picture reach YouTube's own controls.
- A bare 11-character video id is rejected in the paste box — the brief limits input to the watch?v=, youtu.be/, shorts/ and embed/ link forms.

## Adding auditoriums

- The compact format also accepts commas, `|` without spaces around it, descending ranges (`14-11`), `#` comments and, through NFKC normalisation, the full-width `：` `｜` `＿` `－` and digits that Korean and Chinese keyboards type — screenshots and hand-typed maps vary, and these cost nothing to support.
- In the compact format `|` is an aisle two seat widths wide (`| |` a double one), `_` is one missing seat, and rows with the same number of blocks are padded so their aisles line up (outer blocks against the aisle, middle blocks centred); the editor and the importer can change the width or switch alignment off — taken from the earlier build: a one-seat aisle (0.55 m) looked too narrow in 3D, and real aisles run straight from front to back.
- Parse errors come back as codes with a line number, and the editor turns them into translated sentences — the parser stays testable and language-free.
- `formatCompact` writes every gap as `_` — reading that back gives exactly the same rows, with no aisle widening or padding, so loading a file into the editor never changes it.
- `npm run import:auditorium` and the editor share one parser, and the importer reuses the editor's English error sentences — both always agree on what is wrong and where.
- The sample auditoriums were regenerated with the importer under the new aisle rules — the seat counts are unchanged, but aisles are now about 1.1 m wide and straight.
- Auditorium files are written with one row of seats per line — the file then reads like the seat map and diffs stay small.
- Editor sliders start on "Default", and a dimension is only written to the file once its box is unticked — untouched values keep following `src/config/defaults.ts`.
- The editor previews the rows that parsed even while another field still has a problem — it is easier to fix a map you can see.
- The editor's 3D preview reuses one WebGL context (`SeatViewer.setLayout`) — browsers allow only a few live contexts.
- The editor works entirely in the browser (download or copy the JSON) and is only reachable at `#/editor` — the brief asks for a hidden page and a static site.
- An editor draft survives a language switch (it is kept in memory) but not a reload — anything more would mean storing seat maps in the browser.

## Ported from the earlier build

An earlier, separate build of the same brief had several touches this one lacked; these were
brought over on 2026-11-20.

- The seat card has four nudge buttons, and is built once so a pressed nudge keeps focus — seats can be 11 px wide on a phone, and rebuilding the card would drop focus after every press.
- Prime seats carry a dot and seats to avoid a slash, on the map and in the legend; Windows high-contrast mode gets outlines, the shapes and a filled selection — colour alone fails colour-blind users and disappears in forced-colours mode.
- A selection changed by a tap or a nudge is announced in a live region, and every seat button is described by the card's verdict — arrow-key users already hear the seat's own label when it takes focus, so it is not read twice.
- "Fill screen" crops the 16:9 trailer (or its still frame) to cover a wide screen, and is only offered when the screen's shape differs from 16:9 — showing the whole picture with side bars stays the default, as cinemas do with flat trailers.
- "Video not showing?" drops the player by hand and returns to the still frame with "Open trailer" — some failures (an extension blocking YouTube, a stalled player) never raise an error the app can see.
- The seat card can be folded down to the seat and its buttons — it gives the 3D view more room on small phones.
- A lost WebGL context gets 6 s to come back before the "can't show the 3D view" message — phones drop contexts under memory pressure and usually return them; three.js re-uploads everything when they do.
- A small arrow bobs over the target seat during the walk and hides once the avatar sits or the camera comes within 1.4 m — it shows where the walk is heading before the seat is in plain view.
- The avatar leans forward on long walks squeezed into a few seconds — fast walking looks like running instead of a stiff glide.
- The browser smoke test (`npm run smoke`, `scripts/smoke.mjs`) clicks through every screen at phone width with YouTube stubbed out and fails on console errors or overflow; Playwright is not a dependency, and the script falls back to the installed Chrome or Edge when Playwright's own Chromium is missing — `npm ci` and CI stay small, and it still runs on a machine without a browser download.
- The earlier build's `.claude/agents/`, `.claude/skills/` and `docs/spec.md` were brought over and pointed at this build's files (parser, tests, verdict keys, smoke script) — later sessions get the same reviewer, translator and research help.
- Not ported: the earlier build's camera view offset — there the card covered the bottom of the 3D view; here it sits below the view, so nothing hides the screen.

## Polish and deployment

- On short landscape screens the seat card moves beside the 3D view, and the mini map is hidden there — stacked, the card's buttons fell off a 360 px-tall phone screen.
- The disclaimer stays in the footer on every screen, including the full-screen 3D view.
- The deploy workflow runs lint and tests before publishing, and only deploys from `main`; `ci.yml` checks every other push — a broken build never replaces the live site.
- GitHub Actions are referenced by major version tags (`@v7`, `@v6`, `@v5`) — they pick up fixes without editing the workflow.
- This build replaced an earlier, unrelated build of the same brief on `main` (at the owner's request, 2026-11-19); the earlier one stays on the `claude/zealous-rubin-3tujo9` branch — the two histories share no commit, so they could not be merged.
