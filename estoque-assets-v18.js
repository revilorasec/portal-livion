(function enableGalleryChoiceAndLoadInventoryAssets(){
  const selector='input[type="file"][capture]';
  const enableGalleryChoice=root=>{
    if(root?.matches?.(selector)) root.removeAttribute('capture');
    root?.querySelectorAll?.(selector).forEach(input=>input.removeAttribute('capture'));
  };
  enableGalleryChoice(document);
  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType===1) enableGalleryChoice(node);
      }
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
  document.write('<script src="estoque-assets-v18-core.js?v=4"><\/script>');
})();
