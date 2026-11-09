// Geoapify free tier, no credit card required; key stays server-side.
function s(x){return typeof x==='string'?x.trim():''}
function url(x){try{const u=new URL(s(x));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}}
async function get(u,signal){
 const r=await fetch(u,{signal,headers:{Accept:'application/json'}});
 const j=await r.json().catch(()=>null);
 if(!r.ok||!j)throw Error(j?.message||j?.error||'Geoapify returned HTTP '+r.status);
 return j;
}
function mapFeature(f){
 const p=f?.properties||{},raw=p.datasource?.raw||{},xy=f?.geometry?.coordinates||[];
 const lat=Number(p.lat??xy[1]),lon=Number(p.lon??xy[0]);
 const name=s(p.name)||s(raw.name);
 if(!name||!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const cats=Array.isArray(p.categories)?p.categories:[];
 const counter=cats.some(x=>String(x).startsWith('catering.fast_food'));
 return {type:'geoapify',id:String(p.place_id||raw.osm_id||name+':'+lat+':'+lon),lat,lon,tags:{
  name,cuisine:s(raw.cuisine)||s(p.cuisine)||s(cats.find(x=>String(x).startsWith('catering.fast_food.'))?.split('.').pop()),
  amenity:counter?'fast_food':'restaurant',
  'addr:full':s(p.formatted)||s(p.address_line1),
  website:url(raw.website||raw['contact:website']||p.website),
  'website:menu':url(raw['website:menu']||raw['contact:menu']||raw['menu:website']),
  'price:range':s(raw['price:range']),image:url(raw.image||raw['contact:image'])
 }};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const key=process.env.GEOAPIFY_API_KEY?.trim();
 if(!key)return res.status(503).json({code:'SETUP_REQUIRED',error:'Geoapify Free setup needed: create a free account (no credit card), add GEOAPIFY_API_KEY to Vercel environment variables, then redeploy.'});
 const area=s(req.query.area).slice(0,140),radius=Number(req.query.radius||10);
 const latitude=Number(req.query.lat),longitude=Number(req.query.lon);
 if(!Number.isFinite(radius)||radius<1||radius>30)return res.status(400).json({error:'Choose a 1–30 mile radius.'});
 if(!area&&!Number.isFinite(latitude))return res.status(400).json({error:'Enter a location.'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6700);
 try{
  let center;
  if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)center=[latitude,longitude];
  else if(/^addison,\s*(tx|texas)$/i.test(area))center=[32.9618,-96.8292];
  else{
   const params=new URLSearchParams({text:area,format:'json',limit:'1',filter:'countrycode:us',apiKey:key});
   const result=await get('https://api.geoapify.com/v1/geocode/search?'+params,controller.signal);
   const p=result.results?.[0];
   if(!p||!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lon)))throw Error('Could not find area. Try city and state or ZIP.');
   center=[Number(p.lat),Number(p.lon)];
  }
  const params=new URLSearchParams({
   categories:'catering.restaurant,catering.fast_food,catering.cafe',
   filter:'circle:'+center[1]+','+center[0]+','+Math.round(radius*1609.344),
   bias:'proximity:'+center[1]+','+center[0],
   limit:'100',apiKey:key
  });
  const data=await get('https://api.geoapify.com/v2/places?'+params,controller.signal);
  if(!Array.isArray(data.features))throw Error('Restaurant response was invalid.');
  return res.status(200).json({provider:'Geoapify',center,elements:data.features.map(mapFeature).filter(Boolean)});
 }catch(e){
  if(e.name==='AbortError')return res.status(504).json({error:'The free directory timed out. Try again.'});
  console.warn('Geoapify error',String(e.message).slice(0,200));
  return res.status(502).json({error:'Restaurant search error: '+e.message});
 }finally{clearTimeout(timer)}
}
