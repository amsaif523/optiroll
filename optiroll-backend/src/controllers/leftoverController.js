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
