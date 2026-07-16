const express = require('express');
const router = express.Router();
const { getLocationFromIp, geocodeQuery } = require('../controllers/locationController');
const { updateLocation } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/location/from-ip — public, no auth required
router.get('/from-ip', getLocationFromIp);

// POST /api/location/geocode — public, no auth required
router.post('/geocode', geocodeQuery);

// PUT /api/location — private, requires auth
router.put('/', protect, updateLocation);

module.exports = router;
