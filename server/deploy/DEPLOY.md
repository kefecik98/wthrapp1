# WeatherAlert server — deployment runbook

Target: Proxmox host, two Ubuntu 24.04 LTS VMs.

| VM       | Purpose                       | Notes                          |
|----------|-------------------------------|--------------------------------|
| `app`    | Node + PM2 + Nginx + Certbot  | 2 vCPU / 4 GB RAM / 32 GB disk |
| `db`     | Postgres 16                   | 2 vCPU / 4 GB RAM / 64 GB disk |

Both VMs sit on the same Proxmox internal bridge (`vmbr0` or a dedicated
vNIC). Only the `app` VM is reachable from the public internet; `db`
listens only on its private IP.

Replace placeholders before running anything: `api.example.com`,
`10.0.0.20` (db private IP), `<DB_PASSWORD>`.

---

## 1. Postgres VM

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql <<SQL
  CREATE USER weather WITH PASSWORD '<DB_PASSWORD>';
  CREATE DATABASE weather_app OWNER weather;
SQL
```

Bind Postgres to the private interface only:

```bash
# /etc/postgresql/16/main/postgresql.conf
listen_addresses = 'localhost,10.0.0.20'

# /etc/postgresql/16/main/pg_hba.conf — append:
host    weather_app    weather    10.0.0.0/24    scram-sha-256
```

```bash
sudo systemctl restart postgresql
sudo ufw allow from 10.0.0.0/24 to any port 5432
```

Backups (cron on the db VM):

```cron
# /etc/cron.d/weatheralert-pgdump
0 */6 * * * postgres pg_dump -Fc weather_app | gzip > /var/backups/weather_app_$(date +\%Y\%m\%dT\%H\%M).sql.gz
```

Ship `/var/backups/` to off-box storage on its own schedule (rsync to a
Proxmox NAS share, or Proxmox Backup Server on the VM itself).

---

## 2. App VM — one-time bootstrap

Node 22, Nginx, Certbot, PM2:

```bash
sudo apt update && sudo apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
sudo apt install -y certbot python3-certbot-nginx
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Project layout:

```bash
sudo mkdir -p /opt/weatheralert /var/log/weatheralert
sudo chown $USER:$USER /opt/weatheralert /var/log/weatheralert
git clone <REPO_URL> /opt/weatheralert
```

Server `.env` (do not commit):

```bash
cp /opt/weatheralert/server/.env.example /opt/weatheralert/server/.env
# Edit with real secrets. DATABASE_URL points at the db VM:
#   DATABASE_URL=postgresql://weather:<DB_PASSWORD>@10.0.0.20:5432/weather_app
# Drop the Firebase service-account JSON next to the project and point
# GOOGLE_APPLICATION_CREDENTIALS at its absolute path.
#
# Production must also set:
#   NODE_ENV=production
#   TRUST_PROXY=true      # Nginx sets X-Forwarded-For; without this every
#                         # rate-limit bucket keys on the proxy's own IP.
#   ENABLE_DEV_ROUTES     # leave unset/false — never true in production.
```

---

## 3. App VM — first deploy

```bash
cd /opt/weatheralert/server
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup        # run the command pm2 prints (enables boot start)
pm2 install pm2-logrotate
```

Quick health check:

```bash
curl -sS http://127.0.0.1:3000/health
# → {"status":"ok"}
```

---

## 4. Nginx + TLS

```bash
sudo cp /opt/weatheralert/server/deploy/nginx/weatheralert.conf \
        /etc/nginx/sites-available/weatheralert
sudo sed -i 's/api\.example\.com/api.your-domain/g' \
        /etc/nginx/sites-available/weatheralert
sudo ln -s /etc/nginx/sites-available/weatheralert \
           /etc/nginx/sites-enabled/weatheralert
sudo nginx -t && sudo systemctl reload nginx
```

Point DNS (or DDNS) at the rack's public IP and forward 443 → app VM on
your router. Then:

```bash
sudo certbot --nginx -d api.your-domain
```

Certbot edits the site to inject `ssl_certificate` lines and installs a
renewal timer. Verify:

```bash
curl -sS https://api.your-domain/health
sudo systemctl list-timers | grep certbot
```

---

## 5. Updates (recurring) — automated via CI/CD

Once the self-hosted runner is set up (§8), **deploys are automatic**: push
to `main`, the server tests run on GitHub's cloud, and if they pass the
`deploy` job runs on the rack and ships the change. You don't SSH in for a
normal release.

What the pipeline does on the VM is exactly the manual sequence below,
wrapped in `server/deploy/deploy.sh` (sync to `origin/main` → `npm ci` →
`prisma migrate deploy` → `npm run build` → `pm2 startOrReload` → health
check). See `.github/workflows/ci.yml`, the `deploy` job.

Manual deploy (fallback — first release, or deploying without CI):

```bash
cd /opt/weatheralert/server
bash deploy/deploy.sh          # same script the pipeline runs
```

Or the individual steps:

```bash
cd /opt/weatheralert
git pull --ff-only
cd server
npm ci
npx prisma migrate deploy
npm run build
pm2 reload weatheralert-api
```

`pm2 reload` triggers SIGTERM, which `src/index.ts` handles by stopping
the cron, closing Fastify, and disconnecting Prisma before exiting.

Take a Proxmox snapshot of the app VM **before** any migration that's not
purely additive — easy rollback if the deploy goes sideways. `deploy.sh`
runs `prisma migrate deploy`, which is forward-only, but a bad migration is
still easiest to undo from a snapshot.

---

## 6. Operational checks

