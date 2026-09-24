# Self-hosted Pirate Weather — weather VM runbook

A dedicated Proxmox VM that downloads public weather-model data (NOAA,
ECMWF) and serves forecasts to the WeatherAlert app VM over the LAN. It
replaces Tomorrow.io once shadow mode shows it's good enough (`TODO.md`,
"Pirate Weather migration").

> **Status: running on `jupiter` (192.168.155.30) since 2026-09-24.** Brought
> up by following this runbook; every fix that took is folded in below.
> Pirate Weather's own README still calls self-hosting "very beta" — watch
> the sources check in step 7, and step 9's numbers, for the first week.

```
  NOAA / ECMWF open data (S3, HTTPS)
          ▲ outbound only
  ┌───────┴──────────────── weather VM ─────────────────┐
  │  ofelia ──schedules──► 9 ingest jobs ──write──► /srv/pirate-weather/Weather/Prod
  │                                                      │ symlinks (link-stores.sh)
  │  pw_api (uvicorn :8083) ◄──reads── Weather/api/*.zarr
  └───────┬──────────────────────────────────────────────┘
          │ LAN only, port 8083, app VM's IP only (Proxmox firewall)
  ┌───────┴────── app VM ──────┐
  │ WeatherAlert app (adapter:  │
  │ services/providers/         │
  │ pirateWeather.ts)           │
  └─────────────────────────────┘
```

Nothing on this VM is reachable from the internet, and it never touches
user data — the app sends it only grid-cell centres.

## Why a separate VM

- **Memory spikes.** An ingest run needs ≥32 GB *free* RAM. On the app VM,
  that would compete with Postgres and the API.
- **Blast radius.** Pirate Weather's scheduler (Ofelia) mounts the Docker
  socket, which is root on whatever host it runs on. It must not share a
  host with the users database.
- **Independent lifecycle.** Rebuild, resize or snapshot it without touching
  the app.

## 1. Create the VM

| | Size | Why |
|---|---|---|
| OS | Ubuntu 24.04 LTS | same as the app VM |
| vCPU | 12 | the NBM job runs 12 OpenMP threads |
| RAM | 48 GB | 32 GB free for ingest + API + OS |
| System disk | 32 GB | |
| **Data volume** | **~380–500 GB, SSD, ext4**, mounted at `/srv/pirate-weather` | ~200 GB ingest working space + ~50 GB served data + headroom. Upstream warns ext4 is much faster than NTFS. Its own filesystem (LVM volume or second disk) — see step 2. |

Give it a **static LAN IP** — the app VM's `PIRATE_WEATHER_BASE_URL` points at
it. This runbook calls it `<WEATHER_IP>`; the app VM's is `<APP_IP>`.

## 2. Base setup

```bash
sudo apt update && sudo apt install -y git curl vnstat
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# Data volume. The Ubuntu installer leaves most of the disk unallocated
# in LVM, so carve a volume from that (check VFree first). A second virtual
# disk works too — the point is a separate filesystem, so a runaway ingest
# can't fill / and take the VM down.
sudo vgs                                          # VFree
sudo lvcreate -L 380G -n pirate ubuntu-vg
sudo mkfs.ext4 -L pirate /dev/ubuntu-vg/pirate    # easy to miss — no FS, no mount
sudo mkdir -p /srv/pirate-weather
sudo chattr +i /srv/pirate-weather                # unmounted = unwritable
echo '/dev/ubuntu-vg/pirate /srv/pirate-weather ext4 defaults,noatime,nofail 0 2' | sudo tee -a /etc/fstab
sudo systemctl daemon-reload && sudo mount /srv/pirate-weather
findmnt /srv/pirate-weather                       # must show the volume
sudo mkdir -p /srv/pirate-weather/Weather /srv/pirate-weather/Work
sudo chown -R "$USER:$USER" /srv/pirate-weather
```

