// On-demand restaurant photo proxy. Never exposes the Google API key or caches expiring photo references.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 const key=process.env.GOOGLE_PLACES_API_KEY?.trim();
 if(!key)return res.status(503).end('Google Places is not configured');
 const name=String(req.query.name||'');
 if(!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name))return res.status(400).end('Invalid photo reference');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
 try{
  const response=await fetch('https://places.googleapis.com/v1/'+name+'/media?maxWidthPx=520&key='+encodeURIComponent(key),{signal:ctrl.signal});
  const type=response.headers.get('content-type')||'';
  if(!response.ok||!type.startsWith('image/'))throw Error('Photo unavailable');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>6000000)throw Error('Photo too large');
  res.setHeader('Content-Type',type);
  return res.status(200).end(bytes);
 }catch{return res.status(502).end('Photo unavailable')}
 finally{clearTimeout(timer)}
}
