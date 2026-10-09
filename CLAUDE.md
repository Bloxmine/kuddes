# Kuddes (hyves)

A Hyves-style friends network in Dutch. Groups are **Kuddes**, profile guestbook messages are **knuffels**, status posts are **WieWatWaars**. README.md covers running and self-hosting, TECHSTACK.md the stack and the feature list, DEPLOY.md the production setup, WEIDE.md the federation protocol.

## Stack and layout

- Vite + React 19 + TypeScript in `src/`. TanStack Query for data. Plain CSS next to each component (no CSS framework).
- Hono API in `server/` (`routes/` for endpoints, `lib/` for logic, `db/schema.ts` for Drizzle + Postgres). zod v4 for validation.
- `shared/` holds types and constants used by both sides (categories, limits, API types). Put anything both need there.
- `web/` is **BuddyPoke, a separate repo**. Don't change it from here.
- UI text is Dutch. Code, comments and commit messages are English.

## Commands

```sh
npm run dev            # API :8787 + Vite :5173 (the user usually already has this running)
npm run db:migrate     # apply migrations (docker container: kuddes-db-1, port 5433)
npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.server.json --noEmit
npm run -s lint        # oxlint; the only accepted warning is src/lib/smileys.tsx:24
npm run -s build
npm run -s admin -- grant|approve|revoke|list|reset-password <username>
```

Run typecheck + lint + build before saying a change is done.

New migration: `script -qec "npx drizzle-kit generate --name <name>" /dev/null <<< $'\r'`, then `npm run -s db:migrate`. Migrations live in `server/db/migrations/`. Tell the user when a change needs a migration on the server.

## Verifying UI changes

Take a real screenshot instead of guessing: `puppeteer-core` (install in the scratchpad, not the project) with `/usr/bin/chromium`, against the dev server on :5173. Check desktop (1280), iPad (820) and phone (390) widths, and `document.documentElement.scrollWidth` for horizontal overflow. Logged-in pages keep an SSE connection open, so wait for a selector, not `networkidle0`.

Test accounts are named `kxtest_*`: create them with a throwaway script (and `emailVerifiedAt`), and **always delete them afterwards** (`delete from users where username like 'kxtest_%'`). Never leave test data behind.

## Conventions

- Match the surrounding code: comment density, naming, idiom. Comments say why, in plain English.
- Icons are Farm-Fresh PNGs via `<FarmIcon name=...>`; names are in `src/components/ui/farmIcons.ts`. Don't use emoji or new icon sets. Smileys use `<Smiley>`.
- Shared page layouts: catalogue pages (Glitterplaatjes, Recepten, Recensies, Gadgetmarkt, Kuddes, Overzicht) use `src/components/catalog/` (`CatalogHero`, `CategoryBar`, `CatalogMain`...). Reuse them for a new list page.
- Horizontal rows that scroll on small screens go in `HSCROLL_ROWS` (`src/lib/scrollFades.ts`) and the matching list in `src/styles/mobile.css`.
- Background-photo themes set `:root[data-page-image]`; loose text on a page needs the translucent label rule in `global.css`.
- Colours come from CSS variables (`--brand`, `--tint-1`, `--box-border`...). Never hardcode theme colours.
- Notifications: call `notify`/`notifyMentions` from `server/lib/notifications.ts`, and `unnotify` when the thing is deleted.
- Signup mode (mail verification vs. manual approval) is `server/lib/siteSettings.ts`; unconfirmed members stay in guest mode in mail mode.

## Gotchas

- oxlint `react(refs)`: don't read refs off a shared object; use a callback ref and destructure. `only-export-components`: non-component exports go in a separate file.
- Drizzle: bare columns inside `sql` subqueries need explicit aliases.
- zod v4: `.optional().refine` skips undefined; use `z.literal(true, {error})` for required consent.
- Running prettier on a whole file can reformat it all (e.g. AdminPage.tsx). Don't, unless asked; edit only what's needed.
- Placeholder avatars have their size inline; override with `!important`.
- A CSS mask hides open dropdowns inside the row; remove it with `:has(.dropdown.open)`.

## Rules

- **Commit only when asked.** Never push. Don't amend or rewrite history.
- Each server has its own admin (on Hein's server: Hein). Admin rights can't be given from the website, only with `npm run admin`.
- Don't publish the user's personal email on public pages. Use it only for identification, never send it to a service.
- Privacy policy (`shared/privacy.ts`, `PRIVACY_VERSION`) is AVG-based: bump the version when what is collected changes, and add new personal data to the export in `server/routes/customization.ts` (`/me/export`).
- Prefer editing existing files over creating new ones. Don't add docs or READMEs unless asked.

## Working efficiently (keeps usage down)

- Sessions run long here, so keep context small: `/compact` mid-task, `/clear` when switching to an unrelated task. Don't re-read files already read this session.
- Search with Grep/Glob and read only the lines you need (`offset`/`limit`) instead of whole large files (`schema.ts`, `Header.css`, `AdminPage.tsx`, `Forum.css` are big).
- Don't spawn subagents for things one or two searches can answer. Use one only for broad exploration or truly independent work, and pick a cheaper model (haiku/sonnet) for simple lookups.
- Batch independent tool calls in one turn. Combine shell steps instead of many small calls.
- Don't leave background loops, dev servers or watchers running after a task.
