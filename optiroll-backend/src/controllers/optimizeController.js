const Optimizer = require('../services/Optimizer');
const { OptimizationResult, Setting, ActivityLog } = require('../models');

const optimizer = new Optimizer();

const safeParse = (val) => {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return []; }
};

exports.run = async (req, res, next) => {
  try {
    const maxLengthSetting = await Setting.get('max_roll_length');
    const max_roll_length = req.body.max_roll_length
      || (maxLengthSetting ? parseFloat(maxLengthSetting) : 30);

    const leftoverSetting = await Setting.get('leftover_reuse_threshold');
    const leftover_threshold = req.body.leftover_threshold
      ?? (leftoverSetting ? parseFloat(leftoverSetting) : 0.8);

    // Load configured roll widths so optimizer's fallback respects Settings additions.
    // (Frontend always sends per-item selected_widths; this only kicks in for direct API calls.)
    const widthsSetting = await Setting.get('roll_widths');
    let default_widths;
    try {
      const parsed = typeof widthsSetting === 'string' ? JSON.parse(widthsSetting) : widthsSetting;
      default_widths = Array.isArray(parsed)
        ? parsed.map(Number).filter(v => Number.isFinite(v) && v > 0)
        : null;
    } catch {
      default_widths = null;
    }

    const result = await optimizer.optimizeWorkOrder({
      ...req.body,
      max_roll_length,
      leftover_threshold,
      default_widths
    });
    if (!result.preview) {
      await ActivityLog.create({
        user_id: req.user?.id,
        action: 'job.optimized',
        entity_type: 'job',
        entity_id: result.job_id,
        description: `Optimized work order ${result.work_order_number || result.job_id} (${result.mode || 'quick'})`,
        metadata: {
          total_pieces: result.total_pieces,
          total_sheets: result.total_sheets,
          roll_width: result.roll_width,
          mode: result.mode,
          cut_mode: result.cut_mode
        }
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getResults = async (req, res, next) => {
  try {
    const results = await OptimizationResult.findByJob(req.params.jobId);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
};

exports.getCutMap = async (req, res, next) => {
  try {
    const results = await OptimizationResult.findByJob(req.params.jobId);
    const sheets = results.map(r => ({
      sheet_number: r.sheet_number,
      sheet_type: r.sheet_type,
      width: r.roll_width,
      length: r.roll_length_used,
      blinds: safeParse(r.blinds_placed),
      waste_areas: safeParse(r.waste_areas),
      reusable_leftovers: safeParse(r.reusable_leftovers),
      utilization: r.utilization_percent,
      waste: r.waste_percent
    }));
    res.json({ success: true, data: sheets });
  } catch (err) {
    next(err);
  }
};
