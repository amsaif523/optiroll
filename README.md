# OptiRoll — Fabric Roll Cutting Optimization System

## Overview

OptiRoll is an enterprise web application for **blinds manufacturing companies** that optimizes fabric roll cutting to minimize waste and maximize material utilization. It supports two blind types — **Roller** and **Zebra** — and intelligently reuses leftover fabric pieces from previous jobs.

**Tech Stack:**
- **Backend:** Node.js + Express + MySQL2
- **Frontend:** Next.js 14 + React 18 + Tailwind CSS + TypeScript
- **Database:** MySQL (schema managed via `init-db.js`)

---

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js       │────▶│   Express API   │────▶│   MySQL         │
│   Frontend      │     │   Backend       │     │   Database      │
│   (Port 3001)   │◄────│   (Port 3000)   │◄────│   (Port 3306)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Database Schema (5 Tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `rolls` | Fresh material inventory | `width`, `material_type`, `color`, `pattern`, `status` |
| `leftovers` | Reusable fabric pieces | `width`, `length`, `material_type`, `color`, `pattern`, `source_job_id`, `status` |
| `jobs` | Work orders | `work_order_number`, `client_name`, `status`, `total_pieces`, `total_sheets`, `waste_percent`, `utilization_percent` |
| `job_items` | Individual pieces per job | `shade_number`, `blind_type`, `width`, `height`, `valence`, `final_height`, `quantity`, `material_type`, `color`, `pattern` |
| `optimization_results` | Cut plans per sheet | `sheet_number`, `sheet_type`, `roll_width`, `roll_length_used`, `blinds_placed` (JSON), `waste_areas` (JSON), `reusable_leftovers` (JSON), `utilization_percent`, `waste_percent` |

**Material Signature:** Every piece is matched by `material_type + color + pattern`. All items in a single job must share the same signature.

---

## Blind Types & Sizing Logic

| Type | Final Height Formula | Description |
|------|---------------------|-------------|
| **Roller** | `height + valence` | Standard roll-up blind |
| **Zebra** | `(height × 2) + valence` | Dual-layer day/night blind |

The `final_height` is what actually gets laid out on the fabric roll. The `valence` is extra fabric for the top mounting mechanism.

---

## Optimization Algorithm (2-Phase)

### Phase 1: Leftover First
1. Query `leftovers` table for pieces matching the job's material signature
2. Sort by area (largest first)
3. Skip if `leftover.width < roll_width × 0.8` (too narrow)
4. Run `packSheet()` on leftover dimensions
5. If blinds fit: mark/update leftover, save result with `sheet_type = 'leftover'`
6. **Track previous cuts:** Look up `source_job_id` in `optimization_results`, find original sheet, extract `previous_blinds` and `original_width/length/offset` for visualization

### Phase 2: Fresh Rolls
1. Sort remaining blinds by area (largest first)
2. Run `packSheet()` on fresh roll (`roll_width × 30m`)
3. Create new `leftovers` from unused tail length (`30m - usedLength`)
4. Save result with `sheet_type = 'fresh_roll'`

### Packing Strategy: Row-Based Shelf (Guillotine Cuts)
- Sort blinds by width (descending)
- Place left-to-right in rows
- When row is full, start new row below
- Supports 90° rotation if `allow_rotation = true`

---

## Leftover Creation & Reuse Flow

```
JOB #1: Fresh Roll 2.5m × 30m
├─ Cuts: Blind A (0.8×1.9), Blind B (0.9×1.9), Blind C (0.7×1.5)
├─ Side Waste: 0.8m × 1.9m (right of row 1) → Saved to leftovers
├─ Tail Waste: 2.5m × 24.6m (bottom of sheet) → Saved to leftovers
└─ source_job_id = 1

        ↓ (New job with same material)

JOB #2: Reuses Leftover 0.8m × 1.9m
├─ Finds leftover in DB with source_job_id = 1
├─ Looks up Job #1's optimization_results
├─ Matches reusable_leftover dimensions → gets original sheet info
├─ Renders: previous_blinds (ghosted) + new cuts (solid) on original canvas
└─ Shows green "REUSABLE ZONE" border around the leftover area
```

---

## API Endpoints

### Rolls
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | `/api/rolls` | Create roll |
| GET | `/api/rolls` | List rolls (filterable by material_type, color, pattern, status) |
| DELETE | `/api/rolls/:id` | Delete roll |

### Leftovers
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | `/api/leftovers` | List available leftovers (filterable) |
| DELETE | `/api/leftovers/:id` | Delete leftover |

### Jobs
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | `/api/jobs` | Create job |
| GET | `/api/jobs` | List all jobs |
| GET | `/api/jobs/:id` | Get job with items |
| DELETE | `/api/jobs/:id` | Delete job + items + results |

### Optimize
| Method | Endpoint | Action |
|--------|----------|--------|
| POST | `/api/optimize/run` | **Run optimization** (main endpoint) |
| GET | `/api/optimize/jobs/:jobId/results` | Get raw optimization results |
| GET | `/api/optimize/jobs/:jobId/cutmap` | Get visual cut map data |

**`POST /api/optimize/run` Payload:**
```json
{
  "work_order_number": "WO-2024-001",
  "client_name": "Acme Corp",
  "roll_width": 2.5,
  "allow_rotation": false,
  "items": [
    {
      "shade_number": "BR-001",
      "blind_type": "roller",
      "width": 0.8,
      "height": 1.8,
      "valence": 0.1,
      "quantity": 2,
      "material_type": "Polyester",
      "color": "White",
      "pattern": "Plain"
    }
  ]
}
```

---

## Frontend Components

### `page.tsx` (Main Layout)
- **Collapsible Sidebar** (light theme, collapsed by default)
- **Sticky Header** with logo, title, user avatar, optimization status
- **Footer** with system status, version, copyright
- **Two-column layout:** Left (input) | Right (results)

### `WorkOrderBuilder.tsx`
- Blind type toggle (Roller / Zebra)
- **Persistent shade number** — carries over between adds
- **Blank defaults** for Height, Valence, Qty (user must enter, not pre-filled)
- Live `final_height` calculation display
- Added pieces table with remove action

### `RollConfig.tsx`
- 5 preset roll widths: `[2.0, 2.5, 2.8, 2.9, 3.0]` meters
- 90° rotation toggle

### `CutMapCanvas.tsx`
- **HTML5 Canvas** renderer for each optimized sheet
- **For fresh rolls:** Shows current cuts, waste, reusable leftovers
- **For reused leftovers:** Shows **full original sheet** with:
  - Ghosted previous cuts (hatched, labeled "PREVIOUS")
  - Green dashed "REUSABLE ZONE" border around leftover area
  - Solid new cuts placed inside the reusable zone (offset by `leftover_offset_x/y`)
- Zoom in/out, toggle labels, download PNG, fullscreen mode

---

## Key Data Structures

### `Sheet` (Frontend TypeScript)
```typescript
interface Sheet {
  sheet_number: number
  sheet_type: 'fresh_roll' | 'leftover'
  width: number           // Current sheet/leftover width
  length: number          // Current sheet/leftover length
  blinds: any[]           // Current cuts (relative to leftover origin)
  waste_areas: any[]
  reusable_leftovers: any[]
  previous_blinds: any[]  // Cuts from original job (original coordinates)
  original_width: number  // Original sheet width
  original_length: number // Original sheet length
  leftover_offset_x: number // Where leftover starts on original
  leftover_offset_y: number
  utilization: number
  waste: number
}
```

### Coordinate System for Leftovers
- **Previous blinds:** Stored in **original sheet coordinates** (from `optimization_results.blinds_placed`)
- **New blinds:** Packed in **leftover-relative coordinates** (origin at `0,0` of leftover)
- **Rendering:** New blinds are offset by `leftover_offset_x/y` to position them correctly on the original sheet canvas

```
Original Sheet (2.5m × 5.4m)
├─ Previous Cut A: x=0, y=0, w=0.8, h=1.9  ← ghosted
├─ Previous Cut B: x=0.8, y=0, w=0.9, h=1.9  ← ghosted
├─ [REUSABLE ZONE] x=1.7, y=0, w=0.8, h=1.9 ← green border
│   └─ New Cut: x=0, y=0 (leftover-relative)
│       Rendered at: x=1.7+0=1.7, y=0+0=0 ← solid blue
```

---

## Known Issues & Design Decisions

| Issue | Status | Notes |
|-------|--------|-------|
| No transaction wrapping | ⚠️ | Job creation + items not atomic; partial failures possible |
| No width validation | ⚠️ | `STANDARD_ROLL_WIDTHS` defined but not enforced |
| No deduplication/locking | ⚠️ | Same leftover could be used in concurrent optimizations |
| No update endpoints | ⚠️ | Only POST/GET/DELETE; no PUT/PATCH for jobs/rolls |
| No authentication | ⚠️ | Completely open API |
| MySQL2 auto-parses JSON | ✅ Fixed | Must use `safeParse()` helper — don't double `JSON.parse()` |

---

## Environment Setup

### Backend
```bash
cd optiroll-backend
npm install
# Create .env with DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
node src/scripts/init-db.js  # Initialize database
npm start                    # Starts on port 3000
```

### Frontend
```bash
cd optiroll-frontend
npm install
npm run dev                  # Starts on port 3001
```

### Environment Variables
```env
# Backend .env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=optiroll
NODE_ENV=development

# Frontend .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

---

## File Structure

```
optiroll-backend/
├── src/
│   ├── app.js                 # Express server entry
│   ├── config/database.js     # MySQL pool connection
│   ├── controllers/
│   │   ├── jobController.js
│   │   ├── rollController.js
│   │   ├── leftoverController.js
│   │   └── optimizeController.js
│   ├── models/index.js        # Data access layer (queries)
│   ├── routes/
│   │   ├── jobs.js
│   │   ├── rolls.js
│   │   ├── leftovers.js
│   │   └── optimize.js
│   ├── services/
│   │   └── Optimizer.js       # Core nesting algorithm
│   ├── middleware/
│   │   └── errorHandler.js
│   └── scripts/
│       └── init-db.js         # Database schema creation

optiroll-frontend/
├── app/
│   ├── page.tsx               # Main layout (sidebar + header + footer)
│   ├── layout.tsx             # Root layout with Inter font
│   └── globals.css            # Tailwind custom styles
├── components/
│   ├── WorkOrderBuilder.tsx   # Piece entry form
│   ├── RollConfig.tsx         # Roll width + rotation settings
│   └── CutMapCanvas.tsx       # Canvas cut map renderer
├── types/
│   └── index.ts               # TypeScript interfaces
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Future Enhancements

- [ ] Job history / past orders view
- [ ] Roll inventory management UI
- [ ] Leftover browser with filtering
- [ ] PDF export of cut maps
- [ ] Multi-material jobs (currently restricted to single signature)
- [ ] Authentication & user roles
- [ ] Real-time WebSocket updates
- [ ] Better packing algorithm (e.g., Maximal Rectangles, Skyline)


› now keep all the date human freindly like 05 may 2026 and in activity log keep action also human freidnly please rn
  comming like seeting.update and all dont needed and also when i apply the f ilte ri have to click on filte rbutton to
  apply it hsould apply direcy=tly and in place of filter button give reset icon so i can reset all the filter you
  getting me and make the dropden looks preminum rn too simply and all and in date range by default slect 1 month form
  today in date rane in all pages please and it should get applied also filter in backend and all you getting me you
  have fill acees to this folder dont ask me for revies and running thing