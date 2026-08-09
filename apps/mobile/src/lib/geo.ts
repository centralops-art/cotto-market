// Straight-line (not driving) distance -- good enough for sorting/display in
// the delivery pool list without a Mapbox Directions call per card on every
// poll tick. See checkout-create-payment-intent/index.ts for the one place
// this repo does call Mapbox Directions, for the checkout delivery fee.
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}
