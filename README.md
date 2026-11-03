# Campus Lost and Found Portal

A full-stack web application where students report lost items, list items they have
found, search the campus catalogue, submit claims, and track recovery — with an
administrator dashboard for moderation, claims and statistics.

Built for the **Web Technology and Internet Programming** individual project,
Sai University, School of Computing and Data Science (20 marks, deadline 30 November 2026).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6 modules, Fetch API, async/await |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL (Supabase) via Sequelize ORM |
| Auth | JWT bearer tokens, bcrypt password hashing |
| API testing | Postman collection included (42 requests) |
| Deployment | Render (single web service serving API and frontend) |

Everything is served from one process: Express exposes `/api/*` and also serves the
static frontend from `public/`. One deploy, no CORS problems, no second host.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and JWT_SECRET
npm run db:sync               # or run database/schema.sql in Supabase
npm run seed                  # 16 sample items, 3 users, claims and matches
npm start                     # http://localhost:3000
```

Run the automated tests (no database server needed — they use an in-memory Postgres):

```bash
npm test
```

**Demo accounts created by the seed script** (change the passwords in `.env` if you
like; they are read from `SEED_ADMIN_PASSWORD` and `SEED_USER_PASSWORD`):

| Role | Email | Password |
|---|---|---|
| Administrator | `sivaharsha.s-29@scds.saiuniversity.edu.in` | `Admin@12345` |
| Student | `demo.student@saiuniversity.edu` | `Student@12345` |
| Student | `priya@saiuniversity.edu` | `Student@12345` |

The first account registered on a fresh database automatically becomes the
administrator, so a new deployment bootstraps without touching the database.

---

## Supabase setup

1. Create a project at supabase.com (the free tier is enough).
2. **Project Settings → Database → Connection string → URI.** Copy it.
3. Put it in `.env` as `DATABASE_URL`. Keep `DATABASE_SSL=true`.
   - If your network has no IPv6, use the **Session pooler** string instead of the
     direct connection string.
4. Create the tables, either way:
   - paste `database/schema.sql` into the Supabase SQL editor and run it, or
   - run `npm run db:sync` locally against the same `DATABASE_URL`.
5. `npm run seed` to load the demo data.
6. Check `GET /api/health` returns `"database": "connected"`.

Supabase's connection limit on the free tier is low, so the pool is capped at 5
connections in `src/config/db.js`.

---

## Deployment (Render)

1. Push the repository to GitHub.
2. On Render: **New → Web Service**, connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add environment variables: `DATABASE_URL`, `DATABASE_SSL=true`, `JWT_SECRET`,
   `NODE_ENV=production`, `ARCHIVE_AFTER_DAYS=90`.
4. Deploy, then open `https://<your-app>.onrender.com/api/health` to confirm the
   database connection, and run the seed script once against the production
   database (`DATABASE_URL=... npm run seed` from your machine).
5. Note: uploaded images are written to `public/uploads` on the host's ephemeral
   disk, so they are lost on redeploy. See "Known limitations" below.

---


## Password recovery

Forgot-password is a three-step flow on `/forgot-password.html`: email, six-digit
code, new password.

- The code is six digits from `crypto.randomInt`, hashed with HMAC-SHA256 before it
  is stored. The database never holds a usable code.
- Expiry (`OTP_TTL_MINUTES`), attempt limit (`OTP_MAX_ATTEMPTS`) and resend cooldown
  (`OTP_RESEND_SECONDS`) are all configurable.
- Requesting a new code deletes every earlier one for that account, and a verified
  code is marked consumed, so a code cannot be replayed.
- `POST /api/auth/forgot-password` answers identically whether or not the address is
  registered, and stays silent when the cooldown is active, so it cannot be used to
  discover who has an account.
- Verifying a code returns a 15-minute token scoped to the reset (`purpose:
  password-reset`). That token is refused as a session token.
- A completed reset bumps `token_version`, which retires every JWT issued before it.

**Delivery.** With `BREVO_API_KEY` set, mail goes through Brevo's transactional API
using the branded template in `src/utils/mailer.js`. Without it, the console adapter
logs the message instead and the flow still works end to end — useful for testing,
never for production.

