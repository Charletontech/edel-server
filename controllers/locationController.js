/**
 * Location Controller
 * Handles IP geolocation and server-side geocoding via BigDataCloud API
 */

const BDC_KEY = process.env.BIGDATACLOUD_API_KEY;
const BDC_BASE = process.env.BIGDATACLOUD_BASE_URL || 'https://api.bigdatacloud.net';
const { getPlatformSettingValue } = require('../utils/platformSettings');

/**
 * Helper: parse the real client IP from the request,
 * handling proxies and load balancers via x-forwarded-for.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first (original client)
    return forwarded.split(',')[0].trim();
  }
  return (
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    null
  );
}

// @desc    Get approximate location from client IP address
// @route   GET /api/location/from-ip
// @access  Public
exports.getLocationFromIp = async (req, res, next) => {
  try {
    if (!BDC_KEY) {
      return res.status(503).json({ success: false, error: 'Geolocation service not configured' });
    }

    const clientIp = getClientIp(req);

    // Loopback / private IPs will not resolve to a real location
    const isPrivate = !clientIp ||
      clientIp === '::1' ||
      clientIp === '127.0.0.1' ||
      clientIp.startsWith('192.168.') ||
      clientIp.startsWith('10.') ||
      clientIp.startsWith('172.');

    if (isPrivate) {
      return res.json({
        success: false,
        error: 'private_ip',
        message: 'Cannot geolocate a private/local IP address',
      });
    }

    const url = `${BDC_BASE}/data/ip-geolocation?ip=${encodeURIComponent(clientIp)}&key=${BDC_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`BigDataCloud returned ${response.status}`);
    }

    const data = await response.json();

    if (data && data.latitude && data.longitude) {
      const staleThresholdKm = Number(await getPlatformSettingValue('location_stale_threshold_km') || 15);
      return res.json({
        success: true,
        location: {
          lat: data.latitude,
          lng: data.longitude,
          city: data.city || data.localityInfo?.administrative?.[2]?.name || data.principalSubdivision || 'Unknown',
          country: data.countryName || '',
          source: 'ip',
          accuracy: 'medium',
          staleThresholdKm,
        },
      });
    }

    return res.json({ success: false, error: 'no_location', message: 'Could not determine location from IP' });
  } catch (error) {
    console.error('[Location] IP geolocation error:', error.message);
    return res.status(500).json({ success: false, error: 'server_error', message: 'Location service error' });
  }
};

// @desc    Geocode a text query (city name, area, postcode) to coordinates
// @route   POST /api/location/geocode
// @access  Public
// Uses Nominatim (OpenStreetMap) — free, no API key required, excellent Nigeria coverage.
exports.geocodeQuery = async (req, res, next) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'A search query is required' });
    }

    const searchTerm = query.trim();

    // Nominatim requires a descriptive User-Agent per their usage policy
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerm)}&format=json&countrycodes=ng&addressdetails=1&limit=5&accept-language=en`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'eDelHub-App/1.0 (support@elevatexassets.com)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const results = await response.json();

    if (!results || !results.length) {
      return res.json({
        success: false,
        error: 'no_results',
        message: `No location found for "${searchTerm}"`,
      });
    }

    // Build a clean label from the address components
    const buildLabel = (addr) => {
      const parts = [
        addr.suburb || addr.neighbourhood || addr.village || addr.town,
        addr.city || addr.state_district,
        addr.state,
        addr.country,
      ].filter(Boolean);
      return parts.join(', ');
    };

    const best = results[0];
    const bestLabel = buildLabel(best.address);
    const bestCity =
      best.address.suburb ||
      best.address.neighbourhood ||
      best.address.village ||
      best.address.town ||
      best.address.city ||
      best.address.state_district ||
      best.address.state ||
      searchTerm;

    return res.json({
      success: true,
      results: results.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: buildLabel(r.address),
        city: r.address.suburb || r.address.neighbourhood || r.address.village ||
              r.address.town || r.address.city || r.address.state_district || r.address.state || '',
      })),
      location: {
        lat: parseFloat(best.lat),
        lng: parseFloat(best.lon),
        city: bestCity,
        label: bestLabel,
        source: 'manual',
        accuracy: 'medium',
      },
    });
  } catch (error) {
    console.error('[Location] Geocode error:', error.message);
    return res.status(500).json({ success: false, error: 'server_error', message: 'Geocoding service error' });
  }
};
