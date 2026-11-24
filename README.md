<div align="center">
<a href="#">
    <img src="https://user-images.githubusercontent.com/61631665/160162690-04047e63-f704-44f7-9d30-7e9685236ba1.png" alt="Logo">
</a>

<br>
<h1 align="center">🚌 Poland's Public Transport API</h1>

  <p align="center">
      <b>Simple</b>, <b>open</b> and <b>community</b>-maintained REST API you can use in your project <b>limitlessly.</b>
    <br>
    <br>
    <a href="#-lets-talk">💬 Let's talk</a>
    ·
    <a href="https://github.com/konhi/poland-public-transport-api/blob/main/CONTRIBUTING.MD">🖥 Contribute & Use</a>
    ·
    <a href="https://github.com/konhi/poland-public-transport-api/issues">✨ Request Feature</a>
  </p>
</div>

## 🌐 Sources

| Status | Version | City | Notes |
|--------|---------|------|--------|
| ✅ | v2 | Zielona Góra | Scrapes directly from [mzk.zgora.pl](https://mzk.zgora.pl) |
| Discontinued | ❌ | Gorzów Wielkopolski | ❌ |


Not found what you're looking for?  [**Contribute new providers »**](https://github.com/konhi/poland-public-transport-api/blob/main/CONTRIBUTING.MD)

## ✨ Features
- **🔌 CORS:** fetch data in your cool webapp
- **🥰 Fully Free:** no keys and ratelimits, open-source - you can deploy your own instance
- **💨 Fast**: headers-based caching
- **🔒 Safe**: validates data to check external servers

## 💖 Instances
This project is **proudly powered by Cloudflare Workers**. You can deploy your own instance for **free**, **100k requests/day**.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/konhi/poland-public-transport-api)

