#!/usr/bin/env node
/**
 * Fetches running data from the Strava API and writes data/stats.json.
 *
 * Runs in GitHub Actions (see .github/workflows/strava-sync.yml).
 * Requires these environment variables (set as GitHub repo secrets):
 *   STRAVA_CLIENT_ID
 *   STRAVA_CLIENT_SECRET
 *   STRAVA_REFRESH_TOKEN
 *
 * The training-block start date is read from data/config.json.
 * Node 18+ (built-in fetch) required.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const META_PER_MILE = 1609.344;
const META_PER_FOOT = 0.3048;

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;

function requireEnv() {
  const missing = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

async function getAccessToken() {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function api(path, token) {
  const res = await fetch(`https://www.strava.com/api/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function isRunOrRunningAdjacent(a) {
  const t = a.sport_type || a.type || "";
  return t === "Run" || t === "TrailRun" || t === "VirtualRun" || t == "Soccer";
}

async function main() {
  requireEnv();

  const config = JSON.parse(await readFile(join(ROOT, "data", "config.json"), "utf8"));
  const blockStart = new Date(config.trainingBlockStart || "1970-01-01");
  const afterEpoch = Math.floor(blockStart.getTime() / 1000);

  console.log("Refreshing access token…");
  const token = await getAccessToken();

  // --- Athlete + lifetime totals ---
  console.log("Fetching athlete profile…");
  const me = await api("/athlete", token);
  const stats = await api(`/athletes/${me.id}/stats`, token);
  const lifeRun = stats.all_run_totals || {};

  // --- Training-block activities (paginate) ---
  console.log(`Fetching activities since ${config.trainingBlockStart}…`);
  const blockRuns = [];
  const recent = [];
  let page = 1;
  const perPage = 100;
  while (page <= 10) {
    const acts = await api(`/athlete/activities?per_page=${perPage}&page=${page}`, token);
    if (!acts.length) break;
    for (const a of acts) {
      if (!isRunOrRunningAdjacent(a)) continue;
      // recent list: first 5 runs overall (activities come newest-first)
      if (recent.length < 5) recent.push(a);
      const started = new Date(a.start_date).getTime() / 1000;
      if (started >= afterEpoch) blockRuns.push(a);
    }
    // Activities are newest-first; once the last item on the page predates the
    // block start, no later page can contain block runs.
    const last = acts[acts.length - 1];
    if (last && new Date(last.start_date).getTime() / 1000 < afterEpoch) break;
    page += 1;
  }

  // --- Aggregate the training block ---
  const sum = (arr, f) => arr.reduce((n, x) => n + (f(x) || 0), 0);
  const blockMeters = sum(blockRuns, (a) => a.distance);
  const blockSeconds = sum(blockRuns, (a) => a.moving_time);
  const blockElevM = sum(blockRuns, (a) => a.total_elevation_gain);
  const longestM = blockRuns.reduce((m, a) => Math.max(m, a.distance || 0), 0);

  const round1 = (n) => Math.round(n * 10) / 10;

  const out = {
    updated: new Date().toISOString(),
    profileUrl: `https://www.strava.com/athletes/${me.id}`,
    trainingBlock: {
      since: config.trainingBlockStart,
      miles: round1(blockMeters / META_PER_MILE),
      runs: blockRuns.length,
      movingHours: Math.round(blockSeconds / 3600),
      elevationFt: Math.round(blockElevM / META_PER_FOOT),
      longestRunMiles: round1(longestM / META_PER_MILE),
    },
    lifetime: {
      miles: Math.round((lifeRun.distance || 0) / META_PER_MILE),
      runs: lifeRun.count || 0,
    },
    recentRuns: recent.map((a) => ({
      name: a.name,
      date: a.start_date_local || a.start_date,
      miles: round1(a.distance / META_PER_MILE),
      time: formatDuration(a.moving_time),
      pace: formatPace(a.moving_time, a.distance),
      url: `https://www.strava.com/activities/${a.id}`,
    })),
  };

  await writeFile(join(ROOT, "data", "stats.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote stats.json — block: ${out.trainingBlock.miles} mi over ${out.trainingBlock.runs} runs, ` +
    `lifetime: ${out.lifetime.miles} mi.`
  );
}

function formatDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(sec, meters) {
  if (!sec || !meters) return "";
  const miles = meters / META_PER_MILE;
  const paceSec = sec / miles;
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")} /mi`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
