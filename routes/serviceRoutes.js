const express = require('express');
const router = express.Router();
const { addService, updateService, deleteService, getDiscoveryFeed, getCategories } = require('../controllers/serviceController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.get('/categories', getCategories);
router.get('/discovery', getDiscoveryFeed);
router.post('/', upload.single('businessPhoto'), addService);
router.put('/:id', upload.single('businessPhoto'), updateService);
router.delete('/:id', deleteService);

module.exports = router;
