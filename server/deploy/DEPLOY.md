# WeatherAlert server — deployment runbook

Target: one Proxmox VM (Ubuntu 24.04 LTS) running Docker, plus a small rented
VPS acting as the public front door.

**No inbound port is ever opened on your home router.** Both the API traffic
and the deploy pipeline reach the rack over connections the rack itself dials
out. That constraint is what shapes everything below.

---

## 1. How it fits together

```
  ┌─────────┐   HTTPS   ┌──────────────┐            ┌──────────────────────────┐
  │  Phone  │ ────────► │     VPS      │            │   Proxmox app VM (rack)  │
  └─────────┘   :443    │              │            │                          │
                        │   frps       │◄───────────┤  frpc   (dials OUT)      │
                        │  (raw TCP,   │   tunnel   │    │                     │
                        │   no certs)  │  :7000     │    ▼                     │
                        └──────────────┘            │  caddy  (TLS terminates  │
                                                    │    │     HERE — holds    │
                                                    │    │     the only key)   │
                                                    │    ▼                     │
                                                    │  app    :3000            │
                                                    │    │                     │
                                                    │    ▼                     │
                                                    │  db     Postgres 16      │
                                                    └──────────────────────────┘
```

The VPS relays **raw TCP**. It holds no certificate and no credentials, and it
cannot read anything passing through it — if it is compromised, the attacker
gets a relay, not your users' locations. TLS terminates on the rack. Do not
"simplify" this by moving certificates to the VPS.

| Piece | Where | Why it exists |
|---|---|---|
| `frps` | VPS | Public :443. Relays bytes down the tunnel. |
| `frpc` | rack | Dials out to the VPS. Removes the need for a port forward. |
| `caddy` | rack | Terminates TLS, gets/renews Let's Encrypt certs. |
| `app` | rack | Fastify API + node-cron alert engine. |
| `db` | rack | Postgres 16, reachable only on the compose network. |

### VM sizing

| VM | vCPU | RAM | Disk |
|---|---|---|---|
| app (Proxmox) | 2 | 4 GB | 32 GB system + **separate 64 GB data disk** |
| VPS | 1 | 1 GB | whatever the cheapest plan gives |

The second virtual disk holds Postgres data and backups, so the database can be
snapshotted in Proxmox independently of the OS disk and survives a rebuild of
the VM. Mount it at `/srv/weatheralert` and set `DATA_DIR` to match.

4 GB is comfortable rather than required — CI builds the image, so the VM never
runs `npm ci` or `tsc`. 2 GB would work; the headroom is for the self-hosted
weather service you may add later.

### Before you start

- A **domain** (~$12/yr). Not optional — the mobile app hardcodes this hostname
  and you cannot change an IP after shipping a build without breaking every
  installed copy.
- A **VPS** with a static public IP (~€4/mo Hetzner, ~$5 Vultr/DO).
- The **Firebase service-account JSON** (see `../../ACCOUNTS.md`).

Replace throughout: `api.example.com`, `<VPS_IP>`, and every blank in `.env`.

---

## 2. DNS

One record. No dynamic DNS needed — the VPS IP is static.

```
A    api.example.com    <VPS_IP>
```

Wait for it to resolve before step 4, or Caddy's first certificate request will
fail:

```bash
dig +short api.example.com     # → <VPS_IP>
```

---

## 3. The VPS

```bash
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# Firewall: only 443 (public) and 7000 (the rack's tunnel).
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp
sudo ufw allow 7000/tcp
sudo ufw enable
```

If your home IP is static, tighten 7000 to just it — nobody else ever needs it:

```bash
sudo ufw delete allow 7000/tcp
sudo ufw allow from <YOUR_HOME_IP> to any port 7000 proto tcp
```

Copy the VPS config over from your workstation and start it:

```bash
scp -r server/deploy/vps youruser@<VPS_IP>:~/weatheralert-frps
ssh youruser@<VPS_IP>
cd ~/weatheralert-frps
cp .env.example .env && chmod 600 .env
# Fill in FRP_VERSION (from github.com/fatedier/frp/releases) and generate
# the shared secret — you need this same value on the rack:
openssl rand -hex 32
nano .env
docker compose up -d
docker compose logs -f frps      # should show it listening on 7000
```

---

## 4. The app VM

```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# Outbound only — nothing here accepts connections from the internet.
sudo ufw allow OpenSSH
sudo ufw enable

# Data disk for Postgres (adjust the device to match your Proxmox disk).
sudo mkfs.ext4 /dev/sdb
sudo mkdir -p /srv/weatheralert
echo '/dev/sdb /srv/weatheralert ext4 defaults 0 2' | sudo tee -a /etc/fstab
sudo mount -a

sudo mkdir -p /opt/weatheralert && sudo chown "$USER:$USER" /opt/weatheralert
git clone <REPO_URL> /opt/weatheralert
```

