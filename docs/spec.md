# Build spec: Vancouver Cinema Seat Viewer

This is the original build brief, kept in the repo so reviews and later sessions can check the app against it.
Deliberate deviations are listed in `DECISIONS.md`; progress is tracked in `PROGRESS.md`.

## Working mode

- Work autonomously from start to finish, milestone by milestone. After each milestone: run the build and
  tests, fix anything broken, and make a git commit with a clear message. When every milestone passes, push to
  `origin main`.
- When something is ambiguous, make a reasonable decision, write it down in `DECISIONS.md` (one line each:
  decision + why), and keep going.
- If a milestone hits a blocker, ship a simpler working version, note it in `DECISIONS.md`, and move on. Do not
  leave the app in a broken state.
- Keep a short `PROGRESS.md` checklist of the milestones, updated as you go.

## Project skills and subagents

Subagents in `.claude/agents/` (Markdown with YAML frontmatter: `name`, `description`, `tools`):

- `i18n-translator`: translates `en.json` into `ko.json` and `zh-Hans.json`. Natural, short UI wording; keeps
  keys identical; never translates theatre or movie names.
- `trailer-researcher`: finds now-playing / coming-soon movies in Canada and their official studio YouTube
  trailers, verifies each id through oEmbed, and writes `data/movies.json`. Web tools only; it must not edit
  source code.
- `reviewer`: read-only. After each milestone it reviews the diff, runs build, lint and tests, and reports
  bugs, missing requirements from this spec, and mobile/CJK layout risks. It does not fix code itself; the main
  agent fixes.

Skills in `.claude/skills/<name>/SKILL.md` (frontmatter: `name`, `description`):

- `add-auditorium`: how to turn a Cineplex seat-map screenshot or the compact text format into a valid
  auditorium JSON, which defaults to use, and how to validate it with the zod schema and tests.
- `seat-metrics`: the metric formulas, rating-band thresholds and verdict keys, so every change to scoring
  stays consistent with tests.

How to use them:

- Run `trailer-researcher` and `i18n-translator` in parallel with the main work, since they touch separate
  files (`data/movies.json`, `src/i18n/locales/`).
- The main agent owns architecture and all of `src/` except locale files. Don't let two agents edit the same
  file at the same time.
- Run `reviewer` at the end of every milestone and fix what it finds before committing.

## What this is

A free, personal, unofficial web app for choosing a seat at Metro Vancouver Cineplex theatres. The user picks a
theatre, an auditorium and a seat on a 2D seat map. A simple avatar then walks down the aisle into the row and
sits, and the camera switches to that seat's point of view. From there a YouTube trailer plays on the screen. A
bottom card shows the seat's rating, the distance to the screen, the horizontal viewing angle and a one-line
verdict.

Reference UX (from a Korean fan-made CGV IMAX simulator):

- Seat map screen: title "Pick a seat and sit down", seats coloured by rating band, a legend, a selected-seat
  card ("Row K, Seat 23 · Recommended · Comfortable on the neck and you see the whole screen"), and a big "Take
  this seat" button.
- Walk-in: a 3rd-person view of a small cute avatar walking along the side aisle past the screen, then into the
  row.
- Seated POV: first-person view of the screen with the silhouettes of heads in the rows in front. A bottom card
  shows the band label, "Row I, Seat 23", the verdict ("The screen fills your view"), "Distance 21.8 m ·
  Viewing angle 76°", and a mini seat map with the current seat highlighted.

Show this disclaimer in the footer: "Unofficial fan project — not affiliated with Cineplex Entertainment."

## Hard constraints

- No backend, no accounts, no database. Static site only.
- Do NOT call any Cineplex API and do NOT scrape cineplex.com. All seat data comes from JSON files in the repo
  that the user creates by hand from seat-map screenshots.
