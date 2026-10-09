# Running your own Kuddes server

This guide takes you from an empty VPS to your own Kuddes server, for example at https://kuddes.example, with HTTPS, backups and you as its admin. Budget an hour or two. Run every command on the server unless it says **on your PC**.

Kuddes is a network of servers without a central owner. Your server has its own members, rules and admin, and talks with other Kuddes servers (and Mastodon and the like) through Weide, an open protocol on top of ActivityPub (see [WEIDE.md](WEIDE.md)). Section 17 covers setting it up.

Throughout this guide, replace `kuddes.example` with your own domain and `<you>` with your login on the server. The examples use Strato (a German host), but any VPS with Ubuntu works.

How it fits together:

```
visitor ──HTTPS──▶ Caddy (ports 80/443, gets the certificate by itself)
                     │
                     ▼ 127.0.0.1:8787
                   Kuddes (Node, systemd service, user "kuddes")
                     │                     │
                     ▼ 127.0.0.1:5433      ▼
                   Postgres (Docker)     /opt/kuddes/uploads (photos, videos…)
```

Only Caddy is reachable from the internet. The app and the database listen on 127.0.0.1 only.

---

## 1. What you need

| | |
|---|---|
| **VPS** | Any VPS with **Ubuntu 24.04 LTS** (for example a Strato VPS Linux). At least **2 GB RAM** (4 GB is better: video conversion with ffmpeg and `npm run build` both use memory), at least 2 vCPUs (4 is better: videos are compressed to H.265, which takes a lot of CPU), and enough disk for videos (uploads are at most 100 MB and shrink a lot after compression). |
| **Domain** | Your own domain (or subdomain), with access to its DNS records. It becomes part of every member's address on other servers (`naam@kuddes.example`), so pick one you'll keep. |
| **On your PC** | An SSH client. |
| **Software on the server** (installed below) | Node.js 24 LTS, Docker with the compose plugin (Postgres 17 runs in it), Caddy 2, ffmpeg, git, ufw, fail2ban. |

Optionally an account at a mail service for `noreply@kuddes.example` (step 12); without it, you approve new members yourself and help with forgotten passwords under Beheer. Sessions live in the database, so there are no other secrets besides the database password (and the mail login, if you use one).

---

## 2. Point the domain at the server

In your host's panel, find the server's IPv4 address (and IPv6, if it has one). Under the domain's DNS settings, set:

| Type | Name | Value |
|---|---|---|
| A | `kuddes.example` (`@`) | the server's IPv4 |
| A | `www` | the server's IPv4 |
| AAAA | `@` and `www` | the server's IPv6 (only if you have one; otherwise remove any existing AAAA records) |

Remove any old A/AAAA records that point at your host's parking page. DNS can take a while (usually minutes, sometimes a few hours). Check it with `dig +short kuddes.example` on your PC. Caddy can only get a certificate once this points at your server.

---

## 3. Secure the server

### 3.1 Log in and create your own user

Install Ubuntu 24.04 from the Strato panel. You'll get a root password. **On your PC**, make an SSH key if you don't have one yet (`ssh-keygen -t ed25519`), then:

```bash
ssh root@<server-ip>
```

On the server:

```bash
apt update && apt full-upgrade -y
adduser <you>                       # pick a strong password (needed for sudo)
usermod -aG sudo <you>
timedatectl set-timezone Europe/Amsterdam
```

**On your PC**, copy your key to the new user, then check you can log in without a password:

```bash
ssh-copy-id <you>@<server-ip>
ssh <you>@<server-ip>
```

### 3.2 SSH: keys only, no root

Only do this **after** logging in as `<you>` with your key works, or you'll lock yourself out.

```bash
sudo tee /etc/ssh/sshd_config.d/10-kuddes.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo systemctl restart ssh
```

Keep your current session open and test in a **second** terminal that `ssh <you>@<server-ip>` still works.

### 3.3 Firewall, fail2ban, automatic security updates

```bash
sudo apt install -y ufw fail2ban unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp             # HTTP/3
sudo ufw enable
sudo systemctl enable --now fail2ban      # bans IPs that keep guessing SSH logins
sudo dpkg-reconfigure -plow unattended-upgrades   # answer "Yes"
```

