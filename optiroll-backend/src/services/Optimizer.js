const { Leftover, Job, JobItem, OptimizationResult } = require('../models');

const STANDARD_ROLL_WIDTHS = [2.0, 2.5, 2.8, 2.9, 3.0];
const MIN_REUSABLE_WIDTH = 0.3;
const MIN_REUSABLE_LENGTH = 0.5;
const DEFAULT_ROLL_LENGTH = 30; // Standard roll length in meters

class Optimizer {
  constructor() {
    this.results = [];
    this.blindQueue = [];
    this.usedLeftovers = [];
  }

  /**
   * MAIN: Run optimization for a work order
   * Payload: { work_order_number, client_name, roll_width, items[], allow_rotation }
   */
  async optimizeWorkOrder(payload) {
    const { work_order_number, client_name, roll_width, items, allow_rotation } = payload;

    if (!items || items.length === 0) throw new Error('No items in work order');
    if (!roll_width || roll_width <= 0) throw new Error('Invalid roll width');

    // Validate all items have same material signature
    const materialType = items[0].material_type;
    const color = items[0].color;
    const pattern = items[0].pattern || null;

    for (const item of items) {
      if (item.material_type !== materialType || item.color !== color || (item.pattern || null) !== pattern) {
        throw new Error('All items must have the same material, color, and pattern');
      }
    }

    // Create job record
    const job = await Job.create({
      work_order_number: work_order_number || null,
      client_name: client_name || null,
      allow_rotation: allow_rotation || false
    });

    // Save job items
    let totalPieces = 0;
    for (const item of items) {
      await JobItem.create({ ...item, job_id: job.id });
      totalPieces += parseInt(item.quantity) || 1;
    }

    // Expand quantities into individual pieces with final heights
    this.blindQueue = [];
    for (const item of items) {
      const qty = parseInt(item.quantity) || 1;
      const finalHeight = item.blind_type === 'zebra'
        ? (parseFloat(item.height) * 2) + parseFloat(item.valence || 0)
        : parseFloat(item.height) + parseFloat(item.valence || 0);

      for (let i = 0; i < qty; i++) {
        this.blindQueue.push({
          id: `${item.shade_number || 'item'}_${i}`,
          shade_number: item.shade_number || '',
          blind_type: item.blind_type,
          width: parseFloat(item.width),
          height: parseFloat(item.height),
          final_height: finalHeight,
          piece_index: i,
          material_type: materialType,
          color,
          pattern
        });
      }
    }

    this.results = [];
    this.usedLeftovers = [];

    let sheetCounter = 0;

    // Load leftovers matching this material signature
    const leftovers = await Leftover.findByMaterialSignature(materialType, color, pattern);
    const sortedLeftovers = [...leftovers].sort((a, b) => (b.width * b.length) - (a.width * a.length));

    // PHASE 1: LEFTOVER FIRST — try to use matching leftovers
    for (const leftover of sortedLeftovers) {
      if (this.blindQueue.length === 0) break;
      if (parseFloat(leftover.width) < roll_width * 0.8) continue; // Skip if too narrow

      const placed = this.packSheet({
        width: parseFloat(leftover.width),
        length: parseFloat(leftover.length),
        allow_rotation: allow_rotation || false
      });

      if (placed.length > 0) {
        sheetCounter++;
        this.usedLeftovers.push(leftover.id);

        const usedLength = this.calculateUsedLength(placed);
        const remainingLength = parseFloat(leftover.length) - usedLength;

        if (remainingLength < 0.1) {
          await Leftover.markUsed(leftover.id);
        } else {
          await Leftover.updateDimensions(leftover.id, parseFloat(leftover.width), remainingLength);
        }

        // Fetch previous cuts from the job that created this leftover
        let previousBlinds = [];
        let originalWidth = parseFloat(leftover.width);
        let originalLength = parseFloat(leftover.length);
        let leftoverOffsetX = 0;
        let leftoverOffsetY = 0;

        if (leftover.source_job_id) {
          const prevResults = await OptimizationResult.findByJob(leftover.source_job_id);
          const safeParse = (val) => {
            if (!val) return [];
            if (typeof val === 'object') return val;
            try { return JSON.parse(val); } catch { return []; }
          };

          for (const pr of prevResults) {
            const prevWaste = safeParse(pr.reusable_leftovers);
            const prevBlinds = safeParse(pr.blinds_placed);

            // Check if any reusable leftover from this sheet matches our current leftover dimensions
            const matched = prevWaste.find(wl =>
              Math.abs(parseFloat(wl.width) - parseFloat(leftover.width)) < 0.01 &&
              Math.abs(parseFloat(wl.height) - parseFloat(leftover.length)) < 0.01
            );

            if (matched) {
              // This leftover came from a specific reusable area on the original sheet
              originalWidth = parseFloat(pr.roll_width);
              originalLength = parseFloat(pr.roll_length_used);
              leftoverOffsetX = parseFloat(matched.x);
              leftoverOffsetY = parseFloat(matched.y);

              // Previous blinds stay in ORIGINAL sheet coordinates
              // New blinds will be offset by leftoverOffsetX/Y when rendered
              previousBlinds = prevBlinds;
              break;
            }

            // Also check tail waste case: leftover is the bottom strip of a fresh roll
            if (Math.abs(parseFloat(pr.roll_width) - parseFloat(leftover.width)) < 0.01) {
              const prevUsedLength = parseFloat(pr.roll_length_used);
              const tailLength = DEFAULT_ROLL_LENGTH - prevUsedLength;
              if (Math.abs(tailLength - parseFloat(leftover.length)) < 0.1) {
                originalWidth = parseFloat(pr.roll_width);
                originalLength = DEFAULT_ROLL_LENGTH;
                leftoverOffsetX = 0;
                leftoverOffsetY = prevUsedLength;
                previousBlinds = prevBlinds;
                break;
              }
            }
          }
        }

        await this.saveSheetResult(
          job.id, sheetCounter, 'leftover', parseFloat(leftover.width), usedLength, placed,
          previousBlinds, originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY
        );
      }
    }

    // PHASE 2: FRESH ROLLS with selected width
    this.blindQueue.sort((a, b) => (b.width * b.final_height) - (a.width * a.final_height));

    while (this.blindQueue.length > 0) {
      sheetCounter++;

      const placed = this.packSheet({
        width: parseFloat(roll_width),
        length: DEFAULT_ROLL_LENGTH,
        allow_rotation: allow_rotation || false
      });

      if (placed.length === 0) {
        throw new Error(`Cannot fit remaining ${this.blindQueue.length} blinds on ${roll_width}m roll`);
      }

      const usedLength = this.calculateUsedLength(placed);

      // Create leftover from unused roll length
      const remainingLength = DEFAULT_ROLL_LENGTH - usedLength;
      if (remainingLength >= MIN_REUSABLE_LENGTH && roll_width >= MIN_REUSABLE_WIDTH) {
        await Leftover.create({
          width: roll_width,
          length: remainingLength,
          material_type: materialType,
          color,
          pattern,
          source_job_id: job.id
        });
      }

      await this.saveSheetResult(
        job.id, sheetCounter, 'fresh_roll', roll_width, usedLength, placed,
        [], roll_width, usedLength, 0, 0
      );
    }

    // Calculate totals
    const stats = this.calculateJobStats();

    await Job.update(job.id, {
      status: 'optimized',
      total_pieces: totalPieces,
      total_sheets: this.results.length,
      roll_width_used: roll_width,
      total_waste_percent: stats.wastePercent,
      total_utilization_percent: stats.utilizationPercent
    });

    return {
      job_id: job.id,
      work_order_number,
      client_name,
      roll_width,
      total_pieces: totalPieces,
      total_sheets: this.results.length,
      total_leftovers_used: this.usedLeftovers.length,
      waste_percent: stats.wastePercent,
      utilization_percent: stats.utilizationPercent,
      sheets: this.results
    };
  }

