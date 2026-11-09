// Server-side location search via Nominatim.
export default async function handler(req,res){
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  const area=String(req.query.area||'').trim().slice(0,160);
  if(!area)return res.status(400).json({error:'Enter a location.'});
  try {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
    let response;
    try{response=await fetch('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q:area,format:'json',limit:'1',countrycodes:'us'}),{signal:controller.signal,headers:{'User-Agent':'TableForTwo/1.0 (restaurant search prototype)','Accept-Language':'en-US'}})}finally{clearTimeout(timer)}
    if(!response.ok)throw Error('Location directory HTTP '+response.status);
    const result=await response.json();
    if(!result.length)return res.status(404).json({error:'Location not found. Try city and state or ZIP.'});
    return res.json({center:[Number(result[0].lat),Number(result[0].lon)]});
  }catch(e){return res.status(503).json({error:'Location service temporarily unavailable. Please retry.'})}
}