Configuration — **one file** holds everything:

```bash
cd /opt/weatheralert/server/deploy
cp .env.example .env && chmod 600 .env
nano .env        # every blank must be filled; see the comments in the file
```

The Firebase credentials go next to the server directory, where compose mounts
them read-only into the container:

```bash
cp ~/firebase-service-account.json /opt/weatheralert/server/
```

> `DATABASE_URL` and `GOOGLE_APPLICATION_CREDENTIALS` are **not** yours to set —
> compose derives them, because they must be container paths (`db`, not
> `localhost`). Setting them in `.env` has no effect.

---

## 5. First deploy

The image lives in a private GitHub Container Registry package, so log in once
with a personal access token that has `read:packages`
(github.com → Settings → Developer settings → Tokens):

```bash
echo <YOUR_PAT> | docker login ghcr.io -u <your-github-username> --password-stdin
```

Then:

```bash
cd /opt/weatheralert/server/deploy
bash deploy.sh          # the same script CI runs
```

That pulls the image, applies migrations, starts all four containers, and
health-checks the result. Verify:

```bash
docker compose -f docker-compose.prod.yml ps        # all Up / healthy
curl -sS http://127.0.0.1:3000/health               # {"status":"ok"}
curl -sS https://api.example.com/health             # from anywhere — the real test
```

The last one exercises the whole path: DNS → VPS → tunnel → Caddy → app. Caddy
issues the certificate on the first HTTPS request, so give it a few seconds.

Then check the public legal pages, which Caddy serves itself (they don't touch
the app) with `OPERATOR_NAME` and `SUPPORT_EMAIL` filled in from `.env`:

```bash
curl -sS https://api.example.com/legal/privacy | grep -i mailto   # your SUPPORT_EMAIL
```

These three URLs — `/legal/privacy`, `/legal/terms`, `/legal/delete-account`
— are what the Play Console listing, the Data safety form and the in-app
paywall link to. They must stay up and stable once the app ships.

Finally, point the client at it — `client/.env`:

```
EXPO_PUBLIC_API_URL=https://api.example.com
```

---

## 6. Updates

Once CI/CD is on (§7), **you don't do this** — push to `main` and it ships.

Manually, if you ever need to:

```bash
cd /opt/weatheralert/server/deploy
git -C /opt/weatheralert pull --ff-only
bash deploy.sh
```

**Rollback.** Every image is tagged with its commit SHA, so going back is
pinning an older tag — no rebuild:

```bash
cd /opt/weatheralert/server/deploy
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=<older-sha>|' .env
docker compose -f docker-compose.prod.yml up -d app
```

`deploy.sh` does this automatically if a deploy fails its health check.

**Migrations are forward-only** and are *not* rolled back by any of the above.
Take a Proxmox snapshot before any migration that isn't purely additive.

---

## 7. CI/CD

### What this is, in one paragraph

"CI" runs your tests automatically whenever you push. "CD" ships the result if
they pass. Together: you `git push`, GitHub runs the test suite on its own
machines, builds a Docker image, and your rack pulls and restarts — with no
manual step and no way to ship a red build.

### Why a self-hosted runner

GitHub runs tests on its own cloud machines. But to *deploy*, something has to
run commands on **your** VM, and GitHub can't reach into your network — that's
the whole premise of this setup. So you install a small GitHub program (the
*runner*) on the app VM. It connects **outbound** to GitHub and waits for work.
When the `deploy` job fires, GitHub hands it to that runner, which is already
inside your network. Same trick as the frp tunnel: nothing dials in.

### The four jobs

`.github/workflows/ci.yml`:

| Job | Runs on | When | Does |
|---|---|---|---|
| `server` | GitHub cloud | every push + PR | Postgres service container, migrations, drift check, typecheck, tests |
| `client` | GitHub cloud | every push + PR | typecheck, lint, jest |
| `image` | GitHub cloud | push to `main`, after `server` passes | builds the Docker image, pushes to GHCR tagged with the commit SHA |
| `deploy` | **your app VM** | after `image` succeeds | pulls that exact tag, migrates, restarts, health-checks |

A red test suite or a PR never reaches `deploy`. Note `client` is **not** a
gate — a failing client check won't block a server deploy.

### Install the runner (one time, on the app VM)

Run it as the **same user** that owns `/opt/weatheralert` — not root.

