// Server-side OpenStreetMap Overpass lookup with multiple provider fallbacks.
// No paid API key is needed; public Overpass is rate limited and listing metadata can be incomplete.
const HOSTS=['https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://overpass.nchc.org.tw/api/interpreter','https://overpass-api.de/api/interpreter'];
const cache=new Map();
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=3600');
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  const lat=Number(req.query.lat),lon=Number(req.query.lon),radius=Number(req.query.radius);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(radius)||radius<1||radius>30)return res.status(400).json({error:'Invalid location or radius.'});
  const key=[lat.toFixed(3),lon.toFixed(3),radius].join(':');
  if(cache.has(key)&&Date.now()-cache.get(key).time<900000)return res.json(cache.get(key).value);
  const query=`[out:json][timeout:22];(nwr["amenity"~"^(restaurant|fast_food|cafe)$"](around:${Math.round(radius*1609.344)},${lat},${lon}););out center 600;`;
  const failures=[];
  for(const host of HOSTS){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),27000);
    try{
      const response=await fetch(host,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'TableForTwo/1.0'},body:new URLSearchParams({data:query}),signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const json=await response.json();
      if(!Array.isArray(json.elements))throw Error('Unexpected restaurant data');
      const value={elements:json.elements,source:'OpenStreetMap / Overpass'};
      cache.set(key,{time:Date.now(),value});if(cache.size>50)cache.delete(cache.keys().next().value);
      return res.json(value);
    }catch(e){failures.push(host+': '+e.message)}finally{clearTimeout(timer)}
  }
  console.warn('Overpass failures',failures.join('; '));
  return res.status(503).json({error:'Public restaurant directories are currently unavailable. Please retry shortly.'});
}
