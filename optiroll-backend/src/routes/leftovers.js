const express = require('express');
const router = express.Router();
const controller = require('../controllers/leftoverController');

router.get('/', controller.getAll);
router.delete('/:id', controller.delete);

module.exports = router;
