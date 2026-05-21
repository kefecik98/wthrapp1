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

## 5. Updates (recurring)

From your dev machine, push to `main` (CI must be green). Then on the app
VM:

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
purely additive — easy rollback if the deploy goes sideways.

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
