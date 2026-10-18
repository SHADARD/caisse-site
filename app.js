import {fields,totals,validateReport,periodFloor,openPeriodReports,reportingCycle,cycleReports} from './domain.mjs?v=cycles-10-09-1';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Kinshasa'}), date=s=>new Date(s.length===10?s+'T12:00:00Z':s).toLocaleDateString('fr-CD',{timeZone:'Africa/Kinshasa'}), fmt=(n,g=false)=>new Intl.NumberFormat('fr-CD',{maximumFractionDigits:g?3:2}).format(n);
const labels=['Connexion totale','Argent M-pesa total','Commission M-pesa (%) totale','Montant achat or total','Poids or total'];
let cfg=window.CAISSE_CONFIG||{},configured=Boolean(cfg.supabaseUrl&&cfg.supabaseKey);const demo=false;let configurationError='La connexion sera disponible après activation des comptes par votre responsable.';
let db,profile,sites=[],periods=[],reports=[],editing=null,loading=false,selectedCycle=null,archives=[],archiveAvailable=false,archiveIssue='';
function periodStart(p){const initial=new Date(p.opened_at).toLocaleDateString('en-CA',{timeZone:'Africa/Kinshasa'});return reports.filter(r=>r.period_id===p.id).reduce((start,r)=>r.report_date<start?r.report_date:start,initial);}
const site=()=>sites.find(s=>s.id===$('#site').value), period=()=>periods.find(p=>p.site_id===site()?.id&&!p.closed_at), canReset=()=>['admin','super'].includes(profile?.role);

