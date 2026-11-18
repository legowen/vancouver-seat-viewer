# Adding a real auditorium

The app ships one made-up sample auditorium per theatre. This guide turns the seat map you see
when booking on Cineplex into a real one. All seat data is typed in by hand from a screenshot:
the app never calls a Cineplex API and never reads cineplex.com.

You need about ten minutes per auditorium:

1. Take a screenshot of the seat map.
2. Turn it into the compact text format (by hand, or with the prompt below).
3. Turn the text into a JSON file (editor page or command line).
4. Check it, commit it.
5. Later, on a visit, measure a few things and mark the room as verified.

## 1. Screenshot the seat map

Start a booking for any showtime in the auditorium you want, on the Cineplex website or app, and
stop at the seat selection screen. Take a screenshot that shows every row, the screen marker and
the auditorium number. Zoom out if a row is cut off; take two screenshots if you must.

Note the auditorium number (for example "Auditorium 7") and whether it is a regular or a VIP
room. Only flat-screen rooms are in scope: skip IMAX, UltraAVX and ScreenX rooms.

## 2. Write the compact text

One line per row, **front row first** (the row closest to the screen, at the top of the
Cineplex map), seats from left to right as drawn:

```
A: 1-4 | 5-10 | 11-14
B: 1-4 | 5-12 | 13-16
C: 1-4 | 5-6 _ _ 9-12 | 13-16
```

| You type | Means                                                                 |
| -------- | --------------------------------------------------------------------- |
| `A:`     | Row label, as printed (1–4 characters). Every line needs one.         |
| `1-4`    | Seats 1, 2, 3, 4. Write `14-11` if the numbers go down left to right. |
| `7`      | A single seat.                                                        |
| `\|`     | An aisle: a walkway between blocks of seats.                          |
| `_`      | One missing seat inside a block (a wheelchair space, a gap).          |
| `# …`    | A comment; ignored. Blank lines are ignored too.                      |

By default the aisles are lined up from row to row: in each row the left block is pushed
against the first aisle, the right block against the last aisle, and the middle blocks are
centred. A row with a different number of blocks (a back row without aisles, say) is centred
on the screen. Turn alignment off in the editor (or pass `--no-align`) if a room needs every
row exactly as typed; then use `_` to shift seats.

Full-width punctuation from a Korean or Chinese keyboard (`：`, `｜`, `＿`) works too.

### Let Claude read the screenshot

Attach the screenshot to a message to Claude with this prompt:

```text
This screenshot is the seat-selection map of a cinema auditorium. Transcribe it into the
compact text format below, so I can paste it into a seat-map editor.

Format, one line per row of seats:
  <row label>: <seats from left to right as drawn>
- List the rows from the screen side first: the row nearest the screen is the first line.
- Write runs of consecutive seat numbers as ranges, e.g. 1-4. If the numbers go down from
  left to right, write the range that way, e.g. 14-11.
- Put | where there is an aisle (a walkway that separates blocks of seats).
- Put _ for each missing seat inside a block (for example a wheelchair space).
- Keep row labels and seat numbers exactly as printed. Never guess: if a number or a row is
  hard to read, write ? in its place and tell me where.
- Ignore the legend, prices, icons, the "screen" label and anything that is not a seat.

Reply with the compact text in one code block. Under it, tell me: the number of rows, the
total number of seats, and the row with the most seats, so I can check your work.
```

Compare Claude's counts with the screenshot before you use the text.

## 3. Make the JSON file

### With the editor page (easiest)

Run the app (`npm run dev`) and open `#/editor`, for example
`http://localhost:5173/vancouver-seat-viewer/#/editor`.

1. Paste the compact text. Mistakes are listed by line number.
2. Pick the theatre, the type (Standard or VIP) and the entrance (where you walk in, as seen
   from the seats facing the screen).
3. Give the auditorium an id (`riverport-07`) and a name (`Auditorium 7`).
4. Leave the dimension sliders alone unless you measured something (see step 5). Only values
   you change are written to the file; the rest come from the defaults.
5. Check the seat map preview against the screenshot, and tap a few seats to see the seated
   preview.
6. Click **Download JSON** and save the file as
   `data/theatres/<theatre-id>/auditoriums/<auditorium-id>.json`.
7. Add the id to the `auditoriums` list in `data/theatres/<theatre-id>/theatre.json`, in the
   order you want them shown. You can also delete the sample auditorium there and its file.

### With the command line

Save the text in a file, then:

```bash
npm run import:auditorium -- --theatre silvercity-riverport --id riverport-07 --name "Auditorium 7" --type standard --entrance front-left --source "seatmap screenshot 2026-11-18" seats.txt
```

