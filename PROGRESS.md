# Progress

Milestone checklist for the build. Updated after each milestone so the work can be picked up
again if a session is interrupted.

- [x] **M1** Scaffold, tooling, CI workflow, i18n (EN / KO / ZH), data schema and loader,
      placeholder data for the 7 theatres
- [x] **M2** Procedural auditorium, seated first-person view, seat metrics with tests
- [x] **M3** 2D seat map: rating bands, legend, info card, keyboard support
- [x] **M4** Walk-in animation, camera transitions, skip, reduced motion
- [x] **M5** YouTube playback on the screen (CSS3D) with head occlusion, unmute, fallback,
      plus the verified trailer list
- [x] **M6** Compact seat-map format, editor page, `docs/add-auditorium.md`
- [x] **M7** Polish, README, GitHub Pages deploy workflow, push to `main`

An earlier, separate build of the same brief (from another session) is kept on the
`claude/zealous-rubin-3tujo9` branch; this build replaced it on `main` on 2026-11-19, and its
best ideas were ported over on 2026-11-20 (see "Ported from the earlier build" in DECISIONS.md).

## Picking the work back up

- `npm install`, then `npm run dev` and open the URL it prints.
- Checks that must pass before each commit: `npm run lint && npm test && npm run build`, and
  `npm run smoke` when Playwright is installed.
- Choices made along the way are in [DECISIONS.md](DECISIONS.md).
