// Google Places (New) server-only API; GOOGLE_PLACES_API_KEY never reaches clients.
const cuisineTypes={mexican:'mexican_restaurant',italian:'italian_restaurant',japanese:'japanese_restaurant',chinese:'chinese_restaurant',thai:'thai_restaurant',indian:'indian_restaurant',asian:'asian_restaurant',mediterranean:'mediterranean_restaurant',bbq:'barbecue_restaurant',seafood:'seafood_restaurant',american:'american_restaurant'};
const levels={PRICE_LEVEL_INEXPENSIVE:'$',PRICE_LEVEL_MODERATE:'$$',PRICE_LEVEL_EXPENSIVE:'$$$',PRICE_LEVEL_VERY_EXPENSIVE:'$$$$'};
async function jsonRequest(url,options,signal){
 const response=await fetch(url,{...options,signal});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw Error(data?.error?.message||'Google Places HTTP '+response.status);
 return data;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const key=process.env.GOOGLE_PLACES_API_KEY?.trim();
 if(!key)return res.status(503).json({code:'SETUP_REQUIRED',error:'Google Places has not been connected. Add GOOGLE_PLACES_API_KEY in Vercel → Settings → Environment Variables, enable Places API (New) and Geocoding API in Google Cloud, and redeploy.'});
 const area=String(req.query.area||'').trim().slice(0,140);
 const radius=Number(req.query.radius||10),cuisine=String(req.query.cuisine||'any').toLowerCase();
 const lat=Number(req.query.lat),lon=Number(req.query.lon);
 if(!Number.isFinite(radius)||radius<1||radius>30)return res.status(400).json({error:'Choose a search radius between 1 and 30 miles.'});
 if(!area&&!Number.isFinite(lat))return res.status(400).json({error:'Enter a location.'});
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6800);
 try{
  let center;
  if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)center=[lat,lon];
  else if(/^addison,\s*(tx|texas)$/i.test(area))center=[32.9618,-96.8292];
  else{
   const geo=await jsonRequest('https://maps.googleapis.com/maps/api/geocode/json?'+new URLSearchParams({address:area,key}),{},ctrl.signal);
   if(geo.status!=='OK'||!geo.results?.length)throw Error(geo.error_message||'Location not found; enter a city and state or ZIP.');
   const pos=geo.results[0].geometry?.location;
   center=[Number(pos?.lat),Number(pos?.lng)];
   if(!center.every(Number.isFinite))throw Error('Invalid location coordinates.');
  }
  const types=[cuisineTypes[cuisine]||'restaurant'];
  const mask='places.id,places.displayName,places.location,places.types,places.primaryType,places.formattedAddress,places.websiteUri,places.googleMapsUri,places.priceLevel,places.dineIn,places.takeout,places.photos';
  const data=await jsonRequest('https://places.googleapis.com/v1/places:searchNearby',{
   method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':mask},
   body:JSON.stringify({includedTypes:types,maxResultCount:20,rankPreference:'POPULARITY',locationRestriction:{circle:{center:{latitude:center[0],longitude:center[1]},radius:Math.min(50000,Math.round(radius*1609.344))}}})
  },ctrl.signal);
  const elements=(data.places||[]).filter(p=>p.id&&p.displayName?.text&&Number.isFinite(p.location?.latitude)&&Number.isFinite(p.location?.longitude)).map(p=>{
   const type=p.primaryType||'restaurant';
   const cuisineType=(p.types||[]).find(x=>/_restaurant$/.test(x)&&x!=='restaurant')||type;
   const isCounter=/fast_food|sandwich_shop|pizza_delivery/.test(type)||(p.takeout===true&&p.dineIn===false);
   const photo=p.photos?.[0];
   return {type:'google',id:p.id,lat:p.location.latitude,lon:p.location.longitude,tags:{
    name:p.displayName.text,cuisine:cuisineType.replace(/_restaurant$/,'').replaceAll('_',' '),
    amenity:isCounter?'fast_food':'restaurant','addr:full':p.formattedAddress||'',
    website:p.websiteUri||'','price:range':levels[p.priceLevel]||'',
    image:photo?.name?'/api/photo?name='+encodeURIComponent(photo.name):'',
    'google_maps_url':p.googleMapsUri||'',
    'photo:credit':Array.isArray(photo?.authorAttributions)?photo.authorAttributions.map(a=>({name:String(a.displayName||''),url:String(a.uri||'').startsWith('//')?'https:'+a.uri:String(a.uri||'')})):[]
   }};
  });
  return res.status(200).json({provider:'Google Places',center,elements});
 }catch(e){
  if(e.name==='AbortError')return res.status(504).json({error:'Google Places timed out; please retry.'});
  console.error('Google Places error:',e.message);
  return res.status(502).json({error:'Google Places: '+e.message});
 }finally{clearTimeout(timer)}
}
