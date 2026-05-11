const express = require('express');
const router = express.Router();
const controller = require('../controllers/jobController');

router.post('/', controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.delete('/:id', controller.delete);

module.exports = router;
