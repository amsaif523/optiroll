const { Leftover, Job, JobItem, OptimizationResult } = require('../models');

const STANDARD_ROLL_WIDTHS = [2.0, 2.5, 2.8, 2.9, 3.0];
const MIN_REUSABLE_WIDTH = 0.3;
const MIN_REUSABLE_LENGTH = 0.5;
const DEFAULT_ROLL_LENGTH = 30;
const WIDTH_TOL = 0.001;
const DEFAULT_CUT_MODE = 'free'; // 'free' = MAXRECTS, 'guillotine' = ShelfPacker (real cross-cuts)
const DEFAULT_LEFTOVER_THRESHOLD = 0.8; // leftover must be ≥ X × effective roll width to qualify
const DEEP_TIME_BUDGET_MS = 15000; // per material bucket: max wall-clock for thorough random-restart search

// ─── Global optimization scoring model ──────────────────────────────────────
// A layout (one width's full set of sheets) is scored by a weighted blend of
// normalized [0,1] objectives. Higher is better. This is the single objective used
// for BOTH width selection and candidate-layout selection, so the width we pick is
// the width we actually pack well — no selection/packing mismatch.
//
//   score = 0.70·utilization     fabric tightness: blind area ÷ TOTAL consumed area
//         + 0.30·sheetEfficiency  fewest sheets vs. the area lower bound (≈ blinds/sheet)
//
// PRIMARY GOAL: use the fabric as completely as possible — minimize total wasted
// fabric. `utilization` (blindArea ÷ Σ width×usedLength) already counts side strips
// AND internal gaps as waste, so the width that leaves the least leftover scores
// highest. `sheetEfficiency` favors consolidating onto fewer sheets.
//
// NOTE: earlier versions also rewarded `wasteReduction` + `remnantReuse`, which gave
// a BONUS to layouts that left large *reusable* offcut strips. That actively pushed
// width selection toward narrow rolls (e.g. 2.5m) that leave a big full-length side
// strip — the opposite of "use the fabric completely". Those terms are removed: a
// leftover is waste, not a reward. (`_layoutMetrics` still computes them for the UI
// breakdown, but they carry zero weight in the decision.)
const SCORE_WEIGHTS = {
  utilization: 0.70,
  sheetEfficiency: 0.30,
  wasteReduction: 0.0,
  remnantReuse: 0.0,
};

// Decreasing sort orders for the cutting-stock packers. Sorting large pieces first
// is what makes First/Best-Fit *Decreasing* effective.
const SORT_AREA   = (a, b) => (b.width * b.final_height) - (a.width * a.final_height);
const SORT_HEIGHT = (a, b) => b.final_height - a.final_height;
const SORT_WIDTH  = (a, b) => b.width - a.width;
const SORT_PERIM  = (a, b) => (b.width + b.final_height) - (a.width + a.final_height);

// Maximal Rectangles (MAXRECTS) — best practical 2D bin packing algorithm.
class MaxRects {
  constructor(width, height) {
    this.binWidth = width;
    this.binHeight = height;
    this.freeRects = [{ x: 0, y: 0, width, height }];
    this.usedRects = [];
  }

  insert(itemW, itemH, heuristic, allowRotation) {
    let bestNode = null;
    let bestS1 = Infinity;
    let bestS2 = Infinity;
    let bestRotated = false;

    for (const fr of this.freeRects) {
      if (itemW <= fr.width && itemH <= fr.height) {
        const [s1, s2] = this._score(fr, itemW, itemH, heuristic);
        if (s1 < bestS1 || (s1 === bestS1 && s2 < bestS2)) {
          bestNode = { x: fr.x, y: fr.y, width: itemW, height: itemH };
          bestS1 = s1; bestS2 = s2; bestRotated = false;
        }
      }
      if (allowRotation && itemH !== itemW && itemH <= fr.width && itemW <= fr.height) {
        const [s1, s2] = this._score(fr, itemH, itemW, heuristic);
        if (s1 < bestS1 || (s1 === bestS1 && s2 < bestS2)) {
          bestNode = { x: fr.x, y: fr.y, width: itemH, height: itemW };
          bestS1 = s1; bestS2 = s2; bestRotated = true;
        }
      }
    }

    if (!bestNode) return null;
    this._place(bestNode);
    this.usedRects.push(bestNode);
    return { ...bestNode, rotated: bestRotated };
  }

  _score(fr, w, h, heuristic) {
    const dx = fr.width - w;
    const dy = fr.height - h;
    switch (heuristic) {
      case 'BSSF': return [Math.min(dx, dy), Math.max(dx, dy)];
      case 'BLSF': return [Math.max(dx, dy), Math.min(dx, dy)];
      case 'BAF':  return [fr.width * fr.height - w * h, Math.min(dx, dy)];
      case 'BL':   return [fr.y, fr.x];
      default:     return [Math.min(dx, dy), Math.max(dx, dy)];
    }
  }

  _place(placed) {
    const newFree = [];
    for (const fr of this.freeRects) {
      if (!this._intersects(fr, placed)) {
        newFree.push(fr);
        continue;
      }
      if (placed.x > fr.x)
        newFree.push({ x: fr.x, y: fr.y, width: placed.x - fr.x, height: fr.height });
      if (placed.x + placed.width < fr.x + fr.width)
        newFree.push({ x: placed.x + placed.width, y: fr.y, width: fr.x + fr.width - placed.x - placed.width, height: fr.height });
      if (placed.y > fr.y)
        newFree.push({ x: fr.x, y: fr.y, width: fr.width, height: placed.y - fr.y });
      if (placed.y + placed.height < fr.y + fr.height)
        newFree.push({ x: fr.x, y: placed.y + placed.height, width: fr.width, height: fr.y + fr.height - placed.y - placed.height });
    }
    this.freeRects = newFree.filter((r, i) =>
      r.width > 0 && r.height > 0 &&
      !newFree.some((o, j) => i !== j && this._contains(o, r))
    );
  }

  _intersects(a, b) {
    return b.x < a.x + a.width && b.x + b.width > a.x &&
           b.y < a.y + a.height && b.y + b.height > a.y;
  }

  _contains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
           inner.x + inner.width <= outer.x + outer.width &&
           inner.y + inner.height <= outer.y + outer.height;
  }

  getUsedLength() {
    if (this.usedRects.length === 0) return 0;
    return Math.max(...this.usedRects.map(r => r.y + r.height));
  }

  getFreeRects() { return [...this.freeRects]; }
}

// 2-stage guillotine packer (horizontal shelves). Every cut is realisable on a real
// cross-cutter: first cut the roll into shelves across the width, then slice each
// shelf into pieces along the length. Slightly more waste than MAXRECTS but always cuttable.
class ShelfPacker {
  constructor(width, length) {
    this.binWidth = width;
    this.binLength = length;
    this.shelves = []; // [{ y, height, usedWidth }]
    this.usedRects = [];
  }

  insert(itemW, itemH, _heuristic, allowRotation) {
    let bestShelf = null;
    let bestRotated = false;
    let bestRem = Infinity;

    // Best-fit on existing shelves (prefer shelf with smallest residual width waste)
    for (const shelf of this.shelves) {
      const remW = this.binWidth - shelf.usedWidth;
      if (itemW <= remW && itemH <= shelf.height && remW - itemW < bestRem) {
        bestShelf = shelf; bestRotated = false; bestRem = remW - itemW;
      }
      if (allowRotation && itemW !== itemH && itemH <= remW && itemW <= shelf.height && remW - itemH < bestRem) {
        bestShelf = shelf; bestRotated = true; bestRem = remW - itemH;
      }
    }

    if (bestShelf) {
      const placedW = bestRotated ? itemH : itemW;
      const placedH = bestRotated ? itemW : itemH;
      const rect = { x: bestShelf.usedWidth, y: bestShelf.y, width: placedW, height: placedH };
      bestShelf.usedWidth += placedW;
      this.usedRects.push(rect);
      return { ...rect, rotated: bestRotated };
    }

    // Open a new shelf below the last one
    const nextY = this.shelves.length === 0
      ? 0
      : this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].height;