- No 3D model files. Generate every auditorium procedurally in code from its JSON config.
- Flat screens only. No IMAX, UltraAVX, ScreenX or curved screens in scope.
- Trailers are public YouTube links played through the official YouTube embed. Never download or re-host video.

## Tech stack

- Vite + TypeScript (strict) + Three.js (plain Three.js, no React needed; keep the UI in light vanilla TS
  modules or a tiny framework of your choice)
- Vitest for unit tests, zod for data validation
- ESLint + Prettier
- Deploy to GitHub Pages via a GitHub Actions workflow (set Vite `base` to `/vancouver-seat-viewer/`)
- Mobile-first. Target smooth rendering on a mid-range phone: use InstancedMesh for seats and heads, cap
  devicePixelRatio at 2, avoid heavy post-processing.

## Internationalization (EN / KO / ZH)

- Supported UI languages: English (`en`, default), Korean (`ko`) and Simplified Chinese (`zh-Hans`). Structure
  the code so Traditional Chinese (`zh-Hant`) can be added later by adding one locale file.
- Pick the initial language in this order: `?lang=` URL parameter, then the saved choice, then
  `navigator.language`, then English.
- Save the user's choice in localStorage, wrapped in try/catch (storage can throw or be unavailable).
- Add a language switcher (EN / 한국어 / 中文) that's always reachable on every screen.
- Keep all UI strings in `src/i18n/locales/{en,ko,zh-Hans}.json`, with typed keys. A missing key in a
  non-English locale falls back to English, and a test must fail if any locale is missing keys that exist in
  `en`.
