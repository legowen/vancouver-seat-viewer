# Vancouver Seat Viewer

See the view from your seat before you book. Pick a Metro Vancouver cinema, an auditorium
and a seat on the seat map; a small avatar walks in and sits down, and the camera switches
to that seat's point of view while a trailer plays on the screen. A card shows how the seat
rates, how far you are from the screen and how much of your view it fills.

> **Unofficial fan project — not affiliated with Cineplex Entertainment.**
> Seat maps are typed in by hand from public seat-map screenshots. Nothing is fetched from
> Cineplex, and trailers play through YouTube's own embedded player.

**GitHub Pages:** https://legowen.github.io/vancouver-seat-viewer/

## What it does

- **Seat map** coloured by rating band (Prime, Recommended, OK, Meh, Avoid), with a legend,
  aisles as gaps and the screen at the top. Works by touch, mouse or keyboard (arrow keys,
  Home/End, Enter).
- **Seat ratings** from the viewing angle, the side angle and how far you look up, with a
  one-line verdict such as "The screen fills your view" or "Turn your head to see it all".
- **3D auditorium** built from each auditorium's JSON: stepped rows, wall sconces, step
  lights and people in the rows in front. No model files.
- **Walk-in**: the avatar comes through the door, takes the side aisle and sits, then the
  camera moves into first person. "Skip" (or Escape) jumps straight to the seat, and
  `prefers-reduced-motion` starts seated.
- **Trailer on the screen**: a YouTube player placed on the screen in 3D, behind the heads
  of the people in front. It starts muted ("Tap for sound" turns sound on). Where it cannot
  run, the screen shows the trailer's still frame and an "Open trailer" button.
- **English, Korean and Simplified Chinese**, picked from `?lang=`, then your last choice,
  then the browser language.
- **Auditorium editor** at `#/editor` for turning a seat-map screenshot into a data file.

Dimensions that have not been measured come from typical values and are marked
**Estimated dimensions** in the app.

## Run it locally

You need Node.js 22.12 or newer (CI uses Node 24).

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173/vancouver-seat-viewer/.

| Command                     | What it does                                                          |
| --------------------------- | --------------------------------------------------------------------- |
| `npm run dev`               | Development server with hot reload                                    |
| `npm run build`             | Type-check, then build the static site into `dist/`                   |
| `npm run preview`           | Serve the built site locally                                          |
| `npm test`                  | Unit tests (Vitest), including validation of every data file          |
| `npm run lint`              | ESLint, then a Prettier check                                         |
| `npm run format`            | Format everything with Prettier                                       |
| `npm run verify:trailers`   | Re-check every trailer in `data/movies.json` with YouTube oEmbed      |
| `npm run import:auditorium` | Turn a seat map typed in the compact format into a data file          |
| `npm run smoke`             | Click through the built site in a headless browser (needs Playwright) |

`npm run smoke` serves `dist/` (run `npm run build` first), walks through every screen at phone
width with YouTube stubbed out, and fails on console errors or horizontal overflow. It needs the
`playwright` package (`npm i -D playwright`), which is not a dependency so that `npm ci` stays
small; it uses Playwright's Chromium if installed, otherwise your Chrome or Edge.

## Deploy

The site is fully static. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
lints, tests and builds on every push to `main`, then publishes `dist/` to GitHub Pages.
[`ci.yml`](.github/workflows/ci.yml) runs the same checks on every push and pull request.

One-time setup in the GitHub repository: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The site is then served from
`https://<owner>.github.io/vancouver-seat-viewer/`. Vite's `base` is set to
`/vancouver-seat-viewer/` in [`vite.config.ts`](vite.config.ts); change both if you rename
the repository.

## Add an auditorium

Each auditorium is a JSON file under `data/theatres/<theatre-id>/auditoriums/`. Every
theatre except Cineplex VIP Brentwood (four real rooms read from booking-site screenshots)
still has one made-up sample auditorium to replace with real ones.

The short version: type the rows in the compact format (`A: 1-4 | 5-10 | 11-14`), paste
them into the editor at `#/editor`, check the previews, and download the file. The full
guide, with a ready-to-use prompt for reading a seat-map screenshot with Claude and a
checklist for measuring a room on a visit, is in
**[docs/add-auditorium.md](docs/add-auditorium.md)**.

Default dimensions live in [`src/config/defaults.ts`](src/config/defaults.ts) and the
rating thresholds in [`src/config/rating.ts`](src/config/rating.ts).

## Update the trailer list

`data/movies.json` lists trailers for films now playing or coming soon. Only use trailers
uploaded by the studio's or distributor's own YouTube channel, and set `channel` to that
channel's exact name. Run `npm run verify:trailers`: it reports trailers that were removed,
can no longer be embedded or now come from a different channel. Add `-- --write` to update
`verifiedOn` for the ones that pass. The app also works with an empty list; people can paste
any YouTube link.

## Add a language

1. Copy `src/i18n/locales/en.json` to a new file named after the language tag, for
   example `src/i18n/locales/zh-Hant.json` for Traditional Chinese.
2. Translate every value. Keep the `{placeholders}` as they are, and set `meta.short` (the
   switcher label, e.g. "繁中") and `meta.name`.
3. Run `npm test`. It fails if the new file is missing a key or a placeholder.

That's it: languages are discovered from that folder, so the switcher and browser-language
detection pick the new file up automatically (`zh-TW` and `zh-HK` already map to `zh-Hant`).
To place it in a specific spot in the switcher, add its tag to `DISPLAY_ORDER` in
[`src/i18n/index.ts`](src/i18n/index.ts). The font stack in
[`src/styles.css`](src/styles.css) already has rules for `zh-Hant`; a new script may need
its own `:lang()` font rule there.

Theatre and auditorium names stay in English. A theatre can still have per-language
display names (`names`, `areaNames` in `theatre.json`).

## How it is built

- Vite, TypeScript (strict), plain three.js and a few small vanilla TypeScript modules for
  the interface; zod validates the data; Vitest, ESLint and Prettier for checks.
- `src/metrics/` holds the pure seat geometry and rating functions, `src/scene/` the walk
  route and room planning, `src/three/` everything that draws, and `src/ui/` the screens.
- The 3D code is loaded only when you first open a seat. Seats and heads are instanced,
  the pixel ratio is capped at 2, and frames are drawn only when something changes.
- [`DECISIONS.md`](DECISIONS.md) records the choices made along the way and why, and
  [`docs/spec.md`](docs/spec.md) is the original brief.
- For Claude Code sessions, `.claude/agents/` holds a read-only reviewer, a translator for the
  locale files and a trailer researcher, and `.claude/skills/` holds project skills for adding
  auditoriums and for the seat metrics, plus a few vendored three.js and design skills
  (licences in `.claude/skills/THIRD_PARTY.md`).

## Privacy

No backend, accounts or analytics. The language choice is kept in your browser's local
storage. Trailers use YouTube's privacy-enhanced (`youtube-nocookie.com`) player, and still
frames load from `i.ytimg.com`.

## Credits

Built with [three.js](https://threejs.org/) and [zod](https://zod.dev/) (both MIT
licensed). Trailers and their still frames belong to their studios and are shown through
YouTube's embedded player.
