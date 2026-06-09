const express = require('express');
const router = express.Router();
const controller = require('../controllers/leftoverController');

router.get('/stats', controller.getStats);
router.post('/bulk', controller.bulkSave);
router.post('/bulk-delete', controller.bulkDelete);
router.post('/create', controller.create);
router.post('/detail', controller.getDetail);
router.post('/delete', controller.delete);
router.get('/', controller.getAll);
router.delete('/:id', controller.delete);

module.exports = router;
