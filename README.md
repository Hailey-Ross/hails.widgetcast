# hails.live Discord Widget

A service that bridges an [AzuraCast](https://azuracast.com) radio station with Discord's profile widget system (Widget v2 / Social Layer). It polls the AzuraCast public API and pushes live now-playing data to a Discord profile widget.

## Preview

<a href="preview1.png"><img src="preview1.png" width="450" alt="Widget expanded view"></a>
<a href="preview2.png"><img src="preview2.png" width="220" alt="Widget compact view"></a>

## How It Works

1. AzuraCast exposes public JSON APIs for the current track, up-next track, listener stats, song history, station details, the upcoming schedule, and the song requests queue.
2. `sync.js` fetches those endpoints on an interval and formats a large catalog of named fields into Discord's identity profile payload.
3. The payload is sent via `PATCH` to Discord's Social Layer API, updating the widget shown on your Discord profile.
4. The widget layout itself is configured once in the Discord Developer Portal and maps named data fields to visual elements.

## Documentation

Full setup, configuration, the data-field catalog, and troubleshooting live in the **[project wiki](https://github.com/Hailey-Ross/hails.widgetcast/wiki)**:

| Page | What it covers |
|---|---|
| [Installation](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Installation) | Prerequisites, server setup, and running under PM2 |
| [Discord App Setup](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Discord-App-Setup) | One-time Discord Developer Portal steps and adding the widget to your profile |
| [Configuration](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Configuration) | Every `.env` variable, data sources, the field limit, and rate limiting |
| [Field Catalog](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Field-Catalog) | The full list of named data fields you can map to your widget layout |
| [AzuraCast API Reference](https://github.com/Hailey-Ross/hails.widgetcast/wiki/AzuraCast-API-Reference) | The public AzuraCast endpoints this service reads |
| [Troubleshooting](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Troubleshooting) | Common log messages, their causes, and fixes |

## Quick start

```bash
git clone https://github.com/Hailey-Ross/hails.widgetcast.git
cd hails.widgetcast
npm install
cp .env.example .env
# fill in BOT_TOKEN, APPLICATION_ID, USER_ID, AZURACAST_BASE_URL, STATION_SHORTCODE
```

Preview every available field with live data, no Discord credentials needed:

```bash
DRY_RUN=1 node sync.js
```

Then run it for real:

```bash
node sync.js
```

For the full server setup (PM2, reboots) see [Installation](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Installation), and for the one-time Discord configuration see [Discord App Setup](https://github.com/Hailey-Ross/hails.widgetcast/wiki/Discord-App-Setup).
