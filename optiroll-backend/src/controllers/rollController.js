const { Roll } = require('../models');

exports.create = async (req, res, next) => {
  try {
    const roll = await Roll.create(req.body);
    res.status(201).json({ success: true, data: roll });
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const rolls = await Roll.findAll(req.query);
    res.json({ success: true, data: rolls });
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    await Roll.delete(req.params.id);
    res.json({ success: true, message: 'Roll deleted' });
  } catch (err) {
    next(err);
  }
};
