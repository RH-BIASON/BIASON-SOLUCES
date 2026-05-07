(function(){
  function goHub(){
    try{
      if(window.top && window.top !== window){
        window.top.postMessage({type:'BIASON_BACK_TO_HUB'}, '*');
        return;
      }
    }catch(err){}
    try{
      window.location.href = new URL('BIASON_Hub_Cliente.html', window.location.href).href;
    }catch(err){
      window.location.href = 'BIASON_Hub_Cliente.html';
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(document.querySelector('.hubReturnBar')) return;

    var style = document.createElement('style');
    style.textContent = [
      '.hubReturnBar{position:fixed;right:18px;bottom:18px;z-index:120;display:flex}',
      '.hubReturnBtn{min-height:44px;padding:0 14px;border-radius:14px;border:1px solid rgba(15,23,42,.12);background:#fff;color:#081a24;font:700 13px Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer;box-shadow:0 16px 30px -24px rgba(8,26,36,.55)}',
      '.hubReturnBtn:hover{transform:translateY(-1px);background:#f8fbfd}',
      '@media print{.hubReturnBar{display:none!important}}'
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'hubReturnBar';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hubReturnBtn';
    btn.textContent = 'Voltar ao Hub';
    btn.addEventListener('click', goHub);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  });

  window.biasonGoHub = goHub;
})();
