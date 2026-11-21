---
name: seat-metrics
description: Seat metric formulas, rating-band thresholds and verdict keys for the Vancouver Seat Viewer. Use before changing anything in src/metrics/, src/config/rating.ts, the band colours or the verdict strings, so scoring stays consistent with the tests.
---

# Seat metrics and rating

Every seat gets four numbers, one rating band and one verdict sentence. The maths lives in pure functions under
`src/metrics/`; the tunable numbers live in `src/config/rating.ts`. Nothing else in the app may compute or
hard-code them.

## Coordinate system (shared by the metrics, the 2D map and the 3D scene)

- `x` runs across the room. `0` is the screen centre line; positive is to the right of someone facing the
  screen (the right side of the seat map with the screen drawn at the top).
- `y` is up. `0` is the floor in front of the first row.
- `z` is the distance from the screen plane. The screen is at `z = 0`; row `i` (0 = front row) has the sitter's
  eyes at `z = firstRowDistance_m + i × rowSpacing_m`.
- Eye position of a seat: `(x_seat, i × rowRise_m + eyeHeight_m, z_row)`.
- Screen: width `W = screen.width_m`, height `H = W / screen.aspect`, bottom edge at `screen.bottomHeight_m`,
  centre `C = (0, bottom + H/2, 0)`, top edge at `bottom + H`.

`resolveAuditorium()` in `src/metrics/layout.ts` fills in defaults from `src/config/defaults.ts` and turns an
auditorium file into these positions. Every slot in a row (seat or `null` gap) is one `seatWidth_m` wide; rows
shorter than the widest row are centred on `x = 0` unless `rowAlign` says otherwise.

## Metrics (`src/metrics/metrics.ts`)

| Field           | Formula                               | Notes                                                           |
| --------------- | ------------------------------------- | --------------------------------------------------------------- |
| `distance`      | `‖eye − C‖` (3D)                      | Shown as "Distance 21.8 m".                                     |
| `viewingAngle`  | `2 · atan((W / 2) / z)`               | Uses the distance to the screen plane `z`, exactly as specified. |
| `offAxis`       | `atan(abs(x) / z)`                    | Horizontal plane only; height is covered by the next metric.    |
| `verticalToTop` | `atan((screenTop − eye.y) / z)`       | Angle up to the top edge. Negative when the eye is above it.    |

All angles are in degrees.

## Rating bands (`rateSeat()` in `src/metrics/rating.ts`, thresholds in `src/config/rating.ts`)

1. **Avoid** when any hard limit is broken. All broken limits are listed in `reasons`, in this order, and
   the first one picks the verdict:
   - `verticalToTop > 35` → `neck`
   - `viewingAngle > 60` → `tooClose`
   - `offAxis > 35` → `side`
2. Otherwise the band comes from the viewing angle:
   - **Prime**: `45 ≤ angle ≤ 60`
   - **Recommended**: `36 ≤ angle < 45`
   - **OK**: `30 ≤ angle < 36`
   - **Meh**: `angle < 30`
3. If `offAxis > 25`, the seat moves **one band down** (Prime → Recommended → OK → Meh; Meh stays Meh, so a
   side angle alone never makes a seat "Avoid") and the reason is `sideMild`.

Bands from best to worst: `prime`, `recommended`, `ok`, `meh`, `avoid` (`BANDS` in `src/config/rating.ts`).
`pickDefaultSeat()` in `src/metrics/index.ts` suggests the starting seat: best band, then closest to the
centre line and to a 50° viewing angle (`idealViewingAngle`).

## Verdict keys (strings in `src/i18n/locales/*.json`)

| Band and reason                     | i18n key              |
| ----------------------------------- | --------------------- |
| avoid, first reason `neck`          | `verdict.neck`        |
| avoid, first reason `tooClose`      | `verdict.tooClose`    |
| avoid, first reason `side`          | `verdict.side`        |
| prime                               | `verdict.prime`       |
| recommended                         | `verdict.recommended` |
| ok                                  | `verdict.ok`          |
| meh                                 | `verdict.meh`         |
| any band moved down for `sideMild`  | `verdict.sideMild`    |

Band labels are `band.prime`, `band.recommended`, `band.ok`, `band.meh`, `band.avoid`.

## When you change scoring

1. Change numbers only in `src/config/rating.ts`. Change formulas only in `src/metrics/`.
2. Update `tests/metrics.test.ts` (formulas, every threshold boundary, the demotion rule, reasons and
   verdicts) and `tests/layout.test.ts` (defaults and positions). Run `npm test`.
3. If you add or rename a verdict or band, update `en.json`, then run the `i18n-translator` agent so `ko.json`
   and `zh-Hans.json` stay complete (`tests/i18n.test.ts` fails otherwise).
4. Band colours are the `--band-*` variables in `src/styles.css`; the seat map, legend, thumbnails and pills
   all use them. Prime seats also carry a dot and avoid seats a slash, so colour is never the only cue.
5. The legend's ranges ("45–60°") are built from `src/config/rating.ts`, so they follow a threshold change
   automatically. Record any change of rule in `DECISIONS.md`.
