const { ActivityLog } = require('../models');

exports.getAll = async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const logs = await ActivityLog.findPage(req.query);
    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
};
