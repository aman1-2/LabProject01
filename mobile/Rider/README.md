# PathCare Rider

The phlebotomist app. Bottom tabs: **Jobs / Map / Profile** (CONTEXT §7.3).

It is a client of the P01–P07 API. It defines no endpoints of its own, and
every network call goes through `@pathcare/api` — token injection, refresh and
error normalisation are defined once there, not per screen.

## Running it

```bash
cp .env.example .env          # then fill in the values below
pnpm --filter @pathcare/mobile-rider start
```

| Variable | Required | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | yes | Base URL of the API, no trailing slash. |
| `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` | for the Map tab | Unset renders an explicit "map not configured" state rather than a blank grey map. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | for push | Without it no Expo push token is issued and Profile says so. |

`EXPO_PUBLIC_*` values are inlined into the bundle. Nothing secret goes in one.

## What runs where

| Check | Command | Runs here? |
| --- | --- | --- |
| Offline-queue unit tests | `pnpm --filter @pathcare/mobile-rider test` | yes |
| Lint | `pnpm lint` (workspace) | yes |
| Android JS bundle | `npx expo export --platform android` | yes |
| Detox E2E | `pnpm --filter @pathcare/mobile-rider e2e:test` | needs a native build + device |

Detox needs `npx expo prebuild` first; it cannot run in Expo Go. The suite
refuses to run without `E2E_RIDER_HANDLE` / `E2E_RIDER_PASSWORD` rather than
inventing credentials, and it does not seed data (§9.8) — it needs a real rider
account and a real pending home-collection booking at that rider's centre.

## Still needed before a store build

- **An app icon.** `app.config.js` has no `icon` field because no artwork
  exists. Add `assets/icon.png` and restore the field.
- **A Google Maps Android key**, if the Map tab is to render.
- **An EAS project id**, for push notifications in a standalone build.

## Notes on behaviour worth knowing

- **Accepting a job is never queued offline.** Claiming work you cannot confirm
  you hold leaves a patient waiting for a rider who does not know they are
  coming. `409 JOB_ALREADY_TAKEN` is shown as information, not an error.
- **Collection, cash and handoff writes are queued** and replayed strictly in
  order; the server's state machine rejects them out of order. Duplicate
  replays that come back `ALREADY_CONFIRMED` / `SAMPLE_ALREADY_COLLECTED` are
  treated as already applied, so an offline retry cannot double-bill.
- **The barcode is issued by the server** at collection. The camera scan at
  handoff verifies the tube against the record; it never invents an identifier.
- **Background location runs only while a job is held**, and stops when the job
  ends or the session does.
- **Tokens live in `expo-secure-store` only.** The offline queue uses
  AsyncStorage, and holds no credentials.
