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