If your Strato package also has a firewall in the customer panel, open 22, 80 and 443 there too.

> **About Docker and ufw:** Docker writes its own firewall rules and ignores ufw for published ports. That's why `docker-compose.yml` publishes Postgres on `127.0.0.1:5433` only. Never change that to `5433:5432`, or the database is open to the internet.

### 3.4 Swap (only with 2 GB RAM)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Install the software

### Node.js 24 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # v24.x; must be at least 22.12
```

### Docker and compose

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Don't add anyone to the `docker` group: that's the same as root. Docker commands in this guide use `sudo`.

### Caddy, ffmpeg, git, fonts

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy ffmpeg git fontconfig fonts-dejavu-core
```

The fonts are for the share images that link previews show (see step 13).

---

## 5. Install Kuddes

### 5.1 A user for the app

The app runs as its own user without sudo. If it's ever broken into, the attacker can't do much.

```bash
sudo useradd --system --create-home --home-dir /home/kuddes --shell /usr/sbin/nologin kuddes
sudo mkdir -p /opt/kuddes && sudo chown kuddes:kuddes /opt/kuddes
```

### 5.2 Get the code

Clone the public repository (or your own fork of it):

```bash
sudo -u kuddes git clone https://github.com/Bloxmine/kuddes.git /opt/kuddes
```

