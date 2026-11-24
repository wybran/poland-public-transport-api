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
- [https://poland-public-transport.konhi.workers.dev/](https://poland-public-transport.konhi.workers.dev/)

## 📖 Documentation
- **`/docs`** — interactive Swagger UI (try every route from the browser)
- **`/openapi`** — OpenAPI 3 spec (JSON), e.g. for generating a client

## 🔌 Routes
### Zielona Góra (MZK)

**Live** — scraped from MZK's passenger information system (rj.mzk.zgora.pl):

| Route | Description | Cache |
|-------|-------------|-------|
| `GET /zg/vehicles` | All vehicles on the road: position, line, direction, delay, `courseId` | 10 s |
| `GET /zg/vehicles/:vehicleNumber/timetable` | Upcoming stops of the vehicle's current course with ETA (`vehicleNumber` = `vehicleId` from `/zg/vehicles`) | 10 s |
| `GET /zg/stops` | All stops with location | 1 h |
| `GET /zg/stops/:stopId` | Stop details and lines serving it | 1 h |
| `GET /zg/stops/:stopId/departures` | Real-time departures from a stop | 10 s |
| `GET /zg/trips/:tripId/track` | Stops, times and map path of a trip (trip ids come from the MZK trip planner) | 1 h |

**Timetable** — from MZK's official [GTFS feed](https://www.mzk.zgora.pl), rebuilt daily. `?date=YYYY-MM-DD` defaults to today (Europe/Warsaw):

| Route | Description | Cache |
|-------|-------------|-------|
| `GET /zg/calendar` | Days covered by the timetable and their day type (`RO`, `SW`, `DS`, `RW`) | 5 min |
| `GET /zg/lines` | All lines | 5 min |
| `GET /zg/lines/:lineId` | Line's route variants: stop sequences per direction, with `shapeId` | 5 min |
| `GET /zg/stops/:stopId/schedule?date=` | Full-day scheduled departures from a stop | 5 min |
| `GET /zg/courses/:courseId?date=` | One course (kurs): all stops with times and route geometry | 5 min |
| `GET /zg/shapes/:shapeId` | Route geometry | 5 min |

Stop ids and `courseId` are the same in both — e.g. take `courseId` of a live vehicle and get its whole course from `/zg/courses/:courseId`.
Times after midnight are returned as `00:04` with `"nextDay": true`.

Responses are cached at Cloudflare's edge (per data center). Concurrent requests for the same data share one upstream call, and if MZK is down the last good response is served for up to 5 min (real-time) / 24 h (stops, tracks, timetable). Response headers:
- `X-Cache` — `HIT`, `MISS`, `STALE` (MZK failed, serving last good data) or `BYPASS`
- `X-Data-Age` — seconds since the data was fetched from MZK

Errors are returned as `{ "error": "..." }`:
- `400` — invalid parameter (e.g. non-numeric id, malformed date)
- `404` — unknown stop / vehicle / trip / course, or date outside the timetable
- `502` — MZK is down or changed its response format

Example:
```bash
curl "https://<your-instance>/zg/stops/6/schedule?date=2026-11-28"
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
`.github/workflows/deploy_to_cloudflare_workers.yml` deploys on every push to `main` and checks MZK's feed daily, redeploying only when a new GTFS version is published. Set these repository secrets:
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