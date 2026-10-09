const ORIGINS = new Set([
  'https://portal.livionsolutions.com.br',
  'https://revilorasec.github.io',
  'http://localhost:3000',
  'http://localhost:5173'
]);

const normalize = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();

const words = value => new Set(normalize(value).split(' ').filter(token => token.length > 1));
const modelWords = value => new Set([...words(value)].filter(token => /\d/.test(token) && /[a-z]/.test(token)));

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / (left.size + right.size - common);
}

function same(left, right) {
  const a = normalize(left), b = normalize(right);
  return Boolean(a && b && a === b);
}

function publicProduct(product) {
  return {
    product_id: product.product_id,
    pn: product.pn || '',
    description: product.description || '',
    item_type: product.item_type || '',
    category: product.category || '',
    internal_code: product.internal_code || '',
    barcode: product.barcode || '',
    unit: product.unit || '',
    balance: Number(product.balance || 0),
    location: product.default_location || '',
    status: product.status || ''
  };
}

export function rankDuplicatePairs(products, maximum = 24) {
  const stop = new Set(['componente','insumo','unidade','produto','material','para','com','sem','peca','eletronico','eletronica']);
  const prepared = products
    .filter(product => String(product.status || 'ATIVO').toUpperCase() !== 'INATIVO')
    .map((product,index) => {
      const fields = [product.pn,product.description,product.internal_code,product.barcode,product.category,product.item_type];
      const text = fields.join(' ');
      return {
        index,
        product,
        text,
        tokens:new Set([...words(text)].filter(token => token.length >= 3 && !stop.has(token))),
        models:modelWords(text),
        pn:normalize(product.pn).replace(/\s+/g,''),
        internal:normalize(product.internal_code).replace(/\s+/g,''),
        barcode:normalize(product.barcode).replace(/\s+/g,''),
        description:normalize(product.description),
        unit:normalize(product.unit),
        category:normalize(product.category),
        type:normalize(product.item_type)
      };
    });
  const pairKeys = new Set();
  const addBucketPairs = (bucket,limit=45) => {
    if (!bucket || bucket.length < 2 || bucket.length > limit) return;
    for (let a=0;a<bucket.length;a++) for (let b=a+1;b<bucket.length;b++) {
      const left=Math.min(bucket[a],bucket[b]),right=Math.max(bucket[a],bucket[b]);
      pairKeys.add(left+':'+right);
    }
  };
  const addIndex = (selector,limit=45) => {
    const map=new Map();
    prepared.forEach((row,index)=>{
      const value=selector(row);
      if(!value)return;
      const bucket=map.get(value)||[];bucket.push(index);map.set(value,bucket);
    });
    map.forEach(bucket=>addBucketPairs(bucket,limit));
  };
  addIndex(row=>row.barcode,100);
  addIndex(row=>row.internal,100);
  addIndex(row=>row.pn,100);
  addIndex(row=>row.description,100);
  const tokenIndex=new Map();
  prepared.forEach((row,index)=>row.tokens.forEach(token=>{
    const bucket=tokenIndex.get(token)||[];bucket.push(index);tokenIndex.set(token,bucket);
  }));
  tokenIndex.forEach(bucket=>addBucketPairs(bucket,35));

  const pairs=[];
  for(const key of pairKeys){
    const [i,j]=key.split(':').map(Number),left=prepared[i],right=prepared[j];
    const lexical=overlap(left.tokens,right.tokens);
    const modelOverlap=overlap(left.models,right.models);
    const barcodeEqual=Boolean(left.barcode&&left.barcode===right.barcode);
    const internalEqual=Boolean(left.internal&&left.internal===right.internal);
    const pnEqual=Boolean(left.pn&&left.pn===right.pn);
    const descriptionEqual=Boolean(left.description&&left.description===right.description);
    const unitEqual=Boolean(left.unit&&left.unit===right.unit);
    const categoryEqual=Boolean(left.category&&left.category===right.category);
    const typeEqual=Boolean(left.type&&left.type===right.type);
    if(left.barcode&&right.barcode&&!barcodeEqual)continue;
    let score=lexical*3;
    if(barcodeEqual)score+=6;
    if(internalEqual)score+=5;
    if(pnEqual)score+=5;
    if(descriptionEqual)score+=4;
    if(unitEqual)score+=.6;else if(left.unit&&right.unit)score-=1;
    if(categoryEqual)score+=.4;
    if(typeEqual)score+=.3;
    if(left.models.size&&right.models.size&&modelOverlap===0&&!barcodeEqual&&!internalEqual&&!pnEqual)score-=2.5;
    if(score<1.35)continue;
    const signals=[];
    if(barcodeEqual)signals.push('Mesmo código de barras');
    if(internalEqual)signals.push('Mesmo código interno');
    if(pnEqual)signals.push('Mesmo PN');
    if(descriptionEqual)signals.push('Mesma descrição normalizada');
    if(lexical>=.45)signals.push('Nomes muito semelhantes');
    if(unitEqual)signals.push('Mesma unidade');
    pairs.push({
      pair_id:'',
      left:publicProduct(left.product),
      right:publicProduct(right.product),
      local_score:Number(score.toFixed(3)),
      signals
    });
  }
  return pairs.sort((a,b)=>b.local_score-a.local_score||
    a.left.description.localeCompare(b.left.description,'pt-BR'))
    .slice(0,maximum).map((pair,index)=>({...pair,pair_id:'pair_'+index}));
}

