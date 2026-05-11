const express = require('express');
const router = express.Router();
const controller = require('../controllers/optimizeController');

router.post('/run', controller.run);
router.get('/jobs/:jobId/results', controller.getResults);
router.get('/jobs/:jobId/cutmap', controller.getCutMap);

module.exports = router;
