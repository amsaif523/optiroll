const { Job, JobItem, OptimizationResult } = require('../models');

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
    const jobs = await Job.findAll();
    res.json({ success: true, data: jobs });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [job] = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    const items = await JobItem.findByJob(req.params.id);
    res.json({ success: true, data: { ...job, items } });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const id = req.params.id;
    await JobItem.deleteByJob(id);
    await OptimizationResult.deleteByJob(id);
    await Job.delete(id);
    res.json({ success: true, message: 'Job deleted' });
  } catch (err) {
    next(err);
  }
};
