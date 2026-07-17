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

**Learning checkpoint:** what would happen if you used `io.emit()` instead of `io.to(roomId).emit()`?

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

---

## Phase 2 — Seniority signals

### 7. Input validation + rate limiting

- `express-validator` or manual checks on all form/API inputs (never trust client input).
- `express-rate-limit` on auth routes especially (prevents brute-force login attempts) and on
  chat message posting (prevents spam).

### 8. Centralized error handling

- One Express error-handling middleware (`(err, req, res, next) => {...}`) instead of scattered
  try/catch with inconsistent responses. Explain Express's special 4-arg middleware signature.

### 9. Tests

- 5-10 tests with Jest + Supertest covering: signup/login flow, message persistence, basic route
  responses. Explain what a test actually verifies vs. what it doesn't (tests aren't proof of
  correctness, they're proof that specific behaviors didn't regress).

### 10. Deployment

- Deploy to Render or Railway free tier. Environment variables set via the host's dashboard, not
  committed. Live link goes in the README.

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
