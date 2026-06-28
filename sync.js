import 'dotenv/config';
import fetch from 'node-fetch';
import { buildCatalog } from './fields.js';

const { BOT_TOKEN, APPLICATION_ID, USER_ID, WIDGET_USERNAME, ENABLED_FIELDS } = process.env;

const AZURACAST_BASE_URL = (process.env.AZURACAST_BASE_URL || 'https://hails.live').replace(/\/+$/, '');
const STATION_SHORTCODE  = process.env.STATION_SHORTCODE || 'radio';
const POLL_INTERVAL_MS   = Number(process.env.POLL_INTERVAL_MS) || 9_000;
const META_REFRESH_MS    = Number(process.env.META_REFRESH_MS) || 60_000;
const HISTORY_DEPTH      = Number(process.env.HISTORY_DEPTH) || 4;
const REQUESTS_DEPTH     = Number(process.env.REQUESTS_DEPTH) || 4;
const DRY_RUN            = /^(1|true|yes|on)$/i.test(process.env.DRY_RUN || '');

if (!DRY_RUN && (!BOT_TOKEN || !APPLICATION_ID || !USER_ID)) {
  console.error('Missing required env vars. Copy .env.example to .env and fill it in, or set DRY_RUN=1 to preview fields without Discord credentials.');
  process.exit(1);
}

const API           = `${AZURACAST_BASE_URL}/api`;
const NOWPLAYING_URL = `${API}/nowplaying/${STATION_SHORTCODE}`;
const STATION_URL    = `${API}/station/${STATION_SHORTCODE}`;
const SCHEDULE_URL   = `${STATION_URL}/schedule`;
const REQUESTS_URL   = `${STATION_URL}/requests`;
const DISCORD_URL    = `https://discord.com/api/v9/applications/${APPLICATION_ID}/users/${USER_ID}/identities/0/profile`;

