const { Setting, ActivityLog } = require('../models');

exports.getSettings = async (req, res, next) => {
  try {
    const rows = await Setting.getAll();
    const settings = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    }
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await Setting.set(key, value);
    }
    await ActivityLog.create({
      user_id: req.user?.id,
      action: 'settings.updated',
      entity_type: 'settings',
      description: 'Updated application settings',
      metadata: updates
    });
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    next(err);
  }
};
