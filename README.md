# OptiRoll — Fabric Roll Cutting Optimisation

A production-grade web application for **blinds manufacturers** that turns work orders into cutting maps, minimises fabric waste, and automatically recycles offcuts from previous jobs.

> **Looking for the client-facing feature list?** See [FEATURES.md](FEATURES.md).
> **Looking for a step-by-step QA walkthrough?** See [test-data/TESTING.md](test-data/TESTING.md).

---

## Highlights

- **Two-mode optimiser**: **Quick** (sub-second, 16 heuristic strategies) and **Deep** (1–4s, order-based Genetic Algorithm — 5–10% better packings on hard jobs)
- **Two cut modes**: **Free** (MAXRECTS, max density — default) and **Guillotine** (2-stage shelf packing — every cut is realisable on a real cross-cutter)
- **Cross-group width merging** — pieces whose allowed roll widths overlap can share a sheet
- **Smart leftover packing** — per-round dry-run picks the leftover that fits the most pieces
- **Cross-sheet backfill** — automatic post-Phase-2 consolidation in the same bucket
- **Per-piece grain lock** for striped / patterned fabric
- **Configurable leftover-reuse threshold** (10–100%)
- **Live Smart Suggestions** that read the current order and recommend setting tweaks
- **Excel / CSV import** with per-row validation
- **A3 print-ready PNG export** of every cut sheet (150 DPI)
- **JWT auth + multi-user (admin / operator)**, full activity log, job history

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, `xlsx` (SheetJS), `lucide-react` |
| Backend | Node.js + Express |
| Database | MySQL (raw SQL via `mysql2`, no ORM) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Process management | PM2 (production) |

---

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js       │────▶│   Express API   │────▶│     MySQL       │
│   (Port 3001)   │◀────│   (Port 3000)   │◀────│   (Port 3306)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        └── JWT in Authorization header (Bearer …)
```

---

## Quick Start

### 1. Backend

```bash
cd optiroll-backend
npm install

# Create .env (see below)
node scripts/init-db.js     # creates / migrates schema, seeds admin user
npm start                   # listens on port 3000
```

The init script is **idempotent** — re-running it on an existing DB safely adds new columns (`selected_widths`, `grain_locked` on `job_items`) via `ALTER TABLE` without touching existing data.

### 2. Frontend

```bash
cd optiroll-frontend
npm install
npm run dev                 # listens on port 3001
```

Open <http://localhost:3001>, log in with the seeded admin (`admin` / `admin123`), and start adding pieces or importing from Excel.

### 3. Environment Variables

```ini
# optiroll-backend/.env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=optiroll
JWT_SECRET=change-me-in-production
NODE_ENV=development
```

```ini
# optiroll-frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### 4. (Optional) Production with PM2

```bash
pm2 start ecosystem.config.js   # local to your install — gitignored
```

---

## Optimisation Algorithm

The optimiser runs in **two phases per material/colour/pattern bucket**, with a **cross-sheet backfill pass** afterwards.

### Bucketing
1. Items are grouped by `(material_type, colour, pattern)` — different fabrics never share a sheet.
2. Within each bucket, **cross-group width merging** picks the best roll width × items assignment iteratively (scored by `total_piece_area × utilisation`).

### Phase 1 — Smart Leftover Packing
For each bucket, available leftovers (matching material/colour/pattern, width ≥ `leftover_threshold × roll_width`) are tried via a per-round **dry-run**: pack a snapshot of the queue against each candidate leftover, commit on whichever places the most pieces (ties broken by minimum used length). Partial leftovers shrink in the DB; fully consumed ones are marked used.

### Phase 2 — Fresh Rolls
What didn't fit on leftovers goes onto fresh rolls. Two packing engines:

| Cut Mode | Engine | Cuttability |
|---|---|---|
| `free` (default) | **MAXRECTS** — 4 heuristics (BSSF, BLSF, BAF, BL) × 4 sort orders = 16 strategies | Maximum density. May require non-straight cuts. |
| `guillotine` | **ShelfPacker** — 2-stage FFDH (rows across the roll, then per-row width cuts) | Every cut is a straight cross-cut. Always realisable on a real fabric cutter. |

