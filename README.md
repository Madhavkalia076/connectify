# Connectify

A real-time chat app built with Node.js, Express, and Socket.io — rooms with join approval, 1:1
direct messages, video calling, image sharing, live unread badges, and a full profile system, on
top of session-based authentication and persistent MongoDB storage.

**Live demo:** [https://connectify-kola.onrender.com](https://connectify-kola.onrender.com)

> Hosted on Render's free tier, which sleeps after 15 minutes of inactivity — the first request
> after a period of no traffic can take 30-60 seconds to wake back up. That's expected, not a bug.

## Features

- **Auth**: session-based login/signup (`express-session` + `connect-mongo`), bcrypt-hashed
  passwords, rate-limited and validated against brute-force/malformed input.
- **Rooms**: create open or approval-required rooms, owner-only room settings/deletion, join
  requests and approvals, leave-room support.
- **Direct messages**: 1:1 chats by username, with live user search.
- **Real-time**: typing indicators, online presence, live unread-message badges across the
  sidebar — all over a single shared Socket.io connection per page.
- **Video calling**: 1:1 WebRTC video/audio calls with a TURN fallback (see below) for reliable
  connections across different networks, minimize-to-corner, synthesized ringtone.
- **Images**: share images in chat, set a profile picture and room image (via Multer, local
  storage).
- **Messages**: delete for me / delete for everyone (soft delete).
- **Profiles**: display name, bio, and profile picture, separate from the permanent login
  username.
- **Dark/light theme**, persistent sidebar, mobile-responsive layout.

## Tech stack

| Layer | Choice |
| --- | --- |
| Server | Express |
| Real-time | Socket.io |
| Views | EJS (server-rendered) + Tailwind CSS |
| Auth | express-session + connect-mongo |
| Database | MongoDB Atlas (free M0 tier) |
| File uploads | Multer (local disk) |
| Video calling | WebRTC, with a free TURN relay (metered.ca) as a NAT-traversal fallback |
| Testing | Jest + Supertest |
| Deployment | Render (free tier) |

Every service used here has a genuinely free tier with no credit card required — see
[CLAUDE.md](./CLAUDE.md) for the full reasoning behind each choice, including alternatives that
were considered and why they weren't picked.

## Known limitations (stated honestly, not hidden)

- **Render free tier sleeps** after 15 minutes idle — expect a slow first load after a gap.
- **Uploaded images (`uploads/`) are local disk storage** and don't survive a redeploy on Render's
  free tier (the filesystem resets). Fine for local dev/demo use; a production deployment would
  need S3/Cloudinary instead.
- **Presence, typing indicators, and the chat/auth rate limiters are all in-memory** — they reset
  on server restart and wouldn't stay correct across multiple server instances without something
  like Redis. Not an issue at this scale (a single free-tier instance).
- **TURN credentials are fetched from an authenticated endpoint**, not truly secret — a logged-in
  user inspecting network traffic could see them. Short-lived, per-call credentials would close
  that gap but weren't built (more infrastructure than this project's scope needs).

## Running it locally

1. Clone the repo and install dependencies:
   ```
   git clone https://github.com/Madhavkalia076/connectify.git
   cd connectify
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in real values:
   ```
   cp .env.example .env
   ```
   - `MONGODB_URI` — a free MongoDB Atlas cluster's connection string.
   - `SESSION_SECRET` — any random string.
   - `TURN_USERNAME` / `TURN_CREDENTIAL` — free from [metered.ca](https://www.metered.ca) (only
     needed for video calls to work reliably across different networks; the app still runs
     without them, calls just won't have a TURN fallback).
3. Build the CSS once (or leave it running in the background while you work):
   ```
   npm run build:css
   ```
4. Start the server:
   ```
   npm run dev
   ```
   (`nodemon`, auto-restarts on code changes) or `npm start` for a plain one-off run.
5. Visit `http://localhost:3000`.

## Testing

```
npm test
```

Runs the Jest + Supertest suite against the real MongoDB Atlas database configured in `.env`
(same connection the dev server uses) — see [CLAUDE.md](./CLAUDE.md) for why that choice was made
over an in-memory test database.

## Project docs

[CLAUDE.md](./CLAUDE.md) is the full build log for this project — the reasoning behind every
major decision, alternatives considered, tradeoffs, and known limitations, written up phase by
phase as the project was built.
