// Table for Two: bounded live restaurant searches against public OpenStreetMap/Overpass services.
// Two independent providers run concurrently; requests are aborted after a fixed deadline.
// No fabricated restaurants are returned when the directory is unavailable.
const PROVIDERS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const cache = new Map();
const DEADLINE_MS = 17000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({error:'GET required'});

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(radius) || radius < 1 || radius > 30) {
    return res.status(400).json({error:'Choose a valid location and radius between 1 and 30 miles.'});
  }

  const key = [lat.toFixed(3),lon.toFixed(3),radius].join(':');
  const prior = cache.get(key);
  if (prior && Date.now() - prior.time < 900000) return res.status(200).json(prior.value);

  // Filter to named establishments before returning results.
  const query = `[out:json][timeout:15];nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:${Math.round(radius*1609.344)},${lat},${lon});out center 500;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEADLINE_MS);

  const lookup = async (host) => {
    const response = await fetch(host, {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded', 'Accept':'application/json', 'User-Agent':'TableForTwo/1.1 (restaurant search)'},
      body: new URLSearchParams({data:query}),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from public directory`);
    const payload = await response.json();
    // Some Overpass instances return HTTP 200 even when the query timed out.
    if (payload.remark) throw new Error(String(payload.remark).slice(0,180));
    if (!Array.isArray(payload.elements)) throw new Error('Directory returned invalid data');
    return {elements:payload.elements, source:'OpenStreetMap / Overpass'};
  };

  try {
    const value = await Promise.any(PROVIDERS.map(lookup));
    cache.set(key, {time: Date.now(),value});
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return res.status(200).json(value);
  } catch (error) {
    console.warn('Overpass search failed', error?.errors?.map(e=>e.message).join('; ') || error.message);
    return res.status(503).json({
      error:'Live restaurant results are taking too long. Please try again or use a smaller search radius.'
    });
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