// Build the field catalog once, then narrow to the optional ENABLED_FIELDS allowlist.
const catalog = buildCatalog({ historyDepth: HISTORY_DEPTH, requestsDepth: REQUESTS_DEPTH });
const allowlist = ENABLED_FIELDS
  ? new Set(ENABLED_FIELDS.split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const activeFields = allowlist ? catalog.filter((f) => allowlist.has(f.name)) : catalog;

// Discord rejects any identity payload with more than 30 dynamic fields (HTTP 400,
// BASE_TYPE_MAX_LENGTH). The full catalog is 70+, so a widget must opt into <= 30 via
// ENABLED_FIELDS. We also hard-cap below as a safety net so a misconfig can't spam 400s.
const MAX_FIELDS = 30;
if (activeFields.length > MAX_FIELDS) {
  console.warn(`WARNING: ${activeFields.length} fields are enabled but Discord allows at most ${MAX_FIELDS}. ` +
    `Set ENABLED_FIELDS to <= ${MAX_FIELDS} field names; extras will be dropped.`);
}

let lastSongId = null;
let meta = { station: {}, schedule: [], requests: [] };
let lastMetaFetch = 0;
let rateLimitedUntil = 0;
let warnedFieldCap = false;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Refresh the slow-changing endpoints. Each is guarded independently so a failing or
// auth-gated endpoint (e.g. an instance with requests disabled) never breaks the now-playing
// push. The previously cached value is kept on error.
async function refreshMeta() {
  const sources = [
    ['station', STATION_URL],
    ['schedule', SCHEDULE_URL],
    ['requests', REQUESTS_URL],
  ];
  const next = { ...meta };
  await Promise.all(sources.map(async ([key, url]) => {
    try {
      next[key] = await getJson(url);
    } catch (err) {
      log(`${key} endpoint unavailable (HTTP ${err.message}); keeping previous value`);
    }
  }));
  meta = next;
  lastMetaFetch = Date.now();
}

function buildContext(data) {
  const np        = data.now_playing ?? {};
  const song      = np.song ?? {};
  const live      = data.live ?? {};
  const listeners = data.listeners ?? {};
  const isOnline  = data.is_online ?? false;
  const next      = data.playing_next ?? {};
  const history   = data.song_history ?? [];
  const station   = meta.station ?? {};
  const mounts    = station.mounts ?? [];
  const mount     = mounts.find((m) => m.is_default) ?? mounts[0] ?? null;
  return {
    np, song, live, listeners, isOnline, next, history,
    station, mount,
    schedule: meta.schedule ?? [],
    requests: meta.requests ?? [],
  };
}

function buildDynamic(ctx) {
  const dynamic = [];
  for (const f of activeFields) {
    let value;
    try {
      value = f.fn(ctx);
    } catch {
      value = f.type === 2 ? 0 : '';
    }
    if (f.type === 3) {
      if (value) dynamic.push({ type: 3, name: f.name, value: { url: value } });
    } else {
      dynamic.push({ type: f.type, name: f.name, value });
    }
  }
  if (dynamic.length > MAX_FIELDS) {
    if (!warnedFieldCap) {
      warnedFieldCap = true;
      log(`Capping payload at ${MAX_FIELDS} fields (built ${dynamic.length}); set ENABLED_FIELDS to choose which.`);
    }
    return dynamic.slice(0, MAX_FIELDS);
  }
  return dynamic;
}

async function patchDiscord(payload) {
  const res = await fetch(DISCORD_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bot ${BOT_TOKEN}`,
      'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)',
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) return;
  const text = await res.text();
  if (res.status === 429) {
    let retry = 5;
    try { retry = JSON.parse(text).retry_after ?? retry; } catch {}
    rateLimitedUntil = Date.now() + (retry * 1000) + 500;
    throw new Error(`Rate limited by Discord; backing off ${retry}s (raise POLL_INTERVAL_MS if frequent)`);
  }
  throw new Error(`Discord responded ${res.status}: ${text}`);
}

const TYPE_LABEL = { 1: 'text', 2: 'num ', 3: 'img ' };

function printDryRun(dynamic) {
  const sent = new Map(dynamic.map((d) => [d.name, d.type === 3 ? d.value.url : d.value]));
  let group = null;
  for (const f of activeFields) {
    if (f.group !== group) {
      group = f.group;
      console.log(`\n# ${group}`);
    }
    const value = sent.has(f.name) ? sent.get(f.name) : '(skipped: empty image)';
    console.log(`  ${f.name.padEnd(24)} [${TYPE_LABEL[f.type]}] ${value}`);
  }
  console.log(`\n${dynamic.length} field(s) would be sent (catalog defines ${activeFields.length}).`);
}

async function sync() {
  // Honour an active Discord rate-limit backoff: skip the cycle entirely until it clears
  // so we send at the allowed cadence instead of hammering the endpoint.
  if (!DRY_RUN && Date.now() < rateLimitedUntil) return;
  try {
    if (Date.now() - lastMetaFetch >= META_REFRESH_MS) await refreshMeta();

    const data = await getJson(NOWPLAYING_URL);
    const ctx = buildContext(data);

    const songId = ctx.song.id ?? null;
    if (songId !== lastSongId) {
      lastSongId = songId;
      const liveTag = ctx.live.is_live ? ` (Live: ${ctx.live.streamer_name})` : '';
      log(ctx.isOnline
        ? `Track changed: "${ctx.song.title}" by "${ctx.song.artist || 'Unknown'}"${liveTag}`
        : 'Station went offline');
    }

    const dynamic = buildDynamic(ctx);

    if (DRY_RUN) {
      printDryRun(dynamic);
      return;
    }

    const username = WIDGET_USERNAME || ctx.station.name || 'AzuraCast';
    await patchDiscord({ username, data: { dynamic } });
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

log(`AzuraCast → Discord widget sync started (${NOWPLAYING_URL})`);
if (DRY_RUN) log('DRY_RUN enabled. Printing the field catalog with live values, not sending to Discord.');

await refreshMeta();
await sync();

if (DRY_RUN) {
  process.exit(0);
} else {
  setInterval(sync, POLL_INTERVAL_MS);
}