Why the two extras: `chattr +i` on the empty mount point means that if the
volume is ever *not* mounted, ingest fails instead of silently filling the
root disk; `nofail` means a volume problem can't strand the VM in emergency
mode at boot. Always confirm with `findmnt` — an fstab line for a volume
without a filesystem looks fine until the next reboot.

`vnstat` starts counting traffic now — you'll want a week of numbers (step 9).

Move SSH to port 432. Ubuntu 24.04 starts sshd from systemd's
`ssh.socket`, so the port only changes after a daemon reload. Keep your
session open, confirm a new login on 432 works, then close 22:

```bash
echo 'Port 432' | sudo tee /etc/ssh/sshd_config.d/10-port.conf
sudo sshd -t && sudo systemctl daemon-reload && \
  { systemctl is-active --quiet ssh.socket && sudo systemctl restart ssh.socket || sudo systemctl restart ssh; }
sudo ss -tlnp | grep sshd        # only :432
```

For Claude Code access from a workstation: a dedicated `claude` user in the
`docker` group (no password, no sudo), whose `authorized_keys` entry is
restricted with `from="<workstation IP>",no-agent-forwarding,no-port-forwarding,no-X11-forwarding`.
Being in the `docker` group is root-equivalent on this VM — acceptable only
because the VM is dedicated and holds no user data. Never do the same on the
app VM.

## 3. Get Pirate Weather, pinned

Always a tagged release, never `main`. v0.7.2 is what this runbook was
written against.

```bash
sudo mkdir -p /opt/pirate-weather && sudo chown "$USER:$USER" /opt/pirate-weather
git clone --branch v0.7.2 --depth 1 \
  https://github.com/Pirate-Weather/pirate-weather-code.git /opt/pirate-weather
cd /opt/pirate-weather

docker build -f Docker/pirate-ingest-dockerfile -t pirateingest:latest .
docker build -f Docker/pirate-api-dockerfile   -t pirateapi:v0.7.2 .
```

The ingest image compiles WGRIB2 from source; the first build takes a while.

Then fetch WeatherAlert's files for this VM (this directory of the repo):

```bash
sudo mkdir -p /opt/weatheralert-weather && sudo chown "$USER:$USER" /opt/weatheralert-weather
git clone --depth 1 --filter=blob:none --sparse <WEATHERALERT_REPO_URL> /tmp/wa
git -C /tmp/wa sparse-checkout set server/deploy/weather
cp /tmp/wa/server/deploy/weather/* /opt/weatheralert-weather/ && rm -rf /tmp/wa
```

## 4. Configure

`/opt/pirate-weather/.env` (both compose files read it):

```bash
cat > /opt/pirate-weather/.env <<EOF
PW_ROOT=/srv/pirate-weather
PW_WEATHER_ROOT=/srv/pirate-weather/Weather
PW_WORK_ROOT=/srv/pirate-weather/Work
PW_RELEASE=v0.7.2
PW_API_BIND=<WEATHER_IP>
COMPOSE_FILE=pirate-compose_oph.local.yml:/opt/weatheralert-weather/docker-compose.ingest.yml:/opt/weatheralert-weather/docker-compose.api.yml
EOF
```

`COMPOSE_FILE` makes every plain `docker compose …` in `/opt/pirate-weather`
load all three files, so the ingest jobs can't be started without our fix:

- `docker-compose.ingest.yml` — **required.** Upstream mounts the work area
  (`/tmp`) and output (`/data`) separately, and five ingest scripts finish
  with `os.rename()` across them, which Linux refuses (`[Errno 18] Invalid
  cross-device link` — our first GFS run died on it). This mounts the volume
  once at `/pw` and repoints each job's path variables into it. No upstream
  code is changed.
- `docker-compose.api.yml` — the API server, in the `api` profile so it only
  starts when asked (step 5).

## 5. First ingest, then the API

The first run downloads and processes every model — upstream says **about
an hour**. Start ingest only, and watch it:

```bash
cd /opt/pirate-weather
tmux new -s pw          # `up` blocks until every job has run once
docker compose up -d
docker compose logs -f  # in a second tmux window
```

