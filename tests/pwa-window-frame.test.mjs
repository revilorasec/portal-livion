import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

for(const [path,id,start] of [
  ['manifest.webmanifest','./','./'],
  ['manifest-desempenho-funcionarios.webmanifest','./pwa/desempenho-funcionarios','./?app=desempenho-funcionarios']
]){
  test(path+': janela com barra de título nativa preserva identidade e rota de instalação',()=>{
    const manifest=JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
    assert.equal(manifest.display,'standalone');
    assert.equal((manifest.display_override||[manifest.display])[0],'standalone');
    assert.ok(!manifest.display_override?.some(mode=>['window-controls-overlay','fullscreen','borderless'].includes(mode)));
    assert.equal(manifest.id,id);
    assert.equal(manifest.start_url,start);
    assert.equal(manifest.scope,'./');
  });
}
