import 'dotenv/config';
import fetch from 'node-fetch';

const { BOT_TOKEN, APPLICATION_ID, USER_ID } = process.env;

if (!BOT_TOKEN || !APPLICATION_ID || !USER_ID) {
  console.error('Missing required env vars. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const AZURACAST_URL = 'http://hails.live/api/nowplaying/radio';
const DISCORD_URL = `https://discord.com/api/v9/applications/${APPLICATION_ID}/users/${USER_ID}/identities/0/profile`;
const POLL_INTERVAL_MS = 9_000;

let lastSongId = null;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fetchNowPlaying() {
  const res = await fetch(AZURACAST_URL);
  if (!res.ok) throw new Error(`Azuracast responded ${res.status}`);
  return res.json();
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord responded ${res.status}: ${text}`);
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function sync() {
  try {
    const data = await fetchNowPlaying();

    const song      = data.now_playing?.song ?? {};
    const np        = data.now_playing ?? {};
    const live      = data.live ?? {};
    const listeners = data.listeners ?? {};
    const isOnline  = data.is_online ?? false;

    const songId   = song.id ?? null;
    const elapsed  = np.elapsed ?? 0;
    const duration = np.duration ?? 0;

    if (songId !== lastSongId) {
      lastSongId = songId;
      const liveTag = live.is_live ? ` (Live: ${live.streamer_name})` : '';
      log(isOnline
        ? `Track changed: "${song.title}" by "${song.artist || 'Unknown'}"${liveTag}`
        : 'Station went offline');
    }

    const liveStatus = live.is_live ? `Live: ${live.streamer_name}` : 'Auto DJ';

    const dynamic = [
      { type: 1, name: 'track_title',   value: isOnline ? (song.title || 'Unknown Track') : 'Off Air' },
      { type: 1, name: 'artist',        value: song.artist ? `Artist: ${song.artist}` : '' },
      { type: 1, name: 'playlist',      value: np.playlist ? `Playlist: ${np.playlist}` : '' },
      { type: 2, name: 'listeners',     value: listeners.current ?? 0 },
      { type: 1, name: 'album',          value: `Album: ${song.album || 'Unknown'}` },
      { type: 1, name: 'live_status',   value: liveStatus },
      { type: 2, name: 'song_elapsed',        value: elapsed },
      { type: 2, name: 'song_duration',       value: duration },
      { type: 1, name: 'elapsed_formatted',   value: formatTime(elapsed) },
      { type: 1, name: 'duration_formatted',  value: formatTime(duration) },
    ];

    if (song.art) {
      dynamic.push({ type: 3, name: 'album_art', value: { url: song.art } });
    }

    const history = data.song_history ?? [];
    for (let i = 0; i < 4; i++) {
      const entry = history[i]?.song ?? {};
      const n = i + 1;
      dynamic.push({ type: 1, name: `history_${n}_title`,  value: entry.title  || '' });
      dynamic.push({ type: 1, name: `history_${n}_artist`, value: entry.artist || '' });
      if (entry.art) {
        dynamic.push({ type: 3, name: `history_${n}_art`, value: { url: entry.art } });
      }
    }

    await patchDiscord({ username: 'hails.live', data: { dynamic } });
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

log('Hails.Live Discord widget sync started');
await sync();
setInterval(sync, POLL_INTERVAL_MS);
