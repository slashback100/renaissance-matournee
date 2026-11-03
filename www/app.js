"use strict";

// Version affichée dans toutes les pages, y compris sur iPhone.
const BCM_APP_VERSION = "V1.0.0";
const versionLabel = document.querySelector(".header .brand small");
if (versionLabel) versionLabel.textContent = `MA TOURNÉE · ${BCM_APP_VERSION}`;

const logo=document.querySelector('.header img').src;
const defaults=[
{id:'g1',name:'Bière',cat:'Bières',emoji:'🍺'},{id:'g2',name:'Bière sans alcool',cat:'Bières',emoji:'🍺'},{id:'g3',name:'Cola',cat:'Softs',emoji:'🥤'},{id:'g4',name:'Cola sans sucre',cat:'Softs',emoji:'🥤'},{id:'g5',name:'Limonade',cat:'Softs',emoji:'🍋'},{id:'g6',name:'Eau plate',cat:'Eaux',emoji:'💧'},{id:'g7',name:'Eau pétillante',cat:'Eaux',emoji:'🫧'},{id:'g8',name:'Jus de fruits',cat:'Softs',emoji:'🧃'},{id:'g9',name:'Café',cat:'Chaudes',emoji:'☕'},{id:'g10',name:'Thé',cat:'Chaudes',emoji:'🫖'},{id:'g11',name:'Chocolat chaud',cat:'Chaudes',emoji:'🍫'},{id:'g12',name:'Chips',cat:'Snacks',emoji:'🥨'}];
const bcm=[{name:'Jupiler',cat:'Bières',emoji:'🍺'},{name:'Maes 0.0',cat:'Bières',emoji:'🍺'},{name:'Coca-Cola',cat:'Softs',emoji:'🥤'},{name:'Coca Zero',cat:'Softs',emoji:'🥤'},{name:'Fanta',cat:'Softs',emoji:'🍊'},{name:'Eau',cat:'Eaux',emoji:'💧'},{name:'Café',cat:'Chaudes',emoji:'☕'},{name:'Chips',cat:'Snacks',emoji:'🥨'}].map((p,i)=>({...p,id:'b'+i}));
const initial=[{id:'default',name:'Carte générique (sans marques)',items:defaults.map(p=>({...p}))},{id:'vr',name:'Carte du VB Renaissance',items:bcm.map(p=>({...p}))}];
function read(k,fallback){try{let v=JSON.parse(localStorage.getItem(k));return v??fallback}catch{return fallback}}
let cards=read('vr_cards_v2',null)||initial,active=read('vr_active_v2','default');
if(!cards.some(c=>c.id===active))active=cards[0].id;
let showPrices=read('vr_show_prices_v1',false);
let bartenderMode=read('vr_bartender_mode_v1',false);
let barOrders=read('vr_bar_orders_v1',[]);
let activeBarOrderId=null;
let orderQrMessage='';
let history=read('vr_history_v2',[]),cart=read('vr_cart_draft_v1',{}),page='home',cat='Tous',modal=null,query='',sort='manual',index=0,perPage=14,editId=null;
// Actualités publiques : Microsoft Lists → SharePoint → GitHub Pages.
const NEWS_URL=(window.BCM_NEWS_URL||'').trim();
const NEWS_CACHE_KEY='vr_news_cache_v2';
let news=read(NEWS_CACHE_KEY,[]);
let newsError=false;
function todayLocalISO(){
 const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function visibleNews(){
 const today=todayLocalISO();
 return news.filter(n=>(!n.date||n.date.slice(0,10)<=today)&&(!n.expires||n.expires.slice(0,10)>=today));
}
function newsDate(s){
 if(!/^\d{4}-\d{2}-\d{2}/.test(s))return s;
 const [y,m,d]=s.slice(0,10).split('-');return `${d}/${m}/${y}`;
}
function newsImageUrl(raw){
 try{const u=new URL(raw);return u.protocol==='https:'?u.href:''}catch{return ''}
}
async function refreshNews(){
 try{
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),9000);
  let response;
  try{response=await fetch(NEWS_URL,{cache:'no-store',signal:ctrl.signal})}finally{clearTimeout(timeout)}
  if(!response.ok)throw new Error('HTTP '+response.status);
  const payload=await response.json();
  const rows=Array.isArray(payload)?payload:payload?.items;
  if(!Array.isArray(rows))throw new Error('Format JSON invalide');
  news=rows.filter(n=>n&&typeof n.title==='string'&&n.title.trim()).slice(0,30).map(n=>({
   id:n.id,date:String(n.date||''),title:n.title.slice(0,160),
   desc:String(n.description??n.desc??'').slice(0,1600),
   image:newsImageUrl(n.image||''),
   expires:String(n.expires??n.dateExpiration??n.DateExpiration??'')
  })).sort((a,b)=>b.date.localeCompare(a.date));
  newsError=false;
  try{localStorage.setItem(NEWS_CACHE_KEY,JSON.stringify(news))}catch{}
 }catch(err){newsError=true;console.warn('Actualités indisponibles ; utilisation du cache.',err.message)}
 if(page==='home')render();
}
// V1.9 — cartes de buvettes distantes. Import explicite et cache hors ligne.
const CARD_URL_BC='';
const CARD_MAX_ITEMS=250;
const CARD_SYNC_INTERVAL=15*60*1000;
const cardSyncTimes={};
let importPreview=null;
function parseRemoteCard(data,url){
 if(!data||data.schema!==1||typeof data.id!=='string'||!/^[a-z0-9][a-z0-9-]{1,70}$/i.test(data.id)||typeof data.name!=='string'||!Array.isArray(data.items)||data.items.length>CARD_MAX_ITEMS)throw Error('Format de carte non reconnu');
 const seen=new Set();
 const entries=data.items.map((p,i)=>{
  if(!p||typeof p.name!=='string'||!p.name.trim()||typeof p.id!=='string'||seen.has(p.id))throw Error('Article invalide ou dupliqué');
  seen.add(p.id);
  return {id:p.id.slice(0,100),name:p.name.trim().slice(0,120),cat:String(p.category||'Autres').slice(0,55),subcat:String(p.subcategory||'').slice(0,55),emoji:String(p.emoji||'🥤').slice(0,10),price:Number.isFinite(Number(p.price))?Math.max(0,Number(p.price)):null,volume:String(p.volume||'').slice(0,20),available:p.available!==false,order:Number.isFinite(Number(p.order))?Number(p.order):i};
 }).filter(p=>p.available).sort((a,b)=>a.order-b.order);
 return {id:'remote:'+data.id,name:data.name.trim().slice(0,100),items:entries,remoteUrl:url,remoteVersion:String(data.version||''),lastSync:new Date().toISOString()};
}
function validCardUrl(raw){
 const u=new URL(String(raw||'').trim());
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.pathname.endsWith('.json'))throw Error('Ce QR code ne correspond pas à une carte Ma tournée publiée');
 u.search='';u.hash='';return u.href;
}
async function getRemoteCard(raw){
 const url=validCardUrl(raw);
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const response=await fetch(url+'?v='+Date.now(),{cache:'no-store',signal:ctrl.signal});
  if(!response.ok)throw Error('Carte inaccessible (HTTP '+response.status+')');
  const data=await response.json();return parseRemoteCard(data,url);
 }finally{clearTimeout(timer)}
}
async function previewCardFromUrl(raw){
 const value=raw||document.getElementById('card-url')?.value;
 if(!value){alert('Saisis ou scanne une adresse de carte.');return}
 try{importPreview=await getRemoteCard(value);modal='remote-preview';render()}
 catch(e){alert('Import impossible : '+e.message)}
}
function confirmRemoteImport(){
 if(!importPreview)return;
 const card=importPreview;const existing=cards.find(c=>c.id===card.id);
 if(existing&&qty()&&!confirm('Une commande est en cours. La carte sera mise à jour, mais la commande existante sera conservée. Continuer ?'))return;
 if(existing){Object.assign(existing,card)}else cards.push(card);
 active=card.id;cat='Tous';index=0;importPreview=null;modal=null;save();render();
 alert('Carte « '+card.name+' » enregistrée pour une utilisation hors ligne.');
}
async function scanCardQR(){
 const scanner=window.Capacitor?.Plugins?.CapacitorBarcodeScanner;
 if(!scanner||typeof scanner.scanBarcode!=='function'){
  alert('Scanner non disponible dans cette version. Installe la version iOS contenant le plugin de scan, ou colle le lien du QR code.');return;
 }
 try{
  // Paramètres explicites requis par certains décodeurs iOS lorsque
  // le plugin est appelé via window.Capacitor.Plugins.
  const result=await scanner.scanBarcode({
   hint:0, // QR_CODE
   scanInstructions:'Scannez le QR code de la buvette',
   scanButton:false,
   scanText:null,
   cameraDirection:1, // BACK
   scanOrientation:1 // PORTRAIT
  });
  if(result?.ScanResult)await previewCardFromUrl(result.ScanResult);
 }catch(err){if(!/cancel|annul/i.test(String(err?.message||'')))alert('Scan impossible : '+(err?.message||err))}
}
async function refreshRemoteCards(force=false){
 if(!navigator.onLine)return;
 const remote=cards.filter(c=>c.remoteUrl);
 for(const old of remote){
  if(!force&&Date.now()-(cardSyncTimes[old.id]||0)<CARD_SYNC_INTERVAL)continue;
  cardSyncTimes[old.id]=Date.now();
  try{
   const fresh=await getRemoteCard(old.remoteUrl);
   if(fresh.id!==old.id)continue;
   if(fresh.remoteVersion===old.remoteVersion&&JSON.stringify(fresh.items)===JSON.stringify(old.items))continue;
   // Ne jamais modifier le panier en cours : seules les données de la carte sont mises à jour.
   Object.assign(old,fresh);save();if(page==='settings'||page==='order')render();
  }catch(err){console.warn('Carte hors ligne conservée :',err.message)}
 }
}
function downloadBackup(){
 save();const data={schema:1,exportedAt:new Date().toISOString(),cards,active,history};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='bc-malone-ma-tournee-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
async function importBackup(input){
 const file=input.files?.[0];if(!file)return;
 try{
  const data=JSON.parse(await file.text());
  if(data.schema!==1||!Array.isArray(data.cards)||!data.cards.length||!Array.isArray(data.history)||!data.cards.every(c=>typeof c.id==='string'&&typeof c.name==='string'&&Array.isArray(c.items)&&c.items.every(p=>typeof p.name==='string'&&typeof p.id==='string'&&typeof p.cat==='string'&&typeof p.emoji==='string'))||data.history.some(h=>!Array.isArray(h.items)))throw Error('Sauvegarde incompatible');
  if(!confirm('Remplacer les cartes et l’historique actuels par cette sauvegarde ?'))return;
  cards=data.cards;active=cards.some(c=>c.id===data.active)?data.active:cards[0].id;history=data.history.slice(0,50);cart={};settingsPage=0;save();render();alert('Sauvegarde restaurée.');
 }catch(e){alert('Import impossible : '+e.message)}
}

const current=()=>cards.find(c=>c.id===active)||cards[0];
const products=()=>current().items;
function save(){localStorage.setItem('vr_bartender_mode_v1',JSON.stringify(bartenderMode));localStorage.setItem('vr_bar_orders_v1',JSON.stringify(barOrders));localStorage.setItem('vr_show_prices_v1',JSON.stringify(showPrices));localStorage.setItem('vr_cards_v2',JSON.stringify(cards));localStorage.setItem('vr_active_v2',JSON.stringify(active));localStorage.setItem('vr_history_v2',JSON.stringify(history));localStorage.setItem('vr_cart_draft_v1',JSON.stringify(cart))}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
// Options de carte et calculs de commandes (prix en euros, enregistrés à la sélection).
function formatMoney(value){return new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(value)}
function unitPrice(p){return p?.price===null||p?.price===undefined||p?.price===''?null:Number(p.price)}
function orderTotal(items){return items.reduce((sum,x)=>sum+(Number.isFinite(Number(x.price))&&x.price!==null?Math.round(Number(x.price)*100)*x.q:0),0)/100}
function hasUnpriced(items){return items.some(x=>x.price===null||x.price===undefined||!Number.isFinite(Number(x.price)))}
function togglePrices(checked){showPrices=checked;save();render()}
function toggleFavorite(id){const p=products().find(x=>x.id===id);if(!p)return;p.favorite=!p.favorite;save();render()}
function orderedProducts(arr){return [...arr].sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite))}
function groupedProducts(){
 const groups=new Map();
 for(const p of products()){const label=p.cat||'Autres';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(p)}
 return [...groups].sort((a,b)=>a[0].localeCompare(b[0],'fr')).map(([name,items])=>({name,items}));
}
function categoryPickerOptions(selected){
 const cats=[...new Set([...products().map(p=>p.cat||'Autres'),'Autres'])];
 if(selected&&!cats.includes(selected))cats.push(selected);
 return cats.sort((a,b)=>a.localeCompare(b,'fr')).map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('')+'<option value="__new__">＋ Nouvelle catégorie…</option>';
}
function onProductCategoryChange(v){const el=document.getElementById('newcat-wrap');if(el)el.hidden=v!=='__new__';if(v==='__new__')document.getElementById('newcat')?.focus()}
function pictogram(value){return Array.from(String(value||'🥤').trim()).slice(0,4).join('')||'🥤'}
function shareOrder(){
 const items=Object.values(cart);if(!items.length)return;
 const lines=['VB Renaissance – Ma tournée','Commande du '+new Date().toLocaleString('fr-BE'),'',...items.map(x=>`${x.q} × ${x.name}${showPrices&&x.price!=null?' — '+formatMoney(x.price*x.q):''}`)];
 if(showPrices){lines.push('',(hasUnpriced(items)?'Sous-total des articles tarifés : ':'TOTAL : ')+formatMoney(orderTotal(items)));if(hasUnpriced(items))lines.push('Prix manquant pour certains articles')}
 const message=lines.join('\n');
 if(navigator.share){navigator.share({title:'Ma tournée – Commande',text:message}).catch(e=>{if(e?.name!=='AbortError')copyOrder(message)})}
 else copyOrder(message);
}
function exportOrderCSV(){
 const items=Object.values(cart);
 if(!items.length)return;
 const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const rows=[['Produit','Quantité',...(showPrices?['Prix unitaire (€)','Montant (€)']:[])]];
 for(const x of items){
  rows.push([x.name,x.q,...(showPrices?[x.price==null?'':Number(x.price).toFixed(2),x.price==null?'':(Math.round(Number(x.price)*100)*x.q/100).toFixed(2)]:[])]);
 }
 if(showPrices){rows.push(['', '', '', '']);rows.push([hasUnpriced(items)?'SOUS-TOTAL':'TOTAL','', '',orderTotal(items).toFixed(2)]);}
 const csv='\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='ma-tournee-commande-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function copyOrder(message){try{await navigator.clipboard.writeText(message);alert('Commande copiée. Colle-la dans un mail ou un message.')}catch{prompt('Copie cette commande :',message)}}
function qty(){return Object.values(cart).reduce((a,v)=>a+v.q,0)}
function lookup(id){return Object.values(cart).find(x=>x.id===id)}
function navigate(p){page=p;modal=null;render();const el=document.getElementById('main');if(el){el.scrollTop=0;el.scrollLeft=0}}
function add(id){let p=products().find(p=>p.id===id);if(!p)return;let key=active+':'+id;if(!cart[key])cart[key]={id:key,name:p.name,q:0,price:unitPrice(p)};cart[key].q++;save();render()}
function change(key,n){if(!cart[key])return;cart[key].q=Math.max(0,cart[key].q+n);if(!cart[key].q)delete cart[key];save();render()}
function finish(){if(!qty())return;history.unshift({id:Date.now(),at:new Date().toLocaleString('fr-BE',{dateStyle:'short',timeStyle:'short'}),items:Object.values(cart).map(x=>({...x}))});history=history.slice(0,50);cart={};save();navigate('history')}
function repeat(id){let h=history.find(x=>x.id===id);if(!h)return;cart={};h.items.forEach((x,i)=>{cart['r'+i+':'+x.name]={id:'r'+i+':'+x.name,name:x.name,q:x.q,price:x.price??null}});save();navigate('summary')}
function removehistory(id){history=history.filter(x=>x.id!==id);save();render()}
function setCard(id){if(id===active)return;settingsPage=0;if(qty()&&!confirm('Changer de carte ? La commande en cours restera disponible mais mélange potentiellement deux cartes.'))return;active=id;cat='Tous';index=0;query='';save();render()}
function setCategory(v){cat=v;index=0;render()}
function setSearch(v){query=v;index=0;render();let e=document.getElementById('search');if(e){e.focus();e.setSelectionRange(v.length,v.length)}}
function setSort(v){sort=v;index=0;render()}
function setPage(n){index=n;render();document.querySelector('.main').scrollTop=0}
function addFree(){let name=document.getElementById('freename').value.trim(),q=Math.max(1,Math.min(99,Number(document.getElementById('freeqty').value)||1)),permanent=document.getElementById('makebase').checked;if(!name)return;if(permanent&&!products().some(p=>p.name.toLowerCase()===name.toLowerCase())){products().push({id:'p'+Date.now(),name,cat:document.getElementById('freecat').value||'Autres',emoji:'🥤'});save()}let key='free:'+name.toLowerCase();if(!cart[key])cart[key]={id:key,name,q:0};cart[key].q+=q;save();modal=null;render()}
function saveProduct(){
 const name=document.getElementById('pname').value.trim();if(!name)return alert('Saisis un nom de produit.');
 const picker=document.getElementById('pcat').value;
 const category=(picker==='__new__'?document.getElementById('newcat').value:picker).trim()||'Autres';
 const emoji=pictogram(document.getElementById('pemoji').value);
 const priceText=document.getElementById('pprice').value.trim().replace(',','.');
 const price=priceText===''?null:Number(priceText);
 if(price!==null&&(!Number.isFinite(price)||price<0||!/^\d+(?:\.\d{1,2})?$/.test(priceText)))return alert('Prix invalide : indique par exemple 2,50 ou laisse vide.');
 if(editId){const p=products().find(p=>p.id===editId);if(p)Object.assign(p,{name,cat:category,emoji,price});}
 else products().push({id:'p'+Date.now(),name,cat:category,emoji,price,favorite:false});
 save();modal=null;editId=null;render();
}
function editProduct(id){editId=id;modal='product';render()}
function removeProduct(id){if(!confirm('Supprimer cet article de cette carte ?'))return;current().items=current().items.filter(p=>p.id!==id);save();render()}
let settingsPage=0; const settingsPageSize=10000;
function setSettingsPage(n){settingsPage=Math.max(0,Math.min(n,Math.max(0,Math.ceil(products().length/settingsPageSize)-1)));render()}
function shiftProduct(id,d){
 const arr=products(),p=arr.find(x=>x.id===id);if(!p)return;
 const peers=arr.filter(x=>(x.cat||'Autres')===(p.cat||'Autres'));
 const i=peers.findIndex(x=>x.id===id),j=i+d;
 if(j<0||j>=peers.length)return;
 const a=arr.indexOf(p),b=arr.indexOf(peers[j]);[arr[a],arr[b]]=[arr[b],arr[a]];save();render();
}
function createCard(){let name=prompt('Nom de la nouvelle carte :','Carte événements');if(!name?.trim())return;let id='c'+Date.now();cards.push({id,name:name.trim(),items:[]});active=id;cat='Tous';save();render()}
function duplicateCard(){let name=prompt('Nom de la copie :',current().name+' (copie)');if(!name?.trim())return;let id='c'+Date.now();cards.push({id,name:name.trim(),items:products().map((p,i)=>({...p,id:id+'-'+i}))});active=id;save();render()}
function renameCard(){let n=prompt('Nouveau nom de la carte :',current().name);if(n?.trim()){current().name=n.trim();save();render()}}
function deleteCard(){if(cards.length<2){alert('Il faut conserver au moins une carte.');return}if(!confirm('Supprimer cette carte et tous ses articles ?'))return;cards=cards.filter(c=>c.id!==active);active=cards[0].id;save();render()}
function navButton(p,ic,t){return `<button class="${page===p||(p==='order'&&page==='summary')?'active':''}" onclick="navigate('${p}')"><span class="ico">${ic}</span>${t}</button>`}

// V1.11 — QR de commande autonome (aucun serveur). Les montants transmis sont informatifs.
// Une commande est validée localement par le barman : aucune facturation ni paiement automatique.
function makeOrderId(){
 const bytes=new Uint8Array(9);
 if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);
 else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function createOrderPayload(){
 const lines=Object.values(cart).filter(x=>x.q>0);
 if(!lines.length)throw Error('La commande est vide.');
 // Compact pour rester scannable, sans URL ni référence à un serveur.
 return {v:1,id:makeOrderId(),at:new Date().toISOString(),bar:current().name.slice(0,70),
  items:lines.map(x=>[String(x.name).slice(0,85),Math.min(999,Math.max(1,Math.round(x.q))),x.price==null?null:Math.round(Number(x.price)*100)]),
  prices:!!showPrices};
}
function encodeOrder(payload){return 'MT1:'+JSON.stringify(payload)}
function drawOrderQr(){
 const target=document.getElementById('order-qr-code');
 if(!target||!orderQrMessage)return;
 if(typeof window.BCMQrCode!=='function'){target.textContent='Générateur QR indisponible : réouvre la nouvelle version.';return}
 try{
  // QR Code version automatique, correction L et UTF-8.
  const qr=new window.BCMQrCode(0,1);
  qr.addData(unescape(encodeURIComponent(orderQrMessage)));
  qr.make();
  const n=qr.getModuleCount(), cells=[];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  target.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${n+8} ${n+8}" role="img" aria-label="QR code de commande" width="100%" height="100%"><rect x="-4" y="-4" width="${n+8}" height="${n+8}" fill="white"/><g fill="black">${cells.join('')}</g></svg>`;
 }catch(err){target.textContent='Commande trop longue pour un QR code. Réduis le nombre de lignes ou partage-la sous forme de texte.';console.warn(err)}
}
function presentOrderQr(){
 try{orderQrMessage=encodeOrder(createOrderPayload());modal='order-qr';render()}
 catch(e){alert(e.message)}
}
function toggleBartender(checked){
 bartenderMode=checked;activeBarOrderId=null;modal=null;page=checked?'bar':'settings';save();render();
}
function parseOrderQr(raw){
 if(typeof raw!=='string'||!raw.startsWith('MT1:')||raw.length>8500)throw Error('QR code de commande Ma tournée non reconnu');
 let data;try{data=JSON.parse(raw.slice(4))}catch{throw Error('QR code endommagé')}
 if(!data||data.v!==1||typeof data.id!=='string'||!/^[0-9a-f]{18}$/.test(data.id)||!Array.isArray(data.items)||data.items.length<1||data.items.length>100)throw Error('Format de commande invalide');
 if(typeof data.bar!=='string'||data.bar.length>70||typeof data.at!=='string'||!Number.isFinite(Date.parse(data.at)))throw Error('Informations de commande invalides');
 const items=data.items.map((p,i)=>{
  if(!Array.isArray(p)||typeof p[0]!=='string'||!p[0].trim()||p[0].length>85||!Number.isInteger(p[1])||p[1]<1||p[1]>999||!(p[2]===null||(Number.isSafeInteger(p[2])&&p[2]>=0&&p[2]<=100000000)))throw Error('Ligne de commande invalide');
  return {name:p[0],q:p[1],price:p[2]===null?null:p[2]/100,checked:false,key:i};
 });
 return {id:data.id,at:data.at,bar:data.bar,items,prices:data.prices===true,status:'new',receivedAt:new Date().toISOString()};
}
function receiveBarOrder(raw){
 let order;try{order=parseOrderQr(raw)}catch(e){alert('Scan impossible : '+e.message);return}
 const existing=barOrders.find(x=>x.id===order.id);
 if(existing){activeBarOrderId=existing.id;page='bar-detail';modal=null;render();alert('Cette commande a déjà été scannée sur cet appareil.');return}
 barOrders.unshift(order);barOrders=barOrders.slice(0,60);
 activeBarOrderId=order.id;page='bar-detail';modal=null;save();render();
}
async function scanBarOrder(){
 const scanner=window.Capacitor?.Plugins?.CapacitorBarcodeScanner;
 if(!scanner||typeof scanner.scanBarcode!=='function'){
  alert('Le scanner natif fonctionne dans l’application iPhone. Sur PC, utilise « Coller le code QR » pour tester.');return;
 }
 try{
  const result=await scanner.scanBarcode({hint:0,scanInstructions:'Scannez le QR code de commande du client',scanButton:false,scanText:null,cameraDirection:1,scanOrientation:1});
  if(result?.ScanResult)receiveBarOrder(result.ScanResult);
 }catch(e){if(!/cancel|annul/i.test(String(e?.message||'')))alert('Scan impossible : '+(e?.message||e))}
}
function importBarOrderText(){const raw=document.getElementById('bar-order-text')?.value.trim();if(raw)receiveBarOrder(raw)}
function toggleBarItem(index){
 const order=barOrders.find(o=>o.id===activeBarOrderId);if(!order||order.status==='done')return;
 const item=order.items[index];if(!item)return;item.checked=!item.checked;save();render();
}
function setBarOrderDone(){
 const order=barOrders.find(o=>o.id===activeBarOrderId);if(!order)return;
 if(order.status==='done'){if(!confirm('Réouvrir cette commande ?'))return;order.status='new';}
 else if(confirm('Marquer cette commande comme terminée ? Les cases à cocher ne sont pas obligatoires.')){order.status='done';order.finishedAt=new Date().toISOString()}
 save();render();
}
function deleteBarOrder(id){if(!confirm('Retirer cette commande de cet appareil ?'))return;barOrders=barOrders.filter(o=>o.id!==id);if(activeBarOrderId===id)activeBarOrderId=null;save();page='bar';render()}
function barTotal(order){return order.items.reduce((n,x)=>n+(x.price===null?0:Math.round(x.price*100)*x.q),0)/100}
function barQty(order){return order.items.reduce((n,x)=>n+x.q,0)}
function barOrderView(order){
 const count=order.items.filter(x=>x.checked).length;
 const priced=order.prices;
 const unknown=order.items.some(x=>x.price===null);
 return `<section class="bar-detail"><div class="bar-order-head"><h2>Commande · ${esc(order.bar)}</h2><span class="pill">${order.status==='done'?'Terminée':'À préparer'}</span></div><p class="muted">${esc(new Date(order.at).toLocaleString('fr-BE'))} · ${barQty(order)} article(s) · ${count}/${order.items.length} ligne(s) cochée(s)</p><p class="muted">Coche les lignes au fur et à mesure, ou termine directement sans cocher.</p>${order.items.map((x,i)=>`<label class="bar-check-row ${x.checked?'prepared':''}"><input type="checkbox" ${x.checked?'checked':''} ${order.status==='done'?'disabled':''} onchange="toggleBarItem(${i})"><span class="bar-check-name"><strong>${x.q} × ${esc(x.name)}</strong>${priced&&x.price!==null?`<small>${formatMoney(x.price*x.q)}</small>`:''}</span></label>`).join('')}${priced?`<div class="price-total"><strong>${unknown?'Sous-total':'TOTAL'}</strong><strong>${formatMoney(barTotal(order))}</strong></div>`:''}<button class="btn dark full" onclick="setBarOrderDone()">${order.status==='done'?'↻ Réouvrir la commande':'✓ Commande terminée'}</button><button class="btn ghost full" onclick="page='bar';activeBarOrderId=null;render()">← Toutes les commandes</button></section>`;
}

function render(){let html='',main=document.getElementById('main');
if(page==='home')html=`<section class="hero"><img src="${logo}" alt="Logo VB Renaissance"><h1>VB Renaissance – Ma tournée</h1><p>Une commande rapide, même sans réseau.</p><button class="btn dark full" onclick="navigate('order')">🥤 Prendre une commande</button></section><h2 class="h2">📰 Actualités du club</h2>${visibleNews().length?visibleNews().map(n=>`<article class="news"><time>${esc(newsDate(n.date))}</time><h3>${esc(n.title)}</h3>${n.image?`<img class="news-image" src="${esc(n.image)}" alt="" loading="lazy">`:''}<p>${esc(n.desc)}</p></article>`).join(''):'<div class="news-empty">Aucune actualité publiée pour le moment.</div>'}${newsError?'<div class="news-offline">Actualités hors ligne : dernière version enregistrée affichée.</div>':''}`;
if(page==='order'){
let all=orderedProducts(products().filter(p=>(cat==='Tous'||p.cat===cat)));let pages=Math.max(1,Math.ceil(all.length/perPage));index=Math.min(index,pages-1);let visible=all.slice(index*perPage,(index+1)*perPage);let cats=['Tous',...new Set(products().map(p=>p.cat))];
html=`<div class="order-heading"><strong>🥤 ${esc(current().name)}</strong><span>${products().length} articles · ${BCM_APP_VERSION}</span></div><div class="chips">${cats.map((c,i)=>`<button class="chip ${c===cat?'active':''}" onclick="setCategory(${i})" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="products">${visible.map(p=>{let n=cart[active+':'+p.id]?.q||0;return `<button class="product" onclick="add('${p.id}')"><span class="emoji">${esc(pictogram(p.emoji))}</span>${p.favorite?`<span class="fav-corner">★</span>`:''}${n?`<span class="count">${n}</span>`:''}<strong>${esc(p.name)}</strong><span class="menu-tag">${esc(p.cat)}</span>${showPrices&&unitPrice(p)!==null?`<span class="product-price">${formatMoney(unitPrice(p))}</span>`:''}</button>`}).join('')}<button class="product free-article" onclick="modal='free';render()"><span class="emoji">✏️</span><strong>Article libre</strong><span class="menu-tag">Personnalisé</span></button>${!visible.length?'<div class="empty-search">Aucun article dans cette catégorie.</div>':''}</div><div class="pager"><button onclick="setPage(${index-1})" ${index===0?'disabled':''}>← Précédent</button><span class="page-dots">Page ${index+1} / ${pages}</span><button onclick="setPage(${index+1})" ${index>=pages-1?'disabled':''}>Suivant →</button></div><div class="bottom-action"><button class="btn full dark" ${!qty()?'disabled':''} onclick="navigate('summary')">Voir la commande <span class="cart-count">${qty()}</span>${showPrices&&qty()?`<span class="cart-amount">${hasUnpriced(Object.values(cart))?"Sous-total : ":""}${formatMoney(orderTotal(Object.values(cart)))}</span>`:""}</button></div>`;
}
if(page==='summary')html=`<div class="summary-heading"><div><div class="summary-label">COMMANDE À PRÉPARER</div><div class="summary-hint">À montrer au comptoir</div></div><div class="summary-total"><strong>${qty()}</strong><span>ARTICLE${qty()>1?'S':''}</span></div></div>${Object.entries(cart).map(([key,x])=>`<div class="lineitem"><strong>${esc(x.name)}</strong>${showPrices&&x.price!=null?`<span class="line-price">${formatMoney(x.price*x.q)}</span>`:''}<div class="qty"><button onclick="change('${esc(key)}',-1)">−</button><span>${x.q}</span><button onclick="change('${esc(key)}',1)">+</button></div></div>`).join('')}${!qty()?'<div class="empty">Commande vide</div>':''}${showPrices&&qty()?`<div class="price-total"><strong>${hasUnpriced(Object.values(cart))?'Sous-total':'TOTAL'}</strong><strong>${formatMoney(orderTotal(Object.values(cart)))}</strong></div>${hasUnpriced(Object.values(cart))?'<p class="muted">Certains articles n’ont pas de prix.</p>':''}`:''}<button class="btn full" onclick="navigate('order')">＋ Ajouter des articles</button><div style="height:12px"></div><button class="btn dark full" ${!qty()?'disabled':''} onclick="finish()">✓ Terminer et enregistrer</button><div style="height:12px"></div><button class="btn full outline" ${!qty()?'disabled':''} onclick="presentOrderQr()">▦ Afficher le QR code pour le barman</button><div style="height:12px"></div><button class="btn full outline" ${!qty()?'disabled':''} onclick="shareOrder()">↗ Partager la commande</button><div style="height:12px"></div><button class="btn full outline" ${!qty()?'disabled':''} onclick="exportOrderCSV()">⬇ Exporter la commande (CSV)</button><div style="height:12px"></div><button class="btn ghost full" onclick="if(confirm('Effacer la commande en cours ?')){cart={};save();navigate('order')}">Effacer la commande</button>`;
if(page==='history')html=`<div class="banner"><h2>🕘 Historique</h2><p>Retrouve et répète une commande précédente</p></div><p class="muted">50 dernières commandes conservées sur ce navigateur.</p>${history.length?history.map(h=>`<div class="listcard"><div class="row"><h3>${esc(h.at)}</h3><span class="pill">${h.items.reduce((s,x)=>s+x.q,0)} articles</span></div><p class="muted">${h.items.map(x=>`${x.q}× ${esc(x.name)}`).join(' · ')}</p><div class="row"><button class="btn dark" onclick="repeat(${h.id})">↻ Reprendre</button><button class="btn ghost" onclick="removehistory(${h.id})">Supprimer</button></div></div>`).join(''):'<div class="empty">Aucune commande pour le moment.</div>'}`;
if(page==='settings')html=`<div class="bartender-toggle"><div><strong>🍹 Mode Barman</strong><p>Scanner et préparer les commandes des clients</p></div><label class="bar-switch"><input type="checkbox" ${bartenderMode?'checked':''} onchange="toggleBartender(this.checked)"><span>Activer</span></label></div><div class="remote-tools"><h3>📷 Cartes de buvettes</h3><p>Scanne le QR code d’une buvette ou colle son adresse. La carte restera disponible hors ligne.</p><button class="btn dark full" onclick="scanCardQR()">▣ Scanner un QR code</button><label for="card-url">Ou coller le lien de la carte</label><input id="card-url" class="input" type="url" value="${CARD_URL_BC}" placeholder="https://…/cartes/nom.json"><button class="btn full" onclick="previewCardFromUrl()">Prévisualiser la carte</button><button class="btn ghost full" onclick="refreshRemoteCards(true)">↻ Actualiser les cartes importées</button></div><div class="banner"><h2>⚙️ Mes cartes</h2><p>Plusieurs listes de boissons sur le même iPhone</p></div><div class="menuinfo"><label style="display:block;font-weight:800;margin-bottom:7px">Carte à configurer</label><select class="select" onchange="setCard(this.value)">${cards.map(c=>`<option value="${esc(c.id)}" ${c.id===active?'selected':''}>${esc(c.name)}</option>`).join('')}</select><div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="smallbtn" onclick="createCard()">＋ Nouvelle</button><button class="smallbtn" onclick="duplicateCard()">⧉ Dupliquer</button><button class="smallbtn" onclick="renameCard()">✎ Renommer</button><button class="smallbtn" onclick="deleteCard()">🗑</button></div></div><div class="price-preference"><label class="switch-line"><input type="checkbox" ${showPrices?'checked':''} onchange="togglePrices(this.checked)"> Afficher les prix et le total (€)</label><p class="muted">Cette option s'applique à l'affichage des commandes. Les prix restent enregistrés dans les cartes.</p></div><div class="row"><h3>${esc(current().name)}</h3><span class="pill">${products().length} article(s)</span></div><p class="muted">★ Marque tes favoris : ils apparaissent en premier sur l'écran de commande, sans modifier le classement par catégorie ci-dessous.</p>${groupedProducts().map(group=>`<section class="category-group"><h3>${esc(group.name)} <span class="pill">${group.items.length}</span></h3>${group.items.map((p,i)=>`<div class="settingsrow row"><span class="settings-product-name"><span>${esc(pictogram(p.emoji))} <strong>${esc(p.name)}</strong></span><span class="muted">${showPrices&&unitPrice(p)!==null?formatMoney(unitPrice(p)):''}</span></span><div class="settings-actions"><button class="favorite-toggle ${p.favorite?'is-favorite':''}" title="${p.favorite?'Retirer des favoris':'Ajouter aux favoris'}" aria-label="Favori ${esc(p.name)}" onclick="toggleFavorite('${esc(p.id)}')">${p.favorite?'★':'☆'}</button><button onclick="shiftProduct('${esc(p.id)}',-1)" ${i===0?'disabled':''} title="Monter dans la catégorie">↑</button><button onclick="shiftProduct('${esc(p.id)}',1)" ${i===group.items.length-1?'disabled':''} title="Descendre dans la catégorie">↓</button><button onclick="editProduct('${esc(p.id)}')" title="Modifier">✎</button><button onclick="removeProduct('${esc(p.id)}')" title="Supprimer">✕</button></div></div>`).join('')}</section>`).join('')}<button class="btn full" onclick="editId=null;modal='product';render()">＋ Ajouter un article</button><div class="menuinfo"><h3>💾 Sauvegardes</h3><p class="muted">Exporte tes cartes et tes 50 dernières commandes pour conserver une copie, puis réimporte-la sur ce téléphone si nécessaire.</p><button class="btn full" onclick="downloadBackup()">⬇ Exporter mes données</button><input type="file" accept=".json,application/json" aria-label="Importer une sauvegarde" onchange="importBackup(this)" style="width:100%;margin-top:12px"></div>`;
if(page==='bar')html=`<div class="bar-home"><div class="bar-title"><h2>🍹 Mode Barman</h2><span class="pill">${barOrders.filter(o=>o.status!=='done').length} en cours</span></div><p class="muted">Scanne le QR code affiché sur l'iPhone du client. Les commandes sont conservées sur cet appareil.</p><button class="btn dark full" onclick="scanBarOrder()">▣ Scanner un QR de commande</button><details class="bar-manual"><summary>Tester en collant un code QR (PC)</summary><textarea id="bar-order-text" class="input" rows="3" placeholder="MT1:…"></textarea><button class="btn full" onclick="importBarOrderText()">Importer le code</button></details><h3>Commandes reçues</h3>${barOrders.length?barOrders.map(o=>`<div class="bar-order-card"><button class="bar-order-open" onclick="activeBarOrderId='${esc(o.id)}';page='bar-detail';render()"><strong>${esc(o.bar)}</strong><span>${esc(new Date(o.at).toLocaleString('fr-BE'))} · ${barQty(o)} article(s)</span><span>${o.status==='done'?'✓ Terminée':'À préparer'}</span></button><button class="bar-delete" onclick="deleteBarOrder('${esc(o.id)}')" title="Supprimer">✕</button></div>`).join(''):'<div class="empty">Aucune commande scannée.</div>'}</div>`;
if(page==='bar-detail'){const currentOrder=barOrders.find(o=>o.id===activeBarOrderId);html=currentOrder?barOrderView(currentOrder):`<div class="empty">Commande introuvable.</div><button class="btn full" onclick="navigate('bar')">Retour</button>`}
main.innerHTML=html;
if(page==='order')document.querySelectorAll('[data-cat]').forEach((b,i)=>b.onclick=()=>setCategory(b.dataset.cat));
document.getElementById('nav').innerHTML=bartenderMode?[navButton('bar','▣','Barman'),navButton('settings','⚙','Paramètres')].join(''):[navButton('home','⌂','Accueil'),navButton('order','▦','Commande'),navButton('history','↻','Historique'),navButton('settings','⚙','Paramètres')].join('');
let m='';if(modal==='free')m=`<div class="modalback"><div class="modal"><h2>✏️ Article libre</h2><div class="field"><label>Nom de l’article</label><input class="input" id="freename" placeholder="Ex. Sandwich, boisson spéciale…"></div><div class="field"><label>Quantité</label><input class="input" id="freeqty" type="number" min="1" max="99" value="1"></div><label class="switch-line"><input type="checkbox" id="makebase" onchange="document.getElementById('freecategory').style.display=this.checked?'block':'none'"> Ajouter aussi comme article de base à la carte active</label><div id="freecategory" style="display:none"><label>Catégorie de l’article</label><select class="select" id="freecat">${[...new Set([...products().map(p=>p.cat),'Autres'])].map(c=>`<option>${esc(c)}</option>`).join('')}</select><div style="height:12px"></div></div><button class="btn full dark" onclick="addFree()">Ajouter à la commande</button><button class="btn full ghost" onclick="modal=null;render()">Annuler</button></div></div>`;
if(modal==='product'){
 let p=products().find(p=>p.id===editId);
 m=`<div class="modalback"><div class="modal"><h2>${p?'Modifier':'Ajouter'} un article</h2><label>Nom</label><input class="input" id="pname" value="${p?esc(p.name):''}" placeholder="Ex. Limonade" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off"><label>Catégorie</label><select class="select" id="pcat" onchange="onProductCategoryChange(this.value)">${categoryPickerOptions(p?.cat||'Autres')}</select><div id="newcat-wrap" hidden><label>Nouvelle catégorie</label><input id="newcat" class="input" maxlength="55" placeholder="Ex. Cocktails" spellcheck="false"></div><label>Emoji ou texte court (4 lettres max)</label><input class="input" id="pemoji" value="${p?esc(pictogram(p.emoji)):'🥤'}" maxlength="8" placeholder="Ex. 🍺 ou IPA"><label>Prix (€), facultatif</label><input class="input" id="pprice" type="text" inputmode="decimal" value="${p?.price!=null?esc(String(p.price).replace('.',',')):''}" placeholder="Ex. 2,50"><button class="btn full dark" onclick="saveProduct()">Enregistrer</button><button class="btn full ghost" onclick="modal=null;render()">Annuler</button></div></div>`
}
if(modal==='order-qr')m=`<div class="modalback"><div class="modal qr-modal"><h2>▦ QR code de commande</h2><p>Présente ce code au barman. Il peut le scanner sans connexion Internet.</p><div id="order-qr-code" class="qr-code-container"></div><p class="muted">Ne termine pas la commande avant que le barman ait scanné le code.</p><button class="btn full ghost" onclick="copyOrder(orderQrMessage)">Copier le code (test PC)</button><button class="btn full dark" onclick="modal=null;render()">Fermer</button></div></div>`;
if(modal==='remote-preview'&&importPreview){const preview=importPreview;const prev=cards.some(c=>c.id===preview.id);m=`<div class="modalback"><div class="modal remote-modal"><h2>📋 ${esc(preview.name)}</h2><p class="muted">${preview.items.length} articles disponibles · ${new Set(preview.items.map(p=>p.cat)).size} catégories</p><p>Exemples : ${preview.items.slice(0,5).map(p=>esc(p.name)).join(' · ')}</p><p class="muted">${prev?'Cette carte existe déjà sur ton téléphone. Elle sera actualisée.':'La carte sera enregistrée sur ton téléphone pour être utilisée hors connexion.'}</p><button class="btn dark full" onclick="confirmRemoteImport()">✓ ${prev?'Mettre à jour':'Importer'} cette carte</button><button class="btn ghost full" onclick="modal=null;importPreview=null;render()">Annuler</button></div></div>`}
 document.getElementById('modalroot').innerHTML=m;
if(modal==='order-qr')requestAnimationFrame(drawOrderQr);
if(page==='order')requestAnimationFrame(adaptOrderPagination);
}
// V1.9.0 — Pagination ajustée d'après l'espace RÉELLEMENT disponible.
// Ne retranche pas une deuxième fois les marges et hauteurs déjà incluses
// dans la position du bouton « Voir la commande ».
// Trois colonnes : on réserve une cellule à « Article libre ».
function adaptOrderPagination(){
 if(page!=='order'||modal||index!==0)return;
 const main=document.getElementById('main');
 const grid=main?.querySelector('.products');
 const action=main?.querySelector('.bottom-action');
 const first=grid?.querySelector('.product');
 if(!main||!grid||!action||!first)return;
 const gs=getComputedStyle(grid);
 const gap=parseFloat(gs.rowGap)||7;
 const rowHeight=Math.max(82,first.getBoundingClientRect().height);
 const rowSpace=rowHeight+gap;
 const availableBottom=main.getBoundingClientRect().bottom-(parseFloat(getComputedStyle(main).paddingBottom)||0)-8;
 const usedBottom=action.getBoundingClientRect().bottom;
 const remaining=availableBottom-usedBottom;
 const count=products().filter(p=>cat==='Tous'||p.cat===cat).length;
 let next=perPage;
 // Si le bouton de commande déborde, retirer une rangée de 3 produits.
 if(remaining < -4 && perPage>2){
   next=Math.max(2,perPage-3);
 // Sinon, ajouter une rangée seulement si des produits restent cachés
 // et qu'une rangée entière tient dans l'espace actuellement inoccupé.
 }else if(count>perPage && remaining>=rowSpace+10){
   next=Math.min(47,perPage+3);
 }
 if(next!==perPage){
   perPage=next;
   render();
 }
}
window.addEventListener('resize',()=>{
 if(page==='order')requestAnimationFrame(adaptOrderPagination);
});
render();
refreshNews();
window.addEventListener('online',()=>{refreshNews();refreshRemoteCards()});
window.addEventListener('focus',()=>refreshRemoteCards());
setTimeout(()=>refreshRemoteCards(),600);