- Logs: `pm2 logs weatheralert-api` (live), `/var/log/weatheralert/*.log`
  (persisted, rotated by `pm2-logrotate`).
- Status: `pm2 status` and `pm2 monit`.
- Nginx access/error: `/var/log/nginx/`.
- DB connectivity from app VM: `psql "$DATABASE_URL" -c 'select 1'`.
- Alert engine heartbeat: grep `pm2 logs` for the cron tick (every two
  minutes); silent → check `ALERT_ENGINE_CRON` + Postgres reachability.

---

## 7. Optional: containerized path

The `server/Dockerfile` produces a runnable image if you'd rather run
under Docker on the app VM than under PM2.

```bash
# Build on the app VM (or push from CI).
docker build -t weatheralert-api:latest .

# Run, mounting .env and the Firebase service account.
docker run -d \
  --name weatheralert-api \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /opt/weatheralert/server/.env \
  -v /opt/weatheralert/server/firebase-service-account.json:/app/firebase-service-account.json:ro \
  weatheralert-api:latest

# Migrations are not run on container start; do them out-of-band:
docker run --rm --env-file /opt/weatheralert/server/.env \
  weatheralert-api:latest npx prisma migrate deploy
```

The Nginx config is unchanged — it still proxies to `127.0.0.1:3000`. PM2
is not needed in this mode.

The container path is a fallback; PM2 is the canonical deploy for this
project (see spec §7).

---

## 8. CI/CD — self-hosted GitHub Actions runner

This is what makes `git push` to `main` deploy automatically. Read this once;
it's the only new piece beyond the manual runbook above.

### Why a self-hosted runner

GitHub runs your **tests** on its own cloud machines. To **deploy**, something
has to run commands on *this* VM. Our home rack sits behind a router that
blocks incoming connections (and may be behind CGNAT with no public address),
so we don't let GitHub connect *in*. Instead we install a small GitHub program
— the *runner* — on the app VM. It connects **outbound** to GitHub and waits
for jobs. When the `deploy` job fires, GitHub hands it to this runner, which is
already inside the network. No port-forwarding, no public IP, no SSH keys
stored in GitHub — that's the whole point of this choice.

### Install (one time, on the app VM)

Run the runner as the **same user** that owns `/opt/weatheralert` (so it can
write the app dir and control PM2) — not root.

1. In GitHub: **repo → Settings → Actions → Runners → New self-hosted runner
   → Linux / x64.** That page shows a download block and a `./config.sh`
   command with a one-time registration **token** baked in. Use *those* exact
   lines (the token rotates); the steps below are the shape of it:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # (copy the exact curl URL + tar line from the GitHub page)
   curl -o actions-runner.tar.gz -L <URL_FROM_GITHUB>
   tar xzf actions-runner.tar.gz
   ./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN_FROM_GITHUB>
   # Accept the defaults; the default label "self-hosted" is what ci.yml targets.
   ```

2. Install it as a **service** so it starts on boot and keeps running after you
   log out:

   ```bash
   sudo ./svc.sh install $USER
   sudo ./svc.sh start
   sudo ./svc.sh status      # should say "active (running)"
   ```

3. Confirm it registered: the runner shows up as **Idle** under
   Settings → Actions → Runners.

### Make sure the runner can find the tools

The `deploy` job calls `git`, `npm`, `node`, `pm2`, and `curl`. These are on
your PATH in an interactive shell, but a **service** may start with a leaner
environment. After the first deploy, if a step fails with "command not found":

- Confirm the tools exist for the runner user: `which node npm pm2 git curl`.
- `pm2` is a global npm install; ensure the npm global bin dir is on PATH for
  the service (e.g. add it in `~/actions-runner/.env` as `PATH=...`, then
  `sudo ./svc.sh stop && sudo ./svc.sh start`).

### How it ties together

- `.github/workflows/ci.yml` has three jobs: `server` and `client` (tests, on
  GitHub's cloud) and `deploy` (on this runner).
- `deploy` has `needs: server` and an `if:` guard, so it runs **only** when the
  server tests pass **and** the push is to `main`. PRs and red builds never
  deploy.
- `deploy` runs `server/deploy/deploy.sh` with `DEPLOY_DIR=/opt/weatheralert`.
  That script does the §5 sequence and ends with a health check; if the app
  isn't healthy the job goes red.

### Turning the pipeline on

The `deploy` job has a master on-switch so it stays dormant until the rack is
ready: it only runs when the repo variable **`DEPLOY_ENABLED`** is `true`.
Until then GitHub *skips* the job (it won't sit queued waiting for a runner
that doesn't exist yet). When you're ready:

**repo → Settings → Secrets and variables → Actions → Variables → New
repository variable**, name `DEPLOY_ENABLED`, value `true`.

To pause automated deploys later (e.g. during maintenance), set it back to
`false` or delete it.

### First-time ordering

1. Provision the VMs and do the manual **first deploy** (§3) once, so PM2
   knows the app and `.env` / Firebase creds are in place.
2. Install the runner (this section, above).
3. Set `DEPLOY_ENABLED=true`.

After that, pushes to `main` deploy on their own.

### Security notes

- A self-hosted runner executes whatever the workflow says — keep the repo
  **private** and be careful merging untrusted PRs (their workflow changes
  would run on your rack).
- The runner needs no inbound firewall rule. Keep `ufw` as in §2; outbound
  HTTPS to GitHub is all it uses.
- To retire a runner: `sudo ./svc.sh stop && sudo ./svc.sh uninstall`, then
  remove it from the GitHub Runners page.