Upstream chains the jobs with `depends_on: service_completed_successfully`,
so `up` waits for all nine and **one failure stops the rest**. The chain is
only there to run them one at a time — no job reads another's output — so
if one fails, run the others individually instead of waiting on it:

```bash
for svc in subh_ingest gefs_ingest hrrr_ingest hrrr_6h_ingest \
           nws_alerts_ingest ecmwf_ingest rtma-ru-ingest nbm_ingest; do
  docker compose up -d --no-deps "$svc"
  echo "$svc exit $(docker wait "$(docker compose ps -a -q "$svc")")"
done
```

What we hit on the first run (2026-09-23):

- **GFS** backfills ~12 days of history on its first run: ~48 runs, **~29 GB**
  under `Weather/Hist/GFS`. Expect the volume to fill faster at first.
- **NBM** can fail with `403 Forbidden` from `nomads.ncep.noaa.gov`. The
  script picks the newest run available on *any* source, but NOAA's AWS
  bucket lags NOMADS by an hour or more, so a run that exists only on
  NOMADS gets fetched from there — and NOMADS rate-limits hard (403, then
  302s once it has throttled you). It clears once AWS catches up; the
  scheduled runs retry every two hours. On 2026-09-24 NOAA's AWS NBM feed
  stalled entirely for 6+ hours, so NBM failed every attempt that morning.
  With HRRR present, the API still serves good US forecasts without NBM.

Ofelia (the scheduler) only starts once every ingest job has finished once
(or start it yourself with `docker compose up -d --no-deps ofelia`). Then
check the output:

```bash
find /srv/pirate-weather/Weather/Prod -maxdepth 3 -name '*.zarr' | sort
```

Expect `Prod/<MODEL>/v30/<Name>.zarr` per model (e.g. `Prod/GFS/v30/GFS.zarr`,
`Prod/RTMA-RU/v30/RTMA_RU.zarr`) — confirmed on the first run. Map tiles
(`GFS_Maps.zarr`, `HRRR_maps.zarr`) sit alongside; `link-stores.sh` skips them.

The ingest containers run as root, so everything under `Weather/` and
`Work/` is root-owned. To delete a broken store (e.g. a partial history file
that makes a job fail every run), go through a container rather than sudo:

```bash
docker run --rm --network none -v /srv/pirate-weather/Weather/Hist/HRRR:/hist \
  --entrypoint rm pirateingest:latest -rf /hist/<broken>.zarr /hist/<broken>.done
```

Link them to the names the API expects, then start the API:

```bash
PW_DIR=/opt/pirate-weather /opt/weatheralert-weather/link-stores.sh

docker compose --profile api up -d pw_api
docker logs -f pirate-api    # "Loaded GFS_Zarr from: /data/api/GFS.zarr" etc.
```

The API loads every store at startup and prints nothing until it's ready;
upstream says allow ~5 minutes.

## 6. Firewall — in Proxmox, not ufw

Docker publishes ports by writing its own iptables rules, which bypass
`ufw`. So enforce access **outside** the VM, in the Proxmox VM firewall
(Datacenter → VM → Firewall → enable, policy IN = DROP):

| Direction | Source | Port | Why |
|---|---|---|---|
| IN | `<APP_IP>` | tcp 8083 | the app VM's forecast requests — nothing else |
| IN | your admin machine(s) | tcp 432 | SSH (moved off 22 — see step 2) |
| OUT | any | any | model downloads (NOAA/ECMWF buckets over HTTPS) |

Nothing else inbound. There is no port forward and no internet exposure.

## 7. Verify

From the **app VM** (proves the firewall lets it through):

```bash
curl -s "http://<WEATHER_IP>:8083/forecast/local/47.595,-122.325?units=si&version=2&exclude=currently,daily,alerts" \
  | python3 -m json.tool | less
```

Check:

- `minutely.data` has 61 points with `time`, `precipIntensity`,
  `precipProbability`, `precipType`.
