const { Leftover, Job, JobItem, OptimizationResult } = require('../models');

const STANDARD_ROLL_WIDTHS = [2.0, 2.5, 2.8, 2.9, 3.0];
const MIN_REUSABLE_WIDTH = 0.3;
const MIN_REUSABLE_LENGTH = 0.5;
const DEFAULT_ROLL_LENGTH = 30;

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

class Optimizer {
  constructor() {
    this.results = [];
    this.blindQueue = [];
    this.usedLeftovers = [];
  }

  async optimizeWorkOrder(payload) {
    const {
      work_order_number, client_name, items,
      allow_rotation, max_roll_length
    } = payload;

    const rollLength = parseFloat(max_roll_length) > 0 ? parseFloat(max_roll_length) : DEFAULT_ROLL_LENGTH;
    if (!items || items.length === 0) throw new Error('No items in work order');

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

    const materialType = items[0].material_type;
    const color = items[0].color;
    const pattern = items[0].pattern || null;
    for (const item of items) {
      if (item.material_type !== materialType || item.color !== color || (item.pattern || null) !== pattern) {
        throw new Error('All items must have the same material, color, and pattern');
      }
    }

    // Create job
    const job = await Job.create({
      work_order_number: work_order_number || null,
      client_name: client_name || null,
      allow_rotation: allow_rotation || false
    });
    let totalPieces = 0;
    for (const item of items) {
      await JobItem.create({ ...item, job_id: job.id });
      totalPieces += parseInt(item.quantity) || 1;
    }

    // Group items by their selected_widths (each unique set is a separate packing run)
    const groupMap = new Map();
    for (const item of items) {
      const sw = Array.isArray(item.selected_widths) && item.selected_widths.length > 0
        ? item.selected_widths.map(Number).sort((a, b) => a - b)
        : STANDARD_ROLL_WIDTHS.slice().sort((a, b) => a - b);
      const key = JSON.stringify(sw);
      if (!groupMap.has(key)) groupMap.set(key, { widths: sw, items: [] });
      groupMap.get(key).items.push(item);
    }

    this.results = [];
    this.usedLeftovers = [];
    let sheetCounter = 0;
    let primaryRollWidth = null;
    const allSuggestions = [];

    const safeParse = (val) => {
      if (!val) return [];
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return []; }
    };