1. GitHub: **repo → Settings → Actions → Runners → New self-hosted runner →
   Linux / x64.** That page shows a download block and a `./config.sh` line
   with a one-time token baked in. Use *those* exact lines — the token rotates.

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner.tar.gz -L <URL_FROM_GITHUB>
   tar xzf actions-runner.tar.gz
   ./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN_FROM_GITHUB>
   # Accept the defaults; the "self-hosted" label is what ci.yml targets.
   ```

2. Install as a service so it survives reboots and logout:

   ```bash
   sudo ./svc.sh install "$USER"
   sudo ./svc.sh start
   sudo ./svc.sh status        # "active (running)"
   ```

3. Confirm it shows as **Idle** under Settings → Actions → Runners.

The runner user must be in the `docker` group — the deploy job runs `docker
compose`. You did this in §4; verify with `docker ps` as that user.

### Turn the pipeline on

`image` and `deploy` stay dormant until a repo variable says otherwise, so they
don't sit queued before the runner exists.

**repo → Settings → Secrets and variables → Actions → Variables → New
repository variable**, name `DEPLOY_ENABLED`, value `true`.

Set it back to `false` to pause automated deploys.

### Order of operations

1. §3–5 above — VPS, VM, first deploy by hand.
2. Install the runner.
3. Set `DEPLOY_ENABLED=true`.
4. Merge to `main`. It deploys itself from here on.

### Security notes

- A self-hosted runner executes whatever a workflow says. **Keep the repo
  private** and be careful merging untrusted PRs — a PR that edits `ci.yml`
  would run on your rack.
- No inbound firewall rule, no SSH key in GitHub, no registry password stored
  on the VM (the deploy job logs in with an ephemeral token and logs out after).
- If a runner service step fails with "command not found", the service has a
  leaner PATH than your shell. Add what's missing to `~/actions-runner/.env`,
  then `sudo ./svc.sh stop && sudo ./svc.sh start`.

---

## 8. Backups

Postgres runs in a container, but its data is a plain directory on the data
disk, so this is ordinary `pg_dump`. On the app VM:

```cron
# /etc/cron.d/weatheralert-pgdump
0 */6 * * * root docker exec weatheralert-db-1 pg_dump -U weather -Fc weather_app | gzip > /srv/weatheralert/backups/weather_app_$(date +\%Y\%m\%dT\%H\%M).sql.gz

# Retention — without this the backups grow without bound.
30 4 * * * root find /srv/weatheralert/backups -name 'weather_app_*.sql.gz' -mtime +14 -delete
```

```bash
sudo mkdir -p /srv/weatheralert/backups
```

Ship that directory off-box on its own schedule (rsync to a NAS share, or point
Proxmox Backup Server at the VM).

Restore:

```bash
gunzip -c /srv/weatheralert/backups/<file>.sql.gz \
  | docker exec -i weatheralert-db-1 pg_restore -U weather -d weather_app --clean
```

---

## 9. Operations

```bash
cd /opt/weatheralert/server/deploy
alias dc='docker compose -f docker-compose.prod.yml'

dc ps                       # what's up, and health status
dc logs -f app              # API + alert engine
dc logs -f caddy            # TLS / certificate issues
dc logs -f frpc             # tunnel health
dc exec db psql -U weather weather_app -c 'select 1'
```

- **Alert engine heartbeat**: `dc logs app | grep alert-engine` — a tick every
  two minutes. Silent means check `ALERT_ENGINE_CRON` and DB reachability.
- **Log rotation** is Docker's job, not pm2-logrotate's. If logs grow, set
  `log-driver`/`log-opts` in `/etc/docker/daemon.json`.

### Troubleshooting

| Symptom | Look at |
|---|---|
| `https://api.example.com` times out | `dc logs frpc` and, on the VPS, `docker compose logs frps`. Is the tunnel connected? |
| TLS error / cert never issued | `dc logs caddy`. Does DNS resolve to the VPS? Is VPS :443 open? Certs need TLS-ALPN-01 to reach Caddy. |
| Every user shares one rate-limit bucket | PROXY protocol mismatch. `frpc.toml`'s `proxyProtocolVersion` and the Caddyfile's `proxy_protocol` wrapper must both be present. |
| `deploy.sh` fails on pull | GHCR login expired on the VM, or the package is private and the token lacks `read:packages`. |
| App restarts in a loop | `dc logs app` — usually a missing `.env` value; `config.ts` throws on required vars. |

---

## 10. The old PM2 path

`ecosystem.config.cjs` and `nginx/` are kept as a fallback for running the
server natively without Docker. They are no longer what CI ships, and the
Nginx config assumes an inbound port forward, which this setup does not use.