- Translate rating-band labels, verdict sentences, buttons, legends, errors and the disclaimer. Keep theatre
  names and auditorium names in English (they're proper nouns), but allow an optional per-locale display name
  in the theatre data.
- Use a font stack that renders Korean and Chinese well (system fonts first, with Noto Sans KR / Noto Sans SC
  as a fallback). Make sure CJK text doesn't overflow the cards on narrow screens.
- Set `<html lang>` to match the current language.
- Format numbers with `Intl.NumberFormat` (e.g. "21.8 m", "76°").

## Data model

Directory layout:

```
data/
  theatres.json                        # list of theatre ids in display order
  theatres/<theatre-id>/theatre.json   # name, area, optional localized names, auditorium ids
  theatres/<theatre-id>/auditoriums/<aud-id>.json
  movies.json                          # optional default trailers: { title, youtubeUrl }
```

Auditorium schema (validate with zod at load time, and show a readable error if a file is invalid):

```json
{
  "id": "riverport-07",
  "theatreId": "silvercity-riverport",
  "name": "Auditorium 7",
  "type": "standard",
  "screen": { "width_m": 14.0, "aspect": 2.39, "bottomHeight_m": 1.2 },
  "firstRowDistance_m": 5.0,
  "rowSpacing_m": 1.0,
  "rowRise_m": 0.35,
  "seatWidth_m": 0.55,
  "eyeHeight_m": 1.15,
  "rows": [{ "label": "A", "seats": [1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, null, 11, 12] }],
  "entrance": "front-left",
  "verified": false,
  "source": "seatmap screenshot YYYY-MM-DD",
  "notes": ""
}
```

- `null` means an aisle or gap.
- `type` is `"standard"` or `"vip"`.
- `verified: false` means the dimensions are defaults, not measured. Show a small "Estimated dimensions" badge
  in the UI when it's false.
- Every dimension field is optional in the JSON. Missing values come from defaults chosen by `type` and by the
  auditorium size (small / medium / large, inferred from seat count). Put the defaults in one file,
  `src/config/defaults.ts`, with comments. Starting assumptions:
  - Standard: rowSpacing ≈ 1.0 m, seatWidth ≈ 0.55 m
  - VIP recliners: rowSpacing ≈ 1.5 m, seatWidth ≈ 0.75 m
  - Seated eye height ≈ 1.15 m above the floor of that row
  - Screen width and first-row distance scale with auditorium size

Theatres in scope (create a folder for each one). The names are best-effort, so keep them in data so the user
can correct them:

1. `cineplex-coquitlam` — Cineplex Cinemas Coquitlam
2. `cineplex-vip-brentwood` — Cineplex VIP Cinemas Brentwood (VIP only)
3. `cineplex-metropolis` — Cineplex Cinemas Metropolis (Metrotown)
4. `cineplex-marine-gateway` — Cineplex Marine Gateway & VIP
5. `silvercity-riverport` — SilverCity Riverport (Richmond)
6. `cineplex-international-village` — Cineplex Odeon International Village
7. `scotiabank-vancouver` — Scotiabank Theatre Vancouver

For each theatre, create ONE clearly labelled placeholder auditorium ("Sample auditorium — replace with real
seat map"): a realistic standard layout of about 10–16 rows, and a VIP layout for Brentwood and Marine Gateway.
The real auditoriums will be added later by the user.

## Seat metrics and rating

Compute these for every seat (pure functions in `src/metrics/`, fully unit-tested):

- distance: from the eye position to the screen centre (m)
- horizontal viewing angle: `2 * atan((screenWidth / 2) / horizontalDistanceToScreenPlane)` (degrees)
- off-axis angle: the angle between the line to the screen centre and the screen normal (degrees)
- vertical angle to the top of the screen (degrees; for neck strain)

Rating bands (thresholds live in config so they can be tuned):

- Avoid: viewing angle > 60°, or vertical angle to the top > 35°, or off-axis > 35°
- Prime: 45–60°
- Recommended: 36–45°
- OK: 30–36°
- Meh: < 30°
- Moving one band down for a large off-axis angle (> 25°) is acceptable.

Verdict sentences come from i18n keys chosen by band and reason (e.g. "Turn your head to see it all", "The
screen fills your view", "Comfortable, you see everything", "Feels a bit far away", "Strong side angle").

## Screens and flow

1. Home: list of theatres → list of auditoriums (with a small seat-map thumbnail so the user can match the one
   they saw on Cineplex) → movie/trailer selection.
2. Trailer input: choose a movie from `movies.json` or paste any YouTube URL. Parse the video id from the
   `watch?v=`, `youtu.be/`, `shorts/` and `embed/` URL forms; reject anything else with a friendly error.
3. Seat map (2D): seats coloured by band, with a legend, aisles shown as gaps and the screen drawn at the top.
   Tap or keyboard-select a seat to update the info card. The "Take this seat" button starts the 3D scene. It
   must work on a 360 px wide screen.
4. Walk-in (3D): a dim auditorium with wall sconces, the screen showing a poster or still frame (use the
   YouTube thumbnail `https://i.ytimg.com/vi/<id>/hqdefault.jpg` as a texture, with CORS handled; fall back to
   a plain glowing panel). A simple stylised avatar (primitives only) walks from the entrance along the side
   aisle, climbs to the row, side-steps to the seat and sits. A 3rd-person follow camera transitions smoothly
   into first person at eye height. Total time ≈ 4–6 s, with a "Skip" button. Respect `prefers-reduced-motion`
   by cutting straight to the seat.
5. Seated POV: the camera is locked at the seat's eye position and aimed at the screen centre, with slight
   drag-to-look limited to about ±40° yaw and ±20° pitch, and a "recentre" button. Show head silhouettes in the
   occupied-looking rows in front (deterministic pseudo-random so it looks the same every time). Bottom card as
   described in the reference UX, plus "Change seat" and "Replay walk" buttons.

## YouTube playback on the 3D screen

- YouTube can't be used as a WebGL texture. Use Three.js `CSS3DRenderer` to place a YouTube iframe exactly on
  the screen plane, under a transparent `WebGLRenderer` canvas that draws the auditorium and the heads in
  front, so the heads occlude the video.
- Only mount the iframe once the camera is seated and still. Re-sync its CSS3D transform on drag-look and on
  resize. Unmount it when leaving the seated view.
- Use
  `https://www.youtube-nocookie.com/embed/<id>?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&controls=1`.
  Show a "Tap for sound" button that unmutes through the YouTube IFrame Player API.
- If the CSS3D approach fails on a device, fall back to showing the thumbnail texture plus an "Open trailer"
  button.

## Official trailers (pre-filled movie list)

- Pre-fill `data/movies.json` with 8–12 movies that are now playing or coming soon in Canadian theatres. Use
  web search to find them and their official trailers.
- Only use trailers uploaded by the official YouTube channel of the studio or distributor (e.g. Warner Bros.,
  Universal Pictures, Disney, Sony Pictures, Paramount, A24, Lionsgate). No fan uploads, re-uploads, reaction
  videos or trailer-aggregator channels.
- Never invent or guess a YouTube video id. Verify every id by requesting
  `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json`: it must return HTTP
  200, and `author_name` must be the official channel. A 401/403/404 means the video is missing or can't be
  embedded, so drop it.
- Each entry: `{ "id", "title", "youtubeId", "channel", "verifiedOn": "YYYY-MM-DD" }`. Movie titles stay in
  English.
- Add `scripts/verify-trailers.ts` (`npm run verify:trailers`) that re-checks every entry through oEmbed and
  reports dead ones, so the list can be refreshed later.
- If you have no web access, or can't verify at least 3 trailers, leave `movies.json` with only the verified
  ones (an empty list is fine), make the "paste a YouTube URL" input the main path, and say so in
  `DECISIONS.md`. The app must work with an empty list.
- In the UI, show the channel name under each movie and keep the "paste your own YouTube URL" option.

## Adding real auditoriums (important for the user)

1. A compact text format and an importer, so the user can type a seat map quickly. For example:

   ```
   A: 1-4 | 5-10 | 11-14
   B: 1-4 | 5-12 | 13-16
   ```

   (`|` = aisle; ranges expand to seat numbers; optional `_` for a single missing seat.)

2. A hidden dev page (`#/editor`) where you paste this text, pick the theatre and type, adjust the dimensions
   with sliders, see a live 2D preview and a live seated preview from a chosen seat, and click "Download JSON".
3. `docs/add-auditorium.md`: how to add an auditorium. Include a ready-to-use prompt the user can give to
   Claude together with a Cineplex seat-map screenshot to get the compact text or the JSON back, and a short
   checklist for calibrating dimensions on a visit ("How many seats wide is the screen?", "How many steps to
   the first row?").

## Quality bar

- Unit tests: metrics, band classification, YouTube URL parsing, the compact seat-map parser, schema validation
  of every JSON file in `data/`, and i18n key completeness.
- `npm run build`, `npm test` and `npm run lint` must all pass.
- The 2D seat map is keyboard accessible and has proper labels.
- README: what it is, the disclaimer, how to run locally, how to deploy, how to add an auditorium (linking the
  docs), and how to add a language.
- No console errors in normal use.

## Milestones (commit after each)

1. Project scaffold, tooling, CI build workflow, i18n system with all three locales, data schema and loader,
   placeholder data for the 7 theatres.
2. Procedural auditorium generator + seated first-person view from a selected seat + metrics module with tests.
3. 2D seat map with bands, legend, info card and keyboard support.
4. Walk-in animation, camera transitions, skip and reduced-motion handling.
5. YouTube CSS3D playback with head occlusion, the unmute flow and the fallback.
6. Compact seat-map format, editor page and docs/add-auditorium.md.
7. Polish: mobile layout, CJK text fitting, the estimated-dimensions badge, README, the GitHub Pages deploy
   workflow. Push.

When finished, report: what was built, anything that couldn't be done or had to be simplified, how to run it
locally, and the GitHub Pages URL it will deploy to.
