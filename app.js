// Vul hier je eigen openbare Supabase projectgegevens in.
const SUPABASE_URL = 'https://onjywbcpmwbtjhlhhvab.supabase.co';
const KEY = 'sb_publishable_6W0JF-VlCccFDop2vVUq8A_y8ax-VgN';
const $ = id => document.getElementById(id);
let db, user, rows = [], busy = false, page = 30;
const status = message => $('status').textContent = message;
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function render(){
 const now = new Date(), start = new Date(now.getFullYear(),now.getMonth(),now.getDate());
 start.setDate(start.getDate()-(start.getDay()+6)%7);
 const counts = new Map();
 for(const r of rows){const k=dayKey(new Date(r.created_at));counts.set(k,(counts.get(k)||0)+1);}
 $('today').textContent=counts.get(dayKey(now))||0;
 $('week').textContent=rows.filter(r=>new Date(r.created_at)>=start).length;
 $('total').textContent=rows.length;
 $('record').textContent='Dagrecord: '+Math.max(0,...counts.values())+' fatbikes';
 const days=Array.from({length:7},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-6+i);return {label:d.toLocaleDateString('nl-NL',{weekday:'short'}),n:counts.get(dayKey(d))||0};});
 const max=Math.max(1,...days.map(d=>d.n));$('chart').replaceChildren();
 for(const d of days){const col=document.createElement('div');col.className='day';const n=document.createElement('span');n.textContent=d.n;const bar=document.createElement('div');bar.className='bar';bar.style.height=`${d.n/max*100}px`;const label=document.createElement('span');label.textContent=d.label;col.append(n,bar,label);$('chart').append(col);}
 $('entries').replaceChildren();for(const r of rows.slice(0,page)){const li=document.createElement('li');li.textContent='🚲 '+new Date(r.created_at).toLocaleString('nl-NL');$('entries').append(li);}
 if(!rows.length){const li=document.createElement('li');li.textContent='Nog geen registraties.';$('entries').append(li);}
 $('more').hidden=rows.length<=page;$('undo').disabled=busy||!rows.length;$('add').disabled=busy;
}
async function load(){const result=[];for(let offset=0;;offset+=500){const {data,error}=await db.from('sightings').select('id,created_at').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)break;}rows=result;render();}
async function refresh(){try{await load();status('');}catch(e){status('Laden mislukt: '+e.message);}}
async function show(){const {data,error}=await db.auth.getUser();user=error?null:data.user;$('login').hidden=!!user;$('dashboard').hidden=!user;$('logout').hidden=!user;rows=[];if(user){busy=true;render();await refresh();busy=false;render();}}
async function mutate(remove){if(busy||!user)return;busy=true;render();try{const res=remove?await db.from('sightings').delete().eq('id',rows[0].id):await db.from('sightings').insert({user_id:user.id});if(res.error)throw res.error;await refresh();}catch(e){status('Opslaan mislukt: '+e.message);}finally{busy=false;render();}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;const button=e.target.querySelector('button');button.disabled=true;try{const {error}=await db.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)throw error;$('password').value='';await show();}catch(e){status('Inloggen mislukt: '+e.message);}finally{button.disabled=false;}});
$('logout').onclick=async()=>{if(busy)return;const {error}=await db.auth.signOut();if(error){status(error.message);return;}await show();status('');};
$('add').onclick=()=>mutate(false);$('undo').onclick=()=>{if(rows.length&&confirm('Laatste registratie verwijderen?'))mutate(true);};$('more').onclick=()=>{page+=30;render();};
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>{const t=button.dataset.tab;$('home').hidden=t!=='home';$('stats').hidden=t==='history';$('history').hidden=t!=='history';document.querySelector('.tiles').hidden=t==='history';for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b===button);};
if(KEY.startsWith('JOUW')||!window.supabase){status('Configureer eerst Supabase in app.js (zie README).');$('loginForm').querySelector('button').disabled=true;}else{db=window.supabase.createClient(SUPABASE_URL,KEY);show().catch(e=>status(e.message));window.addEventListener('focus',()=>{if(user&&!busy)refresh();});}
