# Public Reporting API

API-key-authenticated, read-only endpoints for external systems to pull data
and build their own reports. CORS is enabled and responses are never cached.

## Multi-branch model

Each branch is a **separate deployment** with its own URL, database, and API
key (Option A). The external system keeps a small registry of branches and
calls **each branch's own URL**. Every response carries a `branch` block so the
consumer knows which branch produced the data and can merge branches into one
report.

```jsonc
// example registry on the consumer side
[
  { "branchId": "mississauga", "baseUrl": "https://www.sujeevan.ca",       "key": "<key>" },
  { "branchId": "yorkmills",   "baseUrl": "https://yorkmills.sujeevan.ca", "key": "<key>" },
  { "branchId": "parklawn",    "baseUrl": "https://parklawn.sujeevan.ca",  "key": "<key>" }
]
```

**Adding a future branch:** deploy it (per `MULTI-BRANCH-SETUP.md`), set its API
key env var, and add one row to the registry. No code change in this app.

## Authentication

Send the key any one of these ways (a header is strongly preferred — query
strings end up in access logs):

```
x-api-key: <key>
Authorization: Bearer <key>
?key=<key>
```

Keys are configured per branch via env vars. A single **`PUBLIC_API_KEY`**
works for every public endpoint; endpoint-specific vars are also accepted so
keys can be rotated independently:

| Env var | Used by |
|---|---|
| `PUBLIC_API_KEY` | all public endpoints (catch-all) |
| `SERVER_PERF_API_KEY` | `/api/public/server-performance` |
| `USAGE_REPORT_API_KEY` | `/api/public/usage-report` |

Any var may hold a comma-separated list to allow multiple valid keys.
Generate one: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`

### Response codes
| Code | Meaning |
|---|---|
| 200 | OK |
| 400 | Bad parameters (e.g. malformed date, range too large) |
| 401 | Missing/invalid API key |
| 503 | No key configured on this branch |

---

## GET /api/public/server-performance

Server (waiter) performance leaderboard for a date range — the same numbers as
the in-app `/server-performance` dashboard.

**Query params**
| Param | Format | Default | Notes |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | = `to` | inclusive, UTC business date |
| `to`   | `YYYY-MM-DD` | today | inclusive |

Max range 366 days.

**Example**
```bash
curl -H "x-api-key: $KEY" \
  "https://yorkmills.sujeevan.ca/api/public/server-performance?from=2026-06-01&to=2026-06-15"
```

**Response (abridged)**
```jsonc
{
  "ok": true,
  "branch": { "id": "yorkmills", "name": "Chiang Mai York Mills", "short": "York Mills", "url": "https://yorkmills.sujeevan.ca" },
  "generatedAt": "2026-06-19T15:00:00.000Z",
  "range": { "from": "2026-06-01", "to": "2026-06-15" },
  "weights": { "salesPerHour": 0.35, "avgPerGuest": 0.25, "drinkPct": 0.20, "dessertPer100": 0.12, "discount": 0.08 },
  "servers": [
    {
      "name": "Jane D.", "isStation": false, "score": 87.4,
      "shifts": 11, "hours": 62.5,
      "netSales": 18450.25, "grossSales": 19100.00, "discount": 649.75, "discountPct": 3.4,
      "tips": 3210.50, "tipPct": 17.4, "guests": 540, "orders": 612,
      "salesPerHour": 295.2, "avgPerGuest": 34.17, "avgPerOrder": 30.15,
      "foodSales": 12010.00, "beverageSales": 2100.25, "alcoholSales": 3890.00, "dessertSales": 450.00,
      "foodCount": 1320, "beverageCount": 410, "alcoholCount": 530, "dessertCount": 90,
      "drinkSales": 5990.25,
      "foodPct": 65.1, "beveragePct": 11.4, "alcoholPct": 21.1, "dessertPct": 2.4, "drinkPct": 32.5,
      "dessertPer100": 16.7, "liquorPerGuest": 7.20
    }
    // … sorted by score desc; `isStation: true` rows (e.g. Host) have score 0 and are not ranked
  ],
  "team": {
    "servers": 8, "netSales": 120300.50, "tips": 20800.00, "guests": 3600,
    "avgPerGuest": 33.42, "avgTipPct": 17.3,
    "avgDrinkPct": 31.0, "liquorPct": 20.4, "beveragePct": 10.6, "dessertPct": 2.5
  },
  "coverage": [ { "date": "2026-06-15", "serverCount": 8, "uploadedAt": "2026-06-16T02:11:00.000Z" } ]
}
```

**Field notes**
- All `*Pct` values are percentages of that server's **net** sales (0–100).
- `score` is a 0–100 composite, peer-normalised within the range using `weights`. Tips are intentionally excluded from the score.
- `isStation` rows (Host logins) are returned for completeness but excluded from ranking and team totals.
- `coverage` lists which business dates actually have uploaded data — use it to detect gaps.

---

## GET /api/public/usage-report

Weekly ingredient usage (Mon–Sun) per menu item, with unit-chain info — the
same data as the in-app `/usage-report`.

**Query params**
| Param | Default | Notes |
|---|---|---|
| `days` | `7` | how many trailing days to include |

**Example**
```bash
curl -H "x-api-key: $KEY" "https://www.sujeevan.ca/api/public/usage-report?days=7"
```

Response is wrapped with the same `ok` / `branch` / `generatedAt` envelope as
above, followed by the usage-report payload.
