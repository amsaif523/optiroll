const { Leftover } = require('../models');

exports.getAll = async (req, res, next) => {
  try {
    const leftovers = await Leftover.findAll(req.query);
    res.json({ success: true, data: leftovers });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    await Leftover.delete(req.params.id);
    res.json({ success: true, message: 'Leftover deleted' });
  } catch (err) {
    next(err);
  }
};
