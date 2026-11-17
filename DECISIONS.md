# Decisions

One line each: the decision, then why. Newest at the bottom of each section.

## Process and tooling

- The build spec is saved as `docs/spec.md` — the reviewer agent and later sessions need it to check requirements.
- Vendored 8 of the 13 `cloudai-x/threejs-skills` (MIT) and Anthropic's `frontend-design` skill (Apache-2.0) into `.claude/skills/` — they fit this build (three.js r186 API changes, UI design guidance); the other five three.js skills cover things this app does not use.
- Did not use the `webapp-testing` skill — it needs Python Playwright; `scripts/smoke.cjs` does the same job with Node Playwright and no extra install.
- The setup commit was pushed to `main` first, before the milestones — the first branch pushed to an empty GitHub repo becomes its default branch, and GitHub Pages only deploys from the default branch out of the box.

## Trailers

- `data/movies.json` ships with only oEmbed-verified entries, which is none (`[]`) — the build environment blocks `youtube.com`, so no id could be verified, and the spec forbids unverified ids.
- Pasting a YouTube URL is the main path on the trailer screen while the list is empty — required by the spec for this case.
- Unverified search results go to `data/movie-candidates.json`, which the app never loads; `npm run verify:trailers -- --promote` checks each one through oEmbed and moves the passing ones into `movies.json` — so the list can be filled with one command from a machine that can reach YouTube.
- `movies.json` entries use `{ id, title, youtubeId, channel, verifiedOn }` — the spec gives two shapes; this is the later, more specific one.
