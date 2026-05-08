const express = require('express');
const router = express.Router();
const { addService, updateService, deleteService, getDiscoveryFeed } = require('../controllers/serviceController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/discovery', getDiscoveryFeed);
router.post('/', addService);
router.put('/:id', updateService);
router.delete('/:id', deleteService);

module.exports = router;
