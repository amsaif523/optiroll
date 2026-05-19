# OptiRoll — Feature Overview

A professional roll-cutting optimisation platform built for blinds manufacturers. OptiRoll takes a work order of pieces, intelligently selects the best roll widths, and generates production-ready cutting maps that minimise fabric waste and reuse offcuts from previous jobs.

---

## 1. Work Order Management

### Multi-Piece Entry
- Add unlimited pieces per work order with a single fast form.
- Every piece carries its own dimensions (in inches), quantity, material, colour, pattern, and blind type (Roller or Zebra).
- Valence height defaults to **6 inches** — common for most installations — but can be overridden per piece.
- The add form **does not reset** after saving a piece, so repeated entries with similar values are quick.

### Excel / CSV Import
For large orders (50+ pieces), enter the work order via spreadsheet instead of typing each row:
- **Import Excel** button accepts `.xlsx`, `.xls`, or `.csv`.
- **Template** button downloads a pre-formatted CSV with sample rows.
- Bad rows are skipped automatically with a per-row reason ("Row 5: Width must be a positive number"), good rows always import.
- Supports all per-piece fields including grain lock.

### Per-Piece Configuration
Each piece independently controls:
- **Blind type** — Roller or Zebra (zebra doubles the cut height + valence).
- **Allowed roll widths** — operator picks which production roll widths (e.g. 2.5m, 2.8m) this piece may be cut from.
- **Grain lock** — for striped or patterned fabric, prevents 90° rotation so the print never ends up sideways.

### Live Final-Height Display
As soon as height and valence are entered, the form shows the **final cut height** (inches, 5-decimal precision) — including the doubled length for zebra blinds. Operators see immediately whether the piece fits the roll length limit.

---

## 2. Optimisation Engine

The core of OptiRoll. Two optimisation modes, two cut modes, plus several intelligence layers — all configurable per job.

### Two Optimisation Modes

| Mode | Speed | Best For | What It Does |
|---|---|---|---|
| **Quick** | Sub-second | Day-to-day work | Tries 16 packing strategies (4 heuristics × 4 sort orders) and picks the densest result. |
| **Deep** | 1–4 seconds | Large or mixed-size jobs | Runs a **Genetic Algorithm** that evolves piece ordering over 60 generations. Typically finds 5–10% better packings than Quick on hard jobs. |

The Deep button is opt-in (purple, next to the main Generate button) so daily small orders stay fast.

### Two Cut Modes

| Mode | Density | Cuttability | Use When |
|---|---|---|---|
| **Guillotine** | Standard | Always cuttable on a real fabric cross-cutter | Default — produces straight cross-cuts only (2-stage shelf packing) |
| **Free (MAXRECTS)** | 5–15% denser | May require L-shaped or non-straight cuts | Using a CNC blade, plotter, or laser cutter that can handle complex paths |

The toggle is in the work-order form so operators can pick per job.

### Auto Roll-Width Selection
For every piece group, OptiRoll simulates packing across all allowed roll widths and chooses the width that gives the best utilisation. No manual width-picking required — the operator just lists the widths the piece **could** be cut from.

### Cross-Group Width Merging
If piece A allows widths `[2.5, 2.8]` and piece B allows `[2.8, 3.0]`, they share the 2.8m roll. OptiRoll detects this overlap and packs them together when it saves material, instead of running them as separate jobs.

### Smart Leftover Reuse
Instead of fresh rolls, OptiRoll first tries to fit pieces onto leftovers from previous jobs:
- Filters leftovers by material, colour, and pattern.
- For each round, **simulates** packing on every eligible leftover and picks the one that fits the most pieces (not just the largest one).
- Updates the leftover record — partially used leftovers shrink, fully used ones are marked consumed.

### Configurable Leftover Threshold
A leftover must be at least X% of the job's roll width to qualify. Configurable in Settings:
- **80%** (default) — strict reuse, only nearly full-width leftovers.
- **50–60%** — aggressive reuse, narrower leftovers re-enter the pool.

### 90° Rotation
Optional per-job toggle. When enabled, the optimiser may rotate pieces to fit better. Grain-locked pieces (set per-piece) are **never** rotated even when this is on. A post-run modal lists which pieces were rotated for QA.

### Material / Colour / Pattern Bucketing
Pieces are automatically separated by material, colour, and pattern — different materials never end up on the same roll, regardless of width.

### Reusable Offcut Capture
After every fresh-roll pack, the unused length is saved back to the leftover inventory if it meets the minimum size (30cm wide × 50cm long). Future jobs in the same material/colour automatically see and use them.

---

## 3. Smart Suggestions (Built-In Advisor)

A live panel above the Generate buttons that reads the current work order and recommends setting tweaks. Each suggestion gets a one-click **Apply** button.

| Trigger | Recommendation |
|---|---|
| 20+ pieces and Quick mode is on | Switch to Deep mode (5–10% better) |
| Patterned fabric detected | Grain-lock those specific pieces |
| Rotation off, no grain-locks present | Allow 90° rotation |
| Wide mix of roll widths | Lower leftover threshold to 60% |
| 3+ material/colour groups | Info: each runs as its own pass |
| Free cut mode selected | Info: confirm machine can handle non-straight cuts |

The panel auto-hides once everything is dialled in — no nagging.

---

## 4. Visual Cutting Maps

Every generated job comes with a sheet-by-sheet visual cut map:

