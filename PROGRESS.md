# Progress

Checklist for the build described in `docs/spec.md`. Tick a box only after build, lint and tests pass and the
milestone is committed. To resume after an interruption: read this file, `DECISIONS.md` and `git log --oneline`,
then continue with the first unticked item.

- [x] 0. Agents (`.claude/agents/`), skills (`.claude/skills/`), spec, this checklist
- [x] 1. Scaffold, tooling, CI workflow, i18n (en / ko / zh-Hans), data schema + loader, placeholder data for 7 theatres
- [x] 2. Procedural auditorium generator, seated first-person view, metrics module with tests
- [ ] 3. 2D seat map: bands, legend, info card, keyboard support
- [ ] 4. Walk-in animation, camera transitions, skip, reduced motion
- [ ] 5. YouTube CSS3D playback, head occlusion, unmute flow, fallback
- [ ] 6. Compact seat-map format, `#/editor` page, `docs/add-auditorium.md`
- [ ] 7. Polish: mobile layout, CJK fitting, estimated-dimensions badge, README, GitHub Pages deploy workflow, push to `main`

## Open items

- `data/movies.json` is empty until trailers can be verified through YouTube oEmbed (see `DECISIONS.md`).
