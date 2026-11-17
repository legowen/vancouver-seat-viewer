---
name: add-auditorium
description: Turn a Cineplex seat-map screenshot or the compact text format into a valid auditorium JSON for the Vancouver Seat Viewer, pick the right defaults, and validate it with the zod schema and tests. Use when asked to add or fix a real auditorium.
---

# Add an auditorium

Seat data is entered by hand from seat-map screenshots. **Never call a Cineplex API and never scrape
cineplex.com** — work only from the screenshot or text the user gives you.

## 1. Read the seat map

- The screen is at the **top** of a Cineplex seat map. List rows from the screen side to the back: the first
  row you write is the front row.
- Keep the row labels (`A`, `B`, … or `AA`) and the seat numbers exactly as shown, in left-to-right order as
  drawn. If numbers run right-to-left on the map, write them that way (`14-11`).
- A walkway between seat blocks is an aisle. A single missing seat or wheelchair space inside a block is a gap.
- If you cannot read a number or a row is cut off, ask the user instead of guessing.

## 2. Write the compact text

```
A: 1-4 | 5-10 | 11-14
B: 1-4 | 5-12 | 13-16
C: 1-4 | 5-6 _ _ 9-12 | 13-16
```

- `Label: …` — one row per line, front row first.
- `a-b` — a run of seats (ascending or descending). A single number is one seat.
- `|` — an aisle. `_` — one missing seat.
- `#` starts a comment; blank lines are ignored.

The parser is `parseCompactSeatMap()` in `src/data/compact.ts`. With alignment on (the default) it pads rows with
gaps so aisles line up: the left block is pushed against the first aisle, the right block against the last
aisle, middle blocks are centred.

## 3. Turn it into JSON

Either way produces the same file:

- **Command line** — save the text to a file and run

  ```bash
  npm run import:auditorium -- --theatre <theatre-id> --id <aud-id> --name "Auditorium 7" --type standard seats.txt
  ```

  It writes `data/theatres/<theatre-id>/auditoriums/<aud-id>.json` and adds the id to that theatre's
  `theatre.json`. Add `--dry-run` to print the JSON instead.

- **Editor page** — open the app at `#/editor`, paste the text, choose theatre and type, adjust the sliders,
  check the 2D and seated previews, click **Download JSON**, then put the file in the folder above and add its
  id to `auditoriums` in `theatre.json`.

Ids are lowercase kebab-case, for example `riverport-07`. `theatreId` must equal the folder name.

## 4. Dimensions and defaults

Leave every dimension out unless it was measured. Missing values come from `src/config/defaults.ts`, chosen by
`type` (`standard` or `vip`) and by size (small / medium / large, from the seat count):

- standard: row spacing ≈ 1.0 m, seat width ≈ 0.55 m
- vip recliners: row spacing ≈ 1.5 m, seat width ≈ 0.75 m
- seated eye height ≈ 1.15 m above the row's floor
- screen width and first-row distance grow with the size class

Set `"verified": false` while any dimension is a default — the app then shows an "Estimated dimensions" badge.
Set it to `true` only after calibrating on a visit (see `docs/add-auditorium.md` for the checklist). Flat
screens only: IMAX, UltraAVX, ScreenX and curved screens are out of scope.

Always fill `"source": "seatmap screenshot YYYY-MM-DD"` and use `"notes"` for anything uncertain.

```json
{
  "id": "riverport-07",
  "theatreId": "silvercity-riverport",
  "name": "Auditorium 7",
  "type": "standard",
  "rows": [{ "label": "A", "seats": [1, 2, 3, 4, null, 5, 6, 7, 8, 9, 10, null, 11, 12] }],
  "entrance": "front-left",
  "verified": false,
  "source": "seatmap screenshot 2026-11-17",
  "notes": ""
}
```

`null` in `seats` is an aisle or gap. `entrance` is `front-left`, `front-right`, `back-left` or `back-right`
(left and right as seen from the seats, facing the screen).

## 5. Validate

1. `npm test` — `tests/data-files.test.ts` validates every JSON file in `data/` with the zod schema in
   `src/data/schema.ts` and checks that ids, folders and `theatre.json` agree.
2. `npm run dev`, open the theatre, and compare the thumbnail and the seat map with the screenshot: row count,
   seats per row, aisle positions, seat numbers at both ends of a few rows.
3. Sit in a middle seat and in a corner seat to make sure the 3D view looks plausible.

A schema error names the file and the path that failed (for example `rows[2].seats[5]`).
