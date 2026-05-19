const { Job, JobItem, OptimizationResult, ActivityLog } = require('../models');

const safeParse = (val) => {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return []; }
};

const getIdFromPayload = (req) => req.body?.id || req.params?.id;

const buildJobDetail = async (id) => {
  const [job] = await Job.findById(id);
  if (!job) return null;
  const [items, results] = await Promise.all([
    JobItem.findByJob(id),
    OptimizationResult.findByJob(id)
  ]);
  const sheets = results.map(r => ({
    sheet_number: r.sheet_number,
    sheet_type: r.sheet_type,
    width: Number(r.roll_width),
    length: Number(r.roll_length_used),
    blinds: safeParse(r.blinds_placed),
    waste_areas: safeParse(r.waste_areas),
    reusable_leftovers: safeParse(r.reusable_leftovers),
    previous_blinds: [],
    original_width: Number(r.roll_width),
    original_length: Number(r.roll_length_used),
    leftover_offset_x: 0,
    leftover_offset_y: 0,
    utilization: Number(r.utilization_percent),
    waste: Number(r.waste_percent)
  }));
  return { ...job, items, sheets };
};

exports.create = async (req, res, next) => {
  try {
    const { work_order_number, client_name, allow_rotation } = req.body;
    const job = await Job.create({ work_order_number, client_name, allow_rotation });
    res.status(201).json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const jobs = await Job.findPage(req.query);
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const stats = await Job.stats(req.query);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const detail = await buildJobDetail(req.params.id);
    if (!detail) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
};

exports.getDetail = async (req, res, next) => {
  try {
    const id = getIdFromPayload(req);
    if (!id) return res.status(400).json({ success: false, error: 'Job id is required' });
    const detail = await buildJobDetail(id);
    if (!detail) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const id = getIdFromPayload(req);
    if (!id) return res.status(400).json({ success: false, error: 'Job id is required' });
    await JobItem.deleteByJob(id);
    await OptimizationResult.deleteByJob(id);
    await Job.delete(id);
    await ActivityLog.create({
      user_id: req.user?.id,
      action: 'job.deleted',
      entity_type: 'job',
      entity_id: id,
      description: `Deleted job ${id}`
    });
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    next(err);
  }
};
