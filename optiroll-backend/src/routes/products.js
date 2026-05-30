const express = require('express');
const router = express.Router();
const controller = require('../controllers/productController');

router.get('/export', controller.exportCSV);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/import', controller.importBulk);
router.post('/lookup', controller.lookup);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