**Deep mode** wraps Phase 2 in an **order-based Genetic Algorithm** (pop 24, max 60 gens, OX1 crossover, 15% swap mutation, 2 elites, early-stop after 12 stagnant gens). The chromosome is a permutation of the queue; fitness is `total_length_used + 0.01 × sheets`. Population is seeded with the 4 heuristic sort orders so GA is never worse than Quick.

### Backfill Pass
After Phase 2 for each bucket, the smallest-used-length sheet is repeatedly tested against every other sheet in the bucket: if `target.pieces + source.pieces` can be repacked together on the target's roll dimensions, the source sheet is dropped. Loops until no further consolidation is possible.

### Per-Piece Constraints
- `grain_locked` blocks 90° rotation for that piece even when the job has rotation enabled.
- `selected_widths` restricts which roll widths a piece may be cut from.

---

## Database Schema

| Table | Purpose | Notable Columns |
|---|---|---|
| `users` | Auth | `username`, `password_hash`, `role` (admin/operator), `full_name` |
| `settings` | Key-value config | `key`, `value` — stores `roll_widths` (JSON), `max_roll_length`, `leftover_reuse_threshold` |
| `rolls` | Fresh inventory | `width`, `length`, `material_type`, `color`, `pattern`, `status` |
| `leftovers` | Reusable offcuts | `width`, `length`, `material_type`, `color`, `pattern`, `source_job_id`, `is_used` |
| `jobs` | Work orders | `work_order_number`, `client_name`, `status`, `allow_rotation`, `total_pieces`, `total_sheets`, `roll_width_used`, `total_waste_percent`, `total_utilization_percent` |
| `job_items` | Pieces per job | `shade_number`, `blind_type`, `width`, `height`, `valence`, `final_height`, `quantity`, `material_type`, `color`, `pattern`, **`selected_widths`** (JSON), **`grain_locked`** (TINYINT) |
| `optimization_results` | Per-sheet cut plans | `sheet_number`, `sheet_type` (`fresh_roll`/`leftover`), `roll_width`, `roll_length_used`, `blinds_placed` (JSON), `waste_areas` (JSON), `reusable_leftovers` (JSON), `utilization_percent`, `waste_percent` |
| `activity_logs` | Audit trail | `user_id`, `action`, `entity_type`, `entity_id`, `description`, `metadata` (JSON) |

**Units:** Everything is stored in metres for precision. The UI converts to inches for piece dimensions (`1 inch = 0.0254m`). Roll widths are always displayed in metres.

---

## API Endpoints

All endpoints except `/api/auth/login` require a JWT in `Authorization: Bearer <token>`.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Returns JWT for valid `username` + `password` |

### Optimisation
| Method | Path | Description |
|---|---|---|
| POST | `/api/optimize/run` | Run optimisation — returns full cut plan |
| GET | `/api/optimize/:jobId/results` | Raw `optimization_results` rows for a job |
| GET | `/api/optimize/:jobId/cutmap` | Cut map sheets ready for canvas rendering |

#### `POST /api/optimize/run` payload

```json
{
  "work_order_number": "WO-2024-001",
  "client_name": "Acme Hotel",
  "allow_rotation": false,
  "cut_mode": "free",
  "mode": "quick",
  "leftover_threshold": 0.8,
  "max_roll_length": 30,
  "items": [
    {
      "shade_number": "BR-001",
      "blind_type": "roller",
      "width": 1.2192,
      "height": 1.8288,
      "valence": 0.1524,
      "quantity": 4,
      "material_type": "Polyester",
      "color": "Cream",
      "pattern": "Plain",
      "selected_widths": [2.5, 2.8],
      "grain_locked": false
    }
  ]
}
```

`cut_mode` accepts `"free"` (default) or `"guillotine"`. `mode` accepts `"quick"` (default) or `"deep"`. All numeric dimensions are in **metres**.

