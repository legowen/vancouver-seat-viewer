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
