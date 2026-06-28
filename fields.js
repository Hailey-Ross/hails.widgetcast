// Field catalog: the single source of truth for every Discord widget data field.
//
// Each field is { name, type, group, desc, fn(ctx) }:
//   type 1 = text, 2 = number, 3 = image (value becomes { url })
//   fn(ctx) computes the value from the per-tick context assembled in sync.js:
//     {
//       np,        // now_playing object
//       song,      // now_playing.song
//       live,      // live object
//       listeners, // listeners object
//       isOnline,  // boolean
//       next,      // playing_next object
//       history,   // song_history array
//       station,   // /api/station/{s} response (cached)
//       mount,     // default mount from station.mounts
//       schedule,  // /api/station/{s}/schedule array (cached)
//       requests,  // /api/station/{s}/requests array (cached)
//     }
//
// This catalog drives both the payload sent to Discord and the field table in the README
// (`npm run fields`), so documentation never drifts from the code.

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function remaining(np) {
  if (typeof np.remaining === 'number') return np.remaining;
  return Math.max((np.duration ?? 0) - (np.elapsed ?? 0), 0);
}

export function buildCatalog({ historyDepth = 4, requestsDepth = 4 } = {}) {
  const fields = [];

  // --- now_playing -------------------------------------------------------
  fields.push(
    { name: 'track_title', type: 1, group: 'now_playing', desc: 'Currently playing track title ("Off Air" when offline)',
      fn: (c) => (c.isOnline ? (c.song.title || 'Unknown Track') : 'Off Air') },
    { name: 'artist', type: 1, group: 'now_playing', desc: 'Artist name, prefixed "Artist:"',
      fn: (c) => (c.song.artist ? `Artist: ${c.song.artist}` : '') },
    { name: 'album', type: 1, group: 'now_playing', desc: 'Album name, prefixed "Album:"',
      fn: (c) => `Album: ${c.song.album || 'Unknown'}` },
    { name: 'playlist', type: 1, group: 'now_playing', desc: 'Playlist name, prefixed "Playlist:"',
      fn: (c) => (c.np.playlist ? `Playlist: ${c.np.playlist}` : '') },
    { name: 'genre', type: 1, group: 'now_playing', desc: 'Track genre',
      fn: (c) => c.song.genre || '' },
    { name: 'isrc', type: 1, group: 'now_playing', desc: 'Track ISRC code',
      fn: (c) => c.song.isrc || '' },
    { name: 'song_text', type: 1, group: 'now_playing', desc: 'Full combined "Artist - Album - Title" string',
      fn: (c) => c.song.text || '' },
    { name: 'is_request', type: 1, group: 'now_playing', desc: '"Requested" if the current track was a listener request, else ""',
      fn: (c) => (c.np.is_request ? 'Requested' : '') },
    { name: 'album_art', type: 3, group: 'now_playing', desc: 'Album art image for the current track',
      fn: (c) => c.song.art || '' },
  );

  // --- timing ------------------------------------------------------------
  fields.push(
    { name: 'song_elapsed', type: 2, group: 'timing', desc: 'Seconds elapsed in current track (progress bar current value)',
      fn: (c) => c.np.elapsed ?? 0 },
    { name: 'song_duration', type: 2, group: 'timing', desc: 'Track duration in seconds (progress bar max value)',
      fn: (c) => c.np.duration ?? 0 },
    { name: 'song_remaining', type: 2, group: 'timing', desc: 'Seconds remaining in current track',
      fn: (c) => remaining(c.np) },
    { name: 'elapsed_formatted', type: 1, group: 'timing', desc: 'Elapsed time formatted as M:SS',
      fn: (c) => formatTime(c.np.elapsed ?? 0) },
    { name: 'duration_formatted', type: 1, group: 'timing', desc: 'Track duration formatted as M:SS',
      fn: (c) => formatTime(c.np.duration ?? 0) },
    { name: 'remaining_formatted', type: 1, group: 'timing', desc: 'Remaining time formatted as M:SS',
      fn: (c) => formatTime(remaining(c.np)) },
    { name: 'progress_percent', type: 2, group: 'timing', desc: 'Percent through current track (0 to 100)',
      fn: (c) => { const d = c.np.duration ?? 0; return d ? Math.min(Math.round(((c.np.elapsed ?? 0) / d) * 100), 100) : 0; } },
  );

  // --- listeners ---------------------------------------------------------
  fields.push(
    { name: 'listeners', type: 2, group: 'listeners', desc: 'Current listener count',
      fn: (c) => c.listeners.current ?? 0 },
    { name: 'listeners_total', type: 2, group: 'listeners', desc: 'Total listener connections',
      fn: (c) => c.listeners.total ?? 0 },
    { name: 'listeners_unique', type: 2, group: 'listeners', desc: 'Unique listener count',
      fn: (c) => c.listeners.unique ?? 0 },
  );

  // --- live / DJ ---------------------------------------------------------
  fields.push(
    { name: 'live_status', type: 1, group: 'live', desc: '"Live: Name" when a DJ is streaming, otherwise "Auto DJ"',
      fn: (c) => (c.live.is_live ? `Live: ${c.live.streamer_name}` : 'Auto DJ') },
    { name: 'is_live', type: 2, group: 'live', desc: '1 if a live DJ is streaming, else 0',
      fn: (c) => (c.live.is_live ? 1 : 0) },
    { name: 'streamer_name', type: 1, group: 'live', desc: 'Live streamer / DJ name (empty when AutoDJ)',
      fn: (c) => c.live.streamer_name || '' },
    { name: 'broadcast_start', type: 2, group: 'live', desc: 'Live broadcast start time (unix seconds), 0 if not live',
      fn: (c) => c.live.broadcast_start ?? 0 },
    { name: 'live_art', type: 3, group: 'live', desc: 'Live DJ artwork / banner',
      fn: (c) => c.live.art || '' },
  );

  // --- station -----------------------------------------------------------
  fields.push(
    { name: 'is_online', type: 2, group: 'station', desc: '1 if the station is online, else 0',
      fn: (c) => (c.isOnline ? 1 : 0) },
    { name: 'station_name', type: 1, group: 'station', desc: 'Station name',
      fn: (c) => c.station.name || '' },
    { name: 'station_description', type: 1, group: 'station', desc: 'Station description',
      fn: (c) => c.station.description || '' },
    { name: 'listen_url', type: 1, group: 'station', desc: 'Direct stream / listen URL',
      fn: (c) => c.station.listen_url || '' },
    { name: 'public_player_url', type: 1, group: 'station', desc: 'Public web player URL',
      fn: (c) => c.station.public_player_url || '' },
    { name: 'stream_bitrate', type: 2, group: 'station', desc: 'Default mount bitrate (kbps)',
      fn: (c) => c.mount?.bitrate ?? 0 },
    { name: 'stream_format', type: 1, group: 'station', desc: 'Default mount format (e.g. mp3)',
      fn: (c) => c.mount?.format || '' },
    { name: 'stream_mount', type: 1, group: 'station', desc: 'Default mount name',
      fn: (c) => c.mount?.name || '' },
    { name: 'requests_enabled', type: 2, group: 'station', desc: '1 if song requests are enabled, else 0',
      fn: (c) => (c.station.requests_enabled ? 1 : 0) },
  );

  // --- up next (playing_next) -------------------------------------------
  fields.push(
    { name: 'next_title', type: 1, group: 'up_next', desc: 'Next track title',
      fn: (c) => c.next.song?.title || '' },
    { name: 'next_artist', type: 1, group: 'up_next', desc: 'Next track artist',
      fn: (c) => c.next.song?.artist || '' },
    { name: 'next_album', type: 1, group: 'up_next', desc: 'Next track album',
      fn: (c) => c.next.song?.album || '' },
    { name: 'next_art', type: 3, group: 'up_next', desc: 'Next track album art',
      fn: (c) => c.next.song?.art || '' },
    { name: 'next_duration', type: 2, group: 'up_next', desc: 'Next track duration in seconds',
      fn: (c) => Math.round(c.next.duration ?? 0) },
    { name: 'next_playlist', type: 1, group: 'up_next', desc: 'Next track playlist',
      fn: (c) => c.next.playlist || '' },
  );

  // --- history (generated to HISTORY_DEPTH) -----------------------------
  for (let i = 1; i <= historyDepth; i++) {
    const idx = i - 1;
    fields.push(
      { name: `history_${i}_title`, type: 1, group: 'history', desc: `Previous track #${i} title`,
        fn: (c) => c.history[idx]?.song?.title || '' },
      { name: `history_${i}_artist`, type: 1, group: 'history', desc: `Previous track #${i} artist`,
        fn: (c) => c.history[idx]?.song?.artist || '' },
      { name: `history_${i}_album`, type: 1, group: 'history', desc: `Previous track #${i} album`,
        fn: (c) => c.history[idx]?.song?.album || '' },
      { name: `history_${i}_art`, type: 3, group: 'history', desc: `Previous track #${i} album art`,
        fn: (c) => c.history[idx]?.song?.art || '' },
    );
  }

  // --- schedule (top upcoming entry) ------------------------------------
  fields.push(
    { name: 'schedule_next_title', type: 1, group: 'schedule', desc: 'Next scheduled show title/name',
      fn: (c) => { const e = c.schedule[0]; return e ? (e.title || e.name || '') : ''; } },
    { name: 'schedule_next_streamer', type: 1, group: 'schedule', desc: 'Next scheduled show streamer/name',
      fn: (c) => { const e = c.schedule[0]; return e ? (e.name || '') : ''; } },
    { name: 'schedule_next_start', type: 2, group: 'schedule', desc: 'Next scheduled show start (unix seconds), 0 if none',
      fn: (c) => c.schedule[0]?.start_timestamp ?? 0 },
  );

  // --- requests ----------------------------------------------------------
  fields.push(
    { name: 'requests_count', type: 2, group: 'requests', desc: 'Number of requestable songs',
      fn: (c) => c.requests.length },
  );
  for (let i = 1; i <= requestsDepth; i++) {
    const idx = i - 1;
    fields.push(
      { name: `request_${i}_title`, type: 1, group: 'requests', desc: `Requestable song #${i} title`,
        fn: (c) => c.requests[idx]?.song?.title || '' },
      { name: `request_${i}_artist`, type: 1, group: 'requests', desc: `Requestable song #${i} artist`,
        fn: (c) => c.requests[idx]?.song?.artist || '' },
      { name: `request_${i}_art`, type: 3, group: 'requests', desc: `Requestable song #${i} album art`,
        fn: (c) => c.requests[idx]?.song?.art || '' },
    );
  }

  return fields;
}