If you run your own changes from a private fork, give the `kuddes` user a read-only deploy key instead (`sudo -u kuddes ssh-keygen -t ed25519`, then add the `.pub` file under the fork's **Settings → Deploy keys**) and clone with the `git@github.com:…` address. Kuddes is AGPL-licensed: when you run a modified version for others, share your changes (for example by keeping your fork public).

### 5.3 Optional extras: BuddyPoke, Bejeweled 3, Mario Kart sprites

These aren't in the repository (see [THIRD_PARTY.md](THIRD_PARTY.md)). The site works without them; the boxes or games that need them just stay empty. Skip this step if you don't have them.

**BuddyPoke** (`web/`, the HTML5 port of the 3D buddies) is a separate project. If you have a copy, put it in `web/`. **On your PC**, from the folder that holds it:

```bash
rsync -az --delete --exclude .git web/ <you>@<server-ip>:/tmp/kuddes-web/
```

On the server:

```bash
sudo mv /tmp/kuddes-web /opt/kuddes/web && sudo chown -R kuddes:kuddes /opt/kuddes/web
```

**Bejeweled 3** (`games/bejeweled/`): its code comes with the repo, but its art, sounds and music (`web/assets/`, about 120 MB) are the game's own files. Make them from your own installed copy of the game with `tools/build_assets.py` (see `games/bejeweled/README.md`) and copy them over. **On your PC:**

```bash
rsync -az --delete games/bejeweled/web/assets/ <you>@<server-ip>:/tmp/kuddes-bejeweled/
```

On the server (works the first time and for updates; the trailing slashes copy the folder's contents, and `--delete` drops files that are no longer there). It first checks that the upload is complete: with an empty or half `/tmp/kuddes-bejeweled`, `--delete` would wipe the live assets.

```bash
test -f /tmp/kuddes-bejeweled/manifest.json && sudo rsync -a --delete /tmp/kuddes-bejeweled/ /opt/kuddes/games/bejeweled/web/assets/ && sudo chown -R kuddes:kuddes /opt/kuddes/games/bejeweled/web/assets && rm -rf /tmp/kuddes-bejeweled || echo "Upload not complete: /tmp/kuddes-bejeweled/manifest.json is missing, nothing was changed"
```

Check: `curl -sI http://127.0.0.1:8787/bejeweled/assets/manifest.json | head -1` should say `200 OK`.

Only when the assets change (a new `build_assets.py` run) do you need to copy them again.

**Mario Kart Wii sprites** (`public/mkwii/`, Nintendo's artwork) for the Mario Kart gadget: without them it shows names only. If you have them, copy the folder to `/opt/kuddes/public/mkwii/` before building (step 5.7).

### 5.4 Settings (`.env`)

```bash
sudo -u kuddes cp /opt/kuddes/deploy/env.production.example /opt/kuddes/.env
sudo chmod 600 /opt/kuddes/.env
openssl rand -base64 32 | tr -d '/+=' | cut -c1-32     # this is your database password
sudo -u kuddes nano /opt/kuddes/.env
```

Put that password in **both** places that say `CHANGE_ME` (`POSTGRES_PASSWORD` and inside `DATABASE_URL`). Leave the rest as it is. The file sets:

- `NODE_ENV=production`: session cookies become `Secure`, and startup stops if settings are missing.
- `HOST=127.0.0.1` and `PORT=8787`: the app is only reachable from the server itself.
- `TRUST_PROXY=1`: the app takes visitors' IP addresses from Caddy. Rate limits depend on this.
- `PUBLIC_URL=https://kuddes.example`: your server's address. It turns on HSTS, is used in mails, and is part of every member's address on other servers, so **set it to your real domain before anyone signs up, and don't change it later**.
- `UPLOAD_DIR`, `BUDDYPOKE_DIR` and `BEJEWELED_DIR`: where uploads, BuddyPoke and Bejeweled 3 (its `web/` folder) live.

### 5.5 Database

```bash
cd /opt/kuddes
sudo docker compose up -d --wait        # starts Postgres; reads POSTGRES_PASSWORD from .env
sudo docker compose ps                  # should say "healthy", ports 127.0.0.1:5433->5432
```

`POSTGRES_PASSWORD` is only used the first time, when the database is created. To change it later you have to change it inside Postgres as well (`ALTER USER kuddes PASSWORD '…'`).

### 5.6 Choose: start empty, or move an existing Kuddes

**A. Move a Kuddes you already run** (for example one you tried out on your PC) with its accounts, posts, photos, videos and forum. **On your PC**, in the project folder:

```bash
docker exec kuddes-db-1 pg_dump -U kuddes --no-owner --no-privileges kuddes | gzip > kuddes.sql.gz
rsync -az kuddes.sql.gz <you>@<server-ip>:/tmp/
rsync -az --exclude tmp-videos uploads/ <you>@<server-ip>:/tmp/kuddes-uploads/
```

On the server:

```bash
cd /opt/kuddes
gunzip -c /tmp/kuddes.sql.gz | sudo docker compose exec -T db psql -q -U kuddes -d kuddes
sudo mv /tmp/kuddes-uploads /opt/kuddes/uploads && sudo chown -R kuddes:kuddes /opt/kuddes/uploads
rm /tmp/kuddes.sql.gz
```

Remove test accounts later from the admin page, and check your own e-mail address under Instellingen once you're logged in.

**B. Start empty** (a new server):

```bash
sudo -u kuddes mkdir -p /opt/kuddes/uploads
```

### 5.7 Build and migrate

```bash
cd /opt/kuddes
sudo -u kuddes npm ci
sudo -u kuddes npm run build
sudo -u kuddes npm run db:migrate
```

---

## 6. Start it

### 6.1 The app as a service

```bash
sudo cp /opt/kuddes/deploy/kuddes.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuddes
curl http://127.0.0.1:8787/api/health     # {"ok":true}
```

The service is locked down. It runs as `kuddes`, can only write to `/opt/kuddes/uploads`, can't see `/home`, and restarts itself if it crashes.

### 6.2 Caddy (HTTPS)

```bash
sudo cp /opt/kuddes/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 50 --no-pager   # look for "certificate obtained successfully"
```

Open https://kuddes.example. If Caddy can't get a certificate, the DNS from step 2 isn't pointing here yet, or port 80/443 is blocked. Caddy keeps retrying and renews the certificate by itself.

---

## 7. You as this server's admin

Each server has its own admin. The admin role can **only** be given on the server, with `npm run admin`; nobody can get it through the website. The page is **https://kuddes.example/beheer**, and there's a "Beheer" item in your account menu. Everyone else gets "Deze pagina bestaat niet".

- **Moving an existing Kuddes (5.6 A):** your admin account comes along.
- **Starting empty (5.6 B):** go to https://kuddes.example/aanmelden **right away** and register your own account (say `naam`), so nobody else is first. Then run:

```bash
cd /opt/kuddes
sudo -u kuddes npm run admin -- grant naam
```

Then open **Beheer → Servers** and fill in your server's name, your name as admin, a contact address, your host and mail service, and any rules of your own. The privacy statement, user agreement and Over Kuddes page use them (section 17).

Other commands:

```bash
sudo -u kuddes npm run admin -- list                 # who is admin
sudo -u kuddes npm run admin -- approve <username>   # let someone in from the waitlist (the Beheer page does this too)
sudo -u kuddes npm run admin -- reset-password naam  # forgot your password: prints a new one and logs you out everywhere
sudo -u kuddes npm run admin -- revoke <username>
```

What the admin page can do:

| Tab | |
|---|---|
| **Overzicht** | Numbers (members, online, uploads and storage, open reports), newest members, latest admin actions. |
| **Nieuws** | Write, edit, schedule (a publish date in the future), unpublish and delete news. Shown on the homepage and at /nieuws. |
| **Leden** | Search members; block (with a reason: they're logged out at once and can't log in), unblock, set a temporary password, delete (you type the username to confirm, and everything they posted goes too). |
| **Dummy-accounts** | Create accounts to liven up the site, and "Inloggen als" to post as them (you're logged out as admin). |
| **Uploads** | Every photo, video, profile photo, kudde image and background, newest first, with who uploaded it. Delete with one click. |
| **Inhoud** | Search and remove WieWatWaars, knuffels, reactions, video reactions, forum posts, forum profile discussion, kuddes and events. |
| **Meldingen** | Suggestions and "Probleem melden" reports: mark as handled or delete. |
| **Video-rechten** | Requests from members who want to upload videos: approve or reject, with a note. They get a message either way (see step 11). |
| **Forum** | Topics: sticky/unsticky, close/open, delete. |
| **Logboek** | Everything done by an admin (and by `npm run admin`), with time and details. |

---

## 8. Backups

The backup script dumps the database and packs `uploads/` into `/var/backups/kuddes`, readable only by root, and keeps 14 days. Turn on the nightly run (04:00):

```bash
sudo cp /opt/kuddes/deploy/kuddes-backup.service /opt/kuddes/deploy/kuddes-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kuddes-backup.timer
sudo systemctl start kuddes-backup.service     # one right now, to test
ls -lh /var/backups/kuddes
```

**Keep a copy somewhere other than the VPS.** If the server is gone, so are backups that only live on it. The simplest option is to pull them to your PC now and then. **On your PC**:

```bash
rsync -az --rsync-path="sudo rsync" <you>@<server-ip>:/var/backups/kuddes/ ~/kuddes-backups/
```

(Or rsync them to Strato HiDrive or another storage box from a timer on the server.)

**Restoring** (example):

```bash
cd /opt/kuddes
sudo systemctl stop kuddes
sudo docker compose exec -T db psql -U kuddes -d postgres -c 'DROP DATABASE kuddes' -c 'CREATE DATABASE kuddes OWNER kuddes'
gunzip -c /var/backups/kuddes/db-<date>.sql.gz | sudo docker compose exec -T db psql -q -U kuddes -d kuddes
sudo tar -xzf /var/backups/kuddes/uploads-<date>.tar.gz -C /opt/kuddes && sudo chown -R kuddes:kuddes /opt/kuddes/uploads
sudo systemctl start kuddes
```

---

## 9. Updating

**On your PC:** commit and `git push`. If you changed `web/`, rsync it again as in 5.3. **On the server:**

```bash
sudo bash /opt/kuddes/deploy/update.sh
```

That runs git pull, `npm ci`, the build and migrations, restarts the app and checks `/api/health`. Take a backup first when there are database changes (`sudo systemctl start kuddes-backup.service`).

Updating the server software:

- Ubuntu security updates install by themselves. Now and then run `sudo apt update && sudo apt full-upgrade` and reboot if asked (`/var/run/reboot-required`).
- Node, Caddy and Docker also update through `apt`.
- Postgres: `sudo docker compose pull && sudo docker compose up -d` stays on version 17. A major upgrade (e.g. to 18) needs a dump and restore; don't just change the image.

---

## 10. Games (peer to peer) and an optional TURN server

The players' browsers connect to each other directly over WebRTC. The server only passes the setup messages along and checks the result afterwards. To find a direct route, the browsers use public STUN servers (Google and Cloudflare); nothing needs to be installed for that. When a direct connection isn't possible (some mobile and company networks), the game goes through Kuddes itself. That always works, just a little slower; the page then says "Verbonden via Kuddes".

If you want a proper relay for those players too, you can run your own TURN server (coturn) on the VPS. This is optional:

```bash
sudo apt install -y coturn
openssl rand -hex 32                                  # the TURN secret
sudo nano /etc/turnserver.conf
```

Put this in it, with your secret:

```
listening-port=3478
realm=kuddes.example
use-auth-secret
static-auth-secret=PUT_THE_SECRET_HERE
no-cli
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
```

Then:

```bash
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn
sudo systemctl enable --now coturn
sudo ufw allow 3478
sudo ufw allow 49152:65535/udp
```

Add these two lines to `/opt/kuddes/.env` and run `sudo systemctl restart kuddes`:

```
TURN_URLS=turn:kuddes.example:3478
TURN_SECRET=PUT_THE_SECRET_HERE
```

The app hands out TURN passwords that are valid for only 6 hours, so the secret never reaches a browser.

---

## 11. Video upload rights

New members can watch videos, but they can't upload until you allow it. They ask on the upload page: they tick why they want to upload, can add a note, and agree to the video rules. You get the request as a personal message with a link. You answer under **Beheer → Video-rechten**, and the member gets a message either way. Under **Beheer → Leden** you can also switch it on or off per member ("Video: ja/nee"). You yourself (the admin) can always upload.

Uploads are at most 100 MB. They're compressed to H.265 (HEVC) at 720p at most and 30 fps. Safari, Edge and Chrome play that on most computers and phones, and so does Firefox on Windows and Mac. Firefox and Chrome on Linux often can't; the player then says so.

---

## 12. New members and e-mail

### 12.0 How new members get in

Under **Beheer → Aanmeldingen → Aanmelden** you choose, and can switch at any time:

- **Bevestigen per e-mail** (the normal way, needs mail from step 12.1–12.4): after signing up, members get a mail with a link. Clicking it lets them in, and they get a welcome message.
- **Goedkeuren door jou** (the waitlist, no mail needed): the sign-up form also asks why they want to join, you get a personal message ("Nieuwe aanmelding: …") for each one (replying goes to them), and you click **Goedkeuren** or **Weigeren** (the account is deleted).

Until someone is in, they see Kuddes as a visitor does. Waiting for the confirmation mail, that's all: they can only ask for a new mail, fix their address, log out or delete the account. On the waitlist they can also fill in their own profile meanwhile (profile photo, background, design, layout and gadgets). A banner tells them what to do (including to look in their spam). They don't show up in Nieuwste leden, search or the sitemap yet.

Signing up requires ticking that they agree to the privacy statement (`/privacy`) and are 16 or older or have a parent's permission; the date and version they agreed to are kept with the account (`users.privacy_accepted_at`, `privacy_version`) and are in their data download. The statement names **privacy@kuddes.example** as the contact (`shared/privacy.ts`): set up that address (a forward at Strato is enough) or change it there.

In both modes the list under Aanmeldingen lets you **Goedkeuren** someone by hand, for when a confirmation mail never arrives. In mail mode there's also **Mail opnieuw**. **Beheer → Leden** has the "Wacht op goedkeuring" filter, and **Goedkeuring intrekken** puts a member back without deleting anything. The same box shows whether mail is set up and has a **Stuur een testmail** button.

Until you first choose, it starts on mail when `SMTP_HOST` is set and on the waitlist when it isn't. An old `SIGNUP_APPROVAL=1` or `0` in `.env` only sets that starting point.

Without mail, "wachtwoord vergeten" tells members to ask you: **Beheer → Leden → Wachtwoord** makes a new one to pass on.

### 12.0b Mail

With a mail service set up, Kuddes mails: the **confirmation link** for new members, **wachtwoord vergeten** (a link valid for 1 hour), **confirming a new address** (the old address then gets a heads-up with a link to take the account back) and a **"you're approved"** mail. The mails have the Kuddes look (blue bar with the logo, a Farm-Fresh icon, one big button, the link spelled out underneath) and a plain-text version. The pictures are loaded from `PUBLIC_URL`.

`noreply@kuddes.example` doesn't need a mailbox. You let a mail service send on behalf of `kuddes.example`, and prove to the world that it's allowed to, with three DNS records at Strato. Sending straight from your own server would land in spam.

### 12.1 Pick a mail service

Any service with SMTP works. Two good choices, both in the EU:

- **Brevo** (brevo.com, France): free for 300 mails a day. Easiest.
- **Scaleway Transactional Email** (scaleway.com, France): a few cents per thousand mails.

(A Strato mailbox works too, via `smtp.strato.de` port 465 with that mailbox's login, but Strato limits how much you can send, and mail from it is more likely to end up in spam.)

The steps below are for Brevo; others work the same way.

1. Make an account, then go to **Senders, Domains & Dedicated IPs → Domains → Add a domain** and enter `kuddes.example`.
2. Brevo shows the DNS records to add (next step). Once they're in, click **Verify**.
3. Under **Senders**, add `noreply@kuddes.example` with the name `Kuddes`.
4. Under **SMTP & API → SMTP**, click **Generate a new SMTP key**. You get a server (`smtp-relay.brevo.com`), a port (587), a login and the key (that's the password).
5. Optional but better: under **Transactional → Settings**, turn off **open and click tracking**. Otherwise Brevo rewrites the links in the mails through its own tracking address (they still work, but the confirmation and reset links then pass through Brevo first).

### 12.2 DNS records at Strato

In Strato's DNS settings for `kuddes.example`, add what the mail service gives you. Usually:

| Type | Name | Value | What it does |
|---|---|---|---|
| TXT | `@` | the service's verification code (e.g. `brevo-code:…`) | proves the domain is yours |
| TXT | `@` | `v=spf1 include:spf.brevo.com ~all` | SPF: this service may send for kuddes.example |
| TXT (or CNAME) | e.g. `brevo._domainkey` | the long DKIM value from the service | DKIM: mails are signed |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:postmaster@kuddes.example` | DMARC: what receivers do with fakes, and where reports go |

There can only be **one** SPF record. If Strato already has one (for a Strato mailbox), add the `include:` to it instead of making a second: `v=spf1 include:spf.brevo.com include:_spf.strato.com ~all`. Start DMARC with `p=none` if you like, and switch to `p=quarantine` after a week of good reports.

Check with `dig +short TXT kuddes.example` and `dig +short TXT _dmarc.kuddes.example`, then click Verify at the service.

### 12.3 Settings

Add to `/opt/kuddes/.env`:

```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=the SMTP login
SMTP_PASS=the SMTP key
MAIL_FROM="Kuddes <noreply@kuddes.example>"
```

`PUBLIC_URL=https://kuddes.example` must be set too: the links in mails use it. Restart with `sudo systemctl restart kuddes`.

### 12.4 Test it

In **Beheer → Aanmeldingen**, click **Stuur een testmail**: it goes to your own address, and an error from Brevo (a wrong key, an unverified sender) is shown right there. Or log out, choose **Inloggen → Wachtwoord vergeten?** and fill in your own address. The mail should arrive within a minute, from "Kuddes &lt;noreply@kuddes.example&gt;". In Gmail, **⋮ → Show original** should say `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`. If nothing arrives, check `journalctl -u kuddes -n 50` for `[mail]` lines.

Without `SMTP_HOST` (on your own PC) mails aren't sent: they're printed in the server's output, links and all, so you can click them there.

Accounts that already existed when this was added count as confirmed. If a member's mail never arrives, they can fix their address under Instellingen → E-mailadres, or ask for a new link from the banner at the top of every page.

### 12.5 Optional: a captcha against spam accounts (Cloudflare Turnstile)

With the waitlist, bots can't post anything, but they can still fill your Aanmeldingen with fake accounts. Cloudflare Turnstile stops most of them. It's free, kuddes.example doesn't have to use Cloudflare for anything else, and most people never see a puzzle: they get a tick after a second.

1. Log in (or sign up for free) at **https://dash.cloudflare.com** and open **Turnstile** in the menu on the left.
2. **Add widget**: name it `Kuddes`, add the hostname `kuddes.example`, choose **Managed**, and click **Create**.
3. You get a **Site Key** and a **Secret Key**. Add them to `/opt/kuddes/.env`:
   ```
   TURNSTILE_SITE_KEY=0x4AAAA...
   TURNSTILE_SECRET_KEY=0x4AAAA...
   ```
4. `sudo systemctl restart kuddes`.

The check shows under the sign-up form, and the server asks Cloudflare about every sign-up before creating the account. The privacy statement mentions Cloudflare automatically while it's on. To switch it off again, remove the two lines and restart. Without the keys (like on your own PC), sign-up works without a captcha.

To test it: open https://kuddes.example/aanmelden in a private window; you should see the Cloudflare box with a tick. If it says it can't load, check that both keys are copied in full and that `kuddes.example` is listed as a hostname for the widget.

---

## 13. Search engines and link previews

The work is done by the app itself:

- **Meta tags:** every public page gets its own title, description, canonical URL and structured data (schema.org) from the server, so Google and the preview bots see them without JavaScript.
- **Share cards:** sharing a profile, Kudde, video, forum topic, news item or event in WhatsApp, Facebook, X, Discord, Slack and similar apps shows a 1200×630 card with the photo and details (`/og/…`).
- **Sitemap:** `/sitemap.xml` lists the public pages.
- **Staying hidden:** members who switch off *Instellingen → Privacy → Vindbaar in zoekmachines* are left out of search engines (a shared link still shows the card). Friends-only videos, closed Kuddes' events and blocked members never get a card.
- **Kept out of search:** member photos stay out of image search, and API answers aren't indexed.
- **`/robots.txt`:**
  - search engines are allowed on public pages and kept out of private ones;
  - AI search and AI crawlers, also for training (GPTBot, ClaudeBot, Google-Extended, CCBot and others), are welcome on public pages, so the site can show up in Google's AI Overviews and AI answers;
  - SEO and marketing scrapers (Ahrefs, Semrush and others) are told no, and the ones that identify themselves get a 403 from the server as well.
- **Text and data mining:** `/.well-known/tdmrep.json` says it's allowed (`tdm-reservation: 0`), and pages allow full snippets and previews (`max-snippet:-1`).
- **Rate limits:** there's a per-visitor limit (600 API requests and 300 pages per minute) against bulk scraping.

What you do once the site is live:

1. **Google Search Console** (search.google.com/search-console): add the *domain* property `kuddes.example`. Verify it with the TXT record Google gives you, which you add under the DNS settings at Strato. Then submit `https://kuddes.example/sitemap.xml`.
2. **Bing Webmaster Tools** (bing.com/webmasters): import the site from Search Console. This covers Bing, DuckDuckGo and Ecosia.
3. **Test the cards:**
   - Facebook: developers.facebook.com/tools/debug. "Scrape Again" refreshes a preview that was cached earlier.
   - Other apps: opengraph.xyz.
   - Structured data: search.google.com/test/rich-results.

To refuse a crawler after all, add its name to `BLOCKED_BOTS` in `server/lib/seo.ts`. Scrapers that pretend to be a browser can't be stopped by robots.txt. The rate limits make bulk copying slow, and Caddy's log shows who's doing it.

---

## 14. Kuddes as an app

On a phone, members can put Kuddes on their home screen: Chrome/Android offers "Installeren" (or use the menu → "Kuddes op je beginscherm zetten"), and on iPhone it's Share → "Zet op beginscherm". This only works over HTTPS, which Caddy already provides. There's nothing to set up; after `update.sh` members get the new version by themselves, because the service worker doesn't cache pages or the API.

---

## 15. Checking on it

| What | Command |
|---|---|
| App status | `systemctl status kuddes` |
| App log (errors, video conversion) | `sudo journalctl -u kuddes -f` |
| Visitors (Caddy access log) | `sudo tail -f /var/log/caddy/kuddes.log` |
| Caddy / certificate | `sudo journalctl -u caddy -n 100` |
| Database | `sudo docker compose -f /opt/kuddes/docker-compose.yml ps` |
| Health | `curl https://kuddes.example/api/health` |
| Disk space (videos!) | `df -h /` and `sudo du -sh /opt/kuddes/uploads /var/backups/kuddes` |
| Banned IPs (SSH) | `sudo fail2ban-client status sshd` |

For the health URL you can use a free uptime monitor (UptimeRobot, Better Stack, …), so you get an e-mail when the site is down.

---

## 16. Troubleshooting

| Problem | Likely cause |
|---|---|
| **502 Bad Gateway** | The app isn't running: `sudo journalctl -u kuddes -n 50`. Often the database password in `.env` doesn't match, or Postgres isn't up (`sudo docker compose up -d` in /opt/kuddes). |
| **No HTTPS / certificate error** | DNS doesn't point at the server yet, or port 80/443 is closed (ufw or the Strato panel). |
| **Everyone hits the rate limit at once** | `TRUST_PROXY=1` is missing from `.env`, so every visitor looks like 127.0.0.1. |
| **Videos stay on "bezig"** | ffmpeg is missing (`ffmpeg -version`; `ffmpeg -encoders \| grep libx265` must show libx265), or the server ran out of memory (add swap; see 3.4). H.265 is slow on a small server: a 10-minute video can take 20–40 minutes, and videos are done one at a time. |
| **Upload fails with 413** | Bigger than allowed: 12 MB for photos and backgrounds, 100 MB for videos (see the Caddyfile). |
| **Can't log in after moving** | The login cookie is `Secure`, so it only works over https://. Clear your cookies for kuddes.example and log in again. |
| **Share cards show squares instead of letters** | No fonts on the server: `sudo apt install fontconfig fonts-dejavu-core`, then `sudo systemctl restart kuddes`. |
| **Link preview doesn't change** | The app you shared in cached the old one. Use Facebook's Sharing Debugger ("Scrape Again"). New posts get the new card. |
| **A game stays on "Verbinden…"** | After 8 seconds it carries on through Kuddes by itself. If it never connects at all, the room connection (Server-Sent Events) is blocked: check that the Caddyfile still has `flush_interval -1`. |
| **Someone can't upload videos** | New members have to ask first. Approve them under Beheer → Video-rechten, or use "Video: nee/ja" under Beheer → Leden. |
| **BuddyPoke is empty** | `/opt/kuddes/web` is missing or not readable by `kuddes` (see 5.3). |
| **Bejeweled stays black or says Error** | `/opt/kuddes/games/bejeweled/web/assets` is missing (see 5.3). |
| **Build killed / "JavaScript heap out of memory"** | Too little RAM: add swap (3.4). |

---

## 17. Security checklist

- [ ] SSH only with keys; root login and passwords off (3.2).
- [ ] ufw on with only 22, 80 and 443 open; fail2ban running (3.3).
- [ ] Automatic security updates on (3.3).
- [ ] `.env` has `chmod 600`, a long random database password, `NODE_ENV=production`, `TRUST_PROXY=1`, `PUBLIC_URL=https://kuddes.example`.
- [ ] `sudo ss -tlnp` shows `127.0.0.1:8787` and `127.0.0.1:5433` only, and `*:80` / `*:443` for Caddy.
- [ ] `npm run admin -- list` shows only you.
- [ ] The test accounts from your local data are removed (Beheer → Leden).
- [ ] Nightly backups run (`systemctl list-timers kuddes-backup.timer`), and a copy is kept off the VPS.
- [ ] https://kuddes.example gets an A on https://securityheaders.com.

What the app already does itself:

- Passwords are hashed.
- Session cookies are httpOnly, Secure and SameSite.
- There's CSRF protection and rate limits on sign-up, login, posting and uploads.
- Every input is checked.
- Images are re-encoded (EXIF and location data removed), and videos are converted by ffmpeg.
- A strict Content-Security-Policy is sent, with HSTS.
- Only public images are served from `/uploads`: never the originals or unfinished video uploads.
- API bodies are capped at 1 MB.
- Blocked members are logged out at once.
