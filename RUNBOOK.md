# Running PathCare locally

Every command below is copy-pasteable and was verified against this repo.
Run them from the project root unless a step says otherwise.

---

## 0. One-time setup

```bash
pnpm install
```

Create `backend/.env` from the template, then edit it:

```bash
cp backend/.env.example backend/.env
```

For local development set these two lines. Leave `NODE_ENV` as `development` —
that is what makes signup echo the OTP back in the response, so you can log in
without an SMS provider:

```
MONGODB_URI=mongodb://127.0.0.1:27017/pathcare
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

> ### Read this before running anything
>
> **`backend/.env` currently points at your real MongoDB Atlas cluster.**
> I verified this — the value is a live `mongodb+srv://` connection string.
>
> Every command in this file reads and writes whatever `MONGODB_URI` names.
> That includes `seed:catalogue`, which would upsert 19 tests and 3 lab centres
> straight into production. It has a guard, but the guard only trips on
> `NODE_ENV=production` — and your `.env` says `development`.
>
> Change it to the line above before running anything local, or pass an
> explicit override per command:
>
> ```bash
> MONGODB_URI="mongodb://127.0.0.1:27017/pathcare" pnpm --filter @pathcare/backend seed:catalogue
> ```
>
> That override is how every command in this session was run, which is why your
> Atlas cluster is untouched.

Web env:

```bash
echo "VITE_API_URL=http://127.0.0.1:5000" > frontend/.env.local
```

---

## 1. Database and Redis

MongoDB is installed as a Windows service and starts on boot. Check it:

```bash
mongosh "mongodb://127.0.0.1:27017/pathcare" --quiet --eval "db.runCommand({ping:1}).ok"
```

`1` means it is running. If not:

```powershell
Start-Service MongoDB
```

Redis is optional locally. The API runs fine without it — it reports
`degraded` and falls back to an in-memory store for rate limits and rider geo.
If you want it (Docker Desktop must be running):

```bash
docker compose up -d redis
```

> `docker-compose.yml` also defines a `mongodb` service. Do **not** start it
> while the Windows MongoDB service is running — both want port 27017, and you
> will end up talking to whichever won, which is how a seeded database appears
> to empty itself.

---

## 2. Seed the catalogue

Loads the real Dehradun tests, packages and lab centres. Safe to re-run —
it upserts by slug:

```bash
pnpm --filter @pathcare/backend seed:catalogue
```

Create the indexes (do this before any real traffic):

```bash
pnpm --filter @pathcare/backend db:sync-indexes
```

Create a phlebotomist — there is no self-signup for staff:

```bash
node backend/src/scripts/provisionRider.js \
  --handle rider_dehradun --phone 9876500011 --name "Rider One" \
  --password 'PathCare#Rider1' --lab "Sunrise Diagnostics"
```

---

## 3. Run everything

### Simplest — API, worker and web together

```bash
pnpm dev
```

Colour-prefixed output: `api` (cyan), `worker` (magenta), `web` (green).
Ctrl-C stops all three.

### Or one at a time, in separate terminals

```bash
pnpm dev:api        # API on :5000, restarts on change
```

```bash
pnpm dev:worker     # BullMQ consumers — needs Redis; skip it if Redis is off
```

```bash
pnpm dev:web        # Vite on :5173
```

### Mobile apps

```bash
pnpm --filter @pathcare/mobile-user start     # patient app
pnpm --filter @pathcare/mobile-rider start    # rider app
```

Both need their own `.env` pointing at the API:

```
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:5000
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=<your key>
```

`localhost` will not work from a phone — it resolves to the phone itself. Find
your LAN IP with:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' } | Select IPAddress
```

**If the laptop is on the phone's hotspot**, the phone routes app traffic over
mobile data and cannot reach that LAN IP. Use tunnels instead — see §6.

---

## 4. Check it is working

```bash
curl http://127.0.0.1:5000/api/health
```

Expect `{"status":"ok","db":"connected","redis":"connected",...}` — or
`"degraded"` with `"redis":"disconnected"`, which is **normal and fine**
without Redis. The API still serves.

```bash
curl "http://127.0.0.1:5000/api/tests?category=package"
```

Should return two full-body checkups. An empty list means the catalogue is not
seeded, or `MONGODB_URI` points somewhere else.

Then open **http://127.0.0.1:5173**.

---

## 5. Tests

```bash
pnpm verify              # lint + all tests + integration. The full gate.
```

Individually:

```bash
pnpm lint                                  # eslint, whole workspace
pnpm --filter @pathcare/backend test       # 364 tests, 37 suites (~2 min)
pnpm --filter @pathcare/frontend test      # 87 tests
pnpm --filter @pathcare/mobile-user test   # offline queue + checkout price rules
```

One backend suite:

```bash
cd backend
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest tests/integration/subscriptionBilling.test.js
```

> Backend tests never touch your real database. The Jest setup deletes
> `MONGODB_URI` from the environment and each suite starts its own in-memory
> MongoDB, so a stray `connectDB()` cannot reach a live cluster.

---

## 6. Testing on a phone over tunnels

Needed when the laptop is on the phone's hotspot, or the phone is on mobile
data. Two tunnels — one for the API, one for Metro.

**Terminal 1 — expose the API:**

```bash
npx localtunnel --port 5000
```

Copy the `https://xxxx.loca.lt` URL it prints into **both** mobile `.env` files
as `EXPO_PUBLIC_API_URL`.

**Terminal 2 — Metro over a tunnel:**

```bash
pnpm --filter @pathcare/mobile-user start -- --tunnel
```

Scan the QR with Expo Go. The apps are on **SDK 57**, which matches the current
Expo Go from the Play Store.

Env values are baked in at bundle time, so **restart Metro after changing
`.env`** or the app keeps calling the old URL.

---

## 7. Stopping things

```powershell
Get-NetTCPConnection -LocalPort 5000,5173,8081 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## 8. When something looks wrong

| Symptom | Cause |
| --- | --- |
| Catalogue empty in the web app | Not seeded, or `MONGODB_URI` points at Atlas instead of local |
| Catalogue stuck on skeletons | CORS — the browser origin is not in `CORS_ORIGIN` |
| `health` says `degraded` | Redis is down. Expected, not an error |
| Phone: "failed to download remote update" | Expo Go's SDK does not match the project's |
| Phone cannot reach the API | On a hotspot the phone routes over mobile data — use tunnels (§6) |
| Seeded data vanished | The Docker `mongodb` service took port 27017 from the Windows service |
| Login works, then 401s | `NODE_ENV=production` without `JWT_SECRET` set |

Live API logs:

```bash
pnpm dev:api          # foreground, or check the terminal running `pnpm dev`
```

What is actually in the database:

```bash
mongosh "mongodb://127.0.0.1:27017/pathcare" --quiet --eval "
  print('tests:    ' + db.testcatalogs.countDocuments({}));
  print('labs:     ' + db.labcenters.countDocuments({}));
  print('users:    ' + db.users.countDocuments({}));
  print('bookings: ' + db.bookings.countDocuments({}));
"
```

---

## 9. Test accounts

Created on your local database, not in Atlas.

| Role | Handle | Password |
| --- | --- | --- |
| Patient | `patient` | `PathCare@2026` |
| Rider | `rider_dehradun` | `PathCare#Rider1` |

The patient has a saved address, so home collection is bookable immediately.

**Book with "Cash on collection"** to exercise the full flow — UPI needs live
Razorpay keys, which are not configured.
