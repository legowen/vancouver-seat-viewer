---
name: seat-metrics
description: Seat metric formulas, rating-band thresholds and verdict keys for the Vancouver Seat Viewer. Use before changing anything in src/metrics/, src/config/rating.ts, the band colours or the verdict strings, so scoring stays consistent with the tests.
---

# Seat metrics and rating

Every seat gets four numbers, one rating band and one verdict sentence. The maths lives in pure functions under
`src/metrics/`; the tunable numbers live in `src/config/rating.ts`. Nothing else in the app may compute or
hard-code them.

## Coordinate system (shared by the metrics, the 2D map and the 3D scene)

- `x` runs across the room. `0` is the screen centre line, negative is audience-left (the left side of the seat
  map with the screen drawn at the top).
- `y` is up. `0` is the floor at the screen wall.
- `z` is the horizontal distance from the screen plane. The screen is at `z = 0`, row `i` (0 = front row) is at
  `z = firstRowDistance_m + i × rowSpacing_m`.
- Eye position of a seat: `(x_seat, i × rowRise_m + eyeHeight_m, z_row)`.
- Screen: width `W = screen.width_m`, height `H = W / screen.aspect`, bottom edge at `screen.bottomHeight_m`,
  centre `C = (0, bottom + H/2, 0)`, top edge at `bottom + H`.

`src/geometry/layout.ts` turns a resolved auditorium into these positions. Rows shorter than the widest row are
centred on `x = 0`.

## Metrics (`src/metrics/metrics.ts`)

| Field               | Formula                           | Notes                                                           |
| ------------------- | --------------------------------- | --------------------------------------------------------------- |
| `distance_m`        | `‖eye − C‖` (3D)                  | Shown as "Distance 21.8 m".                                     |
| `viewingAngle_deg`  | `2 · atan((W / 2) / z)`           | Uses the perpendicular distance `z` only, exactly as specified. |
| `offAxis_deg`       | `atan(abs(x) / z)`                | Horizontal plane only; height is covered by the next metric.    |
| `verticalAngle_deg` | `atan((screenTop − eye.y) / z)`   | Angle up to the top edge. Negative when the eye is above it.    |

All angles are returned in degrees. `z` must be > 0 (the schema guarantees it).

## Rating bands (`src/metrics/rating.ts`, thresholds in `src/config/rating.ts`)

Checked in this order:

1. **Avoid** when any of these is true. The first match is the reason:
   - `viewingAngle_deg > 60` → reason `tooClose`
   - `verticalAngle_deg > 35` → reason `neck`
   - `offAxis_deg > 35` → reason `side`
2. Otherwise the base band comes from the viewing angle:
   - **Prime**: `45 ≤ angle ≤ 60`
   - **Recommended**: `36 ≤ angle < 45`
   - **OK**: `30 ≤ angle < 36`
   - **Meh**: `angle < 30`
3. If `offAxis_deg > 25`, move **one band down** (Prime → Recommended → OK → Meh; Meh stays Meh) and set the
   reason to `offAxis`.

Bands in order from best to worst: `prime`, `recommended`, `ok`, `meh`, `avoid`.

## Verdict keys (`verdictKey()` in `src/metrics/rating.ts`, strings in `src/i18n/locales/*.json`)

| Band and reason                           | i18n key                |
| ----------------------------------------- | ----------------------- |
| avoid + `tooClose`                        | `verdict.avoidTooClose` |
| avoid + `neck`                            | `verdict.avoidNeck`     |
| avoid + `side`                            | `verdict.avoidSide`     |
| prime                                     | `verdict.prime`         |
| recommended                               | `verdict.recommended`   |
| ok                                        | `verdict.ok`            |
| meh                                       | `verdict.meh`           |
| recommended or ok, demoted for `offAxis`  | `verdict.offAxis`       |
| meh, demoted for `offAxis`                | `verdict.mehOffAxis`    |

Band labels are `band.prime`, `band.recommended`, `band.ok`, `band.meh`, `band.avoid`.

## When you change scoring

1. Change numbers only in `src/config/rating.ts`. Change formulas only in `src/metrics/`.
2. Update `src/metrics/metrics.test.ts` and `src/metrics/rating.test.ts` — they pin the formulas, every
   threshold boundary and the demotion rule. Run `npm test`.
3. If you add or rename a verdict or band, update `en.json`, then run the `i18n-translator` agent so `ko.json`
   and `zh-Hans.json` stay complete (a test fails otherwise).
4. Band colours are CSS variables `--band-*` in `src/styles/tokens.css`, and the same values are used for the
   3D seat highlight. Keep the legend, the map and the info card on the same variables.
5. Update this file and the table in `README.md` if a threshold or formula changed.