## Image storage

Uploads go through `src/utils/storage.js`, which has two adapters:

- **supabase** — used when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
  Objects live in two buckets: `item-images` (public, listing photos) and
  `claim-proofs` (private, claim evidence). Objects survive redeploys.
- **local** — the fallback. Files are written to `public/uploads` (items) and
  `var/private` (evidence). Fine for development, not for production.

Only object keys are stored in PostgreSQL; URLs are produced at serialisation time,
so switching adapters needs no data migration. Deleting a listing deletes its
objects, and removing a photo during an edit deletes that object too.

Claim evidence is never public. `GET /api/claims/:id/proof` returns a five-minute
signed link, and only to the claimant or an administrator.

To move images that were uploaded before storage existed:

```bash
node src/scripts/migrate-uploads.js --dry-run   # report what would move
node src/scripts/migrate-uploads.js             # move and rewrite rows
```

## Activation checklist

Everything below is code-complete. These are the only steps that need accounts:

| Step | Where | Why |
|---|---|---|
| Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` | Render env + local `.env` | Activates permanent image storage |
| Confirm the `item-images` and `claim-proofs` buckets exist | Supabase → Storage | They were created by migration; verify they are present |
| Set `BREVO_API_KEY` | Render env + local `.env` | Turns reset emails from console output into real mail |
| Verify the sender address in Brevo | Brevo → Senders | Unverified senders are silently dropped |
| Set `MAIL_FROM_EMAIL` to that verified address | Render env | Sender identity |
| Set `CORS_ORIGIN` to the deployed URL | Render env | Pins cross-origin access |
| Run `migrate-uploads.js` | Locally against production DB | Moves any pre-existing local images |

`GET /api/health` reports which adapters are active under `data.integrations`.

## Frontend

The interface is a hand-built design system in `public/css/styles.css` with no CSS
framework and no build step.

- **Type:** Plus Jakarta Sans for headings and interface labels, DM Sans for body text,
  both with system fallbacks so the page still reads correctly if the font CDN is blocked.
- **Colour:** soft off-white canvas, white cards, deep charcoal text and a purple accent.
  Every value is a custom property, so the dark theme is a single token block
  (`[data-theme='dark']`) rather than a second stylesheet.
- **Theme:** a toggle in the top bar and the sidebar. The choice is written to
  `localStorage` and applied by a tiny inline script in each page head, before first
  paint, so there is no flash of the wrong theme.
- **Navigation:** public pages use a top bar; the student dashboard and the desk console
  use a sidebar. On narrow screens the sidebar becomes a drawer and the top bar collapses
  into a menu.
- **Components:** buttons, inputs, selects, chips, badges, cards, tables, tabs, modals,
  toasts, skeletons, empty states and charts are all defined once and reused.
- **Motion:** transitions are short (180ms) and every animation is disabled under
  `prefers-reduced-motion`.

Charts are drawn with CSS and inline SVG rather than a charting library, so there is no
extra runtime dependency and nothing to fail offline.

## Project structure

```
campus-lost-found/
├── server.js                  entry point: connect, listen, daily housekeeping
├── src/
│   ├── app.js                 Express app: middleware, routes, static files
│   ├── config/db.js           Sequelize instance and connection options
│   ├── models/index.js        all six tables and their associations
│   ├── controllers/           auth, item, claim, notification, admin, meta
│   ├── routes/                thin routers that wire middleware to controllers
│   ├── middleware/            auth, validation (zod), upload (multer), errors
│   ├── utils/                 serializers, match engine, notifications, audit
│   ├── scripts/sync.js        create or update tables
│   └── seed.js                16 sample items and 3 users
├── public/                    the frontend (HTML, CSS, ES modules)
├── database/schema.sql        plain SQL schema for Supabase
├── postman/                   collection + environment, 42 requests
└── tests/smoke.test.js        37 end-to-end API tests
```

---

## API reference

All responses are `{ success, data, message }`. Errors carry a `message` and,
for validation failures, an `errors[]` array of `{ field, message }`.

### Auth
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create an account |
| POST | `/api/auth/login` | public | Get a JWT |
| POST | `/api/auth/logout` | user | Client-side token discard |
| GET | `/api/auth/me` | user | Current profile |
| PATCH | `/api/auth/me` | user | Update name and phone |
| PATCH | `/api/auth/password` | user | Change password |

### Items
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/items` | public | Search, filter, sort, paginate |
| GET | `/api/items/:id` | public | Detail (private fields stripped) |
| GET | `/api/items/mine` | user | My listings |
| GET | `/api/items/:id/matches` | owner / admin | Scored matches |
| GET | `/api/items/:id/claims` | owner / admin | Claims on this item |
| POST | `/api/items` | user | Create a report (multipart, up to 3 images) |
| PATCH | `/api/items/:id` | owner / admin | Update |
| DELETE | `/api/items/:id` | owner / admin | Soft delete |
| PATCH | `/api/items/:id/status` | admin | Moderate / change lifecycle state |

