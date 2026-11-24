# Adding an auditorium

Every auditorium in the app is one JSON file in this repository. Nothing is fetched from
Cineplex: you look at the seat map on the booking site, write the rows down, and the app
builds the room in 3D from that.

```
data/
  theatres.json                                   theatre ids, in display order
  theatres/<theatre-id>/theatre.json              name, area, auditorium order
  theatres/<theatre-id>/auditoriums/<id>.json     one file per auditorium
```

Theatres that have no real seat map yet ship with one made-up **sample auditorium**
(`*-sample.json`). Replace it with real ones as you add them: delete the sample file and
remove its id from `theatre.json`. Cineplex VIP Brentwood is already done and is a good
example of a VIP theatre.

## The quick way

1. Open a seat map on the booking site and take a screenshot of it.
2. Turn the screenshot into the compact text format below, either by typing it or by giving
   the screenshot to Claude with [the prompt in this guide](#ask-claude-to-read-a-screenshot).
3. Run the app (`npm run dev`) and open the hidden editor at
   `http://localhost:5173/vancouver-seat-viewer/#/editor`.
4. Pick the theatre, the type (standard or VIP) and the entrance, give the auditorium an id
   and a name, and paste the rows into **Seat map**. Problems are listed under the box with
   their line numbers.
5. Check the 2D preview against the screenshot, and click seats to see the view from them.
   Leave the dimension sliders on **Default** unless you have measured the room (see
   [Measuring on a visit](#measuring-on-a-visit)).
6. Click **Download JSON** and save the file where the editor tells you to, for example
   `data/theatres/silvercity-riverport/auditoriums/riverport-07.json`.
7. Add the id to the `auditoriums` list in that theatre's `theatre.json` to choose where it
   appears. (Files missing from the list still show up, after the listed ones.)
8. Run `npm test`. One of the tests validates every file in `data/` and names the field
   that is wrong if one is.

You can also load an existing auditorium in the editor (**Start from**) to adjust it.

### From the command line

If you prefer the terminal, save the rows in a text file and run:

```bash
npm run import:auditorium -- seats.txt --theatre silvercity-riverport --id riverport-07 --name "Auditorium 7"
```

Add `--type vip`, `--entrance back-right`, `--source "seat map screenshot 2026-11-20"`,
`--aisle 1` (narrower aisles), `--no-align` or `--force` (replace an existing file) as needed;
`--help` lists them all. It checks the rows the same way the editor does, writes the file
into the right folder and reminds you to list it in `theatre.json`.

## The compact seat-map format

One row per line, starting with the row nearest the screen. Seats go from left to right
as they appear on the seat map with the screen at the top.

```
A: 1-3 | 4-13 | 14-16
B: 1-4 | 5-14 | 15-18
C: 1-4 | 5-14 | 15-18
L: 1-20
```

| Write  | Means                                                                 |
| ------ | --------------------------------------------------------------------- |
| `A:`   | The row label: 1 to 3 letters or digits, then a colon                 |
| `5-14` | Seats 5 to 14. Write `14-5` if the numbers go down from left to right |
| `7`    | A single seat                                                         |
| `\|`   | An aisle between two blocks of seats. `\| \|` is a double-width aisle |
| `_`    | A single missing seat                                                 |
| `#`    | Starts a comment, at the start of a line or after the seats           |

Write one `|` per aisle, however wide it looks on the screenshot: an aisle is two seat
widths (about 1.1 m for standard seats). In the editor, **Aisle width** changes that for the
whole map.

Rows with the same number of blocks are lined up so their aisles run straight from front to
back, the way they do in a real cinema: the left and right blocks hug the aisles and the
middle blocks are centred. In the example, row A's three-seat side blocks get one empty seat
on the outside so its aisles match rows B and C. Rows with a different number of blocks
(row L, which has no aisles) are centred on the screen. Untick **Line the aisles up** in the
editor (or pass `--no-align`) to turn this off.

Spaces and commas between seats are both fine, and so are the full-width characters that
Korean and Chinese keyboards type (`：`, `｜`, `＿`, `－`, `１２３`). Gaps become `null` in the
JSON file, each one seat wide.

Rows of different lengths are centred by default. If the seat map shows short rows lined up
on the left or the right instead, change **Shorter rows line up** in the editor (the
`rowAlign` field), or pad them with `_`.

### When the map does not show seat numbers

Some booking maps (the Cineplex VIP ones, for example) show only row letters. Number the
seats 1, 2, 3 … from the left of each row and say so in `notes`: they will not match the
numbers on a ticket. Wheelchair spaces have no seat, so write them as gaps; the companion
seat next to one is a real seat. A pair of recliners drawn touching is two seats side by
side, with no gap slot between one pair and the next, because the map's grid already puts
every pair two slots wide.

To put rows at the right place when they do not line up in the middle (a row that is
shifted, or a seat that is not drawn), pad them with `_`, set `rowAlign` to `left`, and
write every row on the same slot grid. Check the 2D preview against the screenshot.

## Ask Claude to read a screenshot

Attach the seat-map screenshot and paste this prompt:

```text
I'm adding a cinema auditorium to a seat-viewer app. The attached image is the seat map
from the cinema's booking site.

Convert it to this compact text format, one row per line, starting with the row nearest
the screen:

  A: 1-4 | 5-14 | 15-18

Rules:
- Each line is the row label exactly as shown, a colon, then the seats from left to right
  as they appear on the map with the screen at the top.
- Write runs of consecutive seat numbers as ranges, like 5-14. If the numbers go down from
  left to right, write the range backwards, like 14-5.
- Put | between blocks of seats wherever there is an aisle: one | per aisle, however wide
  it is drawn.
- Use _ for a single missing seat inside a block of seats.
- Wheelchair or companion spaces: include them if they have seat numbers, otherwise leave
  them as gaps.
- If the map shows no seat numbers, number the seats 1, 2, 3 … from the left of each row.
  Draw the map on one slot grid (a pair of recliners drawn touching is two slots) and pad
  rows with _ so they line up as they do on the map.
- Do not skip or merge rows, and do not invent seat numbers you cannot read.

Reply with the text in a single code block. After it, list anything you were unsure about
(a hidden row, an unreadable number, an odd gap) instead of guessing.
```

To get the JSON file directly instead, add this to the prompt (with your own ids):

```text
Then also give me the auditorium as JSON in this shape, with two nulls for every |
and one null for every _:

{
  "id": "riverport-07",
  "theatreId": "silvercity-riverport",
  "name": "Auditorium 7",
  "type": "standard",
  "rows": [
    { "label": "A", "seats": [1, 2, 3, 4, null, null, 5, 6] }
  ],
  "entrance": "front-left",
  "verified": false,
  "source": "seat map screenshot YYYY-MM-DD"
}
```

Always compare the result with the screenshot in the editor's 2D preview: a missed row or
gap is easy to spot side by side.

## The auditorium file

Only `id`, `theatreId`, `name`, `type` and `rows` are required. Every dimension is
optional: anything left out comes from [`src/config/defaults.ts`](../src/config/defaults.ts),
chosen by the type and by the room size (from the seat count).

| Field                   | What it is                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                    | Same as the file name. Lowercase letters, digits and hyphens                                      |
| `theatreId`             | The theatre folder it lives in                                                                    |
| `name`                  | Shown in the app, e.g. "Auditorium 7"                                                             |
| `names`                 | Optional names per language: `{ "ko": "…", "zh-Hans": "…" }`                                      |
| `type`                  | `"standard"` or `"vip"` (recliners: wider seats, deeper rows)                                     |
| `rows`                  | `{ "label": "A", "seats": [1, 2, null, 3] }`, nearest the screen first                            |
| `screen.width_m`        | Screen width in metres                                                                            |
| `screen.aspect`         | Width ÷ height: 2.39 for a wide "scope" screen, 1.85 for a "flat" one                             |
| `screen.bottomHeight_m` | Height of the screen's bottom edge above the floor in front of row A                              |
| `firstRowDistance_m`    | From the screen to the eyes of someone sitting in row A                                           |
| `rowSpacing_m`          | Front-to-back distance from one row to the next                                                   |
| `rowRise_m`             | How much higher each row's floor is than the row in front                                         |
| `seatWidth_m`           | Centre-to-centre distance between neighbouring seats                                              |
| `eyeHeight_m`           | Seated eye height above the floor of the row                                                      |
| `rowAlign`              | `"center"` (default), `"left"` or `"right"`                                                       |
| `entrance`              | `"front-left"` (default), `"front-right"`, `"back-left"`, `"back-right"`                          |
| `verified`              | `true` once the dimensions were measured. Otherwise the app shows an "Estimated dimensions" badge |
| `source`, `notes`       | Free text: where the layout came from, anything worth knowing                                     |

Misspelled fields are reported as errors rather than ignored, so `rowSpacing` (without
`_m`) will not silently fall back to the default.

## Measuring on a visit

The ratings depend mostly on the screen width and the distance to the screen, so those
two are worth the most. A phone and your own stride are enough.

Before you go, measure your normal walking pace once at home (10 paces ÷ 10).

- [ ] **How many seats wide is the screen?** From the middle of row A, note which seats sit
      under the left and right edges of the screen. Screen width ≈ number of seats between
      them × seat width (0.55 m standard, 0.75 m VIP).
- [ ] **How many steps to the first row?** Walk from the screen wall to the front edge of
      row A's seats. First-row distance ≈ paces × your pace + 0.4 m (the seat's depth).
- [ ] **How far apart are the rows?** Count paces along the side aisle across five rows and
      divide by five.
- [ ] **How many stairs per row?** Count the aisle stairs between two rows. Each stair is
      about 0.17 m, so the step per row is about stairs × 0.17 m.
- [ ] **Where is the bottom of the screen?** Standing at the front: at your knee is about
      0.5 m, your hip about 1.0 m, your chest about 1.3 m.
- [ ] **What shape is the screen?** If curtains or black masking close in from the sides
      for a trailer, it is a wide "scope" screen (2.39). If the screen looks only about
      twice as wide as it is tall, use 1.85.
- [ ] **Which door did you come in through?** Front (by the screen) or back, left or right.
- [ ] Optional: hold your phone at arm's length from your seat and take a photo of the
      screen; it helps check the 3D view later.

Then set the values in the editor (untick **Default** for each one you measured), tick
**These dimensions were measured on a visit**, and download the file again. With
`"verified": true` the "Estimated dimensions" badge disappears for that auditorium.

## Checking your work

```bash
npm test
```

The data tests check every JSON file under `data/`: valid JSON, the schema, ids that match
file and folder names, and auditoriums listed in `theatre.json` that have no file. The app
itself also lists any broken file on the home screen, with the reason, and keeps working
with the others.
