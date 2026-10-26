# Relaydeck

Relaydeck is the simple management UI for this relay. It covers four jobs:

- **Subscriptions:** connect plans you already pay for (Claude, ChatGPT/Codex, Antigravity, Grok) by signing in on the provider's own page.
- **Provider API keys:** add per-use keys (Gemini, OpenAI, Anthropic, xAI, any OpenAI-compatible endpoint). Each key is checked by the relay before it is saved.
- **Connections:** show the base URL and the existing client access keys, with snippets for Claude Code, Codex CLI, the OpenAI SDK and curl, and a real test request.
- **Usage:** see how pooled accounts shared recent traffic, using the relay's own counters and the last limits each provider reported.

Everything else lives in the full panel at `/management-advanced.html` (the **Advanced** switch).

## Run it

```bash
go build -o cli-proxy-api ./cmd/server
./cli-proxy-api --config config.yaml
```

1. Set `management.secret-key` in `config.yaml`.
2. Open `http://127.0.0.1:8317/management.html` and sign in with that key.

The UI is embedded in the binary from `internal/relaydeck/dist`. A plain `go build` serves it with no Node, network access or download.

## How it is served

| Path | Serves |
| --- | --- |
| `/management.html` | Relaydeck, embedded in the binary |
| `/relaydeck/assets/*` | Hashed scripts, styles, fonts and artwork, cached as immutable |
| `/management-advanced.html` | The full panel downloaded from `management.panel-github-repository`, served from this origin |
| `/management.html?safe-mode=configure` | The full panel, so template access keys can still be replaced |

- **Downloads never replace Relaydeck.** The advanced panel's download (and `disable-auto-update-panel`) only affects `/management-advanced.html`.
- **Disabling.** `disable-control-panel` and Home mode turn all of these routes off.
- **Page headers.** The Relaydeck page is sent with a Content-Security-Policy that limits scripts, styles, fonts, images and API calls to the relay's own origin, so the management key cannot be sent anywhere else.

## Build the UI

The source is in this directory. The build writes to `../../internal/relaydeck/dist`, which is committed.

```bash
cd web/relaydeck
npm ci
npm run check   # typecheck, unit/contract tests, build, then fail if dist differs from git
npm run build   # rebuild dist after changing the UI
```

Commit the rebuilt `dist` together with the source change. CI runs `npm run check`.

For live development against a running relay:

```bash
RELAYDECK_DEV_RELAY=http://127.0.0.1:8317 npm run dev
```

## Contracts it relies on

All calls go to `/v8/management` with `Authorization: Bearer <management key>`.

| Feature | Endpoints |
| --- | --- |
| Sign in | `GET /credentials?page=1&page_size=1` |
| Subscriptions | `GET /credentials` and `PATCH /credentials/status` (pause/resume) |
| Sign-in flow | `POST /oauth/auth-url` with `is_webui: true`, `GET /oauth/status`, `DELETE /oauth/session`, `POST /oauth/callback` (pasted redirect) |
| Provider keys | `GET`/`PUT /config/api-keys/<provider>` |
| Key checks | `POST /requests/api-call` (the relay lists models with the new key) |
| Key counters | `GET /observability/usage/api-keys` |
| Access keys (read only) | `GET /config/access/api-keys` |
| Request detail | `GET`/`PUT /config/observability/usage/usage-statistics-enabled` and `GET /observability/usage/queue` |

**Provider key writes.** Every write reads the provider's list and its ETag first, then writes back with `If-Match`.
- Only that provider's list is written. Other providers, groups and settings are left as they were.
- A concurrent edit is re-read and re-applied once, and never overwritten.
- New keys are appended as new groups.
- Pausing a key sets the relay's own `"*"` model exclusion on that key. OpenAI-compatible keys have no per-key exclusions, so for them the group's `disabled` flag is set.

**Client access keys.** Relaydeck only shows and copies these. It never creates or rotates them, and it writes nothing on page load.

## What the numbers mean

- **Counters** are the relay's in-memory 10-minute buckets per account: 20 buckets, about 3 hours.
  - They reset when the relay restarts.
  - Ranges are "Last hour" and "Last 3 hours" only. There is no 24 h or 7 d history and no browser-side collector.
- **Capacity** shows the last limit headers a provider sent (Claude, Codex).
  - Each reading shows how old it is, and readings older than an hour are flagged.
  - Providers that don't report limits say so.
- **Request detail** (models, tokens, latency) is off until the user opts in, in a dialog that names the relay-wide setting.
  - Reading the queue removes records, so other readers of the usage queue miss them.
  - Records last 60 s by default and an hour at most.
  - Records are read only while the page is open and are kept in memory only.
  - Keys, client addresses, headers and error bodies are dropped as soon as a record arrives.
- **No inferred claims.** Routing reasons and retry linkage are not shown, because the relay doesn't record them.

## Motion

- **Artwork.** The background is the Paper artwork (`src/assets`).
- **Motion layer.** On top of it, an SVG layer in the same coordinate space carries:
  - a slow drift
  - twinkling stars
  - blinking lamps
  - light pulses along the drawn wires
- **Pause.** The dock's Pause button stops all of it and is remembered per device.
- **Reduced motion.** `prefers-reduced-motion: reduce` keeps the art still, and the button then reads "Still".
