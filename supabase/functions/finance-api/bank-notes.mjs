const invalid=()=>{throw Error('INVALID_BANK_NOTE');};
export function validateBankNote(input){
 if(!input||typeof input!=='object'||Array.isArray(input))invalid();
 for(const k of ['account_id','transaction_id'])if(typeof input[k]!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input[k]))invalid();
 if(typeof input.note!=='string'||input.note.trim().length>3000||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(input.note))invalid();
 if(!Number.isInteger(input.revision)||input.revision<0||input.revision>1000000)invalid();
 return {account_id:input.account_id.toLowerCase(),transaction_id:input.transaction_id.toLowerCase(),note:input.note.trim(),revision:input.revision};
}
