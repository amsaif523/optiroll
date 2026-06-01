const { Leftover } = require('../models');

const getIdFromPayload = (req) => req.body?.id || req.params?.id;

exports.getAll = async (req, res, next) => {
  try {
    const leftovers = await Leftover.findPage(req.query);
    res.json({ success: true, data: leftovers });
  } catch (err) {
    next(err);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const stats = await Leftover.stats(req.query);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

exports.getDetail = async (req, res, next) => {
  try {
    const id = getIdFromPayload(req);
    if (!id) return res.status(400).json({ success: false, error: 'Leftover id is required' });
    const [leftover] = await Leftover.findById(id);
    if (!leftover) return res.status(404).json({ success: false, error: 'Leftover not found' });
    res.json({ success: true, data: leftover });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { width, length, material_type, color, pattern, product_code, shades } = req.body || {}
    if (!width || !length || !material_type || !color) {
      return res.status(400).json({ success: false, error: 'width, length, material_type and color are required' })
    }
    const w = parseFloat(width), l = parseFloat(length)
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(l) || l <= 0) {
      return res.status(400).json({ success: false, error: 'width and length must be positive numbers' })
    }
    const result = await Leftover.create({
      width: w, length: l,
      material_type: String(material_type).trim(),
      color: String(color).trim(),
      pattern: pattern ? String(pattern).trim() : null,
      product_code: product_code ? String(product_code).trim() : null,
      shades: shades ? String(shades).trim() : null,
      sheet_number: null,
      source_job_id: null,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
};

exports.bulkSave = async (req, res, next) => {
  try {
    const { leftovers, source_job_id } = req.body || {};
    if (!Array.isArray(leftovers) || leftovers.length === 0) {
      return res.status(400).json({ success: false, error: 'No leftovers to save' });
    }
    const { inserted } = await Leftover.bulkCreate(leftovers, source_job_id || null);
    res.json({ success: true, data: { inserted } });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const id = getIdFromPayload(req);
    if (!id) return res.status(400).json({ success: false, error: 'Leftover id is required' });
    await Leftover.delete(id);
    res.json({ success: true, message: 'Leftover deleted' });
  } catch (err) {
    next(err);
  }
};
