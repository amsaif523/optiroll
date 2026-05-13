const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'optiroll-dev-secret-change-in-production';

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password required' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const payload = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      success: true,
      data: { token, user: payload }
    });
  } catch (err) {
    next(err);
  }
};

exports.me = (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};