    if (itemW <= this.binWidth && nextY + itemH <= this.binLength) {
      const shelf = { y: nextY, height: itemH, usedWidth: itemW };
      this.shelves.push(shelf);
      const rect = { x: 0, y: nextY, width: itemW, height: itemH };
      this.usedRects.push(rect);
      return { ...rect, rotated: false };
    }
    if (allowRotation && itemH !== itemW && itemH <= this.binWidth && nextY + itemW <= this.binLength) {
      const shelf = { y: nextY, height: itemW, usedWidth: itemH };
      this.shelves.push(shelf);
      const rect = { x: 0, y: nextY, width: itemH, height: itemW };
      this.usedRects.push(rect);
      return { ...rect, rotated: true };
    }
    return null;
  }

  getUsedLength() {
    if (this.shelves.length === 0) return 0;
    const last = this.shelves[this.shelves.length - 1];
    return last.y + last.height;
  }

  getFreeRects() {
    const free = [];
    for (const shelf of this.shelves) {
      if (shelf.usedWidth < this.binWidth) {
        free.push({
          x: shelf.usedWidth, y: shelf.y,
          width: this.binWidth - shelf.usedWidth, height: shelf.height
        });
      }
    }
    const lastY = this.getUsedLength();
    if (lastY < this.binLength) {
      free.push({ x: 0, y: lastY, width: this.binWidth, height: this.binLength - lastY });
    }
    return free;
  }
}

class Optimizer {
  constructor() {
    this.results = [];
    this.blindQueue = [];
    this.usedLeftovers = [];
  }

