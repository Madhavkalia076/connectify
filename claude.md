# CLAUDE.md — Connectify Upgrade Roadmap & Learning Guide

## How to use this file

This isn't just a task list for Claude Code to execute silently. The owner of this project
is actively learning — for every phase, Claude Code should:

1. **Explain the concept** before writing code (what it is, why it's used here).
2. **Name the alternatives** that were not chosen, and why.
3. **List pros/cons** of the chosen approach honestly, including its limitations.
4. **Write code with comments** that teach, not just code that works.
5. **Pause after each phase** and summarize what was built, what to test manually, and what
   concepts the owner should be able to explain afterward (a mini "checkpoint quiz" is welcome).

Do not skip ahead to later phases without finishing and explaining the current one. Depth over
speed. If a shortcut is taken for time reasons, say so explicitly rather than silently.

---

## Hard constraint: zero-cost, no paid tiers

The owner does not want to pay for any API, database, or hosting service — not even a "starter"
paid tier, and not services that require a credit card on file even if the base usage is free.
Every tool chosen in this guide is selected specifically to respect that. Claude Code should not
suggest paid add-ons, "you'll eventually want to upgrade to..." nudges, or services requiring
billing info, without flagging it clearly as a paid option first.

Where genuinely free options have limitations (sleep/cold-starts, storage caps, rate limits),
state them honestly — that's a fine, normal thing to explain in a README, not something to hide.

---

## Project context

**Repo:** connectify — a real-time chat app.
**Current stack:** Node.js, Express, Socket.io, EJS (server-rendered views), Tailwind CSS.
**Current state:** no auth (anyone can type any username), no persistence (messages vanish on
restart), single global chat room, no tests, `.env` was previously committed (must stay out of
git going forward).
**Goal:** turn this from a tutorial-tier project into a portfolio piece with real backend depth,
without pretending it's bigger than it is. Every feature added should be one the owner can
confidently explain in an interview.

---

## Tech stack — what we're using and why (read this before writing code)

| Layer        | Choice                                  | What it is                                            | Why this one                                                                                                                                                                                                                   | Notable alternative                                                                                                                                                                                                              |
| ------------ | --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server       | Express                                 | Minimal Node web framework                            | Already in the project; unopinionated, huge ecosystem                                                                                                                                                                          | Fastify (faster, stricter, less common in tutorials — good to know exists)                                                                                                                                                       |
| Real-time    | Socket.io                               | WebSocket library with fallbacks + rooms API          | Already in project; rooms feature maps directly to our "channels" requirement                                                                                                                                                  | Raw `ws` library (lower-level, more control, more manual work)                                                                                                                                                                   |
| Views        | EJS                                     | Server-side templating                                | Already in project; simplest mental model (HTML + `<% %>` tags)                                                                                                                                                                | React/Vue SPA (more modern, but a much bigger rewrite — not worth it for this scope)                                                                                                                                             |
| Auth         | JWT **or** sessions (decide in Phase 1) | Identity + login state                                | Free either way — no external service needed, just libraries                                                                                                                                                                   | OAuth via Google/GitHub (free to use, but adds complexity before basics are solid)                                                                                                                                               |
| Database     | **MongoDB Atlas free tier (M0)**        | Persistent storage for messages/users                 | Permanently free (512MB, no credit card, no expiry) — see Phase 2 for why Mongo over Postgres here                                                                                                                             | Render's free Postgres now **auto-expires after 30 days**, so it's not a real fit for a portfolio project meant to stay up; self-hosted Postgres via Docker locally is also free but harder to keep running for a live demo link |
| File uploads | Multer                                  | Express middleware for handling `multipart/form-data` | Free, standard, no external service                                                                                                                                                                                            | Cloud upload to S3/Cloudinary (better for real scale, but needs a paid or metered account)                                                                                                                                       |
| Testing      | Jest + Supertest                        | Test runner + HTTP assertion library                  | Free, open source, most common Node testing combo                                                                                                                                                                              | Vitest (also free/open source, newer, less battle-tested in older Node projects)                                                                                                                                                 |
| Deployment   | **Render free web service**             | Free-tier app hosting                                 | No credit card required for the free "Hobby" tier; WebSocket-friendly. Known limitation: sleeps after 15 min of inactivity, ~30-60s cold start on first request after sleep — mention this in the README rather than hiding it | Railway (free tier now mostly credit-based, not a flat free allowance), Fly.io (legacy free allowance no longer offered to new signups), Vercel (poor fit for long-lived WebSocket servers)                                      |
| AI           | **Groq API (free tier)**                | Fast LLM inference, OpenAI-compatible                 | Free, fast, no credit card required for base limits                                                                                                                                                                            | Ollama (fully local/self-hosted/open source and free, but needs enough local RAM/CPU — good fallback if Groq's rate limits are ever a problem)                                                                                   |

**Note on "free" vs "open source":** a few of these (Groq, Atlas, Render) are free-to-use hosted
services, not open-source software you run yourself — worth knowing the distinction for
interviews. If the owner wants a fully open-source, self-hostable stack with zero reliance on
any third-party hosted service, the alternative combination is: **self-hosted MongoDB or
Postgres (Docker) + Ollama (local LLM) + self-hosted on your own machine or a free-tier VM**.
That trades convenience and a shareable live link for full control and zero external
dependencies — a valid choice, just a different one, and worth a one-line mention in the README
either way.

**Learning checkpoint:** before moving to Phase 1, be able to answer — _why is Socket.io a good
fit for a chat app instead of just using regular HTTP requests?_ (Hint: think about who has to
ask for new data vs. who can push it.)

---

## Phase 0 — Setup & repo cleanup (do this FIRST, before any feature work)

The repo currently has `.env` committed to git history. This must be fixed before anything else,
since committed secrets are the single fastest thing to erode credibility with anyone reviewing
this project.

**Steps, in order:**

1. Confirm `.gitignore` includes at least:

   ```
   .env
   node_modules/
   uploads/
   ```

   Add any that are missing.

2. Remove `.env` from git history (not just delete-and-commit, which leaves it recoverable in
   history). Use `git filter-repo` (preferred over the older BFG tool):

   ```bash
   pip install git-filter-repo --break-system-packages
   git filter-repo --path .env --invert-paths
   ```

   Then re-add the remote (filter-repo strips it as a safety measure) and force-push:

   ```bash
   git remote add origin https://github.com/Madhavkalia076/connectify.git
   git push origin main --force
   ```

   **Explain to the owner**: if any value in that `.env` was a real secret (not a placeholder),
   rewriting history doesn't undo prior exposure — it should be treated as compromised and
   rotated. If it was only placeholder/dummy values, this is a pure hygiene fix.

3. Create a `.env.example` (committed, safe placeholder values only):

   ```
   PORT=3000
   SESSION_SECRET=change_me
   MONGODB_URI=your_mongodb_atlas_connection_string
   GROQ_API_KEY=your_groq_api_key
   ```

4. Commit and push:

   ```bash
   git add .gitignore .env.example
   git commit -m "Add .env.example, ensure .env is gitignored"
   git push
   ```

5. Write (or rewrite) the README's top section with: what the project does, current tech stack,
   setup instructions referencing `.env.example`, and a placeholder "Live demo" link to fill in
   once Phase 2's deployment step is done.

**Checkpoint before moving to Phase 1:** confirm `git log -p -- .env` (or searching history)
shows no trace of the old `.env` contents, and that a fresh `git clone` of the repo does not
contain a `.env` file at all.

---

## Phase 1 — Core features

### 1. Authentication

**Two real options, pick one and understand the tradeoff:**

- **Sessions (cookie + server-side session store, e.g. `express-session` + `connect-mongo`)**
  - Pros: simpler mental model, easy to revoke a session (just delete it server-side), well-suited
    to a server-rendered EJS app like this one.
  - Cons: server has to store session state (doesn't scale horizontally without a shared store),
    slightly more moving parts (session store + cookie).
- **JWT (JSON Web Tokens, stateless)**
  - Pros: stateless (no server-side session storage needed), natural fit if you later add a
    mobile app or separate frontend/API.
  - Cons: harder to revoke a token before it expires, more footguns if not implemented carefully
    (where to store the token client-side, expiry handling, refresh tokens).

**Recommendation for this project:** sessions. This is a server-rendered EJS app, not an API
consumed by a separate frontend — sessions are the more natural fit and the more commonly
expected pattern for this architecture in interviews. JWT is worth knowing conceptually (you'll
be asked about it), but using it here would be solving a problem you don't have.

**What to build:**

- `bcrypt` for password hashing (never store plaintext passwords — explain _why_ bcrypt
  specifically, i.e. slow-by-design hashing to resist brute force).
- Signup/login routes and views.
- `express-session` middleware, session stored in MongoDB (ties in with Phase 1.2) or in-memory
  for now with a note that in-memory sessions don't survive a server restart or scale to multiple
  server instances.
- Protect chat routes/socket connections so only logged-in users can post.

**Manual test checklist:** can't access chat without logging in; wrong password rejected; two
different browsers can log in as two different users simultaneously.

---

### 2. Persistent chat history

**MongoDB vs Postgres — actually think about this one:**

- **MongoDB (NoSQL, document store)**
  - Pros: schema-flexible (easy to add fields to a message later), natural fit for JSON-like chat
    message objects, huge number of free-tier hosting options (MongoDB Atlas).
  - Cons: weaker at relational queries (e.g. "all messages where user is in these 3 rooms AND
    friends with X") — not a problem at this scale, but worth knowing the limitation exists.
- **Postgres (SQL, relational)**
  - Pros: enforces schema (catches bugs earlier), better for relational data (users, rooms,
    messages, friendships all relate to each other), a more universally expected skill in backend
    interviews.
  - Cons: more upfront schema design work, migrations needed when the schema changes.

**Recommendation:** MongoDB via **MongoDB Atlas's free M0 tier** — chat messages are naturally
document-shaped, it pairs well with `connect-mongo` for session storage from Phase 1 (one less
moving part), and unlike Render's free Postgres, Atlas's free tier doesn't expire after 30 days.
Explicitly note in the README that Postgres was considered and why Mongo won _for this use case
and this budget_ — that reasoning itself is a good interview answer.

**Fully open-source alternative:** if avoiding any hosted service entirely is preferred, run
MongoDB (or Postgres) locally via Docker (`docker run -p 27017:27017 mongo`) for development —
free, open source, fully self-contained, but only reachable while your own machine is running, so
not suitable for a public demo link without your own always-on server.

**What to build:**

- A `Message` schema (Mongoose): `{ username, roomId, text, createdAt }`.
- A `User` schema: `{ username, passwordHash, createdAt }`.
- On page load, fetch and render the last N messages for the room instead of starting empty.
- On new message, save to DB _and_ emit via Socket.io (both, not one or the other — explain why:
  the DB write means it survives; the emit means everyone sees it live).

**Learning checkpoint:** explain the difference between "the message is in the database" and
"the message was broadcast via Socket.io" — why do you need both?

---

### 3. Rooms/channels

**What to build:**

- Socket.io **rooms** (not namespaces — explain the difference: namespaces are more like separate
  communication channels at the connection level, rooms are lightweight groupings within a
  namespace; rooms are the right tool here).
- A room-selection UI (list of rooms, or create-a-room form).
- `socket.join(roomId)` on entering a room, message broadcasts scoped to `io.to(roomId).emit(...)`.
- Update the `Message` schema/queries to filter by `roomId`.
- **Room deletion, owner-only.** Only the user who created a room (`Room.createdBy`) can delete
  it — this is an authorization check, not just an authentication check (authentication asks "who
  are you," authorization asks "are you allowed to do *this specific thing*"). Deleting a room
  should also clean up its messages (`Message.deleteMany({ roomId })`), otherwise they become
  orphaned data nobody can ever see again but that still sits in the database forever. Explain the
  difference between a soft delete (mark as deleted, keep the data) and a hard delete (actually
  remove it) — a hard delete is fine here given the scope, but worth knowing the distinction and
  why production systems often prefer soft deletes for anything a user might want "undo" on.

**Learning checkpoint:** what would happen if you used `io.emit()` instead of `io.to(roomId).emit()`?
Also: what's the difference between checking "is this user logged in" (authentication) and
checking "is this user allowed to delete *this* room" (authorization) — where in the delete route
does each check happen, and what happens if you only implement one of them?

**Join approval (owner's choice per room).** Raised by the owner as a real feature, not deferred —
built alongside the rest of room/channel work. The room creator chooses "open" vs
"approval-required" at creation time (a checkbox), closer to Slack's public/private channel model
than a single global rule. `Room` gained `requiresApproval`, `members`, and `pendingRequests`
fields; open rooms (including the auto-seeded `general`) ignore all of it and behave exactly as
before. For approval-required rooms: a non-member sees a "Request to Join" screen, a pending
requester sees a "waiting for approval" screen, and the owner sees an approve/reject panel inline
on the room's chat page. Enforced in two places — the `GET /chat/:roomId` route (so the chat UI
itself is never reachable without membership) and the Socket.io `joinroom` handler (so a raw socket
connection can't bypass the page-level check) — same defense-in-depth reasoning as the auth check.

**Leave room.** Only meaningful for approval-required rooms, since open rooms never track
membership in the first place — there's nothing persistent to leave. A non-owner member can leave
via a button in the header, which removes them from `Room.members`; they'd need to request access
again (and be re-approved) to rejoin. The owner cannot leave their own room through this route —
ownership and membership are tied together here, and "the owner leaves" raises a question (who
owns it now?) this feature deliberately doesn't try to answer; deleting the room is the owner's
equivalent action instead.

**Message deletion (for me / for everyone).** WhatsApp-style, raised by the owner as a real
feature. `Message` gained `deletedForEveryone` (Boolean) and `deletedFor` (array of usernames who
hid it for themselves). "Delete for everyone" is sender-only (same authorization pattern as room
deletion/approval) and is a soft delete — the row stays in the database, marked, and rendered as
"This message was deleted" for everyone from then on; broadcast live over Socket.io so it updates
instantly for anyone already viewing the room, not just on next reload. "Delete for me" has no
authorization check beyond being logged in (anyone can hide any message from their own view only)
and is purely local — no broadcast, since it can never affect what anyone else sees. Message
history fetches now carry the message's own `_id` through to the client (in both the server-render
and the live Socket.io broadcast) so the UI has something stable to target for later deletion.

---

### 4. Typing indicators + presence

**What to build:**

- Client emits a `typing` event on keypress (debounced!), server relays to the room, hide after
  ~2s of inactivity.
- Track online users per room in memory (a `Map` of `roomId -> Set of usernames`), update on
  `connection`/`disconnect`.
- Explain the tradeoff: in-memory presence is simple but resets on server restart and won't work
  correctly if you ever scale to multiple server instances (would need Redis pub/sub) — fine to
  note as a "future improvement," not a blocker now.

---

### 5. File/image sharing

**What to build:**

- `multer` middleware for handling uploads, storing to a local `/uploads` folder for now (note:
  in real production this should go to S3/Cloudinary since server disk storage doesn't survive
  redeploys on most free hosts — say this honestly in the README as a known limitation).
- Basic file type/size validation (images only, size cap) — this is also a security point worth
  understanding: unrestricted file upload is a classic vulnerability.

---

### 6. UI polish & responsiveness

**Decision (revisited from the tech stack table above): stay with EJS, do not switch to React.**
The original tech-stack table already weighed this — "React/Vue SPA (more modern, but a much
bigger rewrite — not worth it for this scope)" — and that reasoning still holds now that auth,
sessions, and Socket.io are already wired directly into the EJS routes/views. Rewriting to React
would mean reworking how session/auth state reaches the client, how Socket.io connects, adding
client-side routing, and adding build tooling (e.g. Vite) — a genuinely separate project, not a
UI tweak. Explicitly logged here as a considered-and-declined alternative, not an oversight: if a
fully separate React frontend is wanted later as a portfolio/learning exercise in its own right,
that's a valid **Phase 4 (optional, stretch)**, tackled only after Phases 1–3 are solid — not a
substitute for finishing them.

**What to build (staying in EJS + Tailwind):**

- Audit spacing/layout consistency across `index.ejs`, `login.ejs`, `signup.ejs`, `chat.ejs` —
  right now each view was styled ad hoc as it was built.
- Mobile responsiveness: chat/video-call layout in particular was built assuming a desktop
  viewport (fixed pixel widths on the video "smallFrame" overlay, side-by-side controls) — test
  and fix at common breakpoints (Tailwind's `sm:`/`md:` prefixes).
- Consistent form styling (signup/login forms currently duplicate the same input classes inline —
  worth a shared partial or a small set of reusable Tailwind component classes via `@apply`).
- Loading/empty/error states that actually look intentional (e.g. the "nobody here" waiting state,
  form error messages) rather than default browser styling.
- Explain the tradeoff of `@apply`-based reusable classes vs. repeating utility classes inline —
  Tailwind's own docs lean towards accepting repetition for simple cases, only reaching for
  `@apply` when a pattern repeats often enough to be worth naming.

**What was actually built (going further than the original scope above, on the owner's explicit
request — "WhatsApp and Discord are the competition"):**

- **Dark + light theme, with a manual toggle.** `tailwind.config.js` uses the `"class"` dark-mode
  strategy (not the OS-only `prefers-color-scheme` media query), so a sun/moon button can switch
  it. A blocking inline script in `partials/head.ejs` applies the saved theme (or falls back to the
  OS preference) *before* the page paints, avoiding a flash of the wrong theme on load.
- **Persistent sidebar layout**, replacing the old separate room-list page. `partials/sidebar.ejs`
  is included on `/chat`, `/chat/:roomId`, and the room-access ("request to join") page, so the
  room list, search, and user controls are always visible — closer to Discord/WhatsApp's actual
  feel. No SPA framework needed: it's a shared EJS partial included at the top of each page's body.
- **Room search** — client-side filtering of the already-rendered sidebar room list, no server
  round-trip (the room list is small; a search API would be solving a problem that doesn't exist
  yet).
- **Room Info panel**: room image (owner can click to change, reusing the same `multer` upload
  pattern from message images), an editable description (owner-only), and a participants list.
  Participants mean different things depending on room type — approval-required rooms show the
  full member list with a live online/offline dot; open rooms (no tracked membership) show only
  who's currently connected, since that's the only honest answer available for them.
- **Pending join requests moved out of the chat view** into a bell icon (badge shows the count)
  that opens a modal — keeps the chat itself uncluttered, per the owner's explicit preference over
  the original inline banner.
- **Live unread-message badges** on room names in the sidebar (WhatsApp-style) — the one piece of
  this pass with real architectural weight. One shared Socket.io connection now lives app-wide
  (created in `partials/sidebar.ejs`, reused by `chat.ejs` via `window.__socket`) instead of a
  fresh one per page, and "watches" every room the user can see — not just whichever one is
  currently open — so a badge can update the instant a message arrives elsewhere, no reload
  needed. `User` gained a `lastRead` map (room name → timestamp), updated whenever a room is
  actually opened; unread count per room is just "messages from other people newer than that."
  Watching (for badges) is kept deliberately separate from the existing presence-tracked join (for
  the "Online: ..." bar) — a new `watchRoom` socket event joins the broadcast channel without
  marking the user present, so sitting on the room list doesn't make you falsely appear online
  everywhere. Unread counts are only computed for rooms the user can actually read — an
  approval-required room they were never approved for still shows in the sidebar (so they can
  request access) but deliberately shows no badge, since a count would leak "this private room has
  activity" to someone not allowed to see why.

  **A real regression this surfaced and fixed**: making one socket listen to every room means it
  now receives *everything* room-scoped for every room it watches — typing indicators, presence
  updates, and video-call signaling included, not just chat messages. Every one of those payloads
  had to start carrying which room it belongs to, and every client-side handler had to start
  checking "is this actually the room I'm looking at?" before acting on it. Without that fix, a
  video call started in one room could have popped the incoming-call modal on a completely
  different room's page. Caught and fixed before shipping, not after — worth remembering as a
  concrete example of how a seemingly-contained feature (a notification badge) can ripple into
  parts of the app that look unrelated at first glance.
- **1:1 direct messages by username (Instagram-style)** — built after the room-level features
  above, as planned. A DM thread reuses almost all of the room chat infrastructure rather than
  duplicating it: a DM's `roomId` is derived, not stored (`"dm:" + [usernameA, usernameB].sort()`),
  so messages, typing, presence, unread badges, image sharing, and video calling all work
  unchanged — they only ever operate on "a roomId two people are grouped into," and never cared
  whether that string was a real room name. A small `Conversation` model exists purely so a thread
  can be listed and opened before either person has sent a first message. Starting a new DM is a
  live username search (debounced `fetch` against `GET /dm/search`) from a sidebar button, closer
  to Instagram's flow than the plain-form pattern used for creating rooms.

  Two real bugs were caught and fixed during this pass, both worth remembering:
  - **DM online/offline status was a page-load snapshot, never live-updated** — if the other
    person connected *after* your page loaded (an ordinary thing to happen), you'd see "Offline"
    for someone actually online, with nothing to ever correct it. Fixed by listening to the same
    `presence` socket event room chat already broadcasts, filtered to the DM's `roomId`.
  - **The sidebar's mobile hamburger button never actually worked.** `partials/sidebar.ejs`'s
    script runs *before* `#sidebar-open` exists in the DOM (that button lives in
    `chat.ejs`/`dm.ejs`'s own markup, rendered later in the same page), so a direct
    `document.getElementById('sidebar-open')` always returned `null` — silently, because the code
    used `?.` on the listener attachment. Fixed with event delegation on `document` instead,
    which doesn't care when the target element actually appears in the DOM. Caught by the owner
    testing on a narrow/mobile-width window, since desktop testing never exercises the
    mobile-only hamburger at all.

**Video call UX polish**, raised by the owner after using the app for real: the caller had no
feedback that a call was ringing (leading to repeated clicks re-broadcasting the invite), the
callee had no audible ringtone, there was no way to cancel an outstanding call, the hangup icon
looked poor, and — the actual bug underneath all of it — the full-screen video overlay didn't
actually cover the sidebar. Fixed together:
- **Caller-side "Calling..." overlay** with a Cancel button, guarding the video-call button against
  repeated clicks while a call is already ringing or connected. A new `cancelCall` → `callCancelled`
  socket event pair lets the caller back out cleanly, auto-dismissing the callee's incoming-call
  popup (and ringtone) instead of leaving it hanging with no signal.
- **Synthesized ringtone** via the Web Audio API (a repeating two-tone beep) instead of an audio
  file — no asset to source, host, or license.
- **Standard "hang up" icon** — a phone-handset glyph rotated 135°, the same visual convention
  WhatsApp/Zoom/Meet/Material Design all use, replacing the previous custom icon.
- **WhatsApp-style minimize**: the call can shrink to a small floating box in the corner (camera/mic
  toggles hidden at that size, just hangup + click-to-restore) instead of only ever being
  full-screen or fully hidden, so a call can keep running while browsing the rest of the app.
- **The actual full-screen bug**: the video overlay (and the incoming/outgoing call modals) were
  nested inside the main content pane's flex layout instead of being direct children of `<body>`.
  Moved them out — a general lesson worth remembering: full-viewport overlay elements should sit at
  the top of the DOM, not nested inside a page's own layout containers, to avoid any chance of a
  sibling's CSS interfering with their coverage.

**Profile system**, the owner's other explicit request: mandatory setup after signup (display name,
bio/status, profile picture), a public profile view for any user, and an edit page for updating it
later. `User` gained `displayName`, `bio`, `profilePicture`, and a `profileComplete` flag; a new
`requireProfile` middleware (checked from the session, not a database hit per request) redirects to
`/profile/setup` until that flag is set, applied to every real chat/DM entry point. Profile links
are now clickable from the sidebar's own-user footer, a DM's header, and each name in a room's
participants list. Explicitly **not** built: allowing `username` itself to change — it's used as a
raw string reference throughout the schema (DM `roomId`s are *derived* from it, room membership
arrays store it directly, every message references it), so `displayName` is deliberately the one
mutable "who you are" field, keeping `username` acting like a stable primary key. Also noted as a
real gap, not yet fixed: the "New Message" search only matches `username`, not `displayName` — a
person who only knows someone's display name currently can't find them that way.

**Video call reliability + a real live-messaging bug, raised by the owner after cross-network
testing** (phone on mobile data, connecting to the laptop-hosted server via port forwarding — but
the messaging bug turned out to affect the laptop too, not just the phone):

- **TURN server added for cross-network video calls.** The existing WebRTC setup only configured a
  STUN server (`stun:stun.l.google.com:19302`), which is enough to discover a device's public
  IP:port but doesn't guarantee two devices can actually open a direct connection to each other —
  especially common for phones on carrier-grade mobile NAT. Added a free TURN relay
  (metered.ca free tier, ~50GB/month, no credit card) as a fallback: when a direct peer-to-peer
  path isn't possible, both sides connect outward to the TURN server instead, which relays the
  (still end-to-end-encrypted, via SRTP) media between them. This is automatic, built into how ICE
  already works — `iceTransportPolicy` was never set to `"relay"`, so TURN was always just one
  more candidate type tried alongside STUN/host candidates, never a forced detour.
- **Credentials moved out of the rendered page.** The first pass embedded the TURN
  username/credential directly into `chat.ejs`/`dm.ejs`'s server-rendered `<script>` block —
  functional, but visible to anyone logged in who right-clicked "View Page Source." Reworked into
  `routes/webrtcroute.js`, a `GET /webrtc/ice-servers` endpoint (behind `requireAuth`) that the
  client now `fetch()`s only when a call is actually about to start, instead of on every page
  load. Honestly stated limitation: this isn't real secrecy — a technically sophisticated user can
  still see the response in devtools' Network tab — but it raises the bar meaningfully (requires
  actively inspecting network traffic while authenticated, versus reading static HTML) and is
  reasonable for a free-tier portfolio project. The stronger fix, short-lived per-call credentials
  minted via Metered's TURN REST API (so a captured credential expires in minutes), was named as a
  real next step but not built — more moving parts than this project's scope currently calls for.
- **A genuine bug: live chat messages silently stopped arriving until a manual page reload**, and
  it wasn't phone-specific. Root cause: `socket.emit("joinroom", ...)` (the active room) and
  `socket.emit("watchRoom", ...)` (every other room, for sidebar badges) were only ever emitted
  once, synchronously, when each page's script first ran. Socket.io's client reconnects
  automatically after *any* network interruption — a phone locking its screen, switching between
  WiFi and cellular, a laptop waking from sleep, even a brief WiFi hiccup — but a fresh reconnect
  gets a new server-side socket with zero room memberships. Nothing was re-running the join/watch
  calls after that reconnect, so the socket looked "connected" in the browser while silently
  receiving nothing server-side, until a full page reload re-ran the script from scratch. Fixed in
  `partials/sidebar.ejs`, `chat.ejs`, and `dm.ejs` by wrapping each of those emits in a named
  function bound to Socket.io's `"connect"` event (which fires on the *first* connection too, so
  one code path covers both cases) instead of running once inline.

---

## Phase 2 — Seniority signals

### 7. Input validation + rate limiting

- `express-validator` or manual checks on all form/API inputs (never trust client input).
- `express-rate-limit` on auth routes especially (prevents brute-force login attempts) and on
  chat message posting (prevents spam).

**What was actually built:**

- **`routes/authroute.js`**: `express-validator` chains on both `POST /signup` and `POST /login`.
  Signup enforces username length (3-20 chars) and an alphanumeric-plus-underscore character set —
  the character restriction isn't arbitrary tidiness, it directly protects the DM feature: a DM's
  `roomId` is built as `"dm:" + sortedUsernames.join(":")` (`lib/dm.js`) and parsed back apart the
  same way, so a colon in a username would silently corrupt that parsing. Signup also enforces an
  8-character password minimum. Login deliberately only checks that both fields are non-empty, not
  format — tightening the signup rules later must never lock an already-registered account out just
  because it predates the newer rule.
- **`express-rate-limit`**, applied per-route: `loginLimiter` (10 attempts / 15 min) is stricter
  than `signupLimiter` (20 accounts / hour), since login is specifically the brute-force-password
  target. Both are keyed by IP (the library's default) — a real, honestly-stated limitation: users
  behind a shared/corporate IP share one budget, and an attacker rotating IPs isn't slowed at all.
  Verified via curl: 12 rapid bad logins returned `200` for the first 9 and `429 Too Many Requests`
  from the 10th onward.
- **Socket.io chat messages — the part `express-rate-limit` can't reach.** `express-rate-limit` only
  wraps Express HTTP middleware; it has no hook into WebSocket events. `app.js`'s `message` handler
  gets a small hand-rolled equivalent instead: `messageTimestamps` (a `Map<username, timestamp[]>`)
  tracks each user's last-10-seconds of sends, and any message beyond 10 in that window is silently
  dropped (no error emitted back — a legitimate user never approaches 10 messages/10s in normal
  typing, so the only realistic trigger is a script or bug, which doesn't need a friendly message).
  Same honestly-stated limitation as the existing presence Map: in-memory, resets on restart, and
  wouldn't be correct across multiple server instances without something like Redis.
- **Message length cap**: `models/Message.js`'s `text` field gained `maxlength: 2000` at the schema
  level, *and* the socket handler checks `data.text.length` before ever calling `Message.create()` —
  belt-and-suspenders, since the socket-side check avoids a wasted database round-trip for an
  obviously-oversized payload, while the schema-level cap is the actual source of truth.
- **Profile display-name length**: `routes/profileroute.js`'s setup/edit routes gained an explicit
  `displayName.length > 30` check. This wasn't just adding a nicety — without it, a name over 30
  chars would hit `User.displayName`'s existing `maxlength: 30` schema rule only at `.save()` time,
  throwing a `ValidationError` inside an un-awaited multer callback that nothing catches, i.e. a
  silent crash instead of a friendly re-rendered form error. (This exact class of bug — an
  unhandled rejection inside a callback Express never sees — is precisely what Phase 2 item 8,
  centralized error handling, is aimed at next.)

**Learning checkpoint:** why does `express-rate-limit` need a completely separate, hand-rolled
solution for chat messages instead of just being wired into the Socket.io connection somehow? (Hint:
what is `express-rate-limit` actually middleware *for* — what does it wrap, and does a WebSocket
event ever pass through that thing?) Also: what's the actual failure mode being closed by checking
`displayName.length > 30` in the route instead of just trusting the schema's `maxlength` to catch it?

### 8. Centralized error handling

- One Express error-handling middleware (`(err, req, res, next) => {...}`) instead of scattered
  try/catch with inconsistent responses. Explain Express's special 4-arg middleware signature.

**What was actually built:**

- **`middleware/errorHandler.js`**: the single 4-arg error-handling middleware, mounted last in
  `app.js` (after every route and the new 404 handler). Logs the full error server-side via
  `console.error`, then decides the response: routes whose URL contains `/upload`, or that sent
  `Accept: application/json`, or are XHR requests get a JSON `{ error: ... }` body (since their
  client-side `fetch()` code has no way to render an HTML page); everything else gets a rendered
  `views/error.ejs` page. A 500's message to the client is always the generic "something went
  wrong" — the real error (which might contain a stack trace or a raw database error string) only
  ever goes to the server log, never the response. A 4xx's `err.message` is passed through as-is,
  since those are already written to be user-facing (e.g. "Page not found.").
- **`middleware/catchAsync.js`**: a small wrapper, `fn => (req, res, next) => fn(req, res, next).catch(next)`.
  This project is on Express 4 (confirmed via `node_modules/express/package.json`), which — unlike
  Express 5 — does **not** automatically catch a rejected Promise thrown inside an `async (req, res) => {}`
  route handler. Without this wrapper, an `await User.findOne(...)` that rejects becomes an
  unhandled promise rejection that Express never sees, the request just hangs, and the error
  handler above never runs. Every plain `async` route handler across `routes/authroute.js`,
  `routes/chatroute.js`, `routes/dmroute.js`, `routes/messageroute.js`, and `routes/profileroute.js`
  now gets wrapped in `catchAsync(...)`.
- **The multer-upload routes needed a different fix**, not `catchAsync` — their outer function
  (`function (req, res, next) { upload.single('image')(req, res, async function (err) {...}) }`)
  isn't itself the thing Express calls with `next` in a way `catchAsync` can hook into; the async
  logic lives *inside* multer's own callback, one layer deeper. Each of those callbacks
  (`chatroute.js`'s `/settings` and `/upload`, `dmroute.js`'s `/:username/upload`,
  `profileroute.js`'s `/profile/setup` and `/profile/edit`) got a manual `try { ... } catch (err2) { next(err2); }`
  wrapped around its body instead, with the outer route handler gaining a `next` parameter to pass
  through. Same end result (errors reach the centralized handler), different mechanism, because the
  code shape is different.
- **`app.js`** gained a `notFound` middleware (constructs a 404 `Error` and calls `next(err)`)
  mounted directly after all the routers, so any URL that doesn't match a route falls through into
  the same centralized handler and gets the same styled error page as any other error, instead of
  Express's default plain-text "Cannot GET /whatever".
- **`views/error.ejs`**: a small page reusing the same header/theme-toggle/card layout as
  `login.ejs`/`signup.ejs`, showing the status code and message with a link back home.
- **A real bug this caught (not hypothetical)**: `routes/profileroute.js`'s `/profile/setup` handler
  did `const user = await User.findOne(...); user.displayName = ...` with no null check and no
  try/catch — if that lookup ever returned `null` (a deleted account mid-session, for instance),
  `user.displayName = ...` would throw a `TypeError` that, before this phase, vanished as a silent
  unhandled rejection. It's now inside the `try/catch` added above, so it correctly reaches the
  error page instead of hanging the request. Verified the whole wiring end-to-end by sending a
  deliberately malformed JSON body (`{bad json`) at `/login` — Express's own `express.json()`
  body-parser throws a `SyntaxError` synchronously, which Express forwards to `next(err)` on its
  own (this part *does* work the same in Express 4 — the async-handler gap is specifically about
  rejected Promises, not synchronous throws), and the response came back as the styled 400 error
  page with the raw parse error logged server-side but never shown to the client.

**Learning checkpoint:** why does an `async` route handler need a wrapper like `catchAsync` to get
its errors to the centralized handler, when a synchronous `throw` (or a synchronous library error,
like the JSON body-parser's) reaches it automatically? (Hint: `next(err)` is just a normal function
call Express can catch a synchronous throw around — can it do the same thing to an error that
arrives *later*, asynchronously, after the function has already returned?) Also: why does a 500
error's message get replaced with a generic string before it's sent to the client, while a 404's
message is sent through unchanged?

### 9. Tests

- 5-10 tests with Jest + Supertest covering: signup/login flow, message persistence, basic route
  responses. Explain what a test actually verifies vs. what it doesn't (tests aren't proof of
  correctness, they're proof that specific behaviors didn't regress).

**What was actually built:**

- **12 tests** across three files under `tests/`: `auth.test.js` (7 — signup validation rejections,
  a full signup-then-verify-in-DB flow, duplicate-username rejection, wrong-password rejection,
  correct-login-sets-a-session-cookie), `messages.test.js` (2 — a model-layer save/read-back check,
  and a full route+view check that a logged-in user visiting a room actually sees a message that's
  in the database), `routes.test.js` (3 — homepage loads, an unauthenticated visit to `/chat`
  redirects to `/login`, an unknown URL 404s through the centralized error handler built in item 8).
  Slightly over the "5-10" guideline, kept anyway since each test exercises a genuinely distinct
  layer rather than padding the count.
- **Database choice: the real MongoDB Atlas instance**, not an in-memory database — explicitly
  decided over `mongodb-memory-server` (which would isolate tests from the network entirely but
  downloads its own native `mongod` binary and adds a new moving part on a machine that had real
  fragility earlier this session with local tooling changes, the nvm incident). Same tradeoff
  named honestly either way: this choice means tests need network access and are subject to the
  same occasional Atlas TLS flakiness the dev server sometimes hits, in exchange for reusing
  exactly the setup/teardown pattern (create test data with a distinctive prefix, assert, delete by
  that prefix) already used for manual curl testing throughout this project — no new pattern to
  learn, no new dependency.
- **`app.js` gained a `require.main === module` guard** around `server.listen(...)`, plus
  `module.exports = app`. This is the standard Node "is this file being run directly, or required
  by something else" check — `require.main` is the module Node started with; comparing it to `module`
  (this file's own module object) is only ever true when `node app.js` was run directly, not when
  `require('../app')` pulls it in from a test. Without this, requiring `app.js` from a test would
  also bind to port 3000, immediately colliding with the real dev server already running there.
  Supertest doesn't need the port bound anyway — passed an Express `app` (not a listening server),
  it starts its own ephemeral listener internally per test file.
- **Two separate MongoDB connections needed explicit teardown**, not one — a real gotcha hit while
  getting this working: Mongoose's own connection (`mongoose.connection.close()`) is completely
  independent from the session store's connection (`connect-mongo` manages its own `MongoClient`).
  Closing only one left Jest hanging after tests finished ("Jest did not exit one second after the
  test run..."). `app.js` now exposes the store via `app.set('sessionStore', sessionStore)` (same
  pattern already used for `io` and `getOnlineUsers`) so tests can close it too.
- **A genuine race condition caught while fixing that**: `connect-mongo` kicks off a background
  "create the sessions TTL index" operation the moment the store is constructed, tracked internally
  by a promise (`sessionStore.collectionP`). A test file with only a few fast, session-free
  requests (`routes.test.js`) could finish and call `.close()` *before* that background index
  creation had completed, throwing `MongoExpiredSessionError: Cannot use a session that has ended`
  — the in-flight operation lost its connection mid-request. Fixed by `await`ing `collectionP`
  before calling `.close()`, guaranteeing any pending setup work is done first.
- **Test script**: `"test": "jest --runInBand"` in `package.json`. `--runInBand` runs test files one
  at a time in the same process rather than Jest's default of spreading them across several worker
  processes — chosen deliberately here to keep concurrent connections to the shared Atlas database
  low and predictable while debugging, at the cost of the whole suite running a bit slower than it
  would in parallel (not a real cost yet, at 12 tests).

**Learning checkpoint:** what's the actual difference between the model-layer message test and the
route-layer message test in `messages.test.js` — what could be broken that the model-layer test
would still pass, and vice versa? Also: why does `require.main === module` specifically distinguish
"this file was run directly" from "this file was required by something else," and what would break
in the test suite without that guard?

### 10. Deployment

- Deploy to Render or Railway free tier. Environment variables set via the host's dashboard, not
  committed. Live link goes in the README.

**What was actually built:**

- **Deployed to Render's free "Hobby" web service tier**, live at
  `https://connectify-kola.onrender.com`. Build command:
  `npm install && npx tailwindcss -i ./public/css/tailwind.css -o ./public/css/style.css` — the
  Tailwind rebuild step is necessary because Render runs the build command once per deploy rather
  than the continuous `--watch` used in local dev, so without it the deployed CSS could silently
  drift out of sync with whatever's actually committed. Start command: `npm start` (the
  `"start": "node app.js"` script added in the testing work, since `app.js` now guards
  `server.listen()` behind a `require.main === module` check).
- **Connected via "Public Git Repository" (a pasted GitHub URL), not the GitHub App integration**
  — the OAuth-based GitHub connection flow didn't complete successfully on first attempt, so the
  simpler URL-based method was used instead, which works fine since the repo is public. The real
  tradeoff, worth remembering: this method doesn't install a webhook, so Render won't auto-deploy
  on every `git push` the way the GitHub-connected method would. Future deploys need a manual
  "Manual Deploy → Deploy latest commit" click in Render's dashboard. Reconnecting via GitHub
  properly later (to restore auto-deploy) remains an option without needing to recreate the
  service.
- **MongoDB Atlas Network Access opened to `0.0.0.0/0`** ("allow access from anywhere") — Render's
  free tier doesn't provide a fixed outbound IP to whitelist individually, so the connection is
  secured by the username/password in `MONGODB_URI` alone rather than by IP restriction. This is
  the standard, expected approach for this exact situation, not a security shortcut.
- **Environment variables set directly in Render's dashboard** (`MONGODB_URI`, `SESSION_SECRET`,
  `TURN_USERNAME`, `TURN_CREDENTIAL`) — never committed. `PORT` deliberately left unset, since
  Render assigns it automatically and `app.js` already reads `process.env.PORT`.
- **Verified end-to-end against the live deployment**, not just "it loaded": a real signup, a
  session cookie surviving to a protected route, and a login, all executed via curl against
  `https://connectify-kola.onrender.com`, confirming the deployed instance can actually reach
  MongoDB Atlas and not just serve static pages.
- **`README.md` written** (Phase 0 called for this early on, but it was never actually created —
  filled in now that there's a real live link to put in it) — feature list, tech stack table, the
  same honestly-stated known limitations from this document (Render free-tier sleep/cold-start,
  ephemeral `uploads/` storage, in-memory presence/rate-limiting, TURN credential exposure), and
  local setup/testing instructions.

**Learning checkpoint:** why does Render need its own separate Tailwind build step instead of just
using whatever's already committed in `public/css/style.css`? Also: what's the actual functional
difference between connecting a repo via GitHub's App integration versus pasting a public repo
URL — what does the GitHub-connected method get you that this one doesn't?

---

## Phase 3 — AI layer (scaffolded separately, integrate after Phase 1 & 2 are solid)

Already scaffolded with Groq (`lib/groq.js`, `routes/ai.js`, `public/js/ai-features.js` — see
`INTEGRATION.md` from the earlier session). **Decision: sticking with Groq's free tier** — no
payment required, fast, and it works from the deployed Render instance too (unlike Ollama, which
needs local compute and generally can't run on a free hosting tier). Worth noting honestly in the
README that Groq is a free hosted third-party API, not self-hosted open-source software, and that
its free tier is rate-limited (the rate limiter already built into `routes/ai.js` helps avoid
hitting that ceiling accidentally). Wire this in last, once auth/persistence/rooms exist —
summarizing an empty demo chat isn't a compelling story.

---

## Phase 4 — Optional stretch: React frontend (only after Phases 1–3 are solid)

Not committed to yet — logged here as a considered future option, raised when discussing Phase
1.6's UI polish. If pursued, this would be a genuinely separate project layered on top of the
existing Express backend, not a replacement of it:

- Express stays as the API + Socket.io server (routes return JSON instead of rendering EJS).
- A new React app (Vite) becomes the client, calling those APIs and connecting to Socket.io
  directly from the browser.
- Session-based auth would need rethinking for a decoupled frontend — cookies can still work
  cross-origin with the right CORS/`credentials` config, but this is exactly the scenario
  described in the Phase 1 auth tradeoff table where JWT starts looking more natural. Worth
  revisiting that decision explicitly if this phase is ever started, not assuming sessions still
  fit unchanged.
- Purely a learning/portfolio-breadth exercise (demonstrates SPA skills alongside server-rendered
  skills) — do not start this while Phases 1–3 are incomplete, and do not treat it as required.

---

## Backlog — ideas to revisit later, not committed to yet

Things raised in passing that are worth doing eventually but shouldn't derail whatever phase is
currently in progress. Revisit this list once the numbered phases above are further along —
explicitly flagged by the owner as "add this at the very end," not now.

- **Display name, separate from login username.** Right now the `username` used to log in is also
  the name everyone sees in chat. A "display name" set once at signup (or editable later) would
  let people be known by a friendlier name in conversation while `username` stays the stable,
  unique identifier used for login/auth. Small schema change (`User.displayName`, optional,
  falling back to `username` if never set) and a small UI change (an extra field on signup, and
  swap every place the chat currently shows `req.session.username` for a display name instead).
  Explicitly deferred — only build this once the rest of the roadmap feels solid, and only if it
  still seems worth it at that point.

---

## Ground rules for Claude Code while implementing

- Never commit `.env`. Always double check `.gitignore` includes it.
- Comment code to teach, especially anything non-obvious (middleware ordering, async/await
  gotchas, Mongoose schema quirks).
- After each numbered feature, stop and give: (1) a plain-English recap of what was built, (2) a
  manual test checklist, (3) one or two "why did we do it this way" questions the owner should be
  able to answer before moving on.
- If a chosen approach has a real limitation (in-memory presence, local file storage, etc.), state
  it explicitly rather than glossing over it — these limitations are good, honest talking points
  for interviews, not embarrassments to hide.