This writes the JSON file and adds the id to `theatre.json`. `--dry-run` prints the JSON
instead, `--force` replaces an existing file, `--no-align` keeps rows exactly as typed, and
`--aisle 1` makes aisles one seat wide instead of two. Use `-` instead of a file name to read
the text from the clipboard through a pipe.

### Theatre ids

| Theatre                              | id                               |
| ------------------------------------ | -------------------------------- |
| Cineplex Cinemas Coquitlam           | `cineplex-coquitlam`             |
| Cineplex VIP Cinemas Brentwood       | `cineplex-vip-brentwood`         |
| Cineplex Cinemas Metropolis          | `cineplex-metropolis`            |
| Cineplex Marine Gateway & VIP        | `cineplex-marine-gateway`        |
| SilverCity Riverport                 | `silvercity-riverport`           |
| Cineplex Odeon International Village | `cineplex-international-village` |
| Scotiabank Theatre Vancouver         | `scotiabank-vancouver`           |

Names live in each `theatre.json` and can be corrected there. A theatre may also have
`"localizedNames": { "ko": "…", "zh-Hans": "…" }` for its name in other languages.

## 4. Check and commit

```bash
npm test
```

The data test validates every file in `data/` and names the exact place of any problem, for
example `rows[2].seats[5]: seat 7 appears twice in row C`. Then:

```bash
npm run dev
```

Open the theatre, compare the thumbnail and the seat map with your screenshot (number of rows,
seats per row, aisle positions, the seat numbers at both ends of a few rows), and sit in a
middle seat and a corner seat.

## 5. Calibrate on a visit

Until you measure the room, its dimensions are estimates from `src/config/defaults.ts`
(chosen by type and seat count) and the app shows an **Estimated dimensions** badge. Seat
ratings depend mostly on the screen width and the distance to the first row, so those two
are worth the most.

Take these notes on a visit (a phone and your own stride are enough):

| Question                                                                        | How                                                                          | Field                                 |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| How many seats wide is the screen?                                              | From the front row, count the seats that fit under the screen, edge to edge. | `screen.width_m` = seats × seat width |
| How many steps from the screen wall to the first row?                           | Walk it with normal steps; one step ≈ 0.75 m.                                | `firstRowDistance_m`                  |
| How many stair steps from one row to the next?                                  | Count them in the side aisle; one step ≈ 0.17 m.                             | `rowRise_m`                           |
| How deep is a row?                                                              | Count steps along the side aisle over five rows, divide by five.             | `rowSpacing_m`                        |
| How wide is one seat, armrest to armrest?                                       | Measure with a phone (≈ 15 cm long) or a hand span (≈ 20 cm).                | `seatWidth_m`                         |
| How high is the bottom of the screen above the front floor?                     | Compare with your own height standing at the front.                          | `screen.bottomHeight_m`               |
| Is the picture wide (scope, about 2.4 : 1) or less wide (flat, about 1.85 : 1)? | Look at the masking during the film.                                         | `screen.aspect`                       |
| Is the screen curved?                                                           | If it is, the room is out of scope.                                          | —                                     |

Put the measured values in the JSON (or set them with the editor's sliders), set
`"verified": true` only when the screen width and the first-row distance are measured, and
update `"source"`, for example `"seatmap screenshot 2026-11-18, measured 2026-12-02"`.

## The file, field by field

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
  "source": "seatmap screenshot 2026-11-18",
  "notes": ""
}
```

- `id`: lowercase letters, digits and hyphens; also the file name.
- `theatreId`: the folder the file is in.
- `type`: `standard` or `vip` (recliners: wider seats, deeper rows).
- `rows`: front row first; `null` is an aisle or a gap; each row is centred on the screen.
- `entrance`: `front-left`, `front-right`, `back-left` or `back-right`, as seen from the seats.
- Every dimension is optional. Defaults (in metres) by type and size:

| Default                  | Standard    | VIP           |
| ------------------------ | ----------- | ------------- |
| Row spacing              | 1.00        | 1.50          |
| Row rise                 | 0.35        | 0.45          |
| Seat width               | 0.55        | 0.75          |
| Eye height above row     | 1.15        | 1.15          |
| Screen aspect            | 2.39        | 2.39          |
| Screen width (S / M / L) | 9 / 12 / 15 | 8 / 10 / 12   |
| First row (S / M / L)    | 4 / 5 / 6   | 4.5 / 5 / 5.5 |

Size is small, medium or large by seat count: standard rooms under 120 seats are small and
from 250 seats large; VIP rooms under 50 seats are small and from 90 large.

## Why seats get the rating they get

The rules (viewing angle bands, the 60° "too close" limit, the 35° neck and side limits) are in
`.claude/skills/seat-metrics/SKILL.md` and `src/config/rating.ts`. They do not depend on the
auditorium file beyond the dimensions above.
