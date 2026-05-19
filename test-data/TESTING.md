# OptiRoll Testing Guide

This folder contains a realistic sample work order (`sample-work-order.csv`) designed to exercise every feature OptiRoll ships with.

## How to use

1. Open OptiRoll, log in, and head to the main dashboard.
2. Enter a Work Order Number (e.g. `TEST-001`) and Client Name (e.g. `Hotel Pilot`).
3. Click **Import Excel** → select `sample-work-order.csv`.
4. The import banner will report: **14 pieces imported · 4 rows skipped** (the `HTL-BAD-*` rows are intentionally invalid — see below).
5. Work through the test scenarios below.

---

## The Sample Order

A simulated **hotel renovation** order across three floors:

| Floor | Pieces | Material Profile |
|---|---|---|
| Reception (HTL-1xx) | 12 units | Polyester, cream/white, plain |
| Guest rooms (HTL-2xx) | 8 units | Blackout, grey/black, striped/plaid |
| Restaurant (HTL-3xx) | 8 units | Linen, beige/cream, floral/plain |
| Lobby specials (HTL-4xx) | 13 units | Polyester, white, plain, mix of sizes |

**Totals**: 14 valid lines, 41 units, 6 material/colour/pattern groups, roll widths spanning 2.0m → 3.0m.

---

## What to test (in order)

### 1. Excel Import + validation
After import you should see:
- A green banner: `14 pieces imported`
- An amber sub-list: `4 rows skipped` with reasons:
  - Row 16 (HTL-BAD-1): Type must be "roller" or "zebra"
  - Row 17 (HTL-BAD-2): Width must be a positive number
  - Row 18 (HTL-BAD-3): Qty must be a whole number ≥ 1
  - Row 19 (HTL-BAD-4): Roll width(s) not found in configured widths

✅ Confirms: import works, validates, skips bad rows individually.

