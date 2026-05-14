const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true,
}));
app.use(express.json());

const auth = require('./middleware/auth');

app.use('/api/auth', require('./routes/auth'));
app.use('/api/rolls', auth, require('./routes/rolls'));
app.use('/api/leftovers', auth, require('./routes/leftovers'));
app.use('/api/jobs', auth, require('./routes/jobs'));
app.use('/api/optimize', auth, require('./routes/optimize'));
app.use('/api/settings', auth, require('./routes/settings'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'optiroll-backend' });
});

app.use(require('./middleware/errorHandler'));

app.listen(PORT, () => {
  console.log(`OptiRoll backend running on port ${PORT}`);
});
