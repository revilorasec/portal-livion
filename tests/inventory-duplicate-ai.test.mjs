import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, rankDuplicatePairs } from '../supabase/functions/inventory-duplicate-ai/handler.mjs';

const product=(id,pn,description,extra={})=>({
  product_id:id,pn,description,status:'ATIVO',item_type:'INSUMO',
  category:'LIMPEZA',unit:'UNIDADE',balance:1,...extra
});

test('ranks a renamed duplicate and preserves both records for review',()=>{
  const rows=rankDuplicatePairs([
    product('A','PAPEL TOALHA','PAPEL TOALHA INTERFOLHA BRANCO',{internal_code:'PT-01'}),
    product('B','PAPEL TOALHA INTERFOLHA','PAPEL TOALHA BRANCO',{internal_code:'PT-01'}),
    product('C','ALCOOL 5L','ALCOOL ISOPROPILICO 5 LITROS',{barcode:'789100000001'})
  ]);
  assert.ok(rows.some(row=>new Set([row.left.product_id,row.right.product_id]).has('A')&&new Set([row.left.product_id,row.right.product_id]).has('B')));
});

test('does not propose products with conflicting barcodes',()=>{
  const rows=rankDuplicatePairs([
    product('A','CABO USB','CABO USB',{barcode:'111'}),
    product('B','CABO USB','CABO USB',{barcode:'222'})
  ]);
  assert.equal(rows.length,0);
});

test('returns free local candidates without calling an external AI service',async()=>{
  let bootstrapCalls=0;
  const fetcher=async url=>{
    if(String(url).includes('/inventory-api/bootstrap')){
      bootstrapCalls++;
      return new Response(JSON.stringify({
        permissions:{product:true},
        stock:[
          product('A','PAPEL TOALHA','PAPEL TOALHA INTERFOLHA',{internal_code:'PT-01'}),
          product('B','PAPEL TOALHA INTERFOLHA','PAPEL TOALHA',{internal_code:'PT-01'})
        ]
      }),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error('unexpected external network call');
  };
  const handler=createHandler({env:name=>name==='SUPABASE_URL'?'https://example.supabase.co':undefined,fetcher});
  const response=await handler(new Request('https://example.test',{
    method:'POST',headers:{authorization:'Bearer portal-token','content-type':'application/json'},
    body:'{}'
  }));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.model,'local-v1');
  assert.equal(body.analysis,'LOCAL_FREE');
  assert.equal(bootstrapCalls,1);
  assert.ok(body.candidates.length>0);
  assert.equal(body.candidates[0].probability,0.97);
});


test('handles a large catalog without comparing every product pair',()=>{
  const catalog=Array.from({length:900},(_,index)=>product(
    'P'+index,
    'ITEM '+index,
    'COMPONENTE MODELO '+index,
    {internal_code:'COD-'+index,category:'ELETRONICO'}
  ));
  catalog.push(product(
    'DUPLICATE',
    'PAPEL TOALHA INTERFOLHA',
    'PAPEL TOALHA BRANCO',
    {internal_code:'PT-01'}
  ));
  catalog.push(product(
    'ORIGINAL',
    'PAPEL TOALHA',
    'PAPEL TOALHA INTERFOLHA BRANCO',
    {internal_code:'PT-01'}
  ));
  const rows=rankDuplicatePairs(catalog,24);
  assert.ok(rows.length<=24);
  assert.ok(rows.some(row=>new Set([row.left.product_id,row.right.product_id]).has('DUPLICATE')&&new Set([row.left.product_id,row.right.product_id]).has('ORIGINAL')));
});
