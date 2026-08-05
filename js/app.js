const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function loadJSON(path, fallback) {
  try {
    const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    console.warn(`Could not load ${path}:`, err);
    return fallback;
  }
}

function startCountdown(raceISO, caption) {
  const target = new Date(raceISO).getTime();
  const els = {
    days: $('[data-cd="days"]'),
    hours: $('[data-cd="hours"]'),
    mins: $('[data-cd="mins"]'),
    secs: $('[data-cd="secs"]'),
  };
  const capEl = $("#countdown-caption");

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      els.days.textContent = els.hours.textContent = els.mins.textContent = els.secs.textContent = "00";
      if (capEl) capEl.textContent = "RACE DAY IS HERE 🎉";
      clearInterval(timer);
      return;
    }
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);
    const s = Math.floor((diff % 6e4) / 1e3);
    els.days.textContent = String(d);
    els.hours.textContent = String(h).padStart(2, "0");
    els.mins.textContent = String(m).padStart(2, "0");
    els.secs.textContent = String(s).padStart(2, "0");
  }
  tick();
  const timer = setInterval(tick, 1000);
  if (caption && capEl) capEl.textContent = caption;
}

function animateCount(el, target, decimals = 0, dur = 1200) {
  const start = performance.now();
  const from = 0;
  function frame(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = from + (target - from) * eased;
    el.textContent = val.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function setCount(id, value, decimals) {
  const el = document.getElementById(id);
  if (!el) return;
  el.dataset.count = value;
  el.dataset.decimals = decimals;
}

/* ---------- Render: stats ---------- */
function renderStats(stats, config) {
  const tb = stats.trainingBlock || {};
  const lt = stats.lifetime || {};

  setCount("block-miles", tb.miles || 0, 1);
  setCount("life-miles", lt.miles || 0, 0);
  setCount("block-runs", tb.runs || 0, 0);
  setCount("block-long", tb.longestRunMiles || 0, 1);
  setCount("block-elev", tb.elevationFt || 0, 0);
  setCount("block-hours", tb.movingHours || 0, 0);

  const blockLabel = $("#block-label");
  if (blockLabel && config.trainingBlockLabel) {
    blockLabel.textContent = config.trainingBlockLabel;
  }

  // Manual "cries" stat (lives in config.json so the Strava sync can't overwrite it)
  if (typeof config.cries === "number") {
    const card = $("#cries-card");
    if (card) {
      card.hidden = false;
      setCount("cries-count", config.cries, 0);
    }
  }

  // Goal progress bar
  const goal = config.goalMiles || 0;
  const miles = tb.miles || 0;
  const pct = goal ? Math.min((miles / goal) * 100, 100) : 0;
  const goalText = $("#goal-text");
  if (goalText) {
    goalText.textContent = goal
      ? `${miles.toFixed(1)} / ${goal} mi goal · ${Math.round(pct)}%`
      : `${miles.toFixed(1)} mi logged`;
  }
  // animate bar shortly after load
  setTimeout(() => {
    const bar = $("#goal-bar");
    if (bar) bar.style.width = `${pct}%`;
  }, 300);

  // Updated timestamp
  if (stats.updated) {
    const dt = new Date(stats.updated);
    const nice = dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const note = $("#updated-note");
    if (note) note.textContent = `Auto-synced from Strava · last update ${nice}`;
    const foot = $("#footer-updated");
    if (foot) foot.textContent = `Stats last synced ${dt.toLocaleString()}`;
  }
}

/* ---------- Render: recent runs ---------- */
function renderRuns(runs, profileUrl) {
  const wrap = $("#runs-list");
  if (!wrap) return;

  // "View all on Strava" link in the header
  const profileLink = $("#strava-profile-link");
  if (profileLink && profileUrl) {
    profileLink.href = profileUrl;
    profileLink.hidden = false;
  }

  if (!runs || !runs.length) return; // keep the empty placeholder
  wrap.innerHTML = "";
  runs.forEach((r) => {
    const d = parseDate(r.date);
    const href = r.url || (r.id ? `https://www.strava.com/activities/${r.id}` : null);
    const el = document.createElement(href ? "a" : "div");
    el.className = `run reveal${href ? " run--link" : ""}`;
    if (href) {
      el.href = href;
      el.target = "_blank";
      el.rel = "noopener";
      el.title = "View on Strava";
    }
    el.innerHTML = `
      <div class="run__date">
        <b>${d.getDate()}</b>
        <span>${d.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div>
        <div class="run__name">${escapeHTML(r.name || "Run")}</div>
        <div class="run__meta">${escapeHTML(r.pace || "")}${r.pace && r.time ? " · " : ""}${escapeHTML(r.time || "")}</div>
      </div>
      <div class="run__dist">${Number(r.miles || 0).toFixed(1)}<span> mi</span></div>
    `;
    wrap.appendChild(el);
  });
  observeReveals();
}

/* ---------- Render: race-day tracking ---------- */
function renderTracking(tracking) {
  const section = $("#tracking");
  const wrap = $("#tracking-list");
  if (!section || !wrap) return;
  if (!Array.isArray(tracking) || !tracking.length) return; // stays hidden

  section.hidden = false;
  wrap.innerHTML = "";

  tracking.forEach((t) => {
    const live = !!t.available && !!t.url;
    const dateStr = t.date
      ? parseDate(t.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
      : "";
    const card = document.createElement("div");
    card.className = `track-card reveal${live ? " track-card--live" : ""}`;

    const bibLine = t.bib
      ? `<div class="track-card__bib">Bib <b>#${escapeHTML(String(t.bib))}</b></div>`
      : "";

    const action = live
      ? `<a class="track-btn" href="${encodeURI(t.url)}" target="_blank" rel="noopener">📡 Track me live →</a>`
      : "";

    card.innerHTML = `
      <div class="track-card__top">
        <div>
          <div class="track-card__race">${escapeHTML(t.race || "Race")}</div>
          <div class="track-card__date">${escapeHTML(dateStr)}${t.provider ? " · " + escapeHTML(t.provider) : ""}</div>
        </div>
        <span class="track-pill track-pill--${live ? "live" : "soon"}">${live ? "Live now" : "Race day"}</span>
      </div>
      ${bibLine}
      ${t.note ? `<div class="track-card__note">${escapeHTML(t.note)}</div>` : ""}
      ${action}
    `;
    wrap.appendChild(card);
  });
  observeReveals();
}

/* ---------- Render: races ---------- */
function renderRaces(races) {
  const wrap = $("#races-list");
  if (!wrap) return;
  if (!races || !races.length) return;
  // newest first
  races.sort((a, b) => parseDate(b.date) - parseDate(a.date));
  wrap.innerHTML = "";
  races.forEach((r) => {
    const d = parseDate(r.date);
    const isPR = (r.result || "").toLowerCase() === "pr";
    const hasGallery = Array.isArray(r.photos) && r.photos.length > 0;
    const hasAlbumLink = typeof r.photosUrl === "string" && r.photosUrl.trim() !== "";
    const clickable = hasGallery || hasAlbumLink;

    const el = document.createElement("div");
    el.className = `race reveal${clickable ? " race--clickable" : ""}`;

    const photoChip = clickable
      ? `<div class="race__photos">📷 ${hasGallery ? `View photos (${r.photos.length})` : "View album"}</div>`
      : "";

    el.innerHTML = `
      <span class="race__badge race__badge--${isPR ? "pr" : "finished"}">${isPR ? "★ PR" : "Finished"}</span>
      <div class="race__dist">${escapeHTML(r.distance || "")}</div>
      <div class="race__name">${escapeHTML(r.name || "")}</div>
      <div class="race__time">${escapeHTML(r.time || "—")}</div>
      <div class="race__row"><span>${escapeHTML(r.pace || "")}</span><span>${d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span></div>
      <div class="race__row"><span>📍 ${escapeHTML(r.location || "")}</span></div>
      ${r.notes ? `<div class="race__notes">“${escapeHTML(r.notes)}”</div>` : ""}
      ${photoChip}
    `;

    if (clickable) {
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      const open = () => {
        if (hasGallery) openLightbox(r.photos, r.name);
        else window.open(r.photosUrl, "_blank", "noopener");
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    }

    wrap.appendChild(el);
  });
  observeReveals();
}

/* ---------- Render: shoes ---------- */
function renderShoes(shoes) {
  const wrap = $("#shoes-list");
  if (!wrap) return;
  if (!shoes || !shoes.length) return;
  wrap.innerHTML = "";
  shoes.forEach((s) => {
    const miles = Number(s.miles) ?  Number(s.miles) : null;
    const life = 400;
    const pct = Math.min((miles / life) * 100, 100);
    const el = document.createElement("div");
    el.className = `shoe reveal${s.retired ? " shoe--retired" : ""}`;
    el.innerHTML = `
      <div class="shoe__top">
        <span class="shoe__emoji">${escapeHTML(s.emoji || "👟")}</span>
        <span class="shoe__role">${escapeHTML(s.role || "")}</span>
      </div>
      <div class="shoe__name">${escapeHTML(s.name || "")}</div>
      <div class="shoe__color">${escapeHTML(s.color || "")}</div>
      <div class="shoe__miles">${miles === null ? escapeHTML("♾️") : miles.toLocaleString()}<span> mi</span></div>
      <div class="shoe__meter"><div style="width:${pct}%"></div></div>
      ${s.notes ? `<div class="shoe__notes">${escapeHTML(s.notes)}</div>` : ""}
      ${s.retired ? `<div class="shoe__retired-tag">Retired</div>` : ""}
    `;
    wrap.appendChild(el);
  });
  observeReveals();
}

/* ---------- Render: wishlist ---------- */
function renderWishlist(items) {
  const section = $("#wishlist");
  const wrap = $("#wishlist-list");
  if (!section || !wrap) return;
  if (!Array.isArray(items) || !items.length) return; // stays hidden

  section.hidden = false;
  wrap.innerHTML = "";
  items.forEach((it) => {
    const el = document.createElement("div");
    el.className = "wish reveal";
    const hasUrl = typeof it.url === "string" && it.url.trim() !== "";
    const btn = hasUrl
      ? `<a class="wish__btn" href="${encodeURI(it.url)}" target="_blank" rel="noopener">Gift this →</a>`
      : `<span class="wish__btn wish__btn--soon">Link coming soon</span>`;
    el.innerHTML = `
      <div class="wish__top">
        <span class="wish__emoji">${escapeHTML(it.emoji || "🎁")}</span>
        ${it.price ? `<span class="wish__price">${escapeHTML(it.price)}</span>` : ""}
      </div>
      <div class="wish__name">${escapeHTML(it.name || "")}</div>
      ${it.note ? `<div class="wish__note">${escapeHTML(it.note)}</div>` : ""}
      ${btn}
    `;
    wrap.appendChild(el);
  });
  observeReveals();
}

/* ---------- Render: social links ---------- */
function renderSocial(social) {
  const nav = $("#social-links");
  if (!nav || !social) return;
  const map = { instagram: "#social-ig", tiktok: "#social-tt" };
  let anyShown = false;
  Object.entries(map).forEach(([key, sel]) => {
    const link = $(sel);
    const url = social[key];
    const valid = typeof url === "string" && /^https?:\/\//.test(url) && !/YOUR_HANDLE/.test(url);
    if (link && valid) {
      link.href = url;
      link.hidden = false;
      anyShown = true;
    }
  });
  nav.hidden = !anyShown;
}

/* ---------- Reveal-on-scroll ---------- */
let revealObserver;
function observeReveals() {
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealObserver.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
  }
  $$(".reveal:not(.in)").forEach((el) => revealObserver.observe(el));
}

function observeCounts() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const el = e.target;
          animateCount(el, parseFloat(el.dataset.count || "0"), parseInt(el.dataset.decimals || "0", 10));
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.4 }
  );
  $$(".count").forEach((el) => io.observe(el));
}