  /**
   * ROW-BASED NESTING (Shelf Packing)
   */
  packSheet(sheet) {
    const placed = [];
    const sheetWidth = sheet.width;
    const sheetLength = sheet.length;
    const allowRotation = sheet.allow_rotation;

    const candidates = [...this.blindQueue].sort((a, b) => b.width - a.width);

    let currentRowY = 0;
    let currentRowHeight = 0;
    let currentRowX = 0;
    const toRemove = [];

    for (const blind of candidates) {
      let blindWidth = blind.width;
      let blindHeight = blind.final_height;

      // Try rotation if allowed and it fits better
      if (allowRotation && blindHeight <= sheetWidth && blindWidth <= sheetLength) {
        if (blindHeight < blindWidth) {
          const temp = blindWidth;
          blindWidth = blindHeight;
          blindHeight = temp;
        }
      }

      if (blindWidth > sheetWidth || blindHeight > sheetLength) {
        // Try rotated if not already
        if (allowRotation && blind.final_height <= sheetWidth && blind.width <= sheetLength) {
          blindWidth = blind.final_height;
          blindHeight = blind.width;
        } else {
          continue;
        }
      }

      if (currentRowX + blindWidth <= sheetWidth) {
        placed.push({
          ...blind,
          x: currentRowX,
          y: currentRowY,
          width: blindWidth,
          height: blindHeight,
          rotated: blindWidth !== blind.width
        });
        currentRowX += blindWidth;
        currentRowHeight = Math.max(currentRowHeight, blindHeight);
        toRemove.push(blind);
      } else {
        currentRowY += currentRowHeight;
        if (currentRowY + blindHeight > sheetLength) continue;

        currentRowX = 0;
        currentRowHeight = blindHeight;

        placed.push({
          ...blind,
          x: currentRowX,
          y: currentRowY,
          width: blindWidth,
          height: blindHeight,
          rotated: blindWidth !== blind.width
        });
        currentRowX += blindWidth;
        toRemove.push(blind);
      }
    }

    for (const blind of toRemove) {
      const idx = this.blindQueue.findIndex(b => b.id === blind.id && b.piece_index === blind.piece_index);
      if (idx !== -1) this.blindQueue.splice(idx, 1);
    }

    return placed;
  }