Query parameters for `GET /api/items`: `q`, `type`, `category`, `building`, `status`
(admin only), `from`, `to`, `sort` (`newest`, `oldest`, `date_desc`, `date_asc`,
`title_asc`, `title_desc`), `page`, `limit`.

### Claims
| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/items/:id/claims` | user | Submit a claim |
| GET | `/api/claims/mine` | user | My claims |
| GET | `/api/claims` | admin | All claims |
| PATCH | `/api/claims/:id` | admin | Approve or reject |
| PATCH | `/api/claims/:id/cancel` | claimant | Withdraw a pending claim |
| POST | `/api/claims/:id/collect` | admin | Verify pickup code, close case |

### Notifications, admin and metadata
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/notifications` | user | List with unread count |
| PATCH | `/api/notifications/:id/read` | user | Mark one read |
| POST | `/api/notifications/read-all` | user | Mark all read |
| GET | `/api/admin/stats` | admin | Overview numbers |
| GET | `/api/admin/charts` | admin | Four chart series |
| GET | `/api/admin/items` | admin | Every listing, any status |
| GET | `/api/admin/users` | admin | User list with listing counts |
| PATCH | `/api/admin/users/:id` | admin | Change role, block |
| GET | `/api/admin/audit-log` | admin | Privileged action trail |
| GET | `/api/admin/duplicates` | admin | Same-type lookalike reports |
| GET | `/api/categories` | public | Category list |
| GET | `/api/locations` | public | Campus buildings |
| GET | `/api/health` | public | Liveness and database state |

---

## Publishing model

Reports publish immediately. A student submits a listing and it is visible in search
and on the home page at once, with the match engine run on submission so the reporter
sees possible matches straight away.

The administrator keeps the enforcement half of moderation: any listing can be pulled
from the All items table by changing its status to `pending` (hidden), `rejected`
(hidden, with a reason shown to the owner) or `archived` (closed). The Moderation tab
therefore only shows items an administrator has deliberately set back to `pending`.

This trades the pre-publication review queue for a post-publication takedown, which
suits a campus tool where nobody is staffing a queue overnight.

## How the statistics are defined

The admin overview and the report must agree, so the definitions are fixed here:

- **Total lost / total found** — all non-deleted reports of that type, in any status.
- **Listed now** — items in `active` status; the only ones guests can see.
- **Items returned** — items in `returned` status, i.e. handed over after an approved claim.
- **Awaiting moderation** — items in `pending`.
- **Open claims** — claims in `pending`; the dashboard flags how many are older than 3 days.
- **Recovery rate** — `returned ÷ (returned + archived)`. Archived items are listings
  nobody claimed inside the holding period, so this measures how often a closed case
  ends in a handover rather than in disposal.
- **Average time to return** — mean of `returned_at − created_at` across returned items,
  in days.

---

## The custom feature: duplicate-item alerts and a match engine

Every newly approved report is scored against the active reports of the opposite type:

```
score = 0.35 × text similarity   (Jaccard overlap of tokenised title + description)
      + 0.25 × category match
      + 0.20 × location match     (1 same building, 0.5 same campus zone)
      + 0.10 × colour match
      + 0.10 × date proximity     (1 within 3 days, decaying to 0 at 14 days)
```

