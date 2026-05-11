const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/rolls', require('./routes/rolls'));
app.use('/api/leftovers', require('./routes/leftovers'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/optimize', require('./routes/optimize'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'optiroll-backend' });
});

app.use(require('./middleware/errorHandler'));

app.listen(PORT, () => {
  console.log(`OptiRoll backend running on port ${PORT}`);
});