const lb = {
  photos: [],
  index: 0,
  title: "",
  els: {},
  lastFocus: null,
};

function initLightbox() {
  lb.els = {
    root: $("#lightbox"),
    img: $("#lb-img"),
    title: $("#lb-title"),
    count: $("#lb-count"),
    prev: $("#lb-prev"),
    next: $("#lb-next"),
    close: $("#lb-close"),
  };
  if (!lb.els.root) return;
  lb.els.close.addEventListener("click", closeLightbox);
  lb.els.prev.addEventListener("click", () => stepLightbox(-1));
  lb.els.next.addEventListener("click", () => stepLightbox(1));
  lb.els.root.addEventListener("click", (e) => {
    if (e.target === lb.els.root) closeLightbox(); // click backdrop
  });
  document.addEventListener("keydown", (e) => {
    if (lb.els.root.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") stepLightbox(-1);
    else if (e.key === "ArrowRight") stepLightbox(1);
  });
}

function openLightbox(photos, title) {
  lb.photos = photos;
  lb.index = 0;
  lb.title = title || "";
  lb.lastFocus = document.activeElement;
  const single = photos.length <= 1;
  lb.els.prev.hidden = single;
  lb.els.next.hidden = single;
  updateLightbox();
  lb.els.root.hidden = false;
  lb.els.root.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lb.els.close.focus();
}

function closeLightbox() {
  lb.els.root.hidden = true;
  lb.els.root.setAttribute("aria-hidden", "true");
  lb.els.img.src = "";
  document.body.style.overflow = "";
  if (lb.lastFocus && lb.lastFocus.focus) lb.lastFocus.focus();
}

function stepLightbox(dir) {
  lb.index = (lb.index + dir + lb.photos.length) % lb.photos.length;
  updateLightbox();
}

function updateLightbox() {
  const src = lb.photos[lb.index];
  lb.els.img.src = src;
  lb.els.img.alt = `${lb.title} — photo ${lb.index + 1}`;
  lb.els.title.textContent = lb.title;
  lb.els.count.textContent = lb.photos.length > 1 ? `${lb.index + 1} / ${lb.photos.length}` : "";
}

/* ---------- utils ---------- */
// Timezone-safe date parsing. Date-only "YYYY-MM-DD" strings parse as UTC by
// default, which shifts a day for viewers behind UTC — build them as local
// instead. Strava's start_date_local ends in "Z" but is already local wall
// time, so strip the trailing Z before parsing.
function parseDate(str) {
  if (typeof str !== "string") return new Date(str);
  const dOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dOnly) return new Date(+dOnly[1], +dOnly[2] - 1, +dOnly[3]);
  return new Date(str.replace(/Z$/, ""));
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- boot ---------- */
(async function init() {
  const [config, stats, races, shoes, wishlist] = await Promise.all([
    loadJSON("data/config.json", {}),
    loadJSON("data/stats.json", { trainingBlock: {}, lifetime: {}, recentRuns: [] }),
    loadJSON("data/races.json", []),
    loadJSON("data/shoes.json", []),
    loadJSON("data/wishlist.json", []),
  ]);

  // hero text from config
  if (config.raceName) $("#kicker").textContent = `Road to ${config.raceShortName || config.raceName}`;
  if (config.tagline) $("#tagline").textContent = config.tagline;
  document.title = `${config.runnerName || "Sneha"} Runs — Road to ${config.raceShortName || "Berlin"}`;

  if (config.raceDate) startCountdown(config.raceDate);

  initLightbox();
  renderTracking(config.tracking);
  renderStats(stats, config);
  renderRuns(stats.recentRuns, stats.profileUrl);
  renderRaces(races);
  renderShoes(shoes);
  renderWishlist(wishlist);
  renderSocial(config.social);

  observeCounts();
  observeReveals();
})();
