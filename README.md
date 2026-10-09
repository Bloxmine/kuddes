# Kuddes

Kuddes is a friends network in the spirit of the late-2000s ones (Hyves era), glossy gradient bars, bevelled buttons and all. It has profiles you can pimp, guestbook messages (**knuffels**), status updates (**WieWatWaars**), groups (**Kuddes**), photos, games, a forum, video, music, radio and a messenger. The interface is in Dutch.

**Kuddes has no central owner.** Anyone can run a Kuddes server, with its own members, admin and rules, and the servers talk to each other:

- **Between Kuddes servers:** members become friends, knuffel each other and see each other's WieWatWaars (`@naam@server`).
- **With Mastodon, Pixelfed and the rest of the fediverse:** members follow accounts there. Their posts and pictures show up in Overzicht → Fediverse.

This works through **Weide**, an open protocol on top of ActivityPub, described in [WEIDE.md](WEIDE.md). Anyone may implement it.

## Run it locally

You need Node 22 or newer and Docker.

```sh
npm install
cp .env.example .env     # once
npm run db:up            # start Postgres in Docker (port 5433)
npm run db:migrate       # create or update the tables
npm run dev              # the API on :8787 and the app on http://localhost:5173
```

The database starts empty.

1. Sign up at `http://localhost:5173/aanmelden`.
2. Make yourself the admin with `npm run admin -- grant <username>`.
3. Open `/beheer` to manage the server.

Admin rights can only be given on the server itself, never through the
website. The other commands are `approve`, `revoke`, `list` and
`reset-password`.

## Set up your own Kuddes server

[DEPLOY.md](DEPLOY.md) is a step-by-step guide for a VPS with Ubuntu 24.04,
Caddy, Postgres in Docker and systemd. In short:

1. **Get a server and a domain.** A VPS with 2 GB RAM or more, and a domain
   pointed at it. The domain becomes part of every member's address
   (`@naam@jouwdomein.nl`), so pick one you'll keep.
2. **Install and configure it.** Install Node, Docker, Caddy and ffmpeg,
   clone this repository to `/opt/kuddes`, and copy
   `deploy/env.production.example` to `.env`. In `.env`, set a database
   password and `PUBLIC_URL=https://jouwdomein.nl`.
3. **Start it.** Build and migrate (`npm ci && npm run build && npm run
   db:migrate`), then start it as a service (`deploy/kuddes.service`) behind
   Caddy (`deploy/Caddyfile`). Caddy gets the HTTPS certificate by itself.
4. **Make yourself admin.** Sign up on your site, then run
   `npm run admin -- grant <username>` on the server.
5. **Fill in Beheer → Servers.** Give your server's name, your name as
   admin, a contact address, your host and mail service, and any rules of
   your own. The privacy statement, user agreement and About page use them.
   Here you also choose whether your server federates: with every server,
   only with servers you allow, or not at all.
6. **Optionally:** set up a mail service for sign-up mails, nightly backups
   (`deploy/kuddes-backup.timer`) and a TURN server for games and calls.

**Updating:** `sudo bash /opt/kuddes/deploy/update.sh` pulls the new
version, installs, builds, migrates and restarts.

Your server joins the network by itself. Members find people on other Kuddes
servers, Mastodon or Pixelfed by searching for `@naam@server`.

## Documentation

- [DEPLOY.md](DEPLOY.md): running a server, step by step.
- [TECHSTACK.md](TECHSTACK.md): how Kuddes is built (stack, structure,
  conventions, every feature in detail).
- [WEIDE.md](WEIDE.md): the open protocol between servers.
- [THIRD_PARTY.md](THIRD_PARTY.md): what comes from others, and the optional
  extras that aren't included (BuddyPoke, the Bejeweled 3 art, the Mario
  Kart sprites).

## License and contributing

Kuddes is licensed under the [AGPL-3.0](LICENSE). You may run, change and
share it. If you run a changed version for others, share your changes too.

Issues and pull requests are welcome. [TECHSTACK.md](TECHSTACK.md) has the
conventions and the checks to run before sending a change.
