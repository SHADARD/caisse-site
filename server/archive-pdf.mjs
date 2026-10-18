const FIELDS=['connection','mpesa','commission','gold_cost','gold_weight'];
function units(value,precision){
 const text=String(value??0);
 if(!/^\d+(\.\d+)?$/.test(text))throw Error('Montant de rapport invalide.');
 const [whole,fraction='']=text.split('.');
 if(fraction.length>precision&&/[1-9]/.test(fraction.slice(precision)))throw Error('Précision de rapport invalide.');
 return BigInt(whole)*10n**BigInt(precision)+BigInt((fraction+'0'.repeat(precision)).slice(0,precision));
}
function decimal(value,precision){const text=value.toString().padStart(precision+1,'0');return text.slice(0,-precision)+'.'+text.slice(-precision);}
function moneyTotals(rows){return Object.fromEntries(FIELDS.map(key=>{const p=key==='gold_weight'?3:2;return[key,decimal(rows.reduce((sum,r)=>sum+units(r[key],p),0n),p)];}));}
export function makeSummary(snapshot){
 const source=snapshot.reports||[];
 const rows=source.filter(r=>r.report_date>=snapshot.period_start&&r.report_date<=snapshot.period_end);
 const sites=new Map((snapshot.sites||[]).map(s=>[s.id,s.name]));
 for(const r of rows)if(!sites.has(r.site_id))sites.set(r.site_id,'Ancien site');
 const perSite=[...sites].map(([id,name])=>{const records=rows.filter(r=>r.site_id===id);return{id,name,report_count:records.length,totals:moneyTotals(records)};}).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
 return{period_start:snapshot.period_start,period_end:snapshot.period_end,report_count:rows.length,sites:perSite,totals:moneyTotals(rows)};
}
function display(value){const [whole,fraction]=value.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+','+fraction;}
function pdfText(value){
 return String(value).replace(/[\u2018\u2019]/g,"'").replace(/[\u2013\u2014]/g,'-').replace(/œ/g,'oe').replace(/Œ/g,'OE').replace(/[^\x20-\x7e\xa0-\xff]/gu,'?').replace(/[\\()\x80-\xff]/g,char=>char.charCodeAt(0)>127?'\\'+char.charCodeAt(0).toString(8).padStart(3,'0'):'\\'+char);
}
const frenchDate=value=>value.split('-').reverse().join('/');
export function createSummaryPdf(snapshot,summary){
 const pages=[],rows=summary.sites.length?summary.sites:[{name:'Aucun site',report_count:0,totals:moneyTotals([])}];
 const chunks=[];for(let i=0;i<rows.length;i+=15)chunks.push(rows.slice(i,i+15));
 const generated=new Date(snapshot.created_at).toLocaleString('fr-FR',{timeZone:'Africa/Kinshasa'});
 for(let page=0;page<chunks.length;page++){
  const lines=[];
  function text(x,y,value,size=10,bold=false){lines.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfText(value)}) Tj ET`);}
  lines.push('0.07 0.25 0.21 rg');text(36,555,'FLAMINGO NETWORK',22,true);
  lines.push('0.15 0.2 0.18 rg');text(36,532,snapshot.kind==='reset'?'Sauvegarde avant reinitialisation generale':'Rapport de synthese mensuel',15,true);
  text(36,511,`Du ${frenchDate(summary.period_start)} au ${frenchDate(summary.period_end)} inclus`,11);
  text(36,493,`Genere le ${generated} (Kinshasa) - ${summary.report_count} rapport(s)`,9);
  const x=[36,211,330,449,568,687],width=[175,119,119,119,119,119];
  lines.push('0.91 0.94 0.90 rg','36 451 770 25 re f','0.10 0.20 0.15 rg');
  ['Site','Connexion (FC)','M-pesa (FC)','Commission (FC)','Achat or (FC)','Poids or (g)'].forEach((label,i)=>text(x[i]+6,460,label,9,true));
  let y=429;
  for(const row of chunks[page]){
   const name=row.name.length>29?row.name.slice(0,27)+'...':row.name;
   text(42,y,name,9);
   FIELDS.forEach((key,i)=>{const value=display(row.totals[key]);const size=Math.min(9,(width[i+1]-12)/(value.length*.6));text(x[i+1]+6,y,value,size);});
   lines.push('0.85 0.89 0.84 RG',`36 ${y-8} m 806 ${y-8} l S`);y-=23;
  }
  if(page===chunks.length-1){
   lines.push('0.10 0.30 0.21 rg',`36 ${y-8} 770 26 re f`,'1 1 1 rg');text(42,y,'TOTAL TOUS LES SITES',9,true);
   FIELDS.forEach((key,i)=>{const value=display(summary.totals[key]);text(x[i+1]+6,y,value,Math.min(9,107/(value.length*.6)),true);});
  }
  lines.push('0.30 0.36 0.31 rg');text(36,36,'Archive conservee independamment des remises de caisse.',8);
  text(715,36,`Page ${page+1}/${chunks.length}`,8);pages.push(lines.join('\n'));
 }
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const refs=[];
 for(const content of pages){const pageId=objects.length+1,streamId=pageId+1;refs.push(pageId+' 0 R');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${refs.join(' ')}] /Count ${pages.length} >>`;
 let out='%PDF-1.4\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))out+=offset.toString().padStart(10,'0')+' 00000 n \n';
 out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new TextEncoder().encode(out);
}