#### Response (abridged)

```jsonc
{
  "job_id": 42,
  "work_order_number": "WO-2024-001",
  "roll_width": 2.5,
  "roll_width_groups": [
    { "roll_width": 2.5, "material_type": "Polyester", "color": "Cream", "pattern": "Plain", "item_count": 2, "sheets": 1 }
  ],
  "cut_mode": "free",
  "mode": "quick",
  "total_pieces": 4,
  "total_sheets": 1,
  "total_leftovers_used": 0,
  "utilization_percent": 91.44,
  "waste_percent": 8.56,
  "roll_width_suggestions": [ /* per-width simulation summary */ ],
  "sheets": [ /* full cut plan per sheet */ ]
}
```

### Jobs / Rolls / Leftovers
| Method | Path | Description |
|---|---|---|
| GET / POST / DELETE | `/api/jobs[/...]` | Job CRUD |
| GET / POST / DELETE | `/api/rolls[/...]` | Roll inventory |
| GET / POST / DELETE | `/api/leftovers[/...]` | Leftover inventory |

### Settings
| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | Returns all key-value settings (parsed) |
| PUT | `/api/settings` | Bulk-update settings — body is `{ key: value, ... }` |

### Users & Activity
| Method | Path | Description |
|---|---|---|
| GET / POST / PUT / DELETE | `/api/users[/...]` | User management (admin only) |
| GET | `/api/activity` | Activity log (filterable by date / user / action) |
| GET | `/api/dashboard/stats` | Dashboard counters |

---

## Project Structure

```
optiroll-backend/
├── scripts/init-db.js              ← schema + idempotent migrations + seed admin
├── src/
│   ├── app.js
│   ├── config/database.js
│   ├── controllers/
│   │   ├── authController.js       ← JWT login
│   │   ├── optimizeController.js   ← reads settings, calls Optimizer
│   │   ├── settingsController.js   ← generic key/value
│   │   ├── jobController.js
│   │   ├── rollController.js
│   │   ├── leftoverController.js
│   │   ├── userController.js
│   │   ├── activityController.js
│   │   └── dashboardController.js
│   ├── middleware/
│   │   ├── auth.js                 ← verifies JWT
│   │   └── errorHandler.js
│   ├── models/index.js             ← raw SQL DAL for every table
│   ├── routes/
│   │   ├── auth.js, jobs.js, optimize.js, settings.js,
│   │   ├── rolls.js, leftovers.js, users.js, activity.js, dashboard.js
│   └── services/
│       └── Optimizer.js            ← MAXRECTS + ShelfPacker + GA + backfill

optiroll-frontend/
├── app/
│   ├── page.tsx                    ← dashboard, work orders, SmartSuggestions
│   ├── login/page.tsx              ← JWT login
│   ├── layout.tsx                  ← root layout + full SEO metadata
│   └── globals.css                 ← Tailwind + custom component classes
├── components/
│   ├── WorkOrderBuilder.tsx        ← add-piece form + Excel import + per-piece roll widths + grain lock + cut mode
│   ├── CutMapCanvas.tsx            ← canvas renderer + PNG / A3 download (Reusable vs Trim distinction)
│   ├── SettingsPanel.tsx           ← roll widths, max length, leftover threshold
│   └── RollConfig.tsx              ← roll & leftover inventory
├── lib/
│   ├── api.ts                      ← fetch wrappers
│   └── auth.ts                     ← token storage / helpers
├── public/optiroll-import-template.csv ← downloadable Excel template
└── types/index.ts                  ← shared TypeScript interfaces

test-data/
├── sample-work-order.csv           ← 14 valid + 4 intentionally-bad rows
└── TESTING.md                      ← step-by-step QA guide

FEATURES.md                         ← client-facing feature catalogue
CLAUDE.md                           ← AI assistant project guide (gitignored content not shown)
```

---

## Excel Import Format

The CSV template (`optiroll-frontend/public/optiroll-import-template.csv`) has 11 columns:

