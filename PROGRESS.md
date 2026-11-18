# Progress

Checklist for the build described in `docs/spec.md`. Tick a box only after build, lint and tests pass and the
milestone is committed. To resume after an interruption: read this file, `DECISIONS.md` and `git log --oneline`,
then continue with the first unticked item.

- [x] 0. Agents (`.claude/agents/`), skills (`.claude/skills/`), spec, this checklist
- [x] 1. Scaffold, tooling, CI workflow, i18n (en / ko / zh-Hans), data schema + loader, placeholder data for 7 theatres
- [x] 2. Procedural auditorium generator, seated first-person view, metrics module with tests
- [x] 3. 2D seat map: bands, legend, info card, keyboard support
- [x] 4. Walk-in animation, camera transitions, skip, reduced motion
- [x] 5. YouTube CSS3D playback, head occlusion, unmute flow, fallback
- [ ] 6. Compact seat-map format, `#/editor` page, `docs/add-auditorium.md`
- [ ] 7. Polish: mobile layout, CJK fitting, estimated-dimensions badge, README, GitHub Pages deploy workflow, push to `main`

## Open items

- The reviewer agent has not reviewed Milestones 4 and 5 yet (paused to save usage; checks all pass).
- Work in progress, committed but not wired in yet: `src/ui/editorView.ts` (the `#/editor` page, Milestone 6), `docs/add-auditorium.md` (Milestone 6), `.github/workflows/deploy.yml` (Milestone 7; only on the development branch until Pages is enabled).

- `data/movies.json` is empty until trailers can be verified through YouTube oEmbed (see `DECISIONS.md`).