Pairs scoring **0.55 or above** are stored with the reasons that produced them, for
example:

> same category: electronics · both reported at central library · similar wording in the
> description (41% overlap) · same colour: black · dates 2 days apart

Those matches appear on the item page for the reporter, and the same scorer runs over
same-type reports to flag **possible duplicates** for the administrator.

The design is deliberate: deterministic, no external service, nothing that can behave
differently during a demonstration, and every match is explainable line by line.

---

## Testing

`npm test` runs **37 end-to-end tests** against a real Express app backed by an
in-memory PostgreSQL instance (`pg-mem`), so it needs no database server and no
credentials. They cover:

- health, static pages and 404 handling
- registration rules (first user becomes admin, duplicates, weak passwords)
- login success and failure, token issuance
- public listing, search, filters, pagination
- item creation, validation, and the private-detail rule for found items
- moderation and role enforcement (401 vs 403)
- the full claim workflow: submit, duplicate prevention, approval, pickup code, handover
- notifications, audit log, statistics and chart series
- the match engine finding the seeded lost/found pair
- the seed script producing 16 items, 3 users and at least one match

The **Postman collection** in `postman/` holds 42 requests across 7 folders. Set
`baseUrl`, then run the folders in order: authentication saves the tokens, item
creation saves `itemId`, and the claim folder saves `claimId` and `pickupCode` for the
follow-up requests. Export screenshots of each response for the report appendix.

---

## Security

- Passwords hashed with bcrypt (cost 10) and excluded from every query by a default
  scope, so a hash cannot be returned by accident.
- JWT with expiry; `JWT_SECRET` comes from the environment and is never committed.
- `helmet` for headers, `cors` restricted by `CORS_ORIGIN`, rate limiting on the
  credential endpoints (20 attempts per 15 minutes per IP).
- Every write is validated with `zod` at the route boundary, before any controller runs.
- SQL injection is prevented by parameterised queries through Sequelize; there is no
  string concatenation of user input into SQL anywhere.
- Uploads: MIME allowlist (JPEG/PNG/WebP), 5 MB limit, 3 files maximum, randomised
  filenames so a user-supplied name never reaches the disk.
- Ownership and role checks are middleware on the route, not conditions in the UI.
  A normal user gets 403 on another user's item, on any claim decision and on every
  admin route; an unauthenticated request gets 401.
- `privateDetail` is removed by a single serializer used by every item response, so a
  new endpoint cannot leak it.
- Errors return a short message and a request id; stack traces stay in the server log.

---

## Known limitations

- **Images** are stored on local disk (`public/uploads`), which is ephemeral on Render.
  For a permanent deployment, swap `src/middleware/upload.js` for Cloudinary or
  Supabase Storage; the rest of the code only ever sees a URL.
- **Logout** discards the token on the client. With stateless JWTs there is no server
  session to revoke; a token blocklist would be the next step.
- **Weekly trend** buckets are computed in JavaScript from the last 56 days of reports,
  which is fine at campus scale and keeps the query portable.
- Not implemented, by design: real-time chat, email/SMS delivery, AI image matching,
  password reset by email, a mobile app. The report explains why each was excluded.

---

## AI assistance disclosure

The brief asks for AI assistance to be disclosed. Parts of this project were developed
with AI assistance: the initial architecture and feature specification, the first draft
of the backend, and the styling of the frontend. The code has been read, run and tested,
and every design decision above — the state machines, the scoring weights, the metric
definitions — can be explained and modified live during the viva.

---

## Licence

MIT. Written for academic submission at Sai University.

---

## One-click deploy on Render

This repository includes `render.yaml`, so Render can create the whole service for you:

1. Open **https://render.com/deploy?repo=https://github.com/Godspirit4U/campus-lost-found**
2. Sign in with GitHub and approve the repository.
3. Paste your Supabase connection string when asked for `DATABASE_URL`.
4. Deploy. Render generates `JWT_SECRET` itself and health checks `/api/health`.

Then run the seed once against the production database, from your machine:

```bash
DATABASE_URL="<your supabase uri>" DATABASE_SSL=true npm run seed
```
