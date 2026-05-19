const express = require('express');
const router = express.Router();
const controller = require('../controllers/jobController');

router.post('/', controller.create);
router.post('/detail', controller.getDetail);
router.post('/delete', controller.delete);
router.get('/stats', controller.getStats);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.delete('/:id', controller.delete);

module.exports = router;
