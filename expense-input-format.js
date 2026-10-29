(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ExpenseInputFormat=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const digits=value=>String(value??'').replace(/\D/g,'');

  function formatDocument(value){
    const n=digits(value).slice(0,14);
    if(n.length<=11)return n
      .replace(/^(\d{3})(\d)/,'$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/,'.$1-$2');
    return n
      .replace(/^(\d{2})(\d)/,'$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
      .replace(/\.(\d{3})(\d)/,'.$1/$2')
      .replace(/(\d{4})(\d{1,2})$/,'$1-$2');
  }

  function formatMoneyInput(value){
    const raw=digits(value).replace(/^0+(?=\d)/,'')||'0';
    const padded=raw.padStart(3,'0');
    const integer=padded.slice(0,-2).replace(/^0+(?=\d)/,'')||'0';
    const cents=padded.slice(-2);
    return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+cents;
  }

  function formatMoneyValue(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n<0)return'';
    return formatMoneyInput(n.toFixed(2));
  }

  function parseMoneyInput(value){
    const raw=digits(value);
    return raw?Number(raw)/100:0;
  }

  function bindMoneyInput(input,onInput){
    if(!input||input.dataset.moneyBound==='1')return input;
    input.dataset.moneyBound='1';
    input.inputMode='numeric';
    input.addEventListener('input',()=>{
      input.value=formatMoneyInput(input.value);
      if(typeof onInput==='function')onInput(input);
    });
    return input;
  }

  return{formatDocument,formatMoneyInput,formatMoneyValue,parseMoneyInput,bindMoneyInput};
});