| Column | Required | Notes |
|---|---|---|
| Shade # | yes | Free text |
| Type | yes | `roller` or `zebra` |
| Width (″) | yes | Inches |
| Height (″) | yes | Inches |
| Valence (″) | no | Defaults to 6 |
| Qty | yes | ≥ 1 |
| Material | no | Defaults to "Polyester" |
| Color | no | Defaults to "White" |
| Pattern | no | Defaults to "Plain" |
| Roll Widths (m) | yes | Comma-separated (`2.5,2.8`) or `all` |
| Grain Locked | no | `yes` / `no` |

Bad rows are skipped per-row with a reason; valid rows still import.

---

## Smart Suggestions

A live panel above the Generate buttons reads the current order and proposes setting tweaks. Each rule:

| Trigger | Suggestion |
|---|---|
| Total qty ≥ 20 or ≥ 10 lines, Quick mode active | Switch to **Deep** mode |
| Any piece's pattern/colour matches `strip / pattern / grain / floral / check / plaid / print` and isn't locked | **Grain-lock** those pieces |
| Rotation off and no piece needs grain protection | **Allow 90° rotation** |
| Width spread ≥ 0.5m and threshold ≥ 75% | Drop **leftover threshold** to 60% |
| ≥ 3 material/colour/pattern buckets | Info: each runs as its own pass |
| Free cut mode selected | Info: confirm machine can handle non-straight cuts |

Each actionable suggestion gets a one-click Apply button. The panel auto-hides once everything is dialled in.

---

## Testing

A realistic hotel-renovation sample CSV lives in [test-data/](test-data/):

```bash
# 14 valid pieces, 41 units, 6 material/colour buckets,
# roll widths spanning 2.0–3.0m, 4 intentionally-bad rows
test-data/sample-work-order.csv
test-data/TESTING.md         # numbered 1–10 walkthrough
```

Import the CSV from the **Import Excel** button on the dashboard to exercise every feature in one go.

---

## Known Limitations

| Item | Status | Notes |
|---|---|---|
| No DB transactions | ⚠️ | Job + items + results saved sequentially; partial failures possible on connection loss |
| No concurrent-optimisation lock on leftovers | ⚠️ | Two simultaneous optimisations could attempt to claim the same leftover; first commit wins |
| GA runtime not adaptive | ℹ️ | Deep mode runs up to 60 generations regardless of job size — usually finishes early via stagnation but could be capped by piece count |
| MySQL2 auto-parses JSON columns | ✅ Handled | All readers use `safeParse()` — never call `JSON.parse()` on already-parsed values |
| Grain detection is keyword-based | ℹ️ | Smart Suggestions matches `/strip|pattern|grain|floral|check|plaid|print/i` on the pattern/colour text; explicit `grain_locked: true` is the source of truth |

---

## Roadmap

Items already shipped are in [FEATURES.md](FEATURES.md). Open improvements:

- **Skyline packer** as a third alternative engine
- **Global cross-bucket 2-opt** (already do intra-bucket; cross-bucket needs material co-mixing rules)
- **Cut-sequence optimisation** to minimise blade-travel time on real cutters
- **DB transactions** around job creation
- **Per-job adaptive GA budget** based on piece count
- **WebSocket progress events** for long Deep runs

---

## Documentation Index

| Doc | Audience | Contents |
|---|---|---|
| [README.md](README.md) | Developers | Setup, architecture, API, schema (this file) |
| [FEATURES.md](FEATURES.md) | Clients / stakeholders | Non-technical feature catalogue with production impact |
| [test-data/TESTING.md](test-data/TESTING.md) | QA | 10-step walkthrough using the sample CSV |
| [optiroll-backend/CLAUDE.md](optiroll-backend/CLAUDE.md) | AI assistants | Backend project guide (gitignored) |
| [optiroll-frontend/CLAUDE.md](optiroll-frontend/CLAUDE.md) | AI assistants | Frontend project guide (gitignored) |
| [CLAUDE.md](CLAUDE.md) | AI assistants | Root project guide (gitignored) |

---


