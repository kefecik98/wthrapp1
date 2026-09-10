#!/usr/bin/env bash
cd /home/ke/git/home/claudeLearn/weatherapp/server
for i in $(seq 1 8); do
  TOK=$(curl -s -m 8 -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"test@test.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
  curl -s -m 8 -o /dev/null -X PUT http://localhost:3000/location -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"lat":35.68,"lng":139.69,"accuracy":10}'
  docker exec server-db-1 psql -U weather -d weather_app -tc "delete from alert_log where user_id=(select id from users where email='test@test.com');" >/dev/null 2>&1
  OUT=$(npx tsx trigger_cycle.ts 2>&1)
  if echo "$OUT" | grep -q "send failed"; then
    echo "attempt $i: still denied ($(date +%H:%M:%S)) — waiting 60s"
    sleep 60
  else
    echo "attempt $i: SEND SUCCEEDED ($(date +%H:%M:%S))"
    echo "$OUT" | tail -3
    exit 0
  fi
done
echo "gave up after 8 attempts — still denied"
exit 1
