// Public restaurant data can fail; don't block the interface waiting on slow providers.
const PROVIDERS=['https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
const DEADLINE=6900,cache=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=900, stale-while-revalidate=3600');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const lat=Number(req.query.lat),lon=Number(req.query.lon),radius=Number(req.query.radius);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Number.isFinite(radius)||radius<1||radius>30)return res.status(400).json({error:'Choose a valid location and radius from 1 to 30 miles.'});
 const key=[lat.toFixed(3),lon.toFixed(3),radius].join(':');
 const hit=cache.get(key);
 if(hit&&Date.now()-hit.time<15*60*1000)return res.status(200).json(hit.value);
 const query='[out:json][timeout:6];nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:'+Math.round(radius*1609.344)+','+lat+','+lon+');out center 450;';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),DEADLINE);
 const fetchOne=async host=>{
  const response=await fetch(host,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','User-Agent':'TableForTwo/1.2'},body:new URLSearchParams({data:query}),signal:controller.signal});
  if(!response.ok)throw Error('Provider HTTP '+response.status);
  const data=await response.json();
  if(data.remark||!Array.isArray(data.elements))throw Error('Provider returned an invalid response');
  return {elements:data.elements,source:'OpenStreetMap / Overpass'};
 };
 try{
  const data=await Promise.any(PROVIDERS.map(fetchOne));
  cache.set(key,{time:Date.now(),value:data});
  if(cache.size>50)cache.delete(cache.keys().next().value);
  return res.status(200).json(data);
 }catch(e){
  console.warn('Directory failures',e?.errors?.map(x=>x.message).join('; ')||e.message);
  return res.status(503).json({error:'Live restaurant directories are busy. Try again or use the Google Maps link.'});
 }finally{
  clearTimeout(timer);
  controller.abort();
 }
}
