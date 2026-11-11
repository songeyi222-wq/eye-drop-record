 'use strict';
const VERSION='2.2';
const KEY='eyedrop-record-pwa-v06',OLD='eyedrop-record-pwa-v05'; // 기존 기록 유지
const DEFAULT={eyes:{left:{start:'2026-11-07',visit:'2026-11-10T08:00',enabled:true,completed:false,completedAt:'2026-11-10T10:00',restart:'12:00',hourlyUntil:'18:00'},right:{start:'2026-11-07',visit:'2026-11-11T11:00',enabled:true,completed:false,completedAt:'2026-11-11T13:00',restart:'15:00',hourlyUntil:'18:00'}},sessions:'07:00,12:00,17:00,21:00',dLeadHours:1,gap:10,drugSessions:{A:[0,1,2,3],B:[0,1,2,3],C:[0,3]},dry:{start:'2026-10-14',endDates:{left:'2026-11-11',right:'2026-11-11'},times:['07:30','10:00','12:30','15:00','17:30','20:00'],gap:10,enabled:true},done:{},catalog:null,revisions:[],scheduleSchema:0};
const clone=x=>JSON.parse(JSON.stringify(x)),pad=n=>String(n).padStart(2,'0'),dayOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let state=clone(DEFAULT);try{const s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD)||'null');if(s&&s.eyes)state={...state,eyes:{left:{...DEFAULT.eyes.left,...s.eyes.left},right:{...DEFAULT.eyes.right,...s.eyes.right}},done:s.done||{},drugSessions:{...DEFAULT.drugSessions,...s.drugSessions},sessions:s.sessions||DEFAULT.sessions,dLeadHours:[1,2,3].includes(Number(s.dLeadHours))?Number(s.dLeadHours):1,gap:Number.isInteger(Number(s.gap??s.dry?.gap))&&Number(s.gap??s.dry?.gap)>=5&&Number(s.gap??s.dry?.gap)<=10?Number(s.gap??s.dry?.gap):10,dry:{...DEFAULT.dry,...s.dry,endDates:{...DEFAULT.dry.endDates,...(s.dry?.endDates||{})}},catalog:s.catalog||null,revisions:s.revisions||[],scheduleSchema:Number(s.scheduleSchema||0)};}catch{}
if(state.sessions==='07:00,12:00,15:00,21:00')state.sessions='07:00,12:00,17:00,21:00';
// v0.9부터 기본 오후 시간을 17:00로 변경합니다. 이전 버전 기록도 유지합니다.
const CATALOG_IDS=['A','B','C','D','E'];
const catalogDefaults=()=>[
 {id:'A',name:'옵살로신',enabled:true,eyes:{left:{enabled:true,times:[]},right:{enabled:true,times:[]}}},
 {id:'B',name:'프레드벨',enabled:true,eyes:{left:{enabled:true,times:[]},right:{enabled:true,times:[]}}},
 {id:'C',name:'브로낙',enabled:true,eyes:{left:{enabled:true,times:[]},right:{enabled:true,times:[]}}},
 {id:'D',name:'미드린피',enabled:true,eyes:{left:{enabled:true,times:[]},right:{enabled:true,times:[]}}},
 {id:'E',name:'디쿠아스에스',enabled:true,eyes:{left:{enabled:true,times:[]},right:{enabled:true,times:[]}}}
];
const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function normalizeCatalog(list){
 const source=Array.isArray(list)?list:catalogDefaults();
 const ids=new Set();
 return source.filter(x=>x&&typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,90}$/.test(x.id)&&!ids.has(x.id)&&ids.add(x.id)).slice(0,40).map(x=>({
  id:x.id,name:String(x.name||x.id).slice(0,50),enabled:x.enabled!==false,
  eyes:Object.fromEntries(['left','right'].map(eye=>[eye,{
   enabled:x.eyes?.[eye]?.enabled!==false,
   times:Array.isArray(x.eyes?.[eye]?.times)?[...new Set(x.eyes[eye].times.filter(validTime))].slice(0,24).sort():[]
  }]))
 }));
}
// 구버전 설정과 기록을 유지합니다. 새 처방은 수술 전후 계산과 분리하고 수정 시점부터 적용합니다.
const legacyState=clone(state);
state.revisions=Array.isArray(state.revisions)?state.revisions:[];
function priorSchedule(day,conf){return legacyDoses(day,conf);}
function migrateToUniformCatalog(conf,day){
 const oldList=Array.isArray(conf.catalog)?conf.catalog:[];
 const oldMap=Object.fromEntries(oldList.map(x=>[x.id,x]));
 const base=catalogDefaults();
 for(const baseMed of base){
  const old=oldMap[baseMed.id];if(old){baseMed.name=old.name||baseMed.name;baseMed.enabled=old.enabled!==false;}
  for(const eye of ['left','right']){
   const oldEye=old?.eyes?.[eye];baseMed.eyes[eye].enabled=oldEye?.enabled!==false;
   if(Array.isArray(oldEye?.times))baseMed.eyes[eye].times=[...oldEye.times];
   else if(baseMed.id==='E')baseMed.eyes[eye].times=conf.dry?.enabled!==false?[...(conf.dry?.times||[])]:[];
   else{
    const rows=priorSchedule(day,conf).filter(d=>d.drug===baseMed.id&&d.eyes.includes(eye));
    baseMed.eyes[eye].times=[...new Set(rows.map(x=>x.time))].sort();
    if(!baseMed.eyes[eye].times.length&&['A','B','C'].includes(baseMed.id)){
     const slots=String(conf.sessions||'07:00,12:00,17:00,21:00').split(',');
     const gap=Number(conf.gap||10),indices=baseMed.id==='C'?[0,3]:[0,1,2,3],offset=baseMed.id==='A'?0:baseMed.id==='B'?gap:2*gap;
     baseMed.eyes[eye].times=indices.map(i=>slots[i]).filter(validTime).map(t=>{const m=Number(t.slice(0,2))*60+Number(t.slice(3))+offset;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}).filter(validTime);
    }
   }
  }
 }
 for(const old of oldList){if(!CATALOG_IDS.includes(old.id))base.push(old);}
 return normalizeCatalog(base);
}
function migrateState(){
 if(state.scheduleSchema===21){state.catalog=normalizeCatalog(state.catalog);return;}
 const oldConfig=clone(state);const moment=new Date();const today=dayOf(moment);
 const inherited=state.revisions.length?state.revisions:[];
 // Older snapshots retain the legacy schedule algorithm and historic check identities.
 if(!inherited.length)inherited.push({at:'0000-01-01T00:00:00',settings:oldConfig});
 state.catalog=migrateToUniformCatalog(oldConfig,today);
 state.scheduleSchema=21;
 state.eyes.left.completed=!!state.eyes.left.completed;
 state.eyes.right.completed=!!state.eyes.right.completed;
 // Converting an older version never retroactively rewrites today's earlier doses.
 state.revisions=inherited;
 state.revisions.push({at:stampLocal(),settings:configSnapshot()});
}
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));save();
const configSnapshot=()=>{const {done,revisions,...settings}=clone(state);return settings;};
// Migration runs only after date/snapshot helpers are initialized.