  calculateUsedLength(placed) {
    if (placed.length === 0) return 0;
    const rows = [];
    let currentRow = [];
    for (const item of placed) {
      if (currentRow.length === 0 || Math.abs(item.y - currentRow[0].y) < 0.001) {
        currentRow.push(item);
      } else {
        rows.push(currentRow);
        currentRow = [item];
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    let totalHeight = 0;
    for (const row of rows) {
      totalHeight += Math.max(...row.map(i => i.height));
    }
    return totalHeight;
  }

  async saveSheetResult(jobId, sheetNumber, sheetType, rollWidth, usedLength, placed,
                       previousBlinds = [], originalWidth, originalLength, leftoverOffsetX, leftoverOffsetY) {
    const totalSheetArea = rollWidth * usedLength;
    const blindArea = placed.reduce((sum, p) => sum + (p.width * p.height), 0);
    const utilization = totalSheetArea > 0 ? (blindArea / totalSheetArea) * 100 : 0;
    const wastePercent = 100 - utilization;

    const wasteAreas = [];
    const reusableLeftovers = [];

    const rows = [];
    let currentRow = [];
    for (const item of placed) {
      if (currentRow.length === 0 || Math.abs(item.y - currentRow[0].y) < 0.001) {
        currentRow.push(item);
      } else {
        rows.push(currentRow);
        currentRow = [item];
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    for (const row of rows) {
      const rowY = row[0].y;
      const rowHeight = Math.max(...row.map(r => r.height));
      const rowWidthUsed = row.reduce((sum, r) => sum + r.width, 0);
      const wasteWidth = rollWidth - rowWidthUsed;

      if (wasteWidth > 0.001) {
        wasteAreas.push({ x: rowWidthUsed, y: rowY, width: wasteWidth, height: rowHeight, area: wasteWidth * rowHeight });
        if (wasteWidth >= MIN_REUSABLE_WIDTH && rowHeight >= MIN_REUSABLE_LENGTH) {
          reusableLeftovers.push({ x: rowWidthUsed, y: rowY, width: wasteWidth, height: rowHeight, area: wasteWidth * rowHeight });
        }
      }
    }

    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const lastRowY = lastRow[0].y;
      const lastRowHeight = Math.max(...lastRow.map(r => r.height));
      const bottomY = lastRowY + lastRowHeight;
      const bottomWaste = usedLength - bottomY;

      if (bottomWaste > 0.001) {
        wasteAreas.push({ x: 0, y: bottomY, width: rollWidth, height: bottomWaste, area: rollWidth * bottomWaste });
        if (rollWidth >= MIN_REUSABLE_WIDTH && bottomWaste >= MIN_REUSABLE_LENGTH) {
          reusableLeftovers.push({ x: 0, y: bottomY, width: rollWidth, height: bottomWaste, area: rollWidth * bottomWaste });
        }
      }
    }

    // Save reusable leftovers to DB
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

    const result = await OptimizationResult.create({
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
        blind_type: p.blind_type,
        rotated: p.rotated || false
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
      blinds: placed,
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