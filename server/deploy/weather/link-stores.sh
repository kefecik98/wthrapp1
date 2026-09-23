#!/usr/bin/env bash
#
# Point the names Pirate Weather's API expects at the files its ingest jobs
# write. Run once after the first ingest completes, and again after
# upgrading Pirate Weather (the ingest version in the path can change).
#
#   ingest writes:  $PW_WEATHER_ROOT/Prod/<MODEL>/<version>/<Name>.zarr
#   API reads:      $PW_WEATHER_ROOT/api/<Name>.zarr   (save_dir=/data/api)
#
# Links are relative, so they resolve both on the host and inside the API
# container (where PW_WEATHER_ROOT is mounted at /data). Ingest jobs
# overwrite their .zarr in place, so links never need refreshing between
# runs.

set -euo pipefail

PW_DIR="${PW_DIR:-/opt/pirate-weather}"
set -a; source "${PW_DIR}/.env"; set +a
ROOT="${PW_WEATHER_ROOT:?PW_WEATHER_ROOT not set in ${PW_DIR}/.env}"

# The ingest version is a constant in the checked-out code (e.g. v30).
VERSION="$(sed -nE 's/^INGEST_VERSION_STR *= *"([^"]+)".*/\1/p' \
  "${PW_DIR}/API/constants/shared_const.py")"
[[ -n "${VERSION}" ]] || { echo "could not read INGEST_VERSION_STR" >&2; exit 1; }

mkdir -p "${ROOT}/api"
cd "${ROOT}/api"

linked=0
shopt -s nullglob
for store in ../Prod/*/"${VERSION}"/*.zarr; do
  name="$(basename "${store}")"
  case "${name}" in *_Maps.zarr) continue ;; esac # map tiles, not forecasts
  ln -sfn "${store}" "${name}"
  echo "linked ${name} -> ${store}"
  linked=$((linked + 1))
done

if (( linked == 0 )); then
  echo "no stores found under ${ROOT}/Prod/*/${VERSION}/ — has ingest finished?" >&2
  exit 1
fi
echo "${linked} stores linked for ingest ${VERSION}"
