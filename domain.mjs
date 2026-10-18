export const fields = ['connection','mpesa','commission','gold_cost','gold_weight'];
export function totals(reports) { return Object.fromEntries(fields.map(k => [k, reports.reduce((n,r) => n + Number(r[k]), 0)])); }
export function validateReport(r, start) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(r.report_date) || !Number.isFinite(Date.parse(r.report_date+'T00:00:00Z')) || new Date(r.report_date+'T00:00:00Z').toISOString().slice(0,10)!==r.report_date) throw Error('Date invalide.');
 const today = new Date().toLocaleDateString('en-CA', {timeZone:'Africa/Kinshasa'});
 if(r.report_date > today) throw Error('La date ne peut pas être dans le futur.');
 if(r.report_date < start) throw Error('La date précède le début de cette période.');
 for(const k of fields) { const n=Number(r[k]); if(r[k]==='' || !Number.isFinite(n) || n<0 || n>999999999999) throw Error('Saisissez des montants et un poids positifs ou nuls, inférieurs à 1 000 milliards.'); const decimals=k==='gold_weight'?3:2;if(Math.abs(n*10**decimals-Math.round(n*10**decimals))>0.001)throw Error('Maximum deux décimales pour les FC et trois pour les grammes.'); }
 return r;
}

export function periodFloor(period,periods){
 const hasPrevious=periods.some(p=>p.site_id===period.site_id&&p.id!==period.id&&p.closed_at&&new Date(p.closed_at)<=new Date(period.opened_at));
 return hasPrevious?new Date(period.opened_at).toLocaleDateString('en-CA',{timeZone:'Africa/Kinshasa'}):'';
}

export function openPeriodReports(reports,periods,siteId=null){
 const openPeriods=new Map(periods.filter(p=>!p.closed_at&&(siteId===null||p.site_id===siteId)).map(p=>[p.id,p.site_id]));
 return reports.filter(r=>openPeriods.has(r.period_id)&&openPeriods.get(r.period_id)===r.site_id);
}