### On-Screen Canvas
- Each piece labelled with shade number, dimensions (in inches, 5-decimal precision), blind type, valence, and a rotation badge if applicable.
- Colour-coded legend: Roller, Zebra, Waste areas, Previous cuts (when reusing leftovers).
- Waste areas shaded so operators can spot unusable scraps.
- Reusable offcuts highlighted separately.

### Downloads
- **Standard PNG** — 200 pixels per metre, ready for digital reference.
- **A3 PNG (1748 × 2480 px, 150 DPI)** — production-grade printable sheet, centred on A3 paper for hand-off to the cutting team.

### Per-Sheet Statistics
Each sheet shows: number of pieces placed, used length, utilisation %, waste %, sheet type (fresh roll or leftover), and the roll dimensions.

### Piece Details Modal
Full searchable table of every piece in the order: shade, type, W, H, valence, final H, qty, material, colour, pattern, and which roll widths it was eligible for.

### Confirm Generate Modal
Before running optimisation, a summary modal lists every setting in play: work order #, client, max length, rotation status, cut mode, optimisation mode, and the full piece list. One click to confirm or cancel.

### Rotation Info Modal
After optimisation, if any pieces were rotated, a modal lists exactly which ones — so QA can verify rotation was acceptable for those specific pieces.

---

## 5. Inventory Management

### Roll Inventory
- Track production roll stock by width, length, material, colour, pattern, and status.
- Add, edit, delete via the **Roll Configuration** panel.

### Leftover Inventory
- Every offcut from every job is automatically logged.
- Browsable in the **Leftovers** panel — filterable by material/colour.
- Automatically considered for the next compatible job.
- Partially used leftovers update in place; fully consumed ones marked used.

### Settings Panel
- **Roll widths** — add, remove, or reset the available production roll widths. Changes propagate everywhere immediately.
- **Maximum roll length** — global limit; pieces exceeding it are blocked before optimisation.
- **Leftover reuse threshold** — slider/input for how strict leftover matching should be (10–100%).

---

## 6. User Access & Workflow

### Authentication
- Secure login page (split-panel design with brand identity).
- JWT-based session tokens stored in browser local storage.
- Auto-redirect to login on session expiry.
- Default admin account seeded on first install for setup.

### Multi-User Support
- User accounts with roles: **Admin** or **Operator**.
- Admins can create and manage other users.

### Activity Log
- Every optimisation, every settings change, every user action is logged with timestamp and user.
- Browsable in the Activity panel — filter by date, user, or action type.

### Job History
- Every generated work order is stored.
- Open past jobs to review the optimisation result, re-export cut maps, or see what leftover was generated.

### Dashboard
- At-a-glance stats: total jobs, total pieces cut, total fabric used, average utilisation, recent activity.

---

## 7. Technical Foundations

For your IT / development team:

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend | Node.js + Express |
| Database | MySQL (raw SQL via `mysql2`, no ORM) |
| Authentication | JWT (`jsonwebtoken`) + bcrypt password hashing |
| Process management | PM2 (production-ready) |
| Build / deploy | Standard `npm run build` + `pm2 start ecosystem.config.js` |

### Algorithm
- **MAXRECTS** bin-packing for free-cut mode.
- **ShelfPacker** (2-stage guillotine) for real-cut mode.
- **Order-based Genetic Algorithm** with OX1 crossover and tournament selection for Deep mode.
- **Greedy best-fit assignment** for cross-group width merging.
- All numbers stored internally in metres for precision; UI translates to inches for the operator.

### Data Persistence
Every piece's full configuration — including allowed widths and grain-lock state — is stored against the job, so re-opening or re-optimising an old job preserves the operator's original choices.

### Scalability
- Tested with 50–100 piece work orders running sub-second in Quick mode.
- Deep (GA) mode completes in 1–4 seconds on the same job sizes.
- Pure JavaScript backend — no native dependencies, deployable on any Linux/Windows VM or container.

---

## 8. Roadmap Items Already Built

Tracked against the original specification — all delivered:

- Per-piece roll width selection
- Per-piece blind type (Roller / Zebra)
- Per-piece grain lock
- Auto roll-width selection with utilisation scoring
- Guillotine cut mode for real-machine compatibility
- Cross-group width merging
- Smart leftover packing (best-fit dry run)
- Configurable leftover threshold
- 90° rotation with per-piece override
- Genetic Algorithm Deep Optimise
- Excel / CSV import
- A3 PDF export
- Smart Suggestions advisor
- JWT authentication + multi-user support
- Activity logging
- Full inventory management (rolls + leftovers)
- Configurable settings (widths, length, threshold)

---

## 9. What This Means for Your Production

| Metric | Typical Impact |
|---|---|
| Manual data entry time | Reduced from minutes per piece to seconds (Excel import) |
| Material waste | 10–25% reduction vs ad-hoc cutting plans |
| Leftover reuse rate | Material that previously went to scrap now lands on the next compatible job automatically |
| Cutting errors | Reduced — every plot is annotated with piece IDs, dimensions, and grain info |
| Re-cuts / mistakes | Confirm-before-run modal prevents accidental runs with wrong settings |
| Operator training | Smart Suggestions teach best practices in-context |

---

*OptiRoll continues to evolve — additional features (skyline packing, global cross-sheet 2-opt, advanced cut-sequence optimisation) are on the roadmap and can be enabled on request.*