const stampLocal=()=>{const d=new Date();return dayOf(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
// Each revision has a local wall-clock effective instant. Old schedule snapshots remain immutable.
function recordRevision(oldConfig){
 const at=stampLocal();
 if(!state.revisions.length)state.revisions.push({at:'0000-01-01T00:00:00',settings:clone(oldConfig)});
 const previous=state.revisions[state.revisions.length-1];
 if(previous.at===at)previous.settings=configSnapshot();
 else state.revisions.push({at,settings:configSnapshot()});
}

function convertOldCloudSettings(value){
 if(Number(value.scheduleSchema||0)===21)return value;
 const old=clone(value);
 const draft={...clone(DEFAULT),...old,eyes:{left:{...DEFAULT.eyes.left,...(old.eyes?.left||{})},right:{...DEFAULT.eyes.right,...(old.eyes?.right||{})}},dry:{...DEFAULT.dry,...(old.dry||{})}};
 draft.catalog=migrateToUniformCatalog(draft,dayOf(new Date()));
 draft.scheduleSchema=21;
 draft.revisions=Array.isArray(old.revisions)?clone(old.revisions):[];
 if(!draft.revisions.length){const historic=clone(old);delete historic.done;draft.revisions.push({at:'0000-01-01T00:00:00',settings:historic});}
 const current=clone(draft);delete current.done;delete current.revisions;
 draft.revisions.push({at:stampLocal(),settings:current});
 return draft;
}
const syncSettings=()=>{const {done,...settings}=clone(state);return settings;};
window.eyeBridge={
 getSettings:syncSettings,
 getDone:()=>clone(state.done),
 exportBackup:()=>clone(state),
 applySettings(value){if(!value||!value.eyes)return;const needsMigration=Number(value.scheduleSchema||0)!==21;if(needsMigration)value=convertOldCloudSettings(value);if(JSON.stringify(value)===JSON.stringify(syncSettings()))return;state={...state,...value,eyes:{left:{...DEFAULT.eyes.left,...state.eyes.left,...(value.eyes.left||{})},right:{...DEFAULT.eyes.right,...state.eyes.right,...(value.eyes.right||{})}},dry:{...DEFAULT.dry,...state.dry,...(value.dry||{}),endDates:{...DEFAULT.dry.endDates,...state.dry?.endDates,...value.dry?.endDates}},done:state.done,catalog:normalizeCatalog(value.catalog||state.catalog),revisions:Array.isArray(value.revisions)?value.revisions:state.revisions,scheduleSchema:Number(value.scheduleSchema||state.scheduleSchema||0)};editorCatalog=null;save();if(tab!=='settings')render();else {const note=document.getElementById('draft-notice');if(note)note.textContent='클라우드 설정이 갱신되었습니다. 편집 중인 입력값은 유지되며 저장 시 현재 입력값이 적용됩니다.';}},
 applyDone(value,replace=false){const next=replace?{...value}:{...state.done,...value};if(JSON.stringify(next)===JSON.stringify(state.done))return;state.done=next;save();if(tab!=='settings')render();},
 setRole(role){window.eyeCloudRole=role;render();},
 setStatus(text){window.eyeCloudStatus=text;const el=document.getElementById('cloud-summary');if(el)el.textContent=text;}
};
window.eyeCloudRole=localStorage.getItem('eyedrop-cloud-role')||'local';window.eyeCloudStatus='클라우드 연결 전';
let selected=dayOf(new Date()),tab='today';
const drugNames={A:'A 옵살로신',B:'B 프레드벨',C:'C 브로낙',D:'D 미드린피',E:'디쿠아스에스 (건조증 치료제)'};
const drugLabel=d=>d.name||drugNames[d.drug]||d.drug;
const eyeNames={left:'왼쪽 눈',right:'오른쪽 눈'},colors={A:'#eaf0ff',B:'#f1ebff',C:'#fff0e6',D:'#e3f5f0',E:'#fff7d6'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const timeOf=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
migrateState();save();
function completedMoment(eye,conf=state){const c=conf.eyes[eye];return c.completed&&c.completedAt?c.completedAt:null;}
function activeEye(day,eye,time,conf=state){
 const c=conf.eyes[eye];if(!c.enabled||day<c.start)return false;
 const when=day+'T'+time,completed=completedMoment(eye,conf);
 if(completed&&when>=completed)return false;
 if(day>c.visit.slice(0,10))return false;
 return day!==c.visit.slice(0,10)||time<c.visit.slice(11,16);
}
function addDose(out,drug,n,eye,slot,kind){
 if(n<0||n>=1440)return;
 const time=timeOf(n);
 // 표시 행은 안약+시각으로 합치되, 눈별 기록 식별자는 각자 보존합니다.
 let dose=out.find(d=>d.drug===drug&&d.time===time);
 if(!dose){dose={drug,time,eyes:[],slot,eyeSlots:{},color:colors[drug],kind};out.push(dose);}
 if(!dose.eyes.includes(eye))dose.eyes.push(eye);
 dose.eyeSlots[eye]=slot;
}
function legacyDoses(day,conf=state){
 const out=[],slots=conf.sessions.split(','),eyes=Object.keys(eyeNames),gap=conf.gap;
 // 병원 내원일: 수술 전 A/B/C가 D 시간대와 겹치면 두 눈의 아침 회차를 맞춥니다.
 let sharedMorning=minutes(slots[0]);
 for(const eye of eyes){
  const c=conf.eyes[eye];if(!c.enabled||day!==c.visit.slice(0,10)||day<c.start)continue;
  const visit=minutes(c.visit.slice(11,16)),dStart=Math.max(0,visit-60),dEnd=Math.min(1439,visit+180);
  const morning=['A','B','C'].filter(drug=>conf.drugSessions[drug].includes(0)).map(drug=>minutes(slots[0])+({A:0,B:gap,C:2*gap}[drug]));
  if(morning.some(n=>n>=dStart&&n<=dEnd))sharedMorning=Math.min(sharedMorning,Math.max(0,dStart-30));
 }
 for(const eye of eyes){
  const c=conf.eyes[eye];if(!c.enabled)continue;
  const surgDay=c.visit.slice(0,10),surgery=day===surgDay,completed=completedMoment(eye,conf);
  const postDay=completed?.slice(0,10),postActive=!!completed&&day>=postDay;
  // 수술 전 A/B/C: 완료 전까지 기존 규칙 유지.
  if(day>=c.start && day<=surgDay){
   for(let i=0;i<slots.length;i++){
    if(surgery&&i!==0)continue;
    for(const [drug,offset] of [['A',0],['B',gap],['C',2*gap]]){
     if(!conf.drugSessions[drug].includes(i))continue;
     const n=(i===0?sharedMorning:minutes(slots[i]))+offset,time=timeOf(n);
     if(n<0||n>=1440||!activeEye(day,eye,time,conf))continue;
     addDose(out,drug,n,eye,i,surgery?'surgery':'normal');
    }
   }
  }
  if(surgery){
   const visit=minutes(c.visit.slice(11,16)),dStart=Math.max(0,visit-60),dEnd=Math.min(1439,visit+180);
   for(let n=dStart;n<=dEnd;n+=30){
    // 완료 체크된 눈은 완료 시각 이후 D를 더 이상 표시하지 않습니다.
    if(completed&&day+'T'+timeOf(n)>=completed)continue;
    addDose(out,'D',n,eye,n,'surgery');
   }
  }
  if(postActive){
   // 수술 당일 첫 점안 재개 시각부터, 전환 시각까지 1시간 간격.
   // 전환 시각이 지난 후에는 마지막 점안 기준 2시간 간격.
   // 다음 날부터는 A 아침 시각에서 취침 시각까지 2시간 간격.
   const isFirst=day===postDay;
   let starts=[];
   if(isFirst){
    const restart=minutes(c.restart),cutoff=minutes(c.hourlyUntil);
    if(Number.isFinite(restart)){
     let last=-1;
     for(let n=restart;n<=Math.min(cutoff,1439);n+=60){starts.push(n);last=n;}
     if(last<0){last=restart;starts.push(restart);}
     for(let n=last+120;n<=minutes(slots[3]);n+=120)starts.push(n);
    }
   }else{
    for(let n=minutes(slots[0]);n<=minutes(slots[3]);n+=120)starts.push(n);
   }
   for(const n of starts){
    // 수술 후 A/B의 각 회차는 두 눈에 독립적으로 나타납니다.
    addDose(out,'A',n,eye,'post-'+n,'post');
    addDose(out,'B',n+gap,eye,'post-'+n,'post');
   }
   // 브로낙은 하루 두 번, 수술 당일에는 재개 시각 이후의 회차만 표시.
   for(const i of conf.drugSessions.C){
    const n=minutes(slots[i])+2*gap;
    if(isFirst&&(day+'T'+timeOf(n)<completed||n<minutes(c.restart)))continue;
    addDose(out,'C',n,eye,'post-c-'+i,'post');
   }
  }
 }
 // 디쿠아스는 수술 당일에도 적용합니다. 이후 기간은 눈별 종료일에서 조정할 수 있습니다.
 if(conf.dry.enabled&&day>=conf.dry.start){
  for(let i=0;i<conf.dry.times.length;i++){
   const time=conf.dry.times[i];
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))continue;
   const eligibleEyes=eyes.filter(eye=>conf.eyes[eye].enabled&&day>=conf.dry.start&&(!conf.dry.endDates?.[eye]||day<=conf.dry.endDates[eye]));
   for(const eye of eligibleEyes)addDose(out,'E',minutes(time),eye,i,'dry');
  }
 }
 return out.sort((a,b)=>a.time.localeCompare(b.time)||a.drug.localeCompare(b.drug));
}
const doseKey=(d,eye)=>d.eyeKeys?.[eye]||`${selected}|${eye}|${d.drug}|${d.eyeSlots?.[eye]??d.slot}`;
function normalizeLegacyCatalog(list){
 const source=Array.isArray(list)?list:[
  {id:'A',name:'옵살로신',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}},
  {id:'B',name:'프레드벨',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}},
  {id:'C',name:'브로낙',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}}
 ];
 return source.map(d=>({...d,eyes:Object.fromEntries(['left','right'].map(e=>[e,{enabled:d.eyes?.[e]?.enabled!==false,times:Array.isArray(d.eyes?.[e]?.times)?d.eyes[e].times:null}]))}));
}
function legacyScheduleForSnapshot(day,conf){
 const result=legacyDoses(day,conf),catalog=normalizeLegacyCatalog(conf.catalog),map=Object.fromEntries(catalog.map(d=>[d.id,d]));
 // Legacy record IDs must be kept even when rows are merged or labels change.
 for(const d of result){
  d.eyeKeys={};d.name=(map[d.drug]?.name ? d.drug+' '+map[d.drug].name : drugNames[d.drug])||d.drug;
  for(const eye of d.eyes){const slot=d.eyeSlots[eye];d.eyeKeys[eye]=`${day}|${eye}|${d.drug}|${d.drug==='D'?(minutes(conf.eyes[eye].visit.slice(11,16))-slot):slot}`;}
 }
 // A/B/C can use independent eye-specific times; newly added drugs always use these.
 for(const drug of catalog){
  for(const eye of Object.keys(eyeNames)){
   const settings=drug.eyes[eye];
   if(!settings)continue;
   if(!drug.enabled||!settings.enabled||Array.isArray(settings.times)){
    for(let i=result.length-1;i>=0;i--){const d=result[i];if(d.drug!==drug.id||!d.eyes.includes(eye))continue;
     d.eyes=d.eyes.filter(x=>x!==eye);delete d.eyeKeys[eye];if(!d.eyes.length)result.splice(i,1);
    }
   }
   if(drug.enabled&&settings.enabled&&Array.isArray(settings.times)){
    settings.times.forEach((t,i)=>{
     const n=minutes(t);if(!Number.isFinite(n)||n<0||n>=1440)return;
     let row=result.find(d=>d.drug===drug.id&&d.time===t);
     if(!row){row={drug:drug.id,time:t,eyes:[],eyeSlots:{},eyeKeys:{},color:colors[drug.id]||'#e8f3f5',name:drug.id+' '+drug.name,kind:'custom'};result.push(row);}
     if(!row.eyes.includes(eye))row.eyes.push(eye);
     row.eyeKeys[eye]=`${day}|${eye}|${drug.id}|custom|${t}`;
    });
   }
  }
 }
 return result;
}
function scheduleForSnapshot(day,conf){
 if(Number(conf.scheduleSchema||0)!==21)return legacyScheduleForSnapshot(day,conf);
 const rows=new Map();
 for(const med of normalizeCatalog(conf.catalog)){
  if(!med.enabled)continue;
  for(const eye of ['left','right']){
   if(!med.eyes[eye].enabled)continue;
   for(const t of med.eyes[eye].times){
    const id=med.id+'|'+t;
    let row=rows.get(id);
    if(!row){row={drug:med.id,time:t,name:med.name,eyes:[],eyeKeys:{},eyeSlots:{},color:colors[med.id]||'#e8f3f5',kind:'custom'};rows.set(id,row);}
    if(!row.eyes.includes(eye))row.eyes.push(eye);
    row.eyeKeys[eye]=`${day}|${eye}|${med.id}|custom|${t}`;
   }
  }
 }
 return [...rows.values()];
}
function doses(day){
 const versions=state.revisions.length?state.revisions:[{at:'0000-01-01T00:00:00',settings:configSnapshot()}];
 const combined=new Map();
 for(let i=0;i<versions.length;i++){
  const version=versions[i],start=version.at,end=versions[i+1]?.at||'9999-12-31T23:59:59';
  for(const row of scheduleForSnapshot(day,version.settings)){
   const when=day+'T'+row.time+':00';
   if(when<start||when>=end)continue;
   const id=row.drug+'|'+row.time;let merged=combined.get(id);
   if(!merged){merged={...row,eyes:[],eyeSlots:{},eyeKeys:{}};combined.set(id,merged);}
   for(const eye of row.eyes){if(!merged.eyes.includes(eye))merged.eyes.push(eye);merged.eyeKeys[eye]=row.eyeKeys[eye];}
  }
 }
 return [...combined.values()].sort((a,b)=>a.time.localeCompare(b.time)||a.drug.localeCompare(b.drug));
}
const isDone=(d,e)=>!!state.done[doseKey(d,e)];
const eligible=(d,e)=>d.eyes.includes(e);
const allCells=items=>items.flatMap(d=>Object.keys(eyeNames).filter(e=>eligible(d,e)).map(e=>({d,e})));
function datebar(){return `<div class="card datebar"><div><div class="muted">선택한 날짜</div><strong>${esc(fmt(selected))}</strong></div><input aria-label="기록 날짜" type="date" id="day" value="${esc(selected)}"><button class="pill" id="go-today" style="border:0">오늘</button></div>`;}
function status(){return `<div class="card"><div class="section-title">수술 정보</div>${Object.entries(eyeNames).map(([eye,name])=>{const c=state.eyes[eye];return `<div class="historyrow"><span>${name}</span><span class="muted">${esc(c.completed&&c.completedAt?'완료 '+c.completedAt.replace('T',' '):'수술 예정 '+c.visit.replace('T',' '))}</span></div>`;}).join('')}</div>`;}
function checklist(items){let last='';return items.map((d,i)=>{
 let header='';if(last!==d.time){last=d.time;header=`<div class="timehead">${d.time}</div>`;}
 const boxes=Object.entries(eyeNames).map(([e,name])=>{
  const enabled=eligible(d,e),checked=enabled&&isDone(d,e);
  return `<label class="eye-check ${enabled?'':'disabled'}"><span class="eye-label">${e==='left'?'왼쪽':'오른쪽'}</span><input type="checkbox" data-index="${i}" data-eye="${e}" aria-label="${drugLabel(d)} ${d.time} ${name} 점안 완료" ${checked?'checked':''} ${enabled&&window.eyeCloudRole!=='parent'?'':'disabled'}></label>`;
 }).join('');
 return header+`<div class="dose two-eyes"><span class="letter" style="background:${d.color}">${esc(d.drug.length<=2?d.drug:"약")}</span><span class="details"><strong>${esc(drugLabel(d))}</strong><small>${d.time}${d.drug==='D'?' · 수술 당일':''}</small></span><div class="eye-checks">${boxes}</div></div>`;
 }).join('');}