- `hourly.data` has `windSpeed` and `cape`. **`cape` only appears with
  `version=2`** — the adapter always sends it; without it thunder alerts
  can never fire.
- **`flags.sources` includes `hrrrsubh` for a US point.** That is the
  15-minute HRRR the minutely forecast needs. The API silently drops it when:
  - its run is **more than 4 hours old** — i.e. the hourly SubH ingest has
    stopped succeeding; or
  - HRRR (or, when HRRR is also missing, NBM) data can't be read — it then
    falls back to GFS for everything.

  Without `hrrrsubh`, alerts still work but from hourly models, which is
  exactly the precision loss this whole setup exists to avoid. Check it
  whenever something looks off; it is the single best health signal.

From a machine that is **not** the app VM, the same `curl` must time out.

**Freshness — confirmed.** The API serves new data as soon as an ingest
finishes, without a restart (seen for RTMA-RU and SubH on the first day):
`flags.sourceTimes` advances on its own. Only re-run `link-stores.sh` and
restart `pw_api` when a *new* model appears for the first time.

## 8. Capture a real fixture

`server/src/services/providers/fixtures/` holds **real** responses from this
instance (`*.real.json`, captured 2026-09-24: Miami with rain ending, St.
Louis typed "rain" at 0 mm/h) alongside the hand-built sample. The contract
tests run the adapter over every real capture. After upgrading Pirate
Weather, capture fresh ones with the adapter's exact query and re-run:

```bash
curl -s "http://<WEATHER_IP>:8083/forecast/local/<lat>,<lng>?units=si&version=2&exclude=currently,daily,alerts" \
  > server/src/services/providers/fixtures/pirateWeather.<place>.real.json
cd server && npx vitest run src/services/providers
```

Pick a point where it is precipitating — scan a few cities against this
instance; it costs nothing.

## 9. Measure before committing

Run a full week before relying on it:

```bash
vnstat -d                                 # daily download volume
du -sh /srv/pirate-weather/Weather /srv/pirate-weather/Work
docker stats --no-stream                  # peak memory during an ingest run
```

First-day numbers (2026-09-24): the first full ingest downloaded **~23 GB**
(including ~12 days of GFS history backfill); **~46 GB** on the volume after
the first scheduled cycles; peak RAM **~21 GB** of 62. Steady-state daily
download is still unknown — read it from `vnstat -d` after a week and
record it in `TODO.md`.

## 10. Connect WeatherAlert

Not yet. The order (`TODO.md`):

1. **Shadow mode first.** The app evaluates Pirate Weather alongside the live
   provider and logs disagreements without sending anything. Needs step 3
   of the plan (a `SHADOW_WEATHER_PROVIDER` setting — not built yet).
2. **Switch** only when shadow numbers hold up. In `server/deploy/.env` on
   the app VM:

   ```
   WEATHER_PROVIDER=pirate
   PIRATE_WEATHER_BASE_URL=http://<WEATHER_IP>:8083
   FORECAST_CELL_DEG=0.03
   ```

   Then `docker compose -f docker-compose.prod.yml up -d app`. Rollback is
   setting `WEATHER_PROVIDER=tomorrow` again.

## Upgrading Pirate Weather

```bash
cd /opt/pirate-weather
git fetch --tags && git checkout <new-tag>
docker build -f Docker/pirate-ingest-dockerfile -t pirateingest:latest .
docker build -f Docker/pirate-api-dockerfile   -t pirateapi:<new-tag> .
sed -i 's/^PW_RELEASE=.*/PW_RELEASE=<new-tag>/' .env
```

If the release bumps `INGEST_VERSION_STR`, data lands in a new `v<N>`
directory: let one ingest cycle complete, re-run `link-stores.sh`, then
recreate `pw_api`. Delete the old `v<N>` directories once the API is
serving from the new ones.

## Licence

Pirate Weather is AGPL-3.0. Running it unmodified is fine. If you change its
code, publish the changes (a public fork is enough). Data attribution for
ECMWF open data (CC-BY-4.0) goes on the app's `/legal` pages when this goes
live.
