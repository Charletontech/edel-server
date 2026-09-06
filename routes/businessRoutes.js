const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const businessController = require('../controllers/businessController');

router.post('/', protect, businessController.createBusiness);
router.get('/', protect, businessController.getProviderBusinesses);
router.delete('/:id', protect, businessController.deleteBusiness);

module.exports = router;
