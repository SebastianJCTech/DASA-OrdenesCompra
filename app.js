import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-GT',{style:'currency',currency:'GTQ'}).format(Number(n));
const date = v => v ? new Date(v).toLocaleString('es-GT',{timeZone:'America/Guatemala'}) : '—';
const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db, me, people=[], orders=[], approvals=[], reportSnapshot=null;
const kinds = {estado:'Órdenes por estado',rechazadas:'Órdenes rechazadas',tiempo:'Tiempo de aprobación',vencidas:'Órdenes pendientes vencidas',departamento:'Gasto por departamento',proveedor:'Gasto por proveedor',propio:'Historial propio'};
const name = id => people.find(p=>p.id===id)?.name||id;
function notify(t){$('#message').textContent=t;}
async function run(fn){try{await fn();}catch(e){notify(e.message||'No se pudo completar la operación');}}
function check(r){if(r.error)throw r.error;return r.data;}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">Sin resultados para estos filtros</td></tr>`}</tbody></table>`;}
function option(p){return `<option value="${esc(p.id)}">${esc(p.name)}${p.approval_limit ? ' · '+money(p.approval_limit):''}</option>`;}
async function session(){
 const user=check(await db.auth.getUser())?.user;
 if(!user){$('#workspace').hidden=true;$('#login').hidden=false;return;}
 me=check(await db.from('profiles').select('*').eq('id',user.id).single());
 if(!me)throw Error('Tu cuenta todavía no tiene perfil. Solicita habilitación al administrador.');
 people=check(await db.from('profiles').select('*').order('name'));
 $('#identity').textContent=`${me.name} · ${me.role}`;$('#logout').hidden=false;$('#login').hidden=true;$('#workspace').hidden=false;
 $('#orderForm [name=approver_id]').innerHTML=people.filter(p=>p.role==='interno'&&Number(p.approval_limit)>0&&p.id!==me.id).map(option).join('');
 $('#reportForm [name=creator]').innerHTML='<option value="">Todos</option>'+people.map(option).join('');
 $('#reportForm [name=approver]').innerHTML='<option value="">Todos</option>'+people.filter(p=>p.role==='interno').map(option).join('');
 $('#reportForm [name=kind]').innerHTML=Object.entries(kinds).filter(([k])=>me.role==='interno'?k!=='propio':['estado','propio'].includes(k)).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
 $('nav [data-page=audit]').hidden=me.role!=='interno';
 await refresh();notify('Sesión iniciada. Los permisos se aplican en PostgreSQL.');
}
async function fresh(){
 // Consultas nuevas en cada reporte; no reutilizar el listado del panel.
 const results=await Promise.all([db.from('orders').select('*').order('id',{ascending:false}),db.from('approvals').select('*').order('decided_at')]);
 return {orders:check(results[0]),approvals:check(results[1])};
}
async function refresh(){
 ({orders,approvals}=await fresh());
 const pending=orders.filter(o=>o.status==='Pendiente de aprobación');
 $('#metrics').innerHTML=`<div>Órdenes visibles<b>${orders.length}</b></div><div>Pendientes<b>${pending.length}</b></div><div>Importe aprobado y cerrado<b>${money(orders.filter(o=>['Aprobada','Cerrada'].includes(o.status)).reduce((s,o)=>s+Number(o.amount),0))}</b></div>`;
 $('#orderRows').innerHTML=orders.map(o=>{
 let actions=[];const owner=me.id===o.creator_id,internal=me.role==='interno';
 if(o.status==='Borrador'){actions.push(['editar','Editar'],['enviar','Enviar'],['eliminar','Eliminar']);}
 if(['Borrador','Pendiente de aprobación','Aprobada'].includes(o.status))actions.push(['cancelar','Cancelar']);
 const previous=approvals.filter(a=>a.order_id===o.id&&a.decision==='Aprobada');
 if(internal&&!owner&&o.status==='Pendiente de aprobación'&&Number(me.approval_limit)>0&&!previous.some(a=>a.approver_id===me.id)&&(o.approver_id===me.id||previous.length))actions.push(['aprobar','Aprobar'],['rechazar','Rechazar']);
 if(internal&&o.status==='Aprobada')actions.push(['cerrar','Cerrar']);
 return `<tr><td><b>OC-${o.id}</b><br>${esc(name(o.creator_id))}<br><small>${esc(o.description)}</small></td><td>${esc(o.supplier)}</td><td>${esc(o.department)}</td><td>${esc(money(o.amount))}</td><td><span class="badge">${esc(o.status)}</span>${previous.length&&o.status==='Pendiente de aprobación'?'<br><small>Falta segundo aprobador</small>':''}<br><small>${esc(o.reason||'')}</small></td><td>${actions.map(([a,t])=>`<button data-id="${o.id}" data-action="${a}">${t}</button>`).join('')}</td></tr>`;
 }).join('')||'<tr><td colspan="6">Todavía no hay órdenes. Crea tu primer borrador.</td></tr>';
}
$('#loginForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);check(await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')}));e.target.reset();await session();});};
$('#corporate').onclick=()=>run(async()=>{if(!db)throw Error('Primero configura Supabase en config.js');check(await db.auth.signInWithOAuth({provider:'azure',options:{scopes:'email',redirectTo:location.origin+location.pathname}}));});
$('#logout').onclick=()=>run(async()=>{check(await db.auth.signOut());location.reload();});
$('#clear').onclick=()=>{$('#orderForm').reset();$('#orderForm [name=id]').value='';$('#formTitle').textContent='Nueva orden';};
$('#orderForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);check(await db.rpc('save_order',{p_id:f.get('id')?Number(f.get('id')):null,p_supplier:f.get('supplier').trim(),p_department:f.get('department').trim(),p_description:f.get('description').trim(),p_amount:Number(f.get('amount')),p_due:f.get('due_date'),p_approver:f.get('approver_id')}));$('#clear').click();await refresh();notify('Borrador guardado.');});};
$('#orderRows').onclick=e=>{const b=e.target.closest('button[data-action]');if(!b)return;run(async()=>{
 const id=Number(b.dataset.id),a=b.dataset.action,o=orders.find(o=>o.id===id);
 if(a==='editar'){const f=$('#orderForm');for(const k of ['id','supplier','department','description','amount','due_date','approver_id'])f.elements[k].value=o[k];$('#formTitle').textContent=`Editar OC-${id}`;f.scrollIntoView({behavior:'smooth'});return;}
 let reason=null;if(['rechazar','cancelar'].includes(a)){reason=prompt('Motivo obligatorio (máximo 500 caracteres):');if(reason===null)return;if(!reason.trim()||reason.length>500)throw Error('Motivo: ingresa entre 1 y 500 caracteres');}
 if(!confirm(`¿Confirmas ${a} la orden OC-${id}?`))return;
 b.disabled=true;try{check(await db.rpc('order_action',{p_id:id,p_action:a,p_reason:reason}));await refresh();notify('Operación completada.');}finally{b.disabled=false;}
 });};
$('#refresh').onclick=()=>run(refresh);
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{for(const id of ['orders','reports','audit'])$('#'+id).hidden=id!==b.dataset.page;});
function aggregate(rows,key){const groups=new Map();for(const o of rows){const k=o[key];const v=groups.get(k)||[k,0,0];v[1]++;v[2]+=Number(o.amount);groups.set(k,v);}return [...groups.values()].map(([k,n,v])=>[k,n,money(v)]);}
$('#reportForm').oninput=()=>{reportSnapshot=null;$('#pdf').disabled=true;};
$('#reportForm').onsubmit=e=>{e.preventDefault();run(async()=>{
 const f=Object.fromEntries(new FormData(e.target));if(f.from&&f.to&&f.from>f.to)throw Error('Periodo: la fecha inicial no puede ser mayor que la final');
 if(me.role==='externo'&&!['estado','propio'].includes(f.kind))throw Error('Reporte exclusivo para usuarios internos');
 const data=await fresh(),now=new Date(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
 const period=v=>(!f.from||day(v)>=f.from)&&(!f.to||day(v)<=f.to);
 let os=data.orders.filter(o=>(!f.creator||o.creator_id===f.creator)&&(!f.department||o.department.toLowerCase()===f.department.trim().toLowerCase())&&(!f.supplier||o.supplier.toLowerCase()===f.supplier.trim().toLowerCase())&&(!f.status||o.status===f.status));
 let headers,rows;
 if(f.kind==='estado'){headers=['Estado','Cantidad','Importe'];rows=aggregate(os.filter(o=>period(o.created_at)),'status');}
 if(f.kind==='rechazadas'){
 headers=['Orden','Creador','Motivo','Aprobador','Fecha'];rows=data.approvals.filter(a=>a.decision==='Rechazada'&&period(a.decided_at)&&(!f.approver||a.approver_id===f.approver)).flatMap(a=>{const o=os.find(o=>o.id===a.order_id);return o?[[`OC-${o.id}`,name(o.creator_id),a.reason,name(a.approver_id),date(a.decided_at)]]:[];});}
 if(f.kind==='tiempo'){
 headers=['Aprobador','Decisiones de aprobación','Media (horas)','Máximo (horas)'];const groups=new Map();
 for(const a of data.approvals.filter(a=>a.decision==='Aprobada'&&period(a.decided_at)&&(!f.approver||a.approver_id===f.approver))){const o=os.find(o=>o.id===a.order_id);if(!o?.submitted_at)continue;const hours=(new Date(a.decided_at)-new Date(o.submitted_at))/3600000;const v=groups.get(a.approver_id)||[];v.push(hours);groups.set(a.approver_id,v);}
 rows=[...groups].map(([id,v])=>[name(id),v.length,(v.reduce((s,x)=>s+x,0)/v.length).toFixed(2),Math.max(...v).toFixed(2)]);}
 if(f.kind==='vencidas'){
 headers=['Orden','Proveedor','Aprobador pendiente','Fecha límite','Días desde envío'];
 rows=os.filter(o=>o.status==='Pendiente de aprobación'&&o.due_date<today).filter(o=>!f.approver||(data.approvals.some(a=>a.order_id===o.id&&a.decision==='Aprobada')?people.some(p=>p.id===f.approver&&p.role==='interno'&&p.id!==o.creator_id&&Number(p.approval_limit)>0&&!data.approvals.some(a=>a.order_id===o.id&&a.approver_id===p.id)):o.approver_id===f.approver)).map(o=>[`OC-${o.id}`,o.supplier,data.approvals.some(a=>a.order_id===o.id&&a.decision==='Aprobada')?'Segundo aprobador (interno distinto)':name(o.approver_id),o.due_date,Math.floor((now-new Date(o.submitted_at))/86400000)]);}
 if(f.kind==='departamento'){headers=['Departamento','Cantidad','Importe aprobado y cerrado'];rows=aggregate(os.filter(o=>['Aprobada','Cerrada'].includes(o.status)&&period(o.decided_at)),'department');}
 if(f.kind==='proveedor'){headers=['Proveedor','Cantidad','Importe cerrado'];rows=aggregate(os.filter(o=>o.status==='Cerrada'&&period(o.updated_at)),'supplier');}
 if(f.kind==='propio'){headers=['Orden','Proveedor','Estado','Creada','Enviada','Decisión','Último cambio','Motivo','Importe'];rows=os.filter(o=>o.creator_id===me.id&&period(o.created_at)).map(o=>[`OC-${o.id}`,o.supplier,o.status,date(o.created_at),date(o.submitted_at),date(o.decided_at),date(o.updated_at),o.reason||'—',money(o.amount)]);}
 reportSnapshot={title:kinds[f.kind],headers,rows,at:date(now),filters:Object.entries(f).filter(([k,v])=>k!=='kind'&&v).map(([k,v])=>`${k}: ${['creator','approver'].includes(k)?name(v):v}`).join(' · ')};
 $('#reportOutput').innerHTML=`<h2>${esc(reportSnapshot.title)}</h2><p>${esc(reportSnapshot.at)} · ${esc(reportSnapshot.filters)}</p>${table(headers,rows)}`;$('#pdf').disabled=false;notify('Reporte consultado con datos actuales.');
 });};
$('#pdf').onclick=()=>run(async()=>{
 if(!reportSnapshot)throw Error('Consulta primero el reporte');
 const w=window.open('','_blank');if(!w)throw Error('Permite ventanas emergentes para exportar el PDF');
 const r=reportSnapshot;w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial;color:#193044}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd;padding:7px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Guardar como PDF</button><h1>DASA · ${esc(r.title)}</h1><p>Consultado: ${esc(r.at)} · Usuario: ${esc(me.name)}</p><p>${esc(r.filters)}</p>${table(r.headers,r.rows)}<p>Moneda: GTQ. Datos al momento de la consulta.</p></body></html>`);w.document.close();w.focus();
});
$('#loadAudit').onclick=()=>run(async()=>{if(me.role!=='interno')throw Error('Acceso denegado');const rows=check(await db.from('audit_log').select('*').order('id',{ascending:false}).limit(200));$('#auditOutput').innerHTML=table(['Fecha','Usuario','Orden','Operación','Antes','Después'],rows.map(a=>[date(a.occurred_at),name(a.actor_id),`OC-${a.order_id}`,a.operation,JSON.stringify(a.old_values),JSON.stringify(a.new_values)]));});
if(!window.DASA_CONFIG?.url||!window.DASA_CONFIG?.key){notify('Proyecto creado. Falta conectar Supabase: completa url y key publicable en config.js. Consulta ENTREGA.md.');$('#loginForm button').disabled=true;}
else{db=createClient(window.DASA_CONFIG.url,window.DASA_CONFIG.key);run(async()=>{const {data}=await db.auth.getSession();if(data.session)await session();});}