// 같은 눈에 투여하는 서로 다른 안약 간의 설정 간격 확인.
// 두 눈 각각 독립적으로 비교하고, 동일한 안약 반복 회차는 별도 간격 판단 대상에서 제외합니다.
function spacingConflicts(items){
 const gap=Number(state.gap),found=[];
 for(const eye of Object.keys(eyeNames)){
  const eyeItems=items.filter(d=>d.eyes.includes(eye));
  for(let i=0;i<eyeItems.length;i++)for(let j=i+1;j<eyeItems.length;j++){
   const a=eyeItems[i],b=eyeItems[j];
   if(a.drug===b.drug)continue;
   const diff=Math.abs(minutes(a.time)-minutes(b.time));
   if(diff<gap)found.push({eye,a,b,diff});
  }
 }
 return found;
}
function conflictPanel(items,context){
 const hits=spacingConflicts(items);if(!hits.length)return '';
 return `<div class="card"><div class="warn"><strong>점안 간격 확인 필요 · ${hits.length}건</strong><p>${esc(fmt(context))} 일정에서 서로 다른 안약의 간격이 설정한 ${state.gap}분보다 짧습니다. 자동으로 시간을 이동하지 않습니다. 병원 지침을 확인한 뒤 설정에서 시간을 직접 수정하세요.</p>${hits.map(x=>`<div>• ${esc(eyeNames[x.eye])}: ${esc(x.a.time)} ${esc(drugLabel(x.a))} ↔ ${esc(x.b.time)} ${esc(drugLabel(x.b))} (${x.diff}분)</div>`).join('')}</div></div>`;
}
function today(){const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 let html=datebar()+status()+`<div class="card"><button type="button" class="button secondary" id="manual-sync-today" style="margin:0 0 8px">☁ 지금 동기화</button><div id="manual-sync-status" class="note" aria-live="polite">전송 대기는 ☁ 연결에서 확인할 수 있어요.</div></div><div class="card"><div class="section-title">점안 현황</div><div class="stat">${done} / ${cells.length}회 완료</div><div class="track"><div class="fill" style="width:${cells.length?done/cells.length*100:0}%"></div></div><div class="note">왼쪽·오른쪽 눈을 각각 체크하세요. 회색 체크박스는 해당 눈의 점안 대상이 아닙니다.</div></div>`;
 html+=conflictPanel(items,selected);
 return html+(items.length?checklist(items):'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
function history(){
 const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 const eyeSummary=Object.entries(eyeNames).map(([e,name])=>{const ec=cells.filter(x=>x.e===e),n=ec.filter(x=>isDone(x.d,e)).length;return `<div class="history-eye"><span>${name}</span><strong>${n} / ${ec.length}</strong><div class="track"><div class="fill" style="width:${ec.length?n/ec.length*100:0}%"></div></div></div>`;}).join('');
 const grouped=Object.entries(items.reduce((acc,d)=>{(acc[d.drug]??=[]).push(d);return acc;},{})).map(([drug,ds])=>`<div class="card"><div class="history-group"><span class="letter" style="background:${colors[drug]}">${drug}</span><strong>${drugNames[drug]}</strong></div><div class="history-columns"><span>시간</span><span>왼쪽</span><span>오른쪽</span></div>${ds.map(d=>`<div class="history-line"><span>${d.time}</span>${Object.keys(eyeNames).map(e=>!eligible(d,e)?'<span class="history-na">—</span>':isDone(d,e)?'<span class="history-yes" aria-label="완료">✓ 완료</span>':'<span class="history-no">미완료</span>').join('')}</div>`).join('')}</div>`).join('');
 return `<div class="history-intro">날짜별 기록 보기 <span>읽기 전용</span></div>`+datebar()+`<div class="card"><div class="section-title">점안 기록 요약</div><div class="stat">${done} / ${cells.length}회</div><div class="note">지난 기록은 이 화면에서 변경할 수 없습니다. 수정이 필요하면 ‘오늘’ 탭에서 해당 날짜를 선택하세요.</div><div class="history-eyes">${eyeSummary}</div></div>`+(items.length?grouped:'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
let editorCatalog=null;
const timeRow=t=>`<div class="medicine-time"><input aria-label="점안 시간" type="time" value="${esc(t)}" required><button type="button" class="remove-time" aria-label="시간 삭제">−</button></div>`;
function readEditor(){
 const newCatalog=(editorCatalog||state.catalog).map((d,i)=>{
  const name=document.querySelector(`[data-name="${i}"]`)?.value.trim()||d.name;
  const eyes={};for(const eye of ['left','right']){
   const times=[...document.querySelectorAll(`[data-times="${i}|${eye}"] input[type="time"]`)].map(input=>input.value).filter(Boolean);
   eyes[eye]={enabled:document.querySelector(`[data-eye-enabled="${i}|${eye}"]`)?.checked??true,times};
  }
  return {id:d.id,name,enabled:document.querySelector(`[data-enabled="${i}"]`)?.checked??true,eyes};
 });
 return normalizeCatalog(newCatalog);
}
function drugEditor(){
 const catalog=editorCatalog||normalizeCatalog(state.catalog);
 return `<div class="card"><div class="section-title">안약별 · 눈별 시간 설정</div><p class="note">모든 안약을 같은 방식으로 관리합니다. 입력한 시간의 개수가 하루 점안 횟수입니다. 변경 전 일정과 기록은 보존됩니다.</p><p class="note" id="draft-notice">시간 추가·삭제 후 맨 아래의 ‘설정 저장’을 눌러 주세요.</p>
 ${catalog.map((d,i)=>`<div class="eye-settings" data-med="${i}">
 <div class="field"><label>안약 ${esc(d.id)} 이름</label><input data-name="${i}" maxlength="50" value="${esc(d.name)}" required></div>
 <label><input type="checkbox" data-enabled="${i}" ${d.enabled?'checked':''}> 사용 중 (해제하면 저장 이후 일정 중지)</label>
 ${['left','right'].map(eye=>`<div class="field"><strong>${eyeNames[eye]}</strong><label><input type="checkbox" data-eye-enabled="${i}|${eye}" ${d.eyes[eye].enabled?'checked':''}> 이 눈에 사용</label><div class="times-editor" data-times="${i}|${eye}">${d.eyes[eye].times.map(t=>timeRow(t)).join('')}<button type="button" class="button secondary" data-add="${i}|${eye}">+ 시간 추가</button><small class="muted" data-count="${i}|${eye}">${d.eyes[eye].times.length}회/일</small></div></div>`).join('')}
 </div>`).join('')}
 <button type="button" class="button secondary" id="add-med">+ 새 안약 추가</button>
 </div>`;
}
function settings(){if(!editorCatalog)editorCatalog=normalizeCatalog(state.catalog);
 return `<form id="settings-form">${drugEditor()}<div class="card"><div class="section-title">눈별 수술 정보</div><p class="note">수술 일시와 완료 일시는 기록용입니다. 안약의 점안 시각은 위에서 직접 설정합니다.</p>
 ${Object.entries(eyeNames).map(([e,name])=>`<div class="eye-settings"><strong>${name}</strong><div class="field"><label for="${e}-visit">수술 일시</label><input type="datetime-local" id="${e}-visit" value="${esc(state.eyes[e].visit)}" required></div><div class="field"><label for="${e}-completedAt">수술 완료 일시 (선택)</label><input type="datetime-local" id="${e}-completedAt" value="${state.eyes[e].completed?esc(state.eyes[e].completedAt):''}"></div></div>`).join('')}
 </div><div class="card"><div class="section-title">전체 안약의 최소 점안 간격</div><div class="field"><label for="global-gap">최소 간격 (5~10분)</label><input type="number" id="global-gap" min="5" max="10" step="1" value="${state.gap}" required></div><p class="note">같은 눈의 서로 다른 안약이 설정 간격보다 가까우면 경고합니다. 시간을 자동으로 옮기지 않습니다.</p><p class="note">설정을 저장하는 순간 이후의 일정에만 새 처방을 반영하며, 이전 체크 기록과 이전 설정은 보존합니다.</p><button type="submit" class="button">설정 저장</button></div></form>`;
}
function syncPage(){return `<div class="card"><div class="section-title">클라우드 동기화 <span class="version">v2.1</span></div><p class="note">어머니 휴대폰은 기록 입력, 보호자 아이폰은 기록 보기와 설정 수정이 가능합니다. 현재 연결 상태: <strong id="cloud-summary">${esc(window.eyeCloudStatus||'연결 전')}</strong></p><p class="note">기존 기록은 이 기기에 그대로 저장됩니다. 최초 연결 또는 재시도 시 누락된 기록을 확인해 전송합니다.</p><div id="sync-ui"><div class="note">연결 기능을 불러오는 중입니다.</div></div></div>`;}
function render(){if(window.eyeCloudRole==='mother'&&tab==='settings')tab='today';const settingsTab=document.querySelector('[data-tab="settings"]');if(settingsTab)settingsTab.hidden=window.eyeCloudRole==='mother';document.querySelector('#version').textContent='v'+VERSION;document.querySelector('#title').textContent=tab==='today'?'오늘의 안약':tab==='settings'?'일정 설정':'클라우드 연결';document.querySelector('#subtitle').textContent=tab==='settings'?'눈별 날짜와 수술 일정을 설정해요':tab==='sync'?'기기 연결 및 동기화 상태를 확인해요':'왼쪽·오른쪽 눈을 각각 체크해요';document.querySelector('#content').innerHTML=tab==='today'?today():tab==='settings'?settings():syncPage();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));if(tab==='sync')window.dispatchEvent(new Event('eye-sync-panel'));}
document.addEventListener('click',e=>{if(e.target.closest('#manual-sync-today')){if(window.eyeCloudManualSync)window.eyeCloudManualSync();else {const el=document.getElementById('manual-sync-status');if(el)el.textContent='클라우드 기능 초기화 중입니다. 잠시 후 다시 시도하세요.';}return;}const b=e.target.closest('[data-tab]');if(b){if(b.dataset.tab==='settings'&&window.eyeCloudRole==='mother')return;tab=b.dataset.tab==='history'?'today':b.dataset.tab;render();return;}if(e.target.id==='go-today'){selected=dayOf(new Date());render();}});
function refreshCount(group){if(!group)return;const count=document.querySelector(`[data-count="${group.dataset.times}"]`);if(count)count.textContent=group.querySelectorAll('input[type="time"]').length+'회/일';}
function saveFormDraft(){return [...document.querySelectorAll('#settings-form input[id]')].map(el=>({id:el.id,checked:el.checked,value:el.value,type:el.type}));}
function restoreFormDraft(draft){for(const x of draft){const input=document.getElementById(x.id);if(input){if(x.type==='checkbox')input.checked=x.checked;else input.value=x.value;}}}
document.addEventListener('click',e=>{
 if(e.target.closest('#add-med')){
  const draft=saveFormDraft();editorCatalog=readEditor();editorCatalog.push({id:'N'+Date.now().toString(36)+'_'+editorCatalog.length,name:'새 안약',enabled:true,eyes:{left:{enabled:false,times:[]},right:{enabled:false,times:[]}}});render();restoreFormDraft(draft);return;
 }
 const add=e.target.closest('[data-add]');if(add){const group=document.querySelector(`[data-times="${add.dataset.add}"]`);group?.insertAdjacentHTML('beforeend',timeRow('12:00'));refreshCount(group);return;}
 const del=e.target.closest('.remove-time');if(del){const group=del.closest('.times-editor');del.closest('.medicine-time')?.remove();refreshCount(group);return;}
});
document.addEventListener('change',e=>{if(e.target.id==='day'){selected=e.target.value;render();}if(e.target.matches('input[data-index][data-eye]')){const d=doses(selected)[Number(e.target.dataset.index)],eye=e.target.dataset.eye;if(d&&eligible(d,eye)&&window.eyeCloudRole!=='parent'){const k=doseKey(d,eye);state.done[k]=e.target.checked;save();if(window.eyeCloudRole==='mother'){const qk='eyedrop-cloud-pending-records-v18';try{const q=JSON.parse(localStorage.getItem(qk)||'{}');q[k]=e.target.checked;localStorage.setItem(qk,JSON.stringify(q));}catch{}}window.dispatchEvent(new CustomEvent('eye-record-change',{detail:{key:k,value:e.target.checked}}));render();}}});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();if(window.eyeCloudRole==='mother'){alert('어머니 기기에서는 설정을 변경할 수 없습니다.');return;}
 const nextCatalog=readEditor();if(nextCatalog.some(d=>!d.name.trim())){alert('안약 이름을 입력해 주세요.');return;}
 const eyes=clone(state.eyes);
 for(const eye of Object.keys(eyeNames)){
  const visit=document.getElementById(eye+'-visit').value;
  const completedAt=document.getElementById(eye+'-completedAt').value;
  if(!visit){alert('수술 일시를 입력해 주세요.');return;}
  if(completedAt&&completedAt<visit){alert(eyeNames[eye]+' 수술 완료 일시를 확인해 주세요.');return;}
  eyes[eye]={...eyes[eye],visit,completed:!!completedAt,completedAt:completedAt||eyes[eye].completedAt};
 }
 const gap=Number(document.getElementById('global-gap').value);
 if(!Number.isInteger(gap)||gap<5||gap>10){alert('최소 점안 간격은 5~10분 사이의 정수여야 합니다.');return;}
 const oldConfig=configSnapshot();state.catalog=nextCatalog;state.eyes=eyes;state.gap=gap;state.scheduleSchema=21;
 recordRevision(oldConfig);save();if(window.eyeCloudRole==='parent')localStorage.setItem('eyedrop-cloud-pending-settings-v18',JSON.stringify(syncSettings()));editorCatalog=null;
 window.dispatchEvent(new CustomEvent('eye-settings-change',{detail:{settings:syncSettings()}}));alert('설정이 저장되었습니다. 이전 일정과 기록은 그대로 유지됩니다.');render();
});
render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
