// La navigation publique reste disponible même si la connexion tarde à charger.
(()=>{
 const find=id=>document.getElementById(id);
 const message=text=>{const el=find('notice');if(el)el.textContent=text;};
 find('connect').onclick=()=>{find('welcome').hidden=true;find('login').hidden=false;find('login-form').elements.username.focus();};
 find('back-welcome').onclick=()=>{find('login').hidden=true;find('welcome').hidden=false;};
 find('ios-install').onclick=()=>find('ios-install-dialog').showModal();
 find('login-form').addEventListener('submit',event=>{
  if(find('login-form').dataset.handlerReady!=='true'){
   event.preventDefault();event.stopImmediatePropagation();message('La connexion n’a pas fini de charger. Patientez quelques secondes, puis réessayez. Si le problème persiste, actualisez la page.');
  }
 },true);
 if(/FlamingoAndroid\//.test(navigator.userAgent)||navigator.standalone||window.matchMedia('(display-mode: standalone)').matches)find('android-download-card').hidden=true;
})();
