# sneha-runs 🏃‍♀️

A personal marathon-training site on the road to the **BMW Berlin Marathon** (Sept 27, 2026).
Static site hosted on **GitHub Pages**, with mileage **auto-synced from Strava** via a scheduled GitHub Action.

## Sections
- **Countdown** to race day
- **Follow Me Live** — race-day tracking links (`data/config.json` → `tracking`)
- **The Numbers** — training-block miles, lifetime miles, longest run, elevation, hours (auto-synced from Strava)
- **Latest Runs** — your 5 most recent runs
- **Race Résumé** — previous races, with clickable photo galleries (`data/races.json`)
- **Shoe Hall of Fame** — your rotation (`data/shoes.json`)

---

## How the Strava sync works

GitHub Pages can only serve static files — it can't safely hold API secrets. So instead of the browser
talking to Strava, a **GitHub Action** runs on a schedule (daily), fetches your data using secrets stored in
GitHub, and commits the result to `data/stats.json`. The site just reads that JSON file. Your secrets never
touch the public site.

```
GitHub Action (daily) ──▶ Strava API ──▶ writes data/stats.json ──▶ committed to repo ──▶ site reads it
```

---

## One-time setup

### 1. Create a Strava API application
1. Go to <https://www.strava.com/settings/api>
2. Create an app (any name). For **Authorization Callback Domain**, enter `localhost`.
3. Note your **Client ID** and **Client Secret**.

### 2. Authorize your app & get a refresh token
Strava needs a one-time authorization to issue a long-lived refresh token with read access.

**a.** Open this URL in your browser (replace `YOUR_CLIENT_ID`):
```
https://www.strava.com/oauth/authorize?client_id=<client-id>>&response_type=code&redirect_uri=http://localhost/exchange_token&approval_prompt=force&scope=activity:read_all
```
Click **Authorize**. Your browser will redirect to a `localhost` page that fails to load — that's fine.
Copy the `code=...` value from the address bar (it's between `code=` and `&scope`).

**b.** Exchange that code for tokens (replace all three placeholders):
```bash
curl -X POST https://www.strava.com/oauth/token \
  -d client_id=<client-id> \
  -d client_secret=<client-secret> \
  -d code=<code-from-step1> \
  -d grant_type=authorization_code
```
The JSON response includes a **`refresh_token`** — copy it. (The access token expires; the refresh token is what we store.)

### 3. Add the three secrets to GitHub
In your repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret name | Value |
|---|---|
| `STRAVA_CLIENT_ID` | your Client ID |
| `STRAVA_CLIENT_SECRET` | your Client Secret |
| `STRAVA_REFRESH_TOKEN` | the refresh token from step 2b |

### 4. Turn on GitHub Pages
**Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)`.**
Your site will be live at `https://sneha8899.github.io/sneha-runs/`.

### 5. Run the sync once
Go to the **Actions** tab → **Sync Strava stats** → **Run workflow**. This fills in `data/stats.json`
for the first time. After that it runs automatically every day (and you can trigger it any time).

> **Test the sync locally (optional):**
> ```bash
> STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_REFRESH_TOKEN=... node scripts/sync-strava.mjs
> ```

---

## Editing your content

All content lives in plain JSON files under `data/` — edit them in the GitHub web UI or locally and commit.

- **`data/config.json`** — your name, race name/date, training-block start date, mileage goal, tagline.
  - `raceDate` drives the countdown (ISO 8601, e.g. `"2026-09-27T09:15:00+02:00"`).
  - `trainingBlockStart` also controls which runs count toward "This Training Block".
  - `goalMiles` sets the progress bar target.
- **`data/races.json`** — array of past races. Set `"result": "pr"` to get the gold ★ PR badge. Add photos two ways (see below).
- **`data/shoes.json`** — array of shoes. Set `"retired": true` to move a shoe to the retired look.
- **`data/stats.json`** — **auto-generated, don't edit by hand** (the Action overwrites it).

### Race-day live tracking (`config.json` → `tracking`)
Each entry is one race you want spectators to follow. Until you flip it on, the card shows a
"Race day" teaser. When the marathon publishes your tracking link (usually a few days before), edit the entry:
```json
{
  "race": "BMW Berlin Marathon",
  "date": "2026-09-27",
  "provider": "Official BMW Berlin Marathon app",
  "available": true,               // ← flip to true
  "bib": "50231",                  // ← your bib number (optional)
  "url": "https://track.example/…", // ← the live-follow link
  "note": "Tap to follow me in real time on race morning!"
}
```
The card then shows a pulsing **Live now** pill and a big **📡 Track me live →** button. You can list
multiple races here for future events.

### Race photos (`races.json`)
Two options per race — use whichever you like:
- **In-page gallery** — add a `"photos"` array of image paths. The tile becomes clickable and opens a
  lightbox you can arrow through. Drop your images in `images/races/` and reference them:
  ```json
  "photos": ["images/races/berlin-1.jpg", "images/races/berlin-2.jpg"]
  ```
  (The two `demo-*.svg` files in `images/races/` are placeholders — delete them once you add real photos.)
- **External album** — add a single `"photosUrl"` string (e.g. a Google Photos / Flickr share link). The
  tile opens that album in a new tab instead:
  ```json
  "photosUrl": "https://photos.app.goo.gl/your-album"
  ```
A race with neither field simply isn't clickable.

---

## Local preview
No build step. Just serve the folder:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Notes
- If your **Garmin** already syncs to Strava (very common), those runs flow in automatically — no separate Garmin setup needed.
- Only activities of type `Run` / `TrailRun` / `VirtualRun` are counted.
- Adjust the sync schedule in `.github/workflows/strava-sync.yml` (the `cron` line).
