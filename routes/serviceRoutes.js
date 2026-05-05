const express = require('express');
const router = express.Router();
const { addService, updateService, deleteService } = require('../controllers/serviceController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/', addService);
router.put('/:id', updateService);
router.delete('/:id', deleteService);

module.exports = router;
