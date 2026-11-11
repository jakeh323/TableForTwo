import { neon } from '@neondatabase/serverless';
import { randomBytes, createHash } from 'node:crypto';
// A six-character code is shareable, while private per-device tokens protect votes.
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const failure=(res,status,message)=>res.status(status).json({error:message});
const hash=v=>createHash('sha256').update(v).digest('hex');
const roomCode=()=>Array.from(randomBytes(6),b=>ALPHABET[b%ALPHABET.length]).join('');
const token=()=>randomBytes(24).toString('base64url');
const codeOf=v=>String(v||'').toUpperCase().replace(/[\s-]/g,'').slice(0,8);
const validCode=v=>/^[A-HJ-NP-Z2-9]{6}$/.test(v);
const validToken=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{20,100}$/.test(v);
const txt=(v,max=160)=>String(v??'').trim().slice(0,max);
const safeUrl=v=>{try{const u=new URL(String(v||''));return ['http:','https:'].includes(u.protocol)?u.href.slice(0,600):''}catch{return''}};
function checkPlaces(raw){
 if(!Array.isArray(raw)||raw.length===0||raw.length>60)throw Error('Choose 1 to 60 restaurants.');
 const ids=new Set();
 return raw.map(p=>{
  const id=txt(p?.id,130),name=txt(p?.name,160);
  const lat=Number(p?.lat),lon=Number(p?.lon),distance=Number(p?.distance);
  if(!id||!name||ids.has(id)||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!Number.isFinite(distance)||distance<0||distance>100)throw Error('Invalid restaurant in shortlist.');
  ids.add(id);
  return {id,name,lat,lon,distance,cuisine:txt(p?.cuisine,40)||'other',cuisineRaw:txt(p?.cuisineRaw,80),style:txt(p?.style,25),price:txt(p?.price,10),address:txt(p?.address,250),website:safeUrl(p?.website),menu:safeUrl(p?.menu),photo:safeUrl(p?.photo)};
 });
}
function identify(row,secret){
 const h=hash(secret);
 return row.host_token_hash===h?'host':row.guest_token_hash===h?'guest':null;
}
function asState(row,role){
 const places=Array.isArray(row.place_list)?row.place_list:[];
 const hv=row.host_votes||{},gv=row.guest_votes||{};
 const ids=places.map(p=>p.id);
 const hostCount=ids.filter(id=>Object.hasOwn(hv,id)).length;
 const guestCount=ids.filter(id=>Object.hasOwn(gv,id)).length;
 const guestJoined=Boolean(row.guest_token_hash);
 const ready=Boolean(guestJoined&&ids.length&&hostCount===ids.length&&guestCount===ids.length);
 return {code:row.code,role,places,ownVotes:role==='host'?hv:gv,hostCount,guestCount,guestJoined,ready,matches:ready?ids.filter(id=>hv[id]===true&&gv[id]===true):[],expiresAt:row.expires_at};
}
const readRoom=async(db,code)=>{
 const rows=await db.query('SELECT code,host_token_hash,guest_token_hash,place_list,host_votes,guest_votes,expires_at FROM tft_rooms WHERE code=$1 AND expires_at>now()', [code]);
 return rows[0];
};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!process.env.DATABASE_URL?.trim())return failure(res,503,'Enable Couples Rooms by adding DATABASE_URL to Vercel Environment Variables, then redeploy.');
 if(req.method!=='GET'&&req.method!=='POST')return failure(res,405,'GET or POST required.');
 const db=neon(process.env.DATABASE_URL);
 if(req.method==='GET'&&req.query?.health==='1')return res.status(200).json({ready:true});
 try{
  if(req.method==='POST'){
   if(Number(req.headers?.['content-length']||0)>110000)return failure(res,413,'Request too large.');
   const data=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
   const action=txt(data.action,20);
   if(action==='create'){
    const places=checkPlaces(data.places);
    const roomSecret=token(),secretHash=hash(roomSecret),json=JSON.stringify(places);
    let code=null;
    for(let i=0;i<6;i++){
     const candidate=roomCode();
     const rows=await db.query('INSERT INTO tft_rooms(code,host_token_hash,place_list) VALUES ($1,$2,$3::jsonb) ON CONFLICT(code) DO NOTHING RETURNING code',[candidate,secretHash,json]);
     if(rows.length){code=candidate;break}
    }
    if(!code)return failure(res,503,'Could not generate a unique room code. Retry.');
    const row=await readRoom(db,code);
    return res.status(201).json({token:roomSecret,...asState(row,'host')});
   }
   const code=codeOf(data.code);
   if(!validCode(code))return failure(res,400,'Enter a six-character room code.');
   if(action==='join'){
    const secret=token();
    const rows=await db.query('UPDATE tft_rooms SET guest_token_hash=$1 WHERE code=$2 AND guest_token_hash IS NULL AND expires_at>now() RETURNING code',[hash(secret),code]);
    if(!rows.length)return failure(res,409,'Room is full, invalid or expired. Request a new code.');
    const row=await readRoom(db,code);
    return res.status(200).json({token:secret,...asState(row,'guest')});
   }
   if(!validToken(data.token))return failure(res,401,'Missing room access token.');
   const row=await readRoom(db,code);
   if(!row)return failure(res,404,'Room expired or unavailable.');
   const role=identify(row,data.token);
   if(!role)return failure(res,403,'This phone is not a member of that room.');
   const id=txt(data.placeId,130);
   if(!row.place_list.some(p=>p.id===id))return failure(res,400,'Restaurant is not part of this room.');
   if(action==='vote'){
    if(typeof data.value!=='boolean')return failure(res,400,'Vote must be a like or pass.');
    const column=role==='host'?'host_votes':'guest_votes';
    const tokenColumn=role==='host'?'host_token_hash':'guest_token_hash';
    await db.query('UPDATE tft_rooms SET '+column+'=jsonb_set('+column+',ARRAY[$1]::text[],$2::jsonb,true) WHERE code=$3 AND '+tokenColumn+'=$4 AND expires_at>now()',[id,JSON.stringify(data.value),code,hash(data.token)]);
   }else if(action==='undo'){
    const column=role==='host'?'host_votes':'guest_votes';
    const tokenColumn=role==='host'?'host_token_hash':'guest_token_hash';
    await db.query('UPDATE tft_rooms SET '+column+'='+column+'-$1 WHERE code=$2 AND '+tokenColumn+'=$3 AND expires_at>now()',[id,code,hash(data.token)]);
   }else return failure(res,400,'Unknown room action.');
   const updated=await readRoom(db,code);
   return res.status(200).json(asState(updated,role));
  }
  const code=codeOf(req.query?.code),secret=req.headers?.['x-room-token'];
  if(!validCode(code)||!validToken(secret))return failure(res,401,'Room code and private device token required.');
  const row=await readRoom(db,code);
  if(!row)return failure(res,404,'Room expired or unavailable.');
  const role=identify(row,secret);
  if(!role)return failure(res,403,'This device is not part of the room.');
  return res.status(200).json(asState(row,role));
 }catch(error){
  console.error('Couples room API:',error?.message);
  return failure(res,500,'Could not sync the room. Retry in a moment.');
 }
}