You can also use these **public instances**:
- [https://api.mzk.wybran.dev/docs](https://api.mzk.wybran.dev/docs)
- [https://poland-public-transport.konhi.workers.dev/](https://poland-public-transport.konhi.workers.dev/)

## 📖 Documentation
- **`/docs`** — interactive Swagger UI (try every route from the browser)
- **`/openapi`** — OpenAPI 3 spec (JSON), e.g. for generating a client

## 🔌 Routes
All routes are versioned under `/v1`. Within a version fields and error codes are only ever **added** — never renamed or removed; breaking changes would go to `/v2`. The old unversioned `/zg/...` paths still work but are deprecated (`Deprecation: true` header, `Link` to the `/v1` path).

### Zielona Góra (MZK)

**Live** — scraped from MZK's passenger information system (rj.mzk.zgora.pl):

| Route | Description | Cache |
|-------|-------------|-------|
| `GET /v1/zg/status` | Health in one call: is MZK answering, is the timetable valid today and for how many more days, active announcements. Always `200` | 10 s |
| `GET /v1/zg/vehicles?line=&vehicle=&courseId=` | Vehicles on the road: position, bearing, line, direction, delay, `courseId`. Filters (combinable): `line=27` or `27,14`, `vehicle=328`, `courseId=2421` | 10 s |
| `GET /v1/zg/vehicles/:vehicleNumber/timetable` | Upcoming stops of the vehicle's current course with ETA (`vehicleNumber` = `vehicleId` from `/zg/vehicles`) | 10 s |
| `GET /v1/zg/stops` | All stops with location | 1 h |
| `GET /v1/zg/stops/search?q=&near=` | Find stops by name (diacritics-insensitive, `q=lezyca` finds Łężyca) and/or nearest to `lat,lon` | 5 min |
| `GET /v1/zg/stops/:stopId` | Stop details and lines serving it | 1 h |
| `GET /v1/zg/alerts` | Current MZK announcements (detours, timetable changes); empty when there are none | 1 min |
| `GET /v1/zg/alerts/:alertId` | Full text of a dispatcher message | 1 min |
| `GET /v1/zg/stops/:stopId/departures` | Real-time departures from a stop | 10 s |
| `GET /v1/zg/planner?from=&to=` | Trip planner: connections between stops (`6`) or points (`51.93,15.49`) with walking, transfers, times and map paths. Optional `date`, `time`, `maxTransfers` (0–4), `walk` (0–2), `lowFloor` | 10 s |
| `GET /v1/zg/trips/:tripId/track?timetableId=` | Full course of a planner leg: stops, times, map path (`tripId`, `timetableId` from `/zg/planner`) | 1 h |

**Timetable** — from MZK's official [GTFS feed](https://www.mzk.zgora.pl), rebuilt daily. `?date=YYYY-MM-DD` defaults to today (Europe/Warsaw):

| Route | Description | Cache |
|-------|-------------|-------|
| `GET /v1/zg/calendar` | Days covered by the timetable and their day type (`RO`, `SW`, `DS`, `RW`) | 5 min |
| `GET /v1/zg/stops/with-lines?line=` | All stops with the lines serving them, in one request — for map markers; `?line=27` keeps only that line's stops | 5 min |
| `GET /v1/zg/lines` | All lines | 5 min |
| `GET /v1/zg/lines/:lineId` | Line's route variants: stop sequences per direction, with `shapeId` | 5 min |
| `GET /v1/zg/stops/:stopId/schedule?date=&line=` | Full-day scheduled departures from a stop; `?line=27` for a single line's timetable | 5 min |
| `GET /v1/zg/courses/:courseId?date=` | One course (kurs): all stops with times and route geometry | 5 min |
| `GET /v1/zg/shapes/:shapeId` | Route geometry | 5 min |

Stop ids and `courseId` are the same in both — e.g. take `courseId` of a live vehicle and get its whole course from `/v1/zg/courses/:courseId`.
Times after midnight are returned as `00:04` with `"nextDay": true`.

Responses are cached at Cloudflare's edge (per data center). Concurrent requests for the same data share one upstream call, and if MZK is down the last good response is served for up to 5 min (real-time) / 24 h (stops, tracks, timetable). Response headers:
- `X-Cache` — `HIT`, `MISS`, `STALE` (MZK failed, serving last good data) or `BYPASS`
- `X-Data-Age` — seconds since the data was fetched from MZK
- `X-Data-Source: gtfs` (status `203`) — MZK was unreachable, so `/v1/zg/stops` was built from the GTFS timetable (same ids and names, some live-only fields empty)

Requests to MZK time out after 4 s and are retried once — MZK sometimes hangs for Cloudflare's servers while an immediate retry works.

Apps may send `X-App-Name` / `X-App-Version` headers; they're recorded in traces to tell app versions apart. No user or device identifiers are collected.

Errors are returned as `{ "error": "...", "code": "...", "param": "..." }`. **Switch on `code`** (stable, never renamed) and show your own message; `error` is an English hint for developers.

| Status | `code` | When |
|--------|--------|------|
| 400 | `INVALID_PARAMETER` | Bad parameter — its name is in `param` |
| 404 | `ROUTE_NOT_FOUND` | Unknown URL |
| 404 | `NOT_FOUND` | Unknown id (stop, vehicle, line, alert…) |
| 404 | `STOP_NOT_FOUND` | Unknown stop in schedule / planner |
| 404 | `TRIP_NOT_FOUND` | Unknown planner trip |
| 404 | `COURSE_NOT_RUNNING` | Course doesn't run on that date |
| 404 | `DATE_OUT_OF_RANGE` | Date outside the published timetable |
| 404 | `NO_CONNECTION` | Planner found no connection |
| 502 | `UPSTREAM_TIMEOUT` | MZK didn't answer in time |
| 502 | `UPSTREAM_ERROR` | MZK failed or changed its format |
| 502 | `TIMETABLE_UNAVAILABLE` | Timetable data missing on our side |
| 500 | `INTERNAL_ERROR` | Bug — please report |

Example:
```bash
curl "https://api.mzk.wybran.dev/v1/zg/stops/6/schedule?date=2026-11-28&line=27"
curl "https://api.mzk.wybran.dev/v1/zg/planner?from=6&to=51.9332,15.5866&time=10:00"
```

## 🛠 Development
Requires Node ≥ 23.6 and pnpm.

```bash
pnpm install
pnpm gtfs        # download MZK's GTFS feed and build public/gtfs/ (needed for timetable routes)
pnpm dev         # http://localhost:8787/docs
pnpm typecheck
```

The timetable is stored as small JSON files in `public/gtfs/` and shipped with the Worker as [Static Assets](https://developers.cloudflare.com/workers/static-assets/) (not publicly served — the Worker reads them through the `ASSETS` binding). `public/gtfs/` is git-ignored; it's built in CI.

### Deployment
`.github/workflows/deploy_to_cloudflare_workers.yml` deploys on every push to `main` and checks MZK's feed twice a day, redeploying only when a new GTFS version is published. Set these repository secrets:
- `CF_API_TOKEN` — Cloudflare API token with *Edit Cloudflare Workers* permission
- `CF_ACCOUNT_ID` — your Cloudflare account id

## 🌌 Used by
Does your project use this API? Feel free to **add it there!**

- [Przystanek MZK Zielona Góra](https://github.com/Wybranowsky/przystanek-mzk)

## 💬 Let's talk!
- [konhi](https://github.com/konhi) - **Jan Szymański**: [<hello.konhi@gmail.com>](mailto:hello.konhi@gmail.com) · [@konhi_](https://twitter.com/konhi_) · [konhi#1588](https://discord.com) (he/him)

## 🕶 Related
- [Przyjazdy.pl GTFS Feeds](https://przyjazdy.pl/gtfs)
- [MKuran GTFS Feeds](https://mkuran.pl/gtfs/)
- [github.com/public-transport](https://github.com/public-transport)
  - [transport.rest](https://transport.rest)
  - [eu.data.public-transport.earth/](https://eu.data.public-transport.earth/)
- [Polish National Access Point Datasets](https://dane.gov.pl/pl/dataset/1739,krajowy-punkt-dostepowy-kpd-multimodalne-usugi-informacji-o-podrozach)
- [Transitfeeds - An extensive archive of public transit data](https://transitfeeds.com/)
- [Commercial alternative](https://jakdojade.pl/public/pages/api/rest_xml.html)

## 📜 License

- Distributed under the MIT License. See [`LICENSE.txt`](https://github.com/konhi/poland-public-transport-api/blob/main/LICENSE) for more information.
- Check [attributions!](https://github.com/konhi/poland-public-transport-api/blob/main/ATTRIBUTIONS.md)