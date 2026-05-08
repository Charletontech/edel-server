const EARTH_RADIUS_KM = 6371;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const haversineDistanceKm = (fromLat, fromLng, toLat, toLng) => {
  const lat1 = Number(fromLat);
  const lng1 = Number(fromLng);
  const lat2 = Number(toLat);
  const lng2 = Number(toLng);

  if ([lat1, lng1, lat2, lng2].some((value) => Number.isNaN(value))) {
    return null;
  }

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

const getBoundingBox = (latitude, longitude, radiusKm = 50) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const radius = Number(radiusKm);

  if ([lat, lng, radius].some((value) => Number.isNaN(value))) {
    return null;
  }

  const latDelta = radius / 111;
  const lngDelta = radius / (111 * Math.cos(toRadians(lat)) || 1);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  };
};

module.exports = {
  haversineDistanceKm,
  getBoundingBox
};
