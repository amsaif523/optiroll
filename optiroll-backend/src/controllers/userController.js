const bcrypt = require('bcryptjs');
const { User, ActivityLog } = require('../models');

const requireAdmin = (req, res) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return false;
  }
  return true;
};

exports.getAll = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;
    const users = await User.findPage(req.query);
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { username, password, full_name, role } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, error: 'Username, password, and full name are required' });
    }
    if (!['admin', 'operator'].includes(role || 'operator')) {
      return res.status(400).json({ success: false, error: 'Role must be admin or operator' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findByUsername(username.trim());
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim(),
      full_name: full_name.trim(),
      role: role || 'operator',
      password_hash
    });

    await ActivityLog.create({
      user_id: req.user.id,
      action: 'user.created',
      entity_type: 'user',
      entity_id: user.id,
      description: `Created user ${user.username}`,
      metadata: { role: user.role }
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};
