# sneha-runs

https://sneha8899.github.io/sneha-runs/

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

> **Test the sync locally (optional):**
> ```bash
> STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_REFRESH_TOKEN=... node scripts/sync-strava.mjs
> ```

## Misc Editing Notes

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

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```
