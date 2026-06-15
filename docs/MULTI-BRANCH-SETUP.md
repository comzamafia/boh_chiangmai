# Multi-Branch Setup (Option A — clone deployment per branch)

One codebase (this repo) → one Vercel **project** + one Neon **database** + one **URL** per branch.
Data is fully isolated (separate DB). One `git push` rebuilds every branch from the same code.

```
                         ┌─ Vercel "boh-chiangmai"   → Neon DB #1 → chiangmai.example.com
   repo boh_chiangmai ───┼─ Vercel "boh-branch2"     → Neon DB #2 → branch2.example.com
   (one codebase)        ├─ Vercel "boh-branch3"     → Neon DB #3 → branch3.example.com
                         └─ … 6 more …
```

---

## Per-branch checklist (repeat for each new branch)

### 1. Create the database (Neon)
- Neon dashboard → **New Project** (or a new database in an existing project) for the branch.
- Copy **two** connection strings:
  - **Pooled** (host contains `-pooler`) → goes to `DATABASE_URL`
  - **Direct / unpooled** (host has **no** `-pooler`) → goes to `DIRECT_URL`
  - ⚠️ `DIRECT_URL` MUST be the unpooled one, or `prisma migrate deploy` fails with **P1002**.

### 2. Create the Vercel project
- Vercel → **Add New… → Project** → import the **same** GitHub repo (`comzamafia/boh_chiangmai`).
- **Root Directory:** `backofhouse`
- Framework: Next.js (auto). Leave Build Command on default (uses `vercel.json`).
- (If asked) add **Vercel Blob** storage to the project so uploads work → it auto-sets `BLOB_READ_WRITE_TOKEN`.

### 3. Set Environment Variables (Production + Preview)
| Variable | Per-branch? | Value |
|---|---|---|
| `DATABASE_URL` | **UNIQUE** | branch Neon **pooled** URL |
| `DIRECT_URL` | **UNIQUE** | branch Neon **direct/unpooled** URL |
| `APP_URL` | **UNIQUE** | this branch's URL (e.g. `https://branch2.example.com`) |
| `JWT_SECRET` | **UNIQUE** | random 32+ char string (isolates logins per branch) |
| `USAGE_REPORT_API_KEY` | **UNIQUE** | random key for that branch's public API |
| `CRON_SECRET` | **UNIQUE** | random key protecting cron routes |
| `BLOB_READ_WRITE_TOKEN` | UNIQUE (auto) | provisioned by Vercel Blob per project |
| `RESEND_API_KEY` | shared OK | same Resend key for all branches |
| `EMAIL_FROM` | shared OK | e.g. `BOH Alerts <alerts@yourdomain.com>` |
| `EMAIL_REPLY_TO` | shared OK | optional |
| `NOTIFY_TIMEZONE` | shared OK | e.g. `America/Toronto` (set per branch if TZ differs) |

> Generate a random secret: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

### 4. Assign the domain
- Project → **Settings → Domains** → add the branch's subdomain/domain (e.g. `branch2.example.com`).

### 5. Deploy
- First deploy runs `prisma migrate deploy` → creates all tables in that branch's DB automatically.

### 6. Create the branch admin user (one-time)
The build does **not** seed. From your machine, point at the branch DB and run the seed:
```bash
cd backofhouse
DATABASE_URL="<branch pooled>" DIRECT_URL="<branch direct>" npx prisma db seed
```
- Creates admin **`admin@padthaichaiyo.com` / `Admin@1234`** → **log in and change the password immediately.**
- Seed also inserts a few demo suppliers; delete them in the app if not wanted.
- (Alternative: create the admin via the app's user admin once any admin exists.)

### 7. Verify
- Open the branch URL → log in → upload that branch's PMIX / loss / server-sales files.
- Confirm data shows only that branch (separate DB ⇒ no cross-branch leakage).

---

## Operating notes
- **Code updates:** push to `main` once → every branch project rebuilds from the same commit. Data stays separate.
- **Git link health:** if a branch stops deploying, check **Settings → Git** — if it shows *"Project Link not found"*, click **Reconnect** (this happened once on boh-chiangmai).
- **Crons:** the schedules in `vercel.json` run per project, so each branch gets its own digest/reminder crons automatically.
- **Limits / cost:**
  - Neon free tier limits compute/storage — 7 databases likely needs a **paid Neon plan**.
  - Vercel **Hobby** has a daily deployment cap and is for non-commercial use — running 7 commercial branches should be on **Vercel Pro**.
- **Public API per branch:** `https://<branch-url>/api/public/usage-report` with that branch's `USAGE_REPORT_API_KEY`.

## What is NOT shared
Each branch has its **own** users, data, uploads, unit chains, reason maps, settings, and API keys. There is no cross-branch dashboard in Option A (that would be Option B — multi-tenant).
