const encoder = new TextEncoder();
const ITERATIONS = 600000;
export const PIN_SESSION_PREFIX = 'lvpin_';
export const externalPinUser = user => ['CLIENTE','PARCEIRO'].includes(user?.user_type) && user?.profile !== 'ADMINISTRADOR';
export const validPin = pin => typeof pin === 'string' && /^\d{6,12}$/.test(pin);
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
export const randomHex = length => hex(crypto.getRandomValues(new Uint8Array(length)));
export async function hashSession(value) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))); }
export async function derivePin(pin,salt) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:ITERATIONS},key,256)));
}
export function equalDigest(left,right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== 64 || right.length !== 64) return false;
  let difference=0; for(let i=0;i<64;i++)difference|=left.charCodeAt(i)^right.charCodeAt(i);
  return difference===0;
}
export async function pinCredential(db,userId) {
  const q=await db.from('portal_pin_credentials').select('user_id,digest,salt,version').eq('user_id',userId).maybeSingle();
  if(q.error)throw new Error('SERVICE_UNAVAILABLE'); return q.data;
}
export async function resolvePinSession(db,token) {
  if(!/^lvpin_[0-9a-f]{64}$/.test(token))throw new Error('UNAUTHENTICATED');
  const q=await db.from('portal_pin_sessions').select('user_id,credential_version,expires_at').eq('token_hash',await hashSession(token)).maybeSingle();
  if(q.error)throw new Error('SERVICE_UNAVAILABLE');
  if(!q.data||Date.parse(q.data.expires_at)<=Date.now())throw new Error('UNAUTHENTICATED');
  const credential=await pinCredential(db,q.data.user_id);
  if(!credential||credential.version!==q.data.credential_version)throw new Error('UNAUTHENTICATED');
  const user=await db.from('portal_users').select('*').eq('id',q.data.user_id).maybeSingle();
  if(user.error)throw new Error('SERVICE_UNAVAILABLE');
  if(!user.data?.active||!externalPinUser(user.data)||(user.data.apps||[]).includes('fretes'))throw new Error('FORBIDDEN');
  return user.data;
}
export async function loginWithPin(db,request,body) {
  const email=String(body.email||'').trim().toLowerCase();
  if(!email||email.length>254||!validPin(body.pin))throw new Error('INVALID_PIN_LOGIN');
  const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const rate=await db.rpc('portal_pin_reserve_attempt',{p_email_bucket:'email:'+await hashSession(email),p_ip_bucket:'ip:'+await hashSession(ip)});
  if(rate.error)throw new Error('SERVICE_UNAVAILABLE');
  if(rate.data!==true)throw new Error('PIN_RATE_LIMITED');
  const q=await db.from('portal_users').select('*').eq('email',email).maybeSingle();
  if(q.error)throw new Error('SERVICE_UNAVAILABLE');
  const user=q.data,credential=user?await pinCredential(db,user.id):null;
  // Missing/disabled/non-PIN users still perform the expensive derivation.
  const candidate=await derivePin(body.pin,credential?.salt||'00000000000000000000000000000000');
  if(!credential||!equalDigest(candidate,credential.digest)||!user?.active||!externalPinUser(user)||(user.apps||[]).includes('fretes'))throw new Error('INVALID_PIN_LOGIN');
  const token=PIN_SESSION_PREFIX+randomHex(32),expiresAt=new Date(Date.now()+8*60*60*1000).toISOString();
  const session=await db.from('portal_pin_sessions').insert({token_hash:await hashSession(token),user_id:user.id,credential_version:credential.version,expires_at:expiresAt});
  if(session.error)throw new Error('SERVICE_UNAVAILABLE');
  return {token,expiresAt,user};
}
