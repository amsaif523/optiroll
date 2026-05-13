const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'optiroll-dev-secret-change-in-production';

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