### 2. Smart Suggestions panel appears
Right column, above the Generate buttons. You should see at least:
- **Deep mode** suggestion (41 pieces > 20)
- **Grain lock** suggestion (HTL-202 has Stripe pattern but isn't locked; HTL-302 has Floral but isn't locked)
- **Lower threshold to 60%** (width spread is 1.0m)
- **Bucket info** (6 material/colour groups)
- **Cut mode info** (if you're in Free mode)

✅ Confirms: SmartSuggestions reads the order live and offers relevant tweaks.

Try the **[Lock grain]** button — HTL-202 and HTL-302 get locked, suggestion disappears.

### 3. Generate — Quick + Guillotine (default)
Click the main **Generate Cutting Map** button. In the confirm modal you'll see:
- Rotation: Disabled (default)
- Cut mode: Guillotine (real cuts)
- Optimisation: Quick (heuristic)

Confirm. Should complete in well under a second. Review:
- Total sheets
- Utilisation %
- Number of leftovers used (0 on first run — empty leftover pool)

✅ Confirms: cross-group merging (different `selected_widths` sets share rolls), bucketing (Linen never mixes with Polyester), zebra final-height doubling.

### 4. Generate again — Deep + Free
Note your previous total sheets count. Now:
- In the work order form, toggle **Cut Mode** to **Free**
- Click the purple **Deep** button

This run takes 1–4 seconds (GA evolves 60 generations). Compare:
- Total sheets — should be the same or fewer
- Utilisation % — usually 5–10% higher than Quick+Guillotine
- Used length per sheet — typically shorter

✅ Confirms: GA improves over heuristics, Free mode is denser than Guillotine.

### 5. Enable rotation
Add a piece via the UI form that's wider than your narrowest roll (e.g. width 110″ with selected widths `[2.5m]`). Without rotation it'll be rejected.

Now toggle **Allow 90° Rotation** on, add the piece, generate. The post-run modal will list any rotated pieces.

✅ Confirms: rotation, post-run rotation report, validation.

### 6. Grain lock honoured under rotation
Add a piece marked **grain-locked** (the per-piece checkbox in the form) and re-run with rotation ON. The grain-locked piece must **not** appear in the rotation report.

✅ Confirms: per-piece grain lock overrides job-wide rotation.

### 7. Leftover reuse round-trip
After step 3 or 4, run a **second** small work order in the **same material/colour** as one of the buckets — e.g. add a few Polyester / Cream / Plain pieces.

This run will use leftover sheets from the first job — the result banner will show `Leftovers used: N`. Sheet types in the canvas will read `LEFTOVER` instead of `FRESH_ROLL`.

✅ Confirms: leftover reuse, smart leftover packing (best fit), partial leftover updates.

### 8. Configurable leftover threshold
Go to **Settings** → **Leftover Reuse Threshold**, lower it from 80% to 50%. Re-run step 7. You should see **more** leftovers eligible (and possibly used).

✅ Confirms: threshold setting wires through to the optimiser.

### 9. Visual cutting maps
On any generated result:
- Hover/zoom each sheet — labels show shade, dimensions in inches (5 decimals), type (R/Z), rotation badge (↻ 90°) if rotated.
- Click **Download PNG** — standard cut map.
- Click **Download A3 PDF** — production-grade printable sheet.
- Click **Piece Details** — full table of every piece in the order.

✅ Confirms: rendering, exports, modal.

### 10. Cross-group width merging (verify with output)
Look at HTL-102 (`selected_widths: 2.5,2.8`) and HTL-103 (`selected_widths: 2.5,2.8`). They share both widths so they'll auto-merge at whichever yields better packing.

Then compare HTL-201 (`selected_widths: 2.8,3.0`) and HTL-202 (`selected_widths: 2.5,2.8`) — they share **only 2.8** — the merger will use 2.8 if that's the best score.

In the per-group breakdown of the result, you should see **fewer groups than unique `selected_widths` strings**, confirming the merge.

✅ Confirms: cross-group merging works.

---

## Smart Suggestion behaviours to confirm

After importing the sample CSV, these should ALL appear:

| Suggestion | Why it triggers |
|---|---|
| Use Deep mode | 41 pieces total (> 20 threshold) |
| Grain lock 2 piece(s): HTL-202, HTL-302 | Both have patterned fabric (Stripe/Floral) without grain lock |
| Allow rotation | Rotation is off by default and only some pieces are grain-locked |
| Set leftover threshold to 60% | Width spread = 1.0m (≥ 0.5m threshold) and current setting ≥ 75% |
| 6 material/colour groups | Bucket count ≥ 3 |
| Cut mode info | Free mode reminder (if Free is selected) |

Apply each one (or change the corresponding setting manually) — the suggestion should disappear.

---

## Edge cases the bad rows demonstrate

| Row | Field | Issue | Expected Behaviour |
|---|---|---|---|
| HTL-BAD-1 | Type | `triangle` (not roller/zebra) | Skipped, reason logged |
| HTL-BAD-2 | Width | Empty | Skipped, reason logged |
| HTL-BAD-3 | Qty | `0` | Skipped, reason logged |
| HTL-BAD-4 | Widths | `9.9` (not in configured widths) | Skipped, reason logged |

The 4 bad rows confirm validation runs per-row without breaking the import — the 14 good rows still load.

---

## Performance benchmark

On a typical laptop:

| Mode | Roughly |
|---|---|
| Quick + Guillotine | < 0.5 sec |
| Quick + Free | < 0.5 sec |
| Deep + Guillotine | 1.5–3 sec |
| Deep + Free | 1.5–4 sec |

The GA's stagnation early-stop usually triggers around generation 25–40 on this sample.

---

## Reset between tests

If leftover pool grows unwieldy across many runs, go to **Leftovers** panel and bulk-delete to start fresh. Jobs and activity logs are preserved in DB regardless.
