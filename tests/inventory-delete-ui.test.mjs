import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../estoque-product-delete-requests.js',import.meta.url),'utf8');
function ui(){
  const elements=new Map(),buttons=[];
  function element(id=''){
    const classes=new Set();const el={id,textContent:'',disabled:false,className:'',dataset:{},
      classList:{add(...names){names.forEach(name=>classes.add(name))},remove(...names){names.forEach(name=>classes.delete(name))},toggle(name,on){on?classes.add(name):classes.delete(name)},contains(name){return classes.has(name)}},
      before(button){buttons.push(button)},appendChild(){},prepend(child){el.notice=child},setAttribute(){},querySelector(){return null},querySelectorAll(){return []},remove(){buttons.splice(buttons.indexOf(el),1)}};
    if(id)elements.set(id,el);return el;
  }
  for(const id of ['modalCancel','modalSave','modal','modalBody','pStatus'])element(id);
  elements.get('modalBody').parentElement=element('productDialog');
  const context=vm.createContext({D:null,document:{head:{appendChild(){}},createElement:()=>element(),querySelectorAll:()=>buttons.filter(button=>button.className.includes('product-delete-')),getElementById:id=>elements.get(id)},$:id=>elements.get(id),esc:String,fmt:String,dt:String,console,modal(){},closeModal(){},render(){},openProduct(){},api(){throw Error('Não deve aguardar a rede para mostrar a ação')}});
  vm.runInContext(script,context);
  const product={product_id:'P1',pn:'PN1',status:'ATIVO'};
  return {context,buttons,elements,open(permission){context.D={user:{administrator:false},permissions:{productDelete:permission}};context.product=product;vm.runInContext('openProduct(product)',context)}};
}
test('responsável delegado vê Excluir imediatamente sem carregar solicitações',()=>{
  const page=ui();page.open(true);assert.equal(page.buttons.length,1);assert.equal(page.buttons[0].textContent,'Excluir do estoque');
});
test('solicitante vê Solicitar exclusão imediatamente e nenhuma ação de exclusão direta',()=>{
  const page=ui();page.open(false);assert.equal(page.buttons.length,1);assert.equal(page.buttons[0].textContent,'Solicitar exclusão');
});
test('fechar ou trocar o modal remove a ação do produto anterior',()=>{
  const page=ui();page.open(true);vm.runInContext('modal("Outro formulário", "", null)',page.context);assert.equal(page.buttons.length,0);
  page.open(true);vm.runInContext('closeModal()',page.context);assert.equal(page.buttons.length,0);
});
test('abrir outro item ou um novo cadastro não deixa botões duplicados',()=>{
  const page=ui();page.open(true);page.open(true);assert.equal(page.buttons.length,1);
  vm.runInContext('openProduct({})',page.context);assert.equal(page.buttons.length,0);
});

test('trocar componentes mantém a solicitação no rodapé e reinicia somente a rolagem do formulário',()=>{
  const page=ui();page.open(false);
  const body=page.elements.get('modalBody'),dialog=body.parentElement;
  dialog.scrollTop=700;body.scrollTop=500;
  vm.runInContext('closeModal()',page.context);page.context.product={product_id:'P2',status:'ATIVO'};
  vm.runInContext('openProduct(product)',page.context);
  assert.equal(dialog.classList.contains('inventory-product-dialog'),true);
  assert.equal(dialog.scrollTop,0);assert.equal(body.scrollTop,0);
  assert.equal(page.buttons.length,1);assert.equal(page.buttons[0].textContent,'Solicitar exclusão');
  vm.runInContext('modal("Outro formulário", "", null)',page.context);
  assert.equal(dialog.classList.contains('inventory-product-dialog'),false);
});

test('solicitação fica habilitada ao trocar entre itens ativos e inativos',()=>{
  const page=ui();page.open(false);
  page.context.product={product_id:'PROD-49E977CA',status:'INATIVO'};
  vm.runInContext('openProduct(product)',page.context);
  assert.equal(page.buttons.length,1);assert.equal(page.buttons[0].textContent,'Solicitar exclusão');
  assert.equal(page.buttons[0].disabled,false);assert.match(page.elements.get('modalBody').notice.textContent,/também pode solicitar/);
  page.open(false);assert.equal(page.buttons.length,1);assert.equal(page.buttons[0].disabled,false);
  assert.equal(page.buttons[0].textContent,'Solicitar exclusão');
});