    for (const [, group] of groupMap) {
      // Pick best roll width for this group
      const sug = this.suggestRollWidths(group.items, group.widths, rollLength, allow_rotation || false);
      if (sug.length === 0) {
        const names = group.items.map(i => `"${i.shade_number}"`).join(', ');
        throw new Error(
          `No roll width can fit the pieces: ${names}. Check piece widths vs selected roll widths.`
        );
      }
      const effectiveRollWidth = sug[0].width;
      if (!primaryRollWidth) primaryRollWidth = effectiveRollWidth;
      for (const s of sug) {
        if (!allSuggestions.some(e => e.width === s.width)) allSuggestions.push(s);
      }

      // Validate widths fit
      for (const item of group.items) {
        const w = parseFloat(item.width);
        if (w > effectiveRollWidth) {
          throw new Error(
            `Blind "${item.shade_number}" width ${w.toFixed(5)}m exceeds roll width ${effectiveRollWidth}m. ` +
            `Select a wider roll or reduce the piece width.`
          );
        }
      }

      // Build blind queue for this group
      this.blindQueue = [];
      for (const item of group.items) {
        const qty = parseInt(item.quantity) || 1;
        const valence = parseFloat(item.valence || 0);
        const finalHeight = item.blind_type === 'zebra'
          ? (parseFloat(item.height) * 2) + valence
          : parseFloat(item.height) + valence;
        for (let i = 0; i < qty; i++) {
          this.blindQueue.push({
            id: `${item.shade_number || 'item'}_${i}`,
            shade_number: item.shade_number || '',
            blind_type: item.blind_type,
            width: parseFloat(item.width),
            height: parseFloat(item.height),
            valence,
            final_height: finalHeight,
            piece_index: i,
            material_type: materialType,
            color,
            pattern
          });
        }
      }

      // PHASE 1: Reuse leftovers first
      const leftovers = await Leftover.findByMaterialSignature(materialType, color, pattern);
      const sortedLeftovers = [...leftovers].sort((a, b) => (b.width * b.length) - (a.width * a.length));

      for (const leftover of sortedLeftovers) {
        if (this.blindQueue.length === 0) break;
        if (parseFloat(leftover.width) < effectiveRollWidth * 0.8) continue;

        const { placed, freeRects } = this.packSheet({
          width: parseFloat(leftover.width),
          length: parseFloat(leftover.length),
          allow_rotation: allow_rotation || false
        });

        if (placed.length > 0) {
          sheetCounter++;
          this.usedLeftovers.push(leftover.id);
          const usedLength = Math.max(...placed.map(p => p.y + p.height));
          const remainingLength = parseFloat(leftover.length) - usedLength;

          if (remainingLength < 0.1) {
            await Leftover.markUsed(leftover.id);
          } else {
            await Leftover.updateDimensions(leftover.id, parseFloat(leftover.width), remainingLength);
          }

          let previousBlinds = [];
          let originalWidth = parseFloat(leftover.width);
          let originalLength = parseFloat(leftover.length);
          let leftoverOffsetX = 0;
          let leftoverOffsetY = 0;

          if (leftover.source_job_id) {
            const prevResults = await OptimizationResult.findByJob(leftover.source_job_id);
            for (const pr of prevResults) {
              const prevWaste = safeParse(pr.reusable_leftovers);
              const prevBlinds = safeParse(pr.blinds_placed);
              const matched = prevWaste.find(wl =>
                Math.abs(parseFloat(wl.width) - parseFloat(leftover.width)) < 0.01 &&
                Math.abs(parseFloat(wl.height) - parseFloat(leftover.length)) < 0.01
              );
              if (matched) {
                originalWidth = parseFloat(pr.roll_width);
                originalLength = parseFloat(pr.roll_length_used);
                leftoverOffsetX = parseFloat(matched.x);
                leftoverOffsetY = parseFloat(matched.y);
                previousBlinds = prevBlinds;
                break;
              }
              if (Math.abs(parseFloat(pr.roll_width) - parseFloat(leftover.width)) < 0.01) {
                const prevUsedLength = parseFloat(pr.roll_length_used);
                const tailLength = rollLength - prevUsedLength;
                if (Math.abs(tailLength - parseFloat(leftover.length)) < 0.1) {
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
            parseFloat(leftover.width), usedLength, placed, freeRects,
            previousBlinds, originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY
          );
        }
      }

      // PHASE 2: Fresh rolls
      while (this.blindQueue.length > 0) {
        sheetCounter++;
        const { placed, freeRects } = this.packSheet({
          width: effectiveRollWidth,
          length: rollLength,
          allow_rotation: allow_rotation || false
        });

        if (placed.length === 0) {
          const b = this.blindQueue[0];
          throw new Error(
            `Cannot place blind "${b.shade_number}" (${b.width.toFixed(5)}m × ${b.final_height.toFixed(5)}m) ` +
            `on a ${effectiveRollWidth}m × ${rollLength}m roll. Check dimensions and units.`
          );
        }

        const usedLength = Math.max(...placed.map(p => p.y + p.height));
        const remainingLength = rollLength - usedLength;
        if (remainingLength >= MIN_REUSABLE_LENGTH && effectiveRollWidth >= MIN_REUSABLE_WIDTH) {
          await Leftover.create({
            width: effectiveRollWidth,
            length: remainingLength,
            material_type: materialType,
            color,
            pattern,
            source_job_id: job.id
          });
        }

        await this.saveSheetResult(
          job.id, sheetCounter, 'fresh_roll',
          effectiveRollWidth, usedLength, placed, freeRects,
          [], effectiveRollWidth, usedLength, 0, 0
        );
      }
    }

    const stats = this.calculateJobStats();
    await Job.update(job.id, {
      status: 'optimized',
      total_pieces: totalPieces,
      total_sheets: this.results.length,
      roll_width_used: primaryRollWidth,
      total_waste_percent: stats.wastePercent,
      total_utilization_percent: stats.utilizationPercent
    });

    return {
      job_id: job.id,
      work_order_number,
      client_name,
      roll_width: primaryRollWidth,
      max_roll_length: rollLength,
      total_pieces: totalPieces,
      total_sheets: this.results.length,
      total_leftovers_used: this.usedLeftovers.length,
      waste_percent: stats.wastePercent,
      utilization_percent: stats.utilizationPercent,
      roll_width_suggestions: allSuggestions.sort((a, b) => b.utilization - a.utilization),
      sheets: this.results
    };
  }

  // Runs all 16 strategy combinations and returns best placement.
  packSheet({ width, length, allow_rotation }) {
    const HEURISTICS = ['BSSF', 'BLSF', 'BAF', 'BL'];
    const SORT_FNS = [
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
        const candidates = [...this.blindQueue].sort(sortFn);
        const bin = new MaxRects(width, length);
        const placed = [];

        for (const blind of candidates) {
          const result = bin.insert(blind.width, blind.final_height, heuristic, allow_rotation);
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

  // Pure simulation — no DB writes. Returns utilization for a given roll width.
  simulatePacking(items, width, rollLength, allowRotation) {
    const queue = [];
    for (const item of items) {
      const qty = parseInt(item.quantity) || 1;
      const valence = parseFloat(item.valence || 0);
      const finalHeight = item.blind_type === 'zebra'
        ? (parseFloat(item.height) * 2) + valence
        : parseFloat(item.height) + valence;
      for (let i = 0; i < qty; i++) {
        queue.push({
          id: `sim_${item.shade_number || 'item'}_${i}`,
          width: parseFloat(item.width),
          final_height: finalHeight,
          piece_index: i
        });
      }
    }

    const savedQueue = this.blindQueue;
    this.blindQueue = queue;

    let totalBlindArea = 0;
    let totalSheetArea = 0;
    let sheets = 0;
    let allFit = true;

    while (this.blindQueue.length > 0) {
      const { placed } = this.packSheet({ width, length: rollLength, allow_rotation: allowRotation });
      if (placed.length === 0) { allFit = false; break; }
      const usedLength = Math.max(...placed.map(p => p.y + p.height));
      totalBlindArea += placed.reduce((sum, p) => sum + p.width * p.height, 0);
      totalSheetArea += width * usedLength;
      sheets++;
    }

    this.blindQueue = savedQueue;

    const utilization = totalSheetArea > 0 ? (totalBlindArea / totalSheetArea) * 100 : 0;
    return { width, utilization: parseFloat(utilization.toFixed(2)), sheets, all_fit: allFit };
  }

  // Runs simulation for all available widths and returns sorted suggestions.
  suggestRollWidths(items, availableWidths, rollLength, allowRotation) {
    const results = [];
    for (const w of availableWidths) {
      let allFit = true;
      for (const item of items) {
        const iw = parseFloat(item.width);
        const valence = parseFloat(item.valence || 0);
        const finalH = item.blind_type === 'zebra'
          ? (parseFloat(item.height) * 2) + valence
          : parseFloat(item.height) + valence;
        const fitsNormal  = iw <= w && finalH <= rollLength;
        const fitsRotated = allowRotation && finalH <= w && iw <= rollLength;
        if (!fitsNormal && !fitsRotated) { allFit = false; break; }
      }
      if (!allFit) continue;
      const sim = this.simulatePacking(items, w, rollLength, allowRotation);
      if (sim.all_fit) results.push(sim);
    }
    return results.sort((a, b) => b.utilization - a.utilization);
  }

  async saveSheetResult(
    jobId, sheetNumber, sheetType, rollWidth, usedLength, placed, freeRects,
    previousBlinds = [], originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY
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

    for (const rl of reusableLeftovers) {
      await Leftover.create({
        width: rl.width,
        length: rl.height,
        material_type: placed[0].material_type,
        color: placed[0].color,
        pattern: placed[0].pattern,
        source_job_id: jobId
      });
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