export function localProbability(pair) {
  const signals = new Set(pair.signals || []);
  if (signals.has('Mesmo código de barras')) return 0.99;
  if (signals.has('Mesmo código interno')) return 0.97;
  if (signals.has('Mesmo PN')) return 0.96;
  if (signals.has('Mesma descrição normalizada')) return 0.94;
  return Number(Math.min(0.93, Math.max(0.40, 0.36 + Number(pair.local_score || 0) * 0.085)).toFixed(3));
}

export function createHandler({ env, fetcher = fetch }) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const headers = {
      'Content-Type':'application/json',
      'Cache-Control':'no-store',
      'Vary':'Origin',
      'Access-Control-Allow-Origin':ORIGINS.has(origin) ? origin : 'https://portal.livionsolutions.com.br',
      'Access-Control-Allow-Headers':'authorization,content-type',
      'Access-Control-Allow-Methods':'POST,OPTIONS'
    };
    const reply = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
    if (origin && !ORIGINS.has(origin)) return reply({error:'FORBIDDEN_ORIGIN'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (req.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'},405);
    const authorization = req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'UNAUTHORIZED'},401);
    try {
      const raw = await req.text();
      if (raw.length > 2000) return reply({error:'INPUT_TOO_LONG'},413);
      let input = {};
      if (raw) {
        try { input = JSON.parse(raw); } catch { return reply({error:'INVALID_INPUT'},400); }
      }
      const maximum = Math.min(30,Math.max(5,Number(input.maximum || 20)));
      const bootResponse = await fetcher(env('SUPABASE_URL') + '/functions/v1/inventory-api/bootstrap',{
        headers:{authorization},signal:AbortSignal.timeout(12000)
      });
      if (!bootResponse.ok) return reply({error:bootResponse.status===401?'UNAUTHORIZED':bootResponse.status===403?'FORBIDDEN':'AUTH_UNAVAILABLE'},[401,403].includes(bootResponse.status)?bootResponse.status:503);
      const boot = await bootResponse.json();
      if (!boot.permissions?.product) return reply({error:'FORBIDDEN'},403);
      const pairs = rankDuplicatePairs(boot.stock || [],maximum);
      const candidates = pairs.map(pair => ({...pair,probability:localProbability(pair)}))
        .sort((left,right) => right.probability-left.probability || right.local_score-left.local_score);
      return reply({model:'local-v1',analysis:'LOCAL_FREE',candidates});
    } catch (error) {
      return reply({error:['TimeoutError','AbortError'].includes(error?.name)?'AI_TIMEOUT':'AI_UNAVAILABLE'},503);
    }
  };
}
