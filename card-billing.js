(function(root){
  function dateAt(year,month,day){return new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate())))}
  function iso(d){return d.toISOString().slice(0,10)}
  function parse(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return null;const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&iso(d)===s?d:null}
  function validDay(v){return Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=31}
  function firstDue(purchase,closing,due){
    const d=parse(purchase);if(!d||!validDay(closing)||!validDay(due))return null;
    let m=d.getUTCMonth(),y=d.getUTCFullYear();
    // Purchases on the closing date are conservatively assigned to the next cycle.
    if(d>=dateAt(y,m,Number(closing)))m++;
    const close=dateAt(y,m,Number(closing));let payment=dateAt(y,m,Number(due));
    if(payment<=close)payment=dateAt(y,m+1,Number(due));return iso(payment);
  }
  function split(total,count,first){
    const cents=Math.round(Number(total)*100),n=Number(count),d=parse(first);
    if(!Number.isSafeInteger(cents)||cents<=0||!Number.isInteger(n)||n<1||n>36)return [];
    return Array.from({length:n},(_,i)=>({number:i+1,count:n,amount:(Math.floor(cents/n)+(i<cents%n?1:0))/100,due:d?iso(dateAt(d.getUTCFullYear(),d.getUTCMonth()+i,d.getUTCDate())):null}));
  }
  const api={firstDue,split,validDay};root.CardBilling=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