function siteOptions(){return (canReset()?'<option value="__all__">Tous les sites (All)</option>':'')+sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');}
function notice(s){$('#notice').textContent=s;}
async function result(q){const {data,error}=await q;if(error)throw error;return data;}
function explain(e){if(e.code==='23505')return 'Un rapport existe déjà pour cette date et ce site.';if(e.code==='42501')return 'Cette action n’est pas autorisée pour votre compte.';if(e.message?.includes('Invalid login'))return 'Identifiant ou mot de passe incorrect.';return e.message||'Une erreur est survenue.';}
async function busy(fn){if(loading)return;loading=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){notice(explain(e));}finally{loading=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function clearEdit(){editing=null;$('#report-form').reset();$('#report-form').elements.report_date.value=today();$('#save').textContent='Ajouter le rapport';$('#cancel-edit').hidden=true;$('#form-title').textContent='Rapport journalier';}
function render(){
 const all=canReset()&&$('#site').value==='__all__';
 const sid=all?null:site()?.id||'__none__';
 const p=period(), rs=openPeriodReports(reports,periods,sid), t=totals(rs);
 const openIds=new Set(periods.filter(p=>!p.closed_at).map(p=>p.id));
 const scopedReports=reports.filter(r=>all||r.site_id===sid);
 const monthlyAccess=canReset();
 const monthlySource=reports;
 if(!selectedCycle)selectedCycle=reportingCycle(today()).start;
 const cycle=reportingCycle(selectedCycle);
 const knownCycles=[...new Set([reportingCycle(today()).start,selectedCycle,...monthlySource.map(r=>reportingCycle(r.report_date).start)])].sort().reverse();
 $('#report-cycle').innerHTML=knownCycles.map(start=>{const range=reportingCycle(start);return `<option value="${start}">${date(range.start)} au ${date(range.end)}</option>`;}).join('');
 $('#report-cycle').value=selectedCycle;
 $('#monthly-panel').hidden=!monthlyAccess;$('#archive-current-cycle').hidden=profile.role!=='super'||cycle.end>=today()||!archiveAvailable;$('#global-reset').hidden=profile.role!=='super';
 const monthly=cycleReports(monthlySource,cycle,sid),mt=totals(monthly);
 $('#monthly-title').textContent=all?'Rapport mensuel · Tous les sites':'Rapport mensuel · '+(site()?.name||'Site');
 $('#monthly-count').textContent=`${monthly.length} rapport(s) · Caisses ouvertes et clôturées incluses`;
 $('#monthly-stats').innerHTML=fields.map((k,i)=>`<article class="stat"><small>${labels[i]}</small><strong>${fmt(mt[k],i===4)}</strong><span>${i===4?'GRAMMES':'FRANCS CONGOLAIS'}</span></article>`).join('');
 $('#reports-title').textContent=monthlyAccess?`Rapports du ${date(cycle.start)} au ${date(cycle.end)}`:'Rapports journaliers';

 const openCount=periods.filter(p=>!p.closed_at&&(all||p.site_id===sid)).length;
 $('#totals-title').textContent=all?'Cumuls des caisses ouvertes · Tous les sites':'Cumuls de la caisse ouverte';
 $('#period-start').textContent=all?`${openCount} caisse(s) ouverte(s) · hors caisses clôturées`:p?'Début : '+date(periodStart(p)):'Aucune période ouverte';
 $('#stats').innerHTML=fields.map((k,i)=>`<article class="stat"><small>${labels[i]}</small><strong>${fmt(t[k],i===4)}</strong><span>${i===4?'GRAMMES':'FRANCS CONGOLAIS'}</span></article>`).join('');
 const showEntry=profile.role==='site'||(profile.role==='super'&&Boolean(editing));
 $('#entry-panel').hidden=!showEntry;
 document.querySelector('#dashboard>.columns').hidden=!showEntry;
 document.querySelector('#dashboard .note').hidden=profile.role!=='site';
 const reset=canReset()&&!all&&Boolean(p);
 $('#reset').hidden=!reset;
 document.querySelector('.actions').hidden=!reset;
 $('#role-label').textContent={site:'Compte de site',admin:'Administrateur · lecture et clôture',super:'Super utilisateur · accès complet'}[profile.role];
 $('.edit-col').hidden=profile.role!=='super';$('.site-col').hidden=!all;
 const filter=$('#date-filter').value;
 $('#reports').innerHTML=(monthlyAccess?monthly:scopedReports).filter(r=>!filter||r.report_date===filter).sort((a,b)=>b.report_date.localeCompare(a.report_date)).map(r=>`<tr><td>${date(r.report_date)} ${r.is_archived?'<small>· archivé</small>':openIds.has(r.period_id)?'':'<small>· clôturé</small>'}</td>${all?`<td>${esc(sites.find(s=>s.id===r.site_id)?.name||'—')}</td>`:''}${fields.map((k,i)=>`<td>${fmt(r[k],i===4)} ${i===4?'g':'FC'}</td>`).join('')}${profile.role==='super'&&!r.is_archived?`<td><button data-edit="${esc(r.id)}">Modifier</button><button data-delete="${esc(r.id)}">Supprimer</button></td>`:profile.role==='super'?'<td>Archive conservée</td>':''}</tr>`).join('')||'<tr><td colspan="8" class="empty">Aucun rapport pour cette sélection.</td></tr>';
 $('#cash-history').innerHTML=periods.filter(p=>(all||p.site_id===sid)&&p.closed_at).sort((a,b)=>b.closed_at.localeCompare(a.closed_at)).map(p=>{const rr=reports.filter(r=>r.period_id===p.id),tt=totals(rr);return `<article class="panel"><h2>${esc(sites.find(s=>s.id===p.site_id)?.name||'—')} · ${date(periodStart(p))} → ${date(p.closed_at)}</h2><p>Clôture : ${esc(new Date(p.closed_at).toLocaleString('fr-CD',{timeZone:'Africa/Kinshasa'}))} (Kinshasa) · Par ${esc(p.closed_by_name||p.closed_by||'—')} · ${rr.length} rapport(s)</p><div class="stats">${fields.map((k,i)=>`<div class="stat"><small>${labels[i]}</small><strong>${fmt(tt[k],i===4)}</strong><span>${i===4?'g':'FC'}</span></div>`).join('')}</div></article>`;}).join('')||'<div class="panel empty">Aucune caisse clôturée pour cette sélection.</div>';
 renderArchives();
 $('#subtitle').textContent=all?'Tous les sites · Cumuls des caisses ouvertes et rapports d’activité.':site()?`${site().name} · Rapports d’activité et suivi de caisse.`:'Aucun site attribué. Contactez le super utilisateur.';
}

async function allRows(table,order){let rows=[],offset=0;for(;;){const page=await result(db.from(table).select('*').order(order,{ascending:false}).order('id').range(offset,offset+499));rows.push(...page);if(page.length<500)return rows;offset+=500;}}
async function refresh(){if(!demo){[periods,reports]=await Promise.all([allRows('periods','opened_at'),allRows('reports','report_date')]);await loadArchiveData();}render();}
function selectView(view){for(const id of ['dashboard','history','guide','accounts'])$('#'+id).hidden=id!==view;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#page-title').textContent={dashboard:'Tableau de bord',history:'Historique et PDF',guide:'Guide d’utilisation',accounts:'Sites et utilisateurs'}[view];}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>selectView(b.dataset.view));$('#site').onchange=()=>{clearEdit();$('#date-filter').value='';render();};$('#date-filter').onchange=render;$('#report-cycle').onchange=()=>{selectedCycle=$('#report-cycle').value;$('#date-filter').value='';render();};$('#print').onclick=()=>window.print();$('#cancel-edit').onclick=()=>{clearEdit();render();};
$('#report-form').onsubmit=e=>{e.preventDefault();busy(async()=>{const r=Object.fromEntries(new FormData(e.target));const target=editing?periods.find(p=>p.id===reports.find(r=>r.id===editing).period_id):period();if(!target)throw Error('Aucune période ouverte.');validateReport(r,periodFloor(target,periods));fields.forEach(k=>r[k]=Number(r[k]));if(demo){if(reports.some(x=>x.site_id===site().id&&x.report_date===r.report_date&&x.id!==editing))throw Error('Un rapport existe déjà pour cette date et ce site.');if(editing)Object.assign(reports.find(x=>x.id===editing),r);else reports.push({...r,id:crypto.randomUUID(),site_id:site().id,period_id:target.id});}else if(editing)await result(db.from('reports').update(r).eq('id',editing));else await result(db.rpc('add_report',{p_site:site().id,p_date:r.report_date,p_connection:r.connection,p_mpesa:r.mpesa,p_commission:r.commission,p_gold_cost:r.gold_cost,p_gold_weight:r.gold_weight}));clearEdit();await refresh();notice(demo?'Rapport de test ajouté. Les données seront perdues au rechargement.':'Rapport enregistré. Les cumuls sont à jour.');});};
$('#reports').onclick=e=>{const edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(edit){const r=reports.find(r=>r.id===edit.dataset.edit);$('#site').value=r.site_id;editing=r.id;render();for(const k of ['report_date',...fields])$('#report-form').elements[k].value=r[k];$('#save').textContent='Enregistrer les modifications';$('#form-title').textContent='Modifier le rapport';$('#cancel-edit').hidden=false;$('#entry-panel').scrollIntoView({behavior:'smooth'});}if(del){if(confirm('Supprimer définitivement ce rapport ? Les cumuls seront recalculés.'))busy(async()=>{if(demo)reports=reports.filter(r=>r.id!==del.dataset.delete);else await result(db.from('reports').delete().eq('id',del.dataset.delete));clearEdit();await refresh();notice('Rapport supprimé.');});}};
$('#reset').onclick=()=>{if(!period())return notice('Aucune période ouverte.');if(confirm(`Confirmer la collecte de toute la caisse de ${site().name} ? La période sera clôturée et les cumuls repartiront à zéro. Les rapports resteront dans l’historique.`))busy(async()=>{if(demo){const stamp=new Date().toISOString();Object.assign(period(),{closed_at:stamp,closed_by_name:profile.display_name});periods.push({id:crypto.randomUUID(),site_id:site().id,opened_at:stamp,closed_at:null});}else await result(db.rpc('close_period',{p_site:site().id,p_period:period().id}));clearEdit();await refresh();notice('Caisse clôturée. Une nouvelle période est ouverte.');});};
async function openWorkspace(){profile=await result(db.from('profiles').select('*').eq('id',(await db.auth.getUser()).data.user.id).single());sites=await allRows('sites','name');$('#site').innerHTML=siteOptions();$('#identity').textContent='Bienvenue, '+profile.display_name;document.body.classList.remove('public-page');$('#welcome').hidden=true;$('#accounts-nav').hidden=profile.role!=='super';$('#login').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;clearEdit();await refresh();await loadAccounts();}
$('#login-form').onsubmit=e=>{e.preventDefault();busy(async()=>{notice('');if(!configured||!db)throw Error(configurationError);const f=new FormData(e.target);const {error}=await db.auth.signInWithPassword({email:f.get('username').trim().toLowerCase().includes('@')?f.get('username').trim().toLowerCase():f.get('username').trim().toLowerCase()+'@users.caisse.invalid',password:f.get('password')});if(error)throw error;await openWorkspace();e.target.reset();});};$('#logout').onclick=()=>busy(async()=>{const {error}=await db.auth.signOut();if(error)throw error;location.reload();});
$('#connect').onclick=()=>{$('#welcome').hidden=true;$('#login').hidden=false;$('#login-form').elements.username.focus();if(!configured||!db)notice(configurationError);};$('#back-welcome').onclick=()=>{$('#login').hidden=true;$('#welcome').hidden=false;};


async function loadAccounts(){if(profile.role!=='super')return;$('#account-site').innerHTML=sites.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');const accounts=demo?[]:await allRows('profiles','display_name');$('#account-list').innerHTML=accounts.map(a=>`<tr><td>${esc(a.username)}</td><td>${esc(a.display_name)}</td><td>${esc({site:'Site',admin:'Administrateur',super:'Super utilisateur'}[a.role])}</td><td>${esc(sites.find(s=>s.id===a.site_id)?.name||'Tous les sites')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">Aucun compte réel dans cet aperçu.</td></tr>';}
$('#account-form').elements.role.onchange=e=>{$('#account-site-label').hidden=e.target.value!=='site';};
$('#account-form').onsubmit=e=>{e.preventDefault();busy(async()=>{if(demo)throw Error('Démonstration : la création des comptes nécessite la base et le serveur configurés.');const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Reconnectez-vous pour créer un compte.');const res=await fetch('/api/create-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});let body;try{body=await res.json();}catch{throw Error('Le service de création des comptes doit être configuré sur l’hébergeur.');}if(!res.ok)throw Error(body.error||'Impossible de créer le compte.');e.target.reset();$('#account-site-label').hidden=false;await loadAccounts();notice(body.message);});};
$('#site-form').onsubmit=e=>{e.preventDefault();busy(async()=>{if(demo)throw Error('Démonstration : la création des sites nécessite la base configurée.');await result(db.rpc('create_site',{p_name:new FormData(e.target).get('name')}));const selected=$('#site').value;sites=await allRows('sites','name');$('#site').innerHTML=siteOptions();if(selected)$('#site').value=selected;await refresh();await loadAccounts();e.target.reset();notice('Site créé. Vous pouvez maintenant lui attribuer un compte.');});};

const welcomePicture=document.querySelector('#welcome-picture');function showWelcomePicture(){if(welcomePicture.naturalWidth>0)welcomePicture.parentElement.classList.add('has-image');}welcomePicture.addEventListener('load',showWelcomePicture);showWelcomePicture();

async function initializeConnection(){
 await busy(async()=>{
  if(!configured){
   try{
    const response=await fetch('/api/config',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok){configurationError=data.error||'La configuration de connexion doit être complétée.';return;}
    cfg=data;configured=Boolean(cfg.supabaseUrl&&cfg.supabaseKey);
   }catch{configurationError='Le service de connexion est indisponible. Actualisez la page ou contactez votre responsable.';return;}
  }
  if(!configured)return;
  try{
   const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.1');
   db=createClient(cfg.supabaseUrl,cfg.supabaseKey);
   const {data,error}=await db.auth.getSession();if(error)throw error;
   if(data.session)await openWorkspace();
  }catch(error){configurationError='Impossible de charger la connexion : '+explain(error);notice(configurationError);}
 });
}
initializeConnection();

if(/FlamingoAndroid\//.test(navigator.userAgent)){const card=document.querySelector('#android-download-card');if(card)card.hidden=true;}

async function loadArchiveData(){
 if(!canReset()){archives=[];archiveAvailable=false;return;}
 try{archives=await allRows('business_archives','created_at');archiveAvailable=true;archiveIssue='';}
 catch{archiveAvailable=false;archives=[];archiveIssue='Les archives doivent être activées avec la migration 002-archives-reset.sql dans Supabase.';}
}
function renderArchives(){
 $('#archive-history').hidden=!canReset();
 $('#archive-note').textContent=archiveIssue||'PDF mensuels du 10 au 9 et sauvegardes avant réinitialisation générale. Horaire mensuel prévu : le 10 à 00 h 05, heure de Kinshasa.';
 $('#archive-list').innerHTML=archives.map(a=>`<article class="archive-item"><div><h3>${a.kind==='monthly'?'Synthèse mensuelle':'Avant réinitialisation générale'}</h3><p>Du ${date(a.period_start)} au ${date(a.period_end)} · ${a.report_count} rapport(s)<br>Créé le ${esc(new Date(a.created_at).toLocaleString('fr-CD',{timeZone:'Africa/Kinshasa'}))} (Kinshasa)</p></div><div class="archive-buttons"><button data-archive="${esc(a.id)}" data-file="pdf">Ouvrir le PDF</button>${profile.role==='super'?`<button data-archive="${esc(a.id)}" data-file="json">Sauvegarde des données</button>`:''}</div></article>`).join('')||'<p>Aucune archive générée pour le moment.</p>';
}
async function postArchiveAction(path,body){
 const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Reconnectez-vous.');
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});
 let result;try{result=await res.json();}catch{throw Error('Le service de sauvegarde est indisponible.');}if(!res.ok)throw Error(result.error||'Opération refusée.');return result;
}
$('#archive-list').onclick=e=>{const button=e.target.closest('[data-archive]');if(!button)return;busy(async()=>{const a=archives.find(a=>a.id===button.dataset.archive);if(!a)return;const path=button.dataset.file==='pdf'?a.pdf_path:a.backup_path;const {data,error}=await db.storage.from('business-archives').createSignedUrl(path,300);if(error)throw error;window.location.assign(data.signedUrl);});};
$('#archive-current-cycle').onclick=()=>busy(async()=>{notice('Création de la sauvegarde mensuelle…');const result=await postArchiveAction('/api/archive-monthly',{start:selectedCycle});await refresh();notice(result.message);selectView('history');});
$('#global-reset').onclick=()=>{if(profile.role!=='super')return;if(!archiveAvailable)return notice(archiveIssue);$('#global-reset-form').reset();$('#reset-error').textContent='';$('#reset-all-dialog').showModal();};
$('#cancel-global-reset').onclick=()=>$('#reset-all-dialog').close();
$('#reset-all-dialog').addEventListener('cancel',e=>{if(loading)e.preventDefault();});
$('#reset-all-dialog').addEventListener('close',()=>$('#global-reset-form').reset());
$('#global-reset-form').onsubmit=e=>{e.preventDefault();busy(async()=>{try{const body=Object.fromEntries(new FormData(e.target));$('#reset-error').textContent='Sauvegarde en cours. Ne fermez pas cette fenêtre.';const result=await postArchiveAction('/api/reset-all',body);$('#reset-all-dialog').close();clearEdit();await refresh();notice(result.message);selectView('history');}catch(error){$('#reset-error').textContent=explain(error);throw error;}finally{e.target.elements.password.value='';}});};