  async optimizeWorkOrder(payload) {
    const {
      work_order_number, client_name, items,
      allow_rotation, max_roll_length,
      cut_mode: rawCutMode,
      leftover_threshold: rawLeftoverThreshold,
      mode: rawMode,
      default_widths: rawDefaultWidths,
      preview: rawPreview,
      use_leftovers: rawUseLeftovers,
      save_leftovers: rawSaveLeftovers,
    } = payload;

    // preview=true → run algorithm only, skip all DB writes
    this.preview = !!rawPreview;
    // use_leftovers=false → skip Phase 1 leftover packing entirely
    this.useLeftovers = rawUseLeftovers !== false;
    // save_leftovers=false → still compute reusable offcuts/tails (returned for the
    // review sidebar) but do NOT auto-persist them; the user saves manually later.
    this.saveLeftovers = rawSaveLeftovers !== false;

    const cutMode = rawCutMode === 'guillotine' ? 'guillotine' : DEFAULT_CUT_MODE;
    const mode = rawMode === 'deep' ? 'deep' : 'quick';
    const allowRotation = allow_rotation || false;
    // Fallback widths used only when an item has no selected_widths.
    // Prefer settings-driven list (live), then the hardcoded constant.
    const defaultWidths = Array.isArray(rawDefaultWidths) && rawDefaultWidths.length > 0
      ? rawDefaultWidths.map(Number).filter(v => Number.isFinite(v) && v > 0)
      : STANDARD_ROLL_WIDTHS;
    const rollLength = parseFloat(max_roll_length) > 0 ? parseFloat(max_roll_length) : DEFAULT_ROLL_LENGTH;
    const leftoverThreshold = (() => {
      const t = parseFloat(rawLeftoverThreshold);
      if (!Number.isFinite(t) || t <= 0 || t > 1) return DEFAULT_LEFTOVER_THRESHOLD;
      return t;
    })();
    if (!items || items.length === 0) throw new Error('No items in work order');

    // Sanitize per-item selected_widths (drop NaN / non-positive entries)
    for (const item of items) {
      if (Array.isArray(item.selected_widths)) {
        item.selected_widths = item.selected_widths
          .map(Number)
          .filter(v => Number.isFinite(v) && v > 0);
      }
    }

    // Sanitize per-item cut (mechanism deduction): negative/NaN → 0.
    // The fabric width packed & plotted is (width − cut). Validate it stays positive.
    for (const item of items) {
      const cut = parseFloat(item.cut);
      item.cut = Number.isFinite(cut) && cut > 0 ? cut : 0;
      const ew = parseFloat(item.width) - item.cut;
      if (ew <= 0) {
        throw new Error(
          `Blind "${item.shade_number}" cut ${item.cut}m is ≥ its width ${item.width}m — nothing left to cut.`
        );
      }
    }

    // Validate all items heights fit
    for (const item of items) {
      const h = parseFloat(item.height);
      const v = parseFloat(item.valence || 0);
      const finalH = item.blind_type === 'zebra' ? h * 2 + v : h + v;
      if (finalH > rollLength) {
        throw new Error(
          `Blind "${item.shade_number}" final height ${finalH.toFixed(3)}m exceeds max roll length ${rollLength}m.`
        );
      }
    }

    // Create job + persist items (skipped in preview mode)
    let job = { id: null };
    let totalPieces = 0;
    if (!this.preview) {
      job = await Job.create({
        work_order_number: work_order_number || null,
        client_name: client_name || null,
        allow_rotation: allowRotation
      });
      for (const item of items) {
        await JobItem.create({ ...item, job_id: job.id });
        totalPieces += parseInt(item.quantity) || 1;
      }
    } else {
      for (const item of items) {
        totalPieces += parseInt(item.quantity) || 1;
      }
    }

    // BUCKET by product_code (preferred — unique fabric identifier) or (material, color, pattern)
    const buckets = new Map();
    for (const item of items) {
      const key = item.product_code
        ? `product:${item.product_code}`
        : `${item.material_type}|${item.color}|${item.pattern || ''}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          product_code: item.product_code || null,
          material_type: item.material_type,
          color: item.color,
          pattern: item.pattern || null,
          items: []
        });
      }
      buckets.get(key).items.push(item);
    }

    // PER-SHEET WIDTH SELECTION: each material bucket is packed as ONE group. Phase 2
    // (see _packBucketBestLayout / _packGroupMultiWidth) chooses the roll width
    // INDEPENDENTLY for each sheet — sheet 1 may pack best on 2.5m while sheet 2 packs
    // best on 3.0m — so the program tries every allowed width on every sheet and keeps
    // whichever wastes the least fabric. Every piece still only lands on a width listed
    // in its own selected_widths.
    const finalGroups = [];
    for (const [, bucket] of buckets) {
      // Union of all candidate widths usable anywhere in this bucket.
      const widthSet = new Set();
      for (const item of bucket.items) {
        const sw = item.selected_widths && item.selected_widths.length > 0
          ? item.selected_widths
          : defaultWidths;
        for (const w of sw) widthSet.add(w);
      }
      const candidateWidths = [...widthSet].sort((a, b) => a - b);

      finalGroups.push({
        candidateWidths,
        items: bucket.items,
        product_code: bucket.product_code,
        material_type: bucket.material_type,
        color: bucket.color,
        pattern: bucket.pattern
      });
    }

    this.results = [];
    this.usedLeftovers = [];
    this.candidateLeftovers = []; // reusable offcuts + roll tails, for the review sidebar
    let sheetCounter = 0;
    let primaryRollWidth = null;
    const allSuggestions = [];
    const rollWidthGroups = []; // per-group breakdown for UI

    const safeParse = (val) => {
      if (!val) return [];
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return []; }
    };

    for (const group of finalGroups) {
      const candidateWidths = group.candidateWidths;
      const { product_code, material_type, color, pattern } = group;
      // Reference width for the leftover-eligibility threshold (smallest usable width).
      const leftoverRefWidth = Math.min(...candidateWidths);

      // Per-width suggestions (for UI display): simulate each candidate width over the
      // items eligible at that width.
      for (const w of candidateWidths) {
        const eligibleItems = group.items.filter(it => {
          const sw = it.selected_widths && it.selected_widths.length > 0 ? it.selected_widths : defaultWidths;
          return sw.some(v => Math.abs(v - w) < WIDTH_TOL);
        });
        if (eligibleItems.length === 0) continue;
        const sug = this.simulatePacking(eligibleItems, w, rollLength, allowRotation, cutMode);
        if (!allSuggestions.some(e => Math.abs(e.width - sug.width) < WIDTH_TOL)) allSuggestions.push(sug);
      }
      const groupSheetStart = sheetCounter;

      // Build blind queue for this group. Each piece carries the set of roll widths it
      // may be packed on, so the per-sheet width selector only places it on a legal width.
      this.blindQueue = [];
      let itemIdx = 0;
      for (const item of group.items) {
        const qty = parseInt(item.quantity) || 1;
        const valence = parseFloat(item.valence || 0);
        const cut = parseFloat(item.cut) || 0;
        const orderedWidth = parseFloat(item.width);
        const effWidth = orderedWidth - cut; // fabric actually cut from the roll
        const allowedWidths = (item.selected_widths && item.selected_widths.length > 0)
          ? [...item.selected_widths]
          : [...defaultWidths];
        const finalHeight = item.blind_type === 'zebra'
          ? (parseFloat(item.height) * 2) + valence
          : parseFloat(item.height) + valence;
        for (let i = 0; i < qty; i++) {
          this.blindQueue.push({
            // id MUST be globally unique. shade_number can repeat across items (e.g. an
            // imported Excel where many rows share the same Product Name), so the item
            // index is included — otherwise pieces with the same id get removed together
            // and silently dropped during packing.
            id: `${item.shade_number || 'item'}_${itemIdx}_${i}`,
            shade_number: item.shade_number || '',
            blind_type: item.blind_type,
            width: effWidth,           // packed/plotted width = ordered width − cut
            ordered_width: orderedWidth,
            cut,
            height: parseFloat(item.height),
            valence,
            final_height: finalHeight,
            piece_index: i,
            grain_locked: item.grain_locked === true,
            allowed_widths: allowedWidths,
            product_code: item.product_code || product_code || null,
            material_type, color, pattern
          });
        }
        itemIdx++;
      }

      // PHASE 1: SMART leftover packing (skipped when use_leftovers=false)
      let eligibleLeftovers = [];
      if (this.useLeftovers) {
        const leftovers = await Leftover.findByProductOrSignature(product_code, material_type, color, pattern);
        eligibleLeftovers = leftovers.filter(l =>
          parseFloat(l.width) >= leftoverRefWidth * leftoverThreshold
        );
      }

      while (this.blindQueue.length > 0 && eligibleLeftovers.length > 0) {
        const snapshot = [...this.blindQueue];
        let bestLeftover = null;
        let bestCount = 0;
        let bestUsedLength = Infinity;

        // Trial run on each candidate (snapshot/restore around the mutating packSheet)
        for (const leftover of eligibleLeftovers) {
          this.blindQueue = [...snapshot];
          const { placed } = this.packSheet({
            width: parseFloat(leftover.width),
            length: parseFloat(leftover.length),
            allow_rotation: allowRotation,
            cut_mode: cutMode
          });
          if (placed.length === 0) continue;
          const usedLength = Math.max(...placed.map(p => p.y + p.height));
          if (placed.length > bestCount ||
              (placed.length === bestCount && usedLength < bestUsedLength)) {
            bestLeftover = leftover;
            bestCount = placed.length;
            bestUsedLength = usedLength;
          }
        }

        if (!bestLeftover) {
          this.blindQueue = snapshot; // no candidate helped — bail to Phase 2
          break;
        }

        // Commit on the winner: re-run the pack against a fresh snapshot copy
        this.blindQueue = [...snapshot];
        const { placed, freeRects } = this.packSheet({
          width: parseFloat(bestLeftover.width),
          length: parseFloat(bestLeftover.length),
          allow_rotation: allowRotation,
          cut_mode: cutMode
        });

        sheetCounter++;
        this.usedLeftovers.push(bestLeftover.id);
        const usedLength = Math.max(...placed.map(p => p.y + p.height));
        const remainingLength = parseFloat(bestLeftover.length) - usedLength;

        if (!this.preview) {
          if (remainingLength < 0.1) {
            await Leftover.markUsed(bestLeftover.id);
          } else {
            await Leftover.updateDimensions(bestLeftover.id, parseFloat(bestLeftover.width), remainingLength);
          }
        }

        let previousBlinds = [];
        let originalWidth = parseFloat(bestLeftover.width);
        let originalLength = parseFloat(bestLeftover.length);
        let leftoverOffsetX = 0;
        let leftoverOffsetY = 0;

        if (bestLeftover.source_job_id) {
          const prevResults = await OptimizationResult.findByJob(bestLeftover.source_job_id);
          for (const pr of prevResults) {
            const prevWaste = safeParse(pr.reusable_leftovers);
            const prevBlinds = safeParse(pr.blinds_placed);
            const matched = prevWaste.find(wl =>
              Math.abs(parseFloat(wl.width) - parseFloat(bestLeftover.width)) < 0.01 &&
              Math.abs(parseFloat(wl.height) - parseFloat(bestLeftover.length)) < 0.01
            );
            if (matched) {
              originalWidth = parseFloat(pr.roll_width);
              originalLength = parseFloat(pr.roll_length_used);
              leftoverOffsetX = parseFloat(matched.x);
              leftoverOffsetY = parseFloat(matched.y);
              previousBlinds = prevBlinds;
              break;
            }
            if (Math.abs(parseFloat(pr.roll_width) - parseFloat(bestLeftover.width)) < 0.01) {
              const prevUsedLength = parseFloat(pr.roll_length_used);
              const tailLength = rollLength - prevUsedLength;
              if (Math.abs(tailLength - parseFloat(bestLeftover.length)) < 0.1) {
                originalWidth = parseFloat(pr.roll_width);
                originalLength = rollLength;
                leftoverOffsetX = 0;
                leftoverOffsetY = prevUsedLength;
                previousBlinds = prevBlinds;
                break;
              }
            }
          }
        }

        await this.saveSheetResult(
          job.id, sheetCounter, 'leftover',
          parseFloat(bestLeftover.width), usedLength, placed, freeRects,
          previousBlinds, originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY,
          this.preview
        );

        eligibleLeftovers = eligibleLeftovers.filter(l => l.id !== bestLeftover.id);
      }

      // PHASE 2: Fresh rolls via global candidate-layout selection.
      // In Deep mode, the GA first searches for a strong piece ordering; that order is
      // then fed in as one more candidate layout alongside greedy + FFD. The best-scoring
      // full layout wins, so Deep mode is never worse than Quick.
      const phase2Sheets = [];
      if (this.blindQueue.length > 0) {
        let deepOrder = null;
        if (mode === 'deep') {
          // GA produces a piece-ordering hint; the multi-width packer still re-selects
          // the width per sheet. Seed it at the widest candidate so every piece fits.
          deepOrder = this._runGAForGroup(
            this.blindQueue, Math.max(...candidateWidths), rollLength, allowRotation, cutMode
          );
        }

        const layout = this._packBucketBestLayout(
          this.blindQueue, candidateWidths, rollLength, allowRotation, cutMode, deepOrder,
          mode, mode === 'deep' ? DEEP_TIME_BUDGET_MS : 0
        );

        if (!layout.allFit) {
          const b = this.blindQueue.find(x => x != null) || {};
          throw new Error(
            `Cannot place blind "${b.shade_number || '?'}" ` +
            `(${(b.width || 0).toFixed(5)}m × ${(b.final_height || 0).toFixed(5)}m) ` +
            `on any of the selected roll widths [${candidateWidths.join(', ')}]m × ${rollLength}m. ` +
            `Check dimensions and units.`
          );
        }

        phase2Sheets.push(...layout.sheets);
        this.blindQueue = []; // fully consumed by the chosen layout
      }

      // CROSS-SHEET BACKFILL — try to dissolve the least-used sheet by
      // repacking its pieces into earlier sheets in the same bucket.
      // No-op when there are 0 or 1 fresh sheets.
      this._backfillSheets(phase2Sheets, cutMode, allowRotation);

      // Commit Phase 2 sheets to DB + log tail-as-leftover for each fresh roll
      for (const sd of phase2Sheets) {
        sheetCounter++;
        const tailLength = sd.rollLength - sd.usedLength;
        if (tailLength >= MIN_REUSABLE_LENGTH && sd.rollWidth >= MIN_REUSABLE_WIDTH) {
          this.candidateLeftovers.push({
            width: sd.rollWidth,
            length: tailLength,
            material_type, color, pattern,
            product_code: product_code || null,
            sheet_number: sheetCounter,
            source: 'tail'
          });
          if (!this.preview && this.saveLeftovers) {
            const tailShadesStr = [...new Set(sd.placed.map(p => p.shade_number).filter(Boolean))].join(', ') || null;
            await Leftover.create({
              width: sd.rollWidth,
              length: tailLength,
              material_type, color, pattern,
              product_code: product_code || null,
              sheet_number: sheetCounter,
              shades: tailShadesStr,
              source_job_id: job.id
            });
          }
        }

        await this.saveSheetResult(
          job.id, sheetCounter, 'fresh_roll',
          sd.rollWidth, sd.usedLength, sd.placed, sd.freeRects,
          [], sd.rollWidth, sd.usedLength, 0, 0,
          this.preview
        );
      }

      // Widths actually used across this group's committed sheets (may be mixed).
      const widthsUsed = [...new Set(this.results.slice(groupSheetStart).map(s => s.width))]
        .sort((a, b) => a - b);
      if (primaryRollWidth == null && widthsUsed.length > 0) primaryRollWidth = widthsUsed[0];
      rollWidthGroups.push({
        roll_width: widthsUsed[0] || 0,
        roll_widths: widthsUsed,
        material_type, color, pattern,
        item_count: group.items.length,
        sheets: sheetCounter - groupSheetStart
      });
    }

    const stats = this.calculateJobStats();
    if (!this.preview) {
      await Job.update(job.id, {
        status: 'optimized',
        total_pieces: totalPieces,
        total_sheets: this.results.length,
        roll_width_used: primaryRollWidth,
        total_waste_percent: stats.wastePercent,
        total_utilization_percent: stats.utilizationPercent
      });
    }

    return {
      job_id: this.preview ? null : job.id,
      preview: this.preview,
      work_order_number,
      client_name,
      roll_width: primaryRollWidth,
      roll_width_groups: rollWidthGroups,
      cut_mode: cutMode,
      mode,
      max_roll_length: rollLength,
      total_pieces: totalPieces,
      total_sheets: this.results.length,
      total_leftovers_used: this.usedLeftovers.length,
      waste_percent: stats.wastePercent,
      utilization_percent: stats.utilizationPercent,
      roll_width_suggestions: allSuggestions.sort((a, b) => b.utilization - a.utilization),
      leftovers: this.candidateLeftovers,
      leftovers_saved: !this.preview && this.saveLeftovers,
      sheets: this.results
    };
  }

  // WIDTH SELECTION INTELLIGENCE
  // ────────────────────────────
  // For every candidate width, gather the items eligible at that width, pack the
  // WHOLE eligible set into a full multi-sheet layout (the same cutting-stock engine
  // Phase 2 uses), and score that layout with the global weighted model. Returns the
  // (width, item subset) assignment with the best GLOBAL score — not the smallest
  // immediate leftover. The caller commits the winner, removes those items, and repeats.
  //
  // Tie-breaks (when scores are within EPS): prefer the width that needs FEWER sheets,
  // then the one that fits MORE pieces — directly honoring goals 1 & 3.
  _findBestAssignment(unassigned, candidateWidths, rollLength, allowRotation, cutMode, defaultWidths = STANDARD_ROLL_WIDTHS) {
    const SCORE_EPS = 0.005;
    let best = null;
    for (const w of candidateWidths) {
      const eligible = unassigned.filter(item => {
        const sw = item.selected_widths && item.selected_widths.length > 0
          ? item.selected_widths
          : defaultWidths;
        return sw.some(v => Math.abs(v - w) < WIDTH_TOL);
      });
      if (eligible.length === 0) continue;

      // Fast dimensional reject before the (more expensive) layout simulation.
      const allFit = eligible.every(item => {
        const iw = parseFloat(item.width) - (parseFloat(item.cut) || 0);
        const valence = parseFloat(item.valence || 0);
        const finalH = item.blind_type === 'zebra'
          ? (parseFloat(item.height) * 2) + valence
          : parseFloat(item.height) + valence;
        const fitsNormal  = iw <= w && finalH <= rollLength;
        const fitsRotated = allowRotation && finalH <= w && iw <= rollLength;
        return fitsNormal || fitsRotated;
      });
      if (!allFit) continue;

      const queue = this._buildSimQueue(eligible);
      // light=true → greedy + one FFD pass per width keeps selection fast; the chosen
      // width is re-packed with the full strategy set in Phase 2.
      const layout = this._packGroupBestLayout(queue, w, rollLength, allowRotation, cutMode, null, true);
      if (!layout.allFit) continue;
      const m = this._layoutMetrics(layout.sheets, w, rollLength);

      const candidate = {
        width: w, items: eligible, score: m.score,
        utilization: parseFloat((m.utilization * 100).toFixed(2)),
        sheets: layout.sheets.length, blinds: m.blinds
      };
      if (!best) { best = candidate; continue; }
      if (candidate.score > best.score + SCORE_EPS) { best = candidate; continue; }
      if (Math.abs(candidate.score - best.score) <= SCORE_EPS) {
        // Near-tie: prefer fewer sheets, then more pieces accommodated.
        if (candidate.sheets < best.sheets ||
            (candidate.sheets === best.sheets && candidate.blinds > best.blinds)) {
          best = candidate;
        }
      }
    }
    return best;
  }

  // Expand items (qty × final-height) into a lightweight packing queue for
  // simulation/scoring. grain_locked is carried so rotation behavior matches reality.
  _buildSimQueue(items) {
    const queue = [];
    let itemIdx = 0;
    for (const item of items) {
      const qty = parseInt(item.quantity) || 1;
      const valence = parseFloat(item.valence || 0);
      const finalHeight = item.blind_type === 'zebra'
        ? (parseFloat(item.height) * 2) + valence
        : parseFloat(item.height) + valence;
      const effWidth = parseFloat(item.width) - (parseFloat(item.cut) || 0);
      for (let i = 0; i < qty; i++) {
        queue.push({
          // Globally-unique id (shade_number may repeat across items — see blindQueue note).
          id: `sim_${item.shade_number || 'item'}_${itemIdx}_${i}`,
          shade_number: item.shade_number || '',
          width: effWidth,
          final_height: finalHeight,
          piece_index: i,
          grain_locked: item.grain_locked === true,
        });
      }
      itemIdx++;
    }
    return queue;
  }

  // ─── Layout-level metrics (the heart of the scoring model) ──────────────────
  // Computes the four normalized objectives + the blended score for a full set of
  // sheets at a given roll width. All-zero-safe.
  //
  // NOTE on areas: MAXRECTS free rectangles OVERLAP (they're *maximal* rects), so
  // their areas must never be summed. Internal waste is therefore derived exactly as
  // (usedArea − blindArea); the free rects are only inspected to find the single
  // largest reusable remnant per sheet (a conservative, overlap-proof estimate).
  _layoutMetrics(sheets, width, rollLength) {
    let blindArea = 0, usedArea = 0, blinds = 0;
    let unusableInternal = 0;          // internal gaps too small to reuse → real waste
    let reusableRemnantArea = 0;       // salvageable offcuts (internal + roll tails)
    let totalWasteArea = 0;            // internal gaps + roll tails

    for (const s of sheets) {
      const L = s.usedLength;
      const sheetUsedArea = width * L;
      usedArea += sheetUsedArea;

      let sheetBlindArea = 0;
      for (const p of s.placed) { sheetBlindArea += p.width * p.height; blinds++; }
      blindArea += sheetBlindArea;

      const internalWaste = Math.max(0, sheetUsedArea - sheetBlindArea);
      totalWasteArea += internalWaste;

      // Largest qualifying free rectangle within the used region = the one offcut
      // we'd realistically reclaim from this sheet's interior.
      let largestReusableInternal = 0;
      for (const fr of (s.freeRects || [])) {
        if (fr.y >= L) continue;
        const clippedH = Math.min(fr.y + fr.height, L) - fr.y;
        if (clippedH < MIN_REUSABLE_LENGTH || fr.width < MIN_REUSABLE_WIDTH) continue;
        const a = fr.width * clippedH;
        if (a > largestReusableInternal) largestReusableInternal = a;
      }
      largestReusableInternal = Math.min(largestReusableInternal, internalWaste);
      reusableRemnantArea += largestReusableInternal;
      unusableInternal += (internalWaste - largestReusableInternal);

      // Roll tail (the uncut remainder) — a full-width remnant, reusable when long enough.
      const tailLen = rollLength - L;
      if (tailLen > 0.0001) {
        const tailArea = width * tailLen;
        totalWasteArea += tailArea;
        if (tailLen >= MIN_REUSABLE_LENGTH && width >= MIN_REUSABLE_WIDTH) {
          reusableRemnantArea += tailArea;
        }
      }
    }

    const K = sheets.length;
    const utilization = usedArea > 0 ? blindArea / usedArea : 0;
    // Area lower bound on sheets — the fewest full rolls that could hold all blind area.
    const minSheets = (width * rollLength) > 0
      ? Math.max(1, Math.ceil(blindArea / (width * rollLength)))
      : K;
    const sheetEfficiency = K > 0 ? Math.min(1, minSheets / K) : 0;
    const wasteReduction = usedArea > 0 ? Math.max(0, 1 - (unusableInternal / usedArea)) : 0;
    const remnantReuse = totalWasteArea > 0 ? (reusableRemnantArea / totalWasteArea) : 1;

    const score =
      SCORE_WEIGHTS.utilization     * utilization +
      SCORE_WEIGHTS.sheetEfficiency * sheetEfficiency +
      SCORE_WEIGHTS.wasteReduction  * wasteReduction +
      SCORE_WEIGHTS.remnantReuse    * remnantReuse;

    return { score, utilization, sheetEfficiency, wasteReduction, remnantReuse, blinds, sheets: K };
  }

  // ─── Cutting-stock packers ──────────────────────────────────────────────────
  // Greedy "max-per-sheet": fills one roll as densely as possible (packSheet tries all
  // heuristic×sort combos) before opening the next. Strong when a few sheets suffice.
  // Returns { sheets, allFit }; sheets carry full piece metadata via packSheet.
  _packQueueGreedy(queue, width, length, allowRotation, cutMode, forceOrder = false) {
    const saved = this.blindQueue;
    this.blindQueue = [...queue];
    const sheets = [];
    let allFit = true;
    while (this.blindQueue.length > 0) {
      const { placed, freeRects } = this.packSheet({
        width, length, allow_rotation: allowRotation, cut_mode: cutMode, force_order: forceOrder
      });
      if (placed.length === 0) { allFit = false; break; }
      sheets.push({
        rollWidth: width, rollLength: length,
        usedLength: Math.max(...placed.map(p => p.y + p.height)),
        placed, freeRects
      });
    }
    this.blindQueue = saved;
    return { sheets, allFit };
  }

  // First-Fit-Decreasing across simultaneously-open rolls (classic 1-D-ish cutting
  // stock). Pieces are sorted big-first, then each piece drops into the first open
  // roll that still has room; a new roll opens only when none fits. This distributes
  // pieces globally and often escapes the local optima that pure max-per-sheet hits.
  _packQueueMultiBin(queue, width, length, allowRotation, cutMode, sortFn) {
    const mode = cutMode === 'guillotine' ? 'guillotine' : 'free';
    const heuristic = mode === 'guillotine' ? 'SHELF' : 'BSSF';
    const pieces = [...queue].filter(b => b != null).sort(sortFn);
    const bins = []; // { bin, placed: [] }
    let allFit = true;

    for (const blind of pieces) {
      const pieceAllowRotation = allowRotation && !blind.grain_locked;
      let lodged = false;
      for (const entry of bins) {
        const r = entry.bin.insert(blind.width, blind.final_height, heuristic, pieceAllowRotation);
        if (r) {
          entry.placed.push({ ...blind, x: r.x, y: r.y, width: r.width, height: r.height, rotated: r.rotated });
          lodged = true;
          break;
        }
      }
      if (lodged) continue;

      const bin = mode === 'guillotine' ? new ShelfPacker(width, length) : new MaxRects(width, length);
      const r = bin.insert(blind.width, blind.final_height, heuristic, pieceAllowRotation);
      if (!r) { allFit = false; continue; } // doesn't fit even on a fresh empty roll
      bins.push({ bin, placed: [{ ...blind, x: r.x, y: r.y, width: r.width, height: r.height, rotated: r.rotated }] });
    }

    const sheets = bins.map(e => ({
      rollWidth: width, rollLength: length,
      usedLength: Math.max(...e.placed.map(p => p.y + p.height)),
      placed: e.placed,
      freeRects: e.bin.getFreeRects()
    }));
    return { sheets, allFit };
  }

  // GLOBAL PACKING: generate several full candidate layouts and return the best-scoring
  // one. Candidates = greedy max-per-sheet + FFD over multiple decreasing sort orders
  // (+ the GA's chromosome order in Deep mode). Scoring every full layout — rather than
  // committing greedily sheet-by-sheet — is what lets a larger single leftover win when
  // it lets more blinds fit overall.
  _packGroupBestLayout(queue, width, length, allowRotation, cutMode, deepOrder = null, light = false) {
    const candidates = [];

    const greedy = this._packQueueGreedy(queue, width, length, allowRotation, cutMode, false);
    if (greedy.allFit) candidates.push(greedy.sheets);

    const ffdSorts = light ? [SORT_AREA] : [SORT_AREA, SORT_HEIGHT, SORT_WIDTH, SORT_PERIM];
    for (const sf of ffdSorts) {
      const r = this._packQueueMultiBin(queue, width, length, allowRotation, cutMode, sf);
      if (r.allFit) candidates.push(r.sheets);
    }

    if (deepOrder) {
      const r = this._packQueueGreedy(deepOrder, width, length, allowRotation, cutMode, true);
      if (r.allFit) candidates.push(r.sheets);
    }

    if (candidates.length === 0) {
      // Nothing fit fully — hand back the (possibly partial) greedy result so the
      // caller can surface a precise "cannot place" error.
      return { sheets: greedy.sheets, allFit: false };
    }

    let bestSheets = null;
    let bestScore = -Infinity;
    for (const sheets of candidates) {
      const m = this._layoutMetrics(sheets, width, length);
      if (m.score > bestScore) { bestScore = m.score; bestSheets = sheets; }
    }
    return { sheets: bestSheets, allFit: true, score: bestScore };
  }

  // ─── Per-sheet width selection ──────────────────────────────────────────────
  // Best full layout for a bucket whose pieces may legally use several roll widths.
  // Several candidate layouts are generated and compared by `_betterLayout` (least
  // wasted fabric first, fewer rolls as a strong tiebreak):
  //   1. Multi-width greedy, "tight" — each sheet uses the width that packs the
  //      remaining pieces most densely (highest per-sheet utilization).
  //   2. Multi-width greedy, "fill" — each sheet uses the width that packs the MOST
  //      pieces (fills the roll fullest → tends to use fewer rolls).
  //   3. Uniform-width layouts — whole bucket on one width (widths that fit every piece).
  //   4. (Thorough mode only) time-boxed random-restart search that keeps the best
  //      layout found and stops early once it stalls.
  // Guarantees the result is never worse than the single-width approach.
  _packBucketBestLayout(queue, candidateWidths, rollLength, allowRotation, cutMode, deepOrder = null, mode = 'quick', timeBudgetMs = 0) {
    const live = [...queue].filter(p => p != null);
    let best = null;
    const consider = (sheets) => {
      if (!sheets || sheets.length === 0) return;
      if (!best || this._betterLayout(sheets, best)) best = sheets;
    };

    for (const criterion of ['tight', 'fill']) {
      const mw = this._packGroupMultiWidth(live, candidateWidths, rollLength, allowRotation, cutMode, criterion);
      if (mw.allFit) consider(mw.sheets);
    }

    for (const w of candidateWidths) {
      const allEligible = live.every(p =>
        this._pieceAllowsWidth(p, w) && this._pieceFits(p, w, rollLength, allowRotation)
      );
      if (!allEligible) continue;
      const layout = this._packGroupBestLayout(live, w, rollLength, allowRotation, cutMode, deepOrder, false);
      if (layout.allFit) consider(layout.sheets);
    }

    // Thorough search: ε-greedy restarts over the WIDTH-ASSIGNMENT space, within a
    // wall-clock budget. Each restart runs the same strong per-sheet packer but, with
    // probability ε, deliberately picks a non-best width for a sheet — escaping the
    // greedy's local optimum so different roll-width combinations get tried. Keeps the
    // best layout found; early-stops after long stagnation so it never burns the full
    // budget for nothing.
    if (mode === 'deep' && timeBudgetMs > 0 && best) {
      const deadline = Date.now() + timeBudgetMs;
      let stale = 0;
      while (Date.now() < deadline && stale < 800) {
        const criterion = Math.random() < 0.5 ? 'tight' : 'fill';
        const r = this._packGroupMultiWidth(live, candidateWidths, rollLength, allowRotation, cutMode, criterion, null, 0.35);
        if (r.allFit && this._betterLayout(r.sheets, best)) { best = r.sheets; stale = 0; }
        else stale++;
      }
    }

    if (!best) {
      const mw = this._packGroupMultiWidth(live, candidateWidths, rollLength, allowRotation, cutMode, 'tight');
      return { sheets: mw.sheets, allFit: false };
    }
    return { sheets: best, allFit: true };
  }

  // Total cost of a full layout. Used by `_betterLayout`.
  //   rolls      = number of sheets (each = one opened roll)
  //   area       = total fabric consumed (Σ width × usedLength)
  //   blindArea  = sum of placed piece areas
  // waste = area − blindArea (side strips + internal gaps within the used region).
  _layoutCost(sheets) {
    let area = 0, blindArea = 0;
    for (const s of sheets) {
      area += s.rollWidth * s.usedLength;
      for (const p of s.placed) blindArea += p.width * p.height;
    }
    return { rolls: sheets.length, area, blindArea, waste: area - blindArea };
  }

  // Is layout `a` better than layout `b`?
  // Priority: (1) least wasted fabric, bucketed so near-ties don't thrash; within a
  // bucket (2) fewer rolls (honors "prefer fewer rolls"); then (3) exact least waste.
  _betterLayout(a, b) {
    const AREA_TOL = 0.25; // m² — treat layouts within this much waste as "equal" on waste
    const ca = this._layoutCost(a), cb = this._layoutCost(b);
    if (Math.abs(ca.waste - cb.waste) > AREA_TOL) return ca.waste < cb.waste;
    if (ca.rolls !== cb.rolls) return ca.rolls < cb.rolls;
    return ca.waste < cb.waste - 1e-9;
  }

  // Multi-width greedy: fill one sheet at a time; each sheet uses the candidate width
  // that, by `criterion`, serves the goal best. Pieces only land on a width they allow.
  //   criterion 'tight' → highest per-sheet utilization (least waste on this sheet).
  //   criterion 'fill'  → most pieces placed on this sheet (fills the roll fullest →
  //                       fewer rolls overall), utilization as the tiebreak.
  //   explore (0..1)    → with this probability, pick a RANDOM eligible width for a sheet
  //                       instead of the best — used by the thorough search to escape the
  //                       greedy's local optimum. 0 = pure greedy (deterministic).
  //   order             → if given, pack pieces in this exact order (force_order).
  _packGroupMultiWidth(queue, candidateWidths, rollLength, allowRotation, cutMode, criterion = 'tight', order = null, explore = 0) {
    const widths = [...candidateWidths].sort((a, b) => a - b);
    let remaining = order ? [...order] : [...queue].filter(p => p != null);
    const forceOrder = !!order;
    const sheets = [];

    const scoreOf = (placed, util) =>
      criterion === 'fill' ? placed.length + util * 1e-3 : util;

    while (remaining.length > 0) {
      const cands = [];
      for (const w of widths) {
        const eligible = remaining.filter(p =>
          this._pieceAllowsWidth(p, w) && this._pieceFits(p, w, rollLength, allowRotation)
        );
        if (eligible.length === 0) continue;
        const { placed, freeRects } = this._packOneSheet(eligible, w, rollLength, allowRotation, cutMode, forceOrder);
        if (placed.length === 0) continue;
        const usedLength = Math.max(...placed.map(p => p.y + p.height));
        const blindArea = placed.reduce((s, p) => s + p.width * p.height, 0);
        const util = (w * usedLength) > 0 ? blindArea / (w * usedLength) : 0;
        cands.push({ width: w, placed, freeRects, usedLength, util, score: scoreOf(placed, util) });
      }
      if (cands.length === 0) return { sheets, allFit: false };

      const pick = (explore > 0 && cands.length > 1 && Math.random() < explore)
        ? cands[Math.floor(Math.random() * cands.length)]
        : cands.reduce((a, b) => (b.score > a.score + 1e-9 ? b : a));

      sheets.push({
        rollWidth: pick.width, rollLength,
        usedLength: pick.usedLength, placed: pick.placed, freeRects: pick.freeRects
      });
      const done = new Set(pick.placed.map(p => `${p.id}|${p.piece_index}`));
      remaining = remaining.filter(p => !done.has(`${p.id}|${p.piece_index}`));
    }
    return { sheets, allFit: true };
  }

  // Pack a single sheet from an explicit piece list without disturbing this.blindQueue.
  // forceOrder=true packs pieces in the given order (no internal re-sorting).
  _packOneSheet(pieces, width, rollLength, allowRotation, cutMode, forceOrder = false) {
    const saved = this.blindQueue;
    this.blindQueue = [...pieces];
    const { placed, freeRects } = this.packSheet({
      width, length: rollLength, allow_rotation: allowRotation, cut_mode: cutMode, force_order: forceOrder
    });
    this.blindQueue = saved;
    return { placed, freeRects };
  }

  // A piece may be packed on width `w` if its allowed_widths set includes w
  // (an empty/missing set means "any width").
  _pieceAllowsWidth(piece, w) {
    const aw = piece.allowed_widths;
    if (!aw || aw.length === 0) return true;
    return aw.some(v => Math.abs(v - w) < WIDTH_TOL);
  }

  // Dimensional fit of a single piece on a width × rollLength sheet (rotation-aware).
  _pieceFits(piece, w, rollLength, allowRotation) {
    const fitsNormal = piece.width <= w && piece.final_height <= rollLength;
    const fitsRotated = allowRotation && !piece.grain_locked &&
      piece.final_height <= w && piece.width <= rollLength;
    return fitsNormal || fitsRotated;
  }

  // Deep Optimise: Order-based GA. Chromosome = permutation of the queue.
  // Fitness = total length used + small per-sheet penalty (lower is better).
  // Returns the best chromosome found, or null if even the GA can't pack the queue.
  //
  // Tuning: pop=24, gens=60, tournament k=3, mutation rate=0.15, elites=2,
  // early-stop after 12 generations without improvement. Typical runtime
  // for 20-80 pieces: ~1-4 seconds. Seeds the initial population with the
  // 4 hand-coded sort orders so it never loses to Quick mode.
  _runGAForGroup(queue, width, rollLength, allowRotation, cutMode) {
    const N = queue.length;
    if (N <= 1) return [...queue];

    const POP_SIZE = 24;
    const MAX_GENS = 60;
    const TOURNAMENT_K = 3;
    const MUTATION_RATE = 0.15;
    const ELITES = 2;
    const STAGNATION_LIMIT = 12;

    const keyOf = (b) => `${b.id}|${b.piece_index}`;

    const evaluate = (chromosome) => {
      // Defensive: reject malformed chromosomes (wrong length or contains holes)
      // — scoring them as Infinity lets the GA discard them naturally.
      if (!Array.isArray(chromosome) || chromosome.length !== N || chromosome.some(c => c == null)) {
        return Infinity;
      }
      const saved = this.blindQueue;
      this.blindQueue = [...chromosome];
      let totalLength = 0;
      let sheets = 0;
      let ok = true;
      while (this.blindQueue.length > 0) {
        const { placed } = this.packSheet({
          width, length: rollLength,
          allow_rotation: allowRotation,
          cut_mode: cutMode,
          force_order: true
        });
        if (placed.length === 0) { ok = false; break; }
        totalLength += Math.max(...placed.map(p => p.y + p.height));
        sheets++;
      }
      this.blindQueue = saved;
      return ok ? totalLength + sheets * 0.01 : Infinity;
    };

    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Order Crossover (OX1): preserve a slice from p1, fill remainder with p2's order
    const crossover = (p1, p2) => {
      // If either parent is malformed (undefined, wrong length, has holes), bail
      // to a fresh shuffle. Keeps a single bad chromosome from corrupting newPop.
      const valid = (p) => Array.isArray(p) && p.length === N && p.every(x => x != null);
      if (!valid(p1) || !valid(p2)) return shuffle(queue);

      const start = Math.floor(Math.random() * N);
      const end = start + Math.floor(Math.random() * (N - start));
      const slice = p1.slice(start, end + 1);
      const sliceKeys = new Set(slice.map(keyOf));
      const fill = p2.filter(x => !sliceKeys.has(keyOf(x)));
      const child = new Array(N);
      for (let i = start; i <= end; i++) child[i] = slice[i - start];
      let fillIdx = 0;
      for (let i = 0; i < N; i++) {
        if (i >= start && i <= end) continue;
        child[i] = fill[fillIdx++];
      }
      // If the OX1 math didn't produce a full permutation (e.g. duplicate keys
      // shrunk `fill`), fall back to a shuffle rather than return a holed child.
      if (child.some(x => x == null)) return shuffle(queue);
      return child;
    };

    const mutate = (chromo) => {
      if (Math.random() > MUTATION_RATE || N < 2) return chromo;
      const copy = [...chromo];
      const i = Math.floor(Math.random() * N);
      let j = Math.floor(Math.random() * N);
      while (j === i) j = Math.floor(Math.random() * N);
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    };

    // Seed with deterministic sorts so GA is no worse than Quick mode's heuristics
    const seeds = [
      [...queue].sort((a, b) => (b.width * b.final_height) - (a.width * a.final_height)),
      [...queue].sort((a, b) => b.final_height - a.final_height),
      [...queue].sort((a, b) => b.width - a.width),
      [...queue].sort((a, b) => (b.width + b.final_height) - (a.width + a.final_height)),
    ];
    let population = [...seeds];
    while (population.length < POP_SIZE) population.push(shuffle(queue));
    let scores = population.map(evaluate);

    let bestIdx = scores.indexOf(Math.min(...scores));
    let bestChromosome = [...population[bestIdx]];
    let bestScore = scores[bestIdx];
    let stagnation = 0;

    const tournament = () => {
      let winner = -1, winnerScore = Infinity;
      for (let i = 0; i < TOURNAMENT_K; i++) {
        const idx = Math.floor(Math.random() * population.length);
        if (scores[idx] < winnerScore) { winner = idx; winnerScore = scores[idx]; }
      }
      // If every sampled chromosome scored Infinity, no `<` ever fires and
      // winner stays -1 → population[-1] is undefined and crashes downstream.
      // Fall back to a random valid member so the GA can still progress.
      if (winner === -1) winner = Math.floor(Math.random() * population.length);
      return population[winner];
    };

    for (let gen = 0; gen < MAX_GENS; gen++) {
      // Sort population by score, take elites
      const order = population.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
      const newPop = order.slice(0, ELITES).map(i => population[i]);

      while (newPop.length < POP_SIZE) {
        const child = mutate(crossover(tournament(), tournament()));
        newPop.push(child);
      }
      population = newPop;
      scores = population.map(evaluate);

      const genBestIdx = scores.indexOf(Math.min(...scores));
      if (scores[genBestIdx] < bestScore) {
        bestScore = scores[genBestIdx];
        bestChromosome = [...population[genBestIdx]];
        stagnation = 0;
      } else {
        stagnation++;
        if (stagnation >= STAGNATION_LIMIT) break;
      }
    }

    return bestScore === Infinity ? null : bestChromosome;
  }

  // Cross-sheet backfill: try to dissolve the smallest fresh sheet in a bucket
  // by repacking its pieces alongside an earlier sheet's pieces.
  // Mutates `sheets` in place. No-op when fewer than 2 sheets.
  //
  // Algorithm — loops until no further consolidation possible:
  //   1. Pick the sheet with the smallest usedLength (the candidate to dissolve).
  //   2. For every other sheet, try to repack (target.placed + source.placed)
  //      on the target's roll dimensions using all 16 packing strategies.
  //   3. If they all fit, update the target with the new placement and drop
  //      the source sheet.
  //   4. Repeat — successive consolidations can cascade.
  //
  // Cost: O(N² × packSheet) per bucket where N = sheet count. Negligible
  // for typical bucket sizes (1-5 sheets).
  _backfillSheets(sheets, cutMode, allowRotation) {
    if (sheets.length < 2) return;
    let changed = true;
    while (changed && sheets.length >= 2) {
      changed = false;

      // Find index of sheet with smallest used length (best candidate to dissolve)
      let srcIdx = 0;
      for (let i = 1; i < sheets.length; i++) {
        if (sheets[i].usedLength < sheets[srcIdx].usedLength) srcIdx = i;
      }
      const source = sheets[srcIdx];

      // Try merging source into each other sheet
      for (let i = 0; i < sheets.length; i++) {
        if (i === srcIdx) continue;
        const target = sheets[i];

        // Don't move pieces onto a roll width they aren't allowed on.
        if (source.placed.some(p => !this._pieceAllowsWidth(p, target.rollWidth))) continue;

        const combinedItems = [
          ...target.placed.map(p => this._asQueueItem(p)),
          ...source.placed.map(p => this._asQueueItem(p))
        ];

        const savedQ = this.blindQueue;
        this.blindQueue = combinedItems;
        const { placed, freeRects } = this.packSheet({
          width: target.rollWidth,
          length: target.rollLength,
          allow_rotation: allowRotation,
          cut_mode: cutMode
        });
        const allFit = this.blindQueue.length === 0;
        this.blindQueue = savedQ;

        if (allFit && placed.length === combinedItems.length) {
          target.placed = placed;
          target.freeRects = freeRects;
          target.usedLength = Math.max(...placed.map(p => p.y + p.height));
          sheets.splice(srcIdx, 1);
          changed = true;
          break;
        }
      }
    }
  }

  // Recreate the pre-rotation queue dimensions from a placed piece, so backfill
  // repacking can decide for itself whether to rotate again.
  _asQueueItem(placed) {
    const origW = placed.rotated ? placed.height : placed.width;
    const origH = placed.rotated ? placed.width : placed.height;
    return {
      ...placed,
      width: origW,
      final_height: origH
    };
  }

  // Runs all heuristic × sort combinations and returns best placement.
  // cut_mode: 'free' uses MAXRECTS (best utilisation, may need non-guillotine cuts).
  //           'guillotine' uses ShelfPacker (2-stage cross-cuts, always physically cuttable).
  // force_order: when true, skip internal sorting and pack pieces in blindQueue order.
  //              Used by the GA in Deep Optimise mode where the chromosome IS the order.
  packSheet({ width, length, allow_rotation, cut_mode, force_order = false }) {
    const mode = cut_mode === 'guillotine' ? 'guillotine' : 'free';
    const HEURISTICS = mode === 'guillotine' ? ['SHELF'] : (force_order ? ['BSSF'] : ['BSSF', 'BLSF', 'BAF', 'BL']);
    // force_order: identity sort preserves chromosome order (Array.sort is stable since ES2019).
    // Otherwise, try multiple heuristic sorts and pick best.
    const SORT_FNS = force_order
      ? [() => 0]
      : mode === 'guillotine'
        ? [
            (a, b) => b.final_height - a.final_height,
            (a, b) => (b.width * b.final_height) - (a.width * a.final_height),
          ]
        : [
            (a, b) => (b.width * b.final_height) - (a.width * a.final_height),
            (a, b) => b.final_height - a.final_height,
            (a, b) => b.width - a.width,
            (a, b) => (b.width + b.final_height) - (a.width + a.final_height),
          ];

    let bestPlaced = [];
    let bestUsedLength = Infinity;
    let bestFreeRects = [];

    for (const heuristic of HEURISTICS) {
      for (const sortFn of SORT_FNS) {
        // Filter out any holes — defensive guard so a malformed GA chromosome
        // can never crash the packer at `blind.width`.
        const candidates = [...this.blindQueue].filter(b => b != null).sort(sortFn);
        const bin = mode === 'guillotine' ? new ShelfPacker(width, length) : new MaxRects(width, length);
        const placed = [];

        for (const blind of candidates) {
          // Per-piece grain lock disables rotation even if the job allows it
          const pieceAllowRotation = allow_rotation && !blind.grain_locked;
          const result = bin.insert(blind.width, blind.final_height, heuristic, pieceAllowRotation);
          if (result) {
            placed.push({
              ...blind,
              x: result.x,
              y: result.y,
              width: result.width,
              height: result.height,
              rotated: result.rotated
            });
          }
        }

        if (placed.length === 0) continue;

        const usedLength = Math.max(...placed.map(p => p.y + p.height));
        const isBetter =
          placed.length > bestPlaced.length ||
          (placed.length === bestPlaced.length && usedLength < bestUsedLength);

        if (isBetter) {
          bestPlaced = placed;
          bestUsedLength = usedLength;
          bestFreeRects = bin.getFreeRects();
        }
      }
    }

    for (const p of bestPlaced) {
      const idx = this.blindQueue.findIndex(b => b.id === p.id && b.piece_index === p.piece_index);
      if (idx !== -1) this.blindQueue.splice(idx, 1);
    }

    return { placed: bestPlaced, freeRects: bestFreeRects };
  }

  // Pure simulation — no DB writes. Packs the items with the global candidate-layout
  // engine and reports the resulting metrics for a given roll width. Backward-compatible
  // shape ({ width, utilization, sheets, all_fit }) plus the scoring breakdown for UI.
  simulatePacking(items, width, rollLength, allowRotation, cutMode = DEFAULT_CUT_MODE) {
    const queue = this._buildSimQueue(items);
    const layout = this._packGroupBestLayout(queue, width, rollLength, allowRotation, cutMode, null, false);
    const m = this._layoutMetrics(layout.sheets, width, rollLength);
    return {
      width,
      utilization: parseFloat((m.utilization * 100).toFixed(2)),
      sheets: layout.sheets.length,
      all_fit: layout.allFit,
      score: parseFloat(m.score.toFixed(4)),
      blinds: m.blinds,
      waste_percent: parseFloat(((1 - m.utilization) * 100).toFixed(2)),
    };
  }

  // Runs simulation for all available widths and returns sorted suggestions.
  suggestRollWidths(items, availableWidths, rollLength, allowRotation, cutMode = DEFAULT_CUT_MODE) {
    const results = [];
    for (const w of availableWidths) {
      let allFit = true;
      for (const item of items) {
        const iw = parseFloat(item.width) - (parseFloat(item.cut) || 0);
        const valence = parseFloat(item.valence || 0);
        const finalH = item.blind_type === 'zebra'
          ? (parseFloat(item.height) * 2) + valence
          : parseFloat(item.height) + valence;
        const fitsNormal  = iw <= w && finalH <= rollLength;
        const fitsRotated = allowRotation && finalH <= w && iw <= rollLength;
        if (!fitsNormal && !fitsRotated) { allFit = false; break; }
      }
      if (!allFit) continue;
      const sim = this.simulatePacking(items, w, rollLength, allowRotation, cutMode);
      if (sim.all_fit) results.push(sim);
    }
    return results.sort((a, b) => b.utilization - a.utilization);
  }

  async saveSheetResult(
    jobId, sheetNumber, sheetType, rollWidth, usedLength, placed, freeRects,
    previousBlinds = [], originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY,
    preview = false
  ) {
    const totalSheetArea = rollWidth * usedLength;
    const blindArea = placed.reduce((sum, p) => sum + (p.width * p.height), 0);
    const utilization = totalSheetArea > 0 ? (blindArea / totalSheetArea) * 100 : 0;
    const wastePercent = 100 - utilization;

    const wasteAreas = [];
    const reusableLeftovers = [];

    for (const fr of freeRects) {
      if (fr.y >= usedLength) continue;
      const clippedH = Math.min(fr.y + fr.height, usedLength) - fr.y;
      if (clippedH < 0.001 || fr.width < 0.001) continue;
      const area = fr.width * clippedH;
      wasteAreas.push({ x: fr.x, y: fr.y, width: fr.width, height: clippedH, area });
      if (fr.width >= MIN_REUSABLE_WIDTH && clippedH >= MIN_REUSABLE_LENGTH) {
        reusableLeftovers.push({ x: fr.x, y: fr.y, width: fr.width, height: clippedH, area });
      }
    }

    // Record reusable offcuts as candidate leftovers (for the review sidebar),
    // regardless of preview/save mode.
    for (const rl of reusableLeftovers) {
      this.candidateLeftovers.push({
        width: rl.width,
        length: rl.height,
        material_type: placed[0].material_type,
        color: placed[0].color,
        pattern: placed[0].pattern,
        product_code: placed[0].product_code || null,
        sheet_number: sheetNumber,
        source: 'offcut'
      });
    }

    if (!preview) {
      if (this.saveLeftovers) {
        const sheetShadesStr = [...new Set(placed.map(p => p.shade_number).filter(Boolean))].join(', ') || null;
        for (const rl of reusableLeftovers) {
          await Leftover.create({
            width: rl.width,
            length: rl.height,
            material_type: placed[0].material_type,
            color: placed[0].color,
            pattern: placed[0].pattern,
            product_code: placed[0].product_code || null,
            sheet_number: sheetNumber,
            shades: sheetShadesStr,
            source_job_id: jobId
          });
        }
      }

      await OptimizationResult.create({
      job_id: jobId,
      sheet_number: sheetNumber,
      sheet_type: sheetType,
      roll_width: rollWidth,
      roll_length_used: usedLength,
      blinds_placed: placed.map(p => ({
        blind_id: p.id,
        shade_number: p.shade_number,
        piece_index: p.piece_index,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        cut: p.cut || 0,
        ordered_width: p.ordered_width !== undefined ? p.ordered_width : p.width,
        original_height: p.height_orig !== undefined ? p.height_orig : null,
        valence: p.valence || 0,
        blind_type: p.blind_type,
        rotated: p.rotated || false,
      })),
      waste_areas: wasteAreas,
      reusable_leftovers: reusableLeftovers,
        utilization_percent: parseFloat(utilization.toFixed(2)),
        waste_percent: parseFloat(wastePercent.toFixed(2))
      });
    } // end if (!preview)

    this.results.push({
      sheet_number: sheetNumber,
      sheet_type: sheetType,
      width: rollWidth,
      length: usedLength,
      blinds: placed.map(p => ({
        ...p,
        valence: p.valence || 0,
        original_height: p.height,
      })),
      waste_areas: wasteAreas,
      reusable_leftovers: reusableLeftovers,
      previous_blinds: previousBlinds,
      original_width: originalWidth,
      original_length: originalLength,
      leftover_offset_x: leftoverOffsetX,
      leftover_offset_y: leftoverOffsetY,
      utilization: parseFloat(utilization.toFixed(2)),
      waste: parseFloat(wastePercent.toFixed(2))
    });
  }

  calculateJobStats() {
    let totalBlindArea = 0;
    let totalSheetArea = 0;
    let totalBlinds = 0;

    for (const sheet of this.results) {
      for (const p of sheet.blinds) {
        totalBlindArea += p.width * p.height;
        totalBlinds++;
      }
      totalSheetArea += sheet.width * sheet.length;
    }

    const utilization = totalSheetArea > 0 ? (totalBlindArea / totalSheetArea) * 100 : 0;
    return {
      totalBlinds,
      utilizationPercent: parseFloat(utilization.toFixed(2)),
      wastePercent: parseFloat((100 - utilization).toFixed(2))
    };
  }
}

module.exports = Optimizer;
