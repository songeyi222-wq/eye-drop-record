 'use strict';
const VERSION='2.0';
const KEY='eyedrop-record-pwa-v06',OLD='eyedrop-record-pwa-v05'; // 기존 기록 유지
const DEFAULT={eyes:{left:{start:'2026-11-07',visit:'2026-11-10T08:00',enabled:true,completed:false,completedAt:'2026-11-10T10:00',restart:'12:00',hourlyUntil:'18:00'},right:{start:'2026-11-07',visit:'2026-11-11T11:00',enabled:true,completed:false,completedAt:'2026-11-11T13:00',restart:'15:00',hourlyUntil:'18:00'}},sessions:'07:00,12:00,17:00,21:00',dLeadHours:1,gap:10,drugSessions:{A:[0,1,2,3],B:[0,1,2,3],C:[0,3]},dry:{start:'2026-10-14',endDates:{left:'2026-11-11',right:'2026-11-11'},times:['07:30','10:00','12:30','15:00','17:30','20:00'],gap:10,enabled:true},done:{},catalog:null,revisions:[]};
const clone=x=>JSON.parse(JSON.stringify(x)),pad=n=>String(n).padStart(2,'0'),dayOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let state=clone(DEFAULT);try{const s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD)||'null');if(s&&s.eyes)state={...state,eyes:{left:{...DEFAULT.eyes.left,...s.eyes.left},right:{...DEFAULT.eyes.right,...s.eyes.right}},done:s.done||{},drugSessions:{...DEFAULT.drugSessions,...s.drugSessions},sessions:s.sessions||DEFAULT.sessions,dLeadHours:[1,2,3].includes(Number(s.dLeadHours))?Number(s.dLeadHours):1,gap:Number.isInteger(Number(s.gap??s.dry?.gap))&&Number(s.gap??s.dry?.gap)>=5&&Number(s.gap??s.dry?.gap)<=10?Number(s.gap??s.dry?.gap):10,dry:{...DEFAULT.dry,...s.dry,endDates:{...DEFAULT.dry.endDates,...(s.dry?.endDates||{})}},catalog:s.catalog||null,revisions:s.revisions||[]};}catch{}
if(state.sessions==='07:00,12:00,15:00,21:00')state.sessions='07:00,12:00,17:00,21:00';
// v0.9부터 기본 오후 시간을 17:00로 변경합니다. 이전 버전 기록도 유지합니다.
const catalogDefaults=()=>[
 {id:'A',name:'옵살로신',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}},
 {id:'B',name:'프레드벨',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}},
 {id:'C',name:'브로낙',enabled:true,eyes:{left:{enabled:true,times:null},right:{enabled:true,times:null}}}
];
function normalizeCatalog(list){
 const defaults=catalogDefaults();
 const source=Array.isArray(list)?list:defaults;
 return source.filter(x=>x&&typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,90}$/.test(x.id)).slice(0,30).map(x=>({
  id:x.id,name:String(x.name||x.id).slice(0,50),enabled:x.enabled!==false,
  eyes:Object.fromEntries(['left','right'].map(eye=>[eye,{
   enabled:x.eyes?.[eye]?.enabled!==false,
   times:Array.isArray(x.eyes?.[eye]?.times)?x.eyes[eye].times.filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0,24):null
  }]))
 }));
}
state.catalog=normalizeCatalog(state.catalog);
state.revisions=Array.isArray(state.revisions)?state.revisions:[];
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));save();
const configSnapshot=()=>{const {done,revisions,...settings}=clone(state);return settings;};
const stampLocal=()=>{const d=new Date();return dayOf(d)+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());};
// Each revision has a local wall-clock effective instant. Old schedule snapshots remain immutable.
function recordRevision(oldConfig){
 const at=stampLocal();
 if(!state.revisions.length)state.revisions.push({at:'0000-01-01T00:00:00',settings:clone(oldConfig)});
 const previous=state.revisions[state.revisions.length-1];
 if(previous.at===at)previous.settings=configSnapshot();
 else state.revisions.push({at,settings:configSnapshot()});
}

const syncSettings=()=>{const {done,...settings}=clone(state);return settings;};
window.eyeBridge={
 getSettings:syncSettings,
 getDone:()=>clone(state.done),
 exportBackup:()=>clone(state),
 applySettings(value){if(!value||!value.eyes)return;if(JSON.stringify(value)===JSON.stringify(syncSettings()))return;state={...state,...value,eyes:{left:{...DEFAULT.eyes.left,...state.eyes.left,...(value.eyes.left||{})},right:{...DEFAULT.eyes.right,...state.eyes.right,...(value.eyes.right||{})}},dry:{...DEFAULT.dry,...state.dry,...(value.dry||{}),endDates:{...DEFAULT.dry.endDates,...state.dry?.endDates,...value.dry?.endDates}},done:state.done,catalog:normalizeCatalog(value.catalog||state.catalog),revisions:Array.isArray(value.revisions)?value.revisions:state.revisions};editorCatalog=null;save();render();},
 applyDone(value,replace=false){const next=replace?{...value}:{...state.done,...value};if(JSON.stringify(next)===JSON.stringify(state.done))return;state.done=next;save();render();},
 setRole(role){window.eyeCloudRole=role;render();},
 setStatus(text){window.eyeCloudStatus=text;render();}
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
function scheduleForSnapshot(day,conf){
 const result=legacyDoses(day,conf),catalog=normalizeCatalog(conf.catalog),map=Object.fromEntries(catalog.map(d=>[d.id,d]));
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
function status(){return `<div class="card"><div class="section-title">눈별 점안 단계</div>${Object.entries(eyeNames).map(([eye,name])=>{const c=state.eyes[eye],completed=completedMoment(eye),post=completed&&selected>=completed.slice(0,10);const on=c.enabled&&selected>=c.start;const label=!c.enabled?'일정 사용 안 함':!on?'시작 전':post?'수술 후 점안':selected>c.visit.slice(0,10)?'수술 후 설정 필요':selected===c.visit.slice(0,10)?'수술 당일':'수술 전 점안';return `<div class="historyrow"><span>${name}</span><strong class="${on?'on':'off'}">${label}</strong></div>`}).join('')}</div>`;}
function checklist(items){let last='';return items.map((d,i)=>{
 let header='';if(last!==d.time){last=d.time;header=`<div class="timehead">${d.time}</div>`;}
 const boxes=Object.entries(eyeNames).map(([e,name])=>{
  const enabled=eligible(d,e),checked=enabled&&isDone(d,e);
  return `<label class="eye-check ${enabled?'':'disabled'}"><span class="eye-label">${e==='left'?'왼쪽':'오른쪽'}</span><input type="checkbox" data-index="${i}" data-eye="${e}" aria-label="${drugLabel(d)} ${d.time} ${name} 점안 완료" ${checked?'checked':''} ${enabled&&window.eyeCloudRole!=='parent'?'':'disabled'}></label>`;
 }).join('');
 return header+`<div class="dose two-eyes"><span class="letter" style="background:${d.color}">${d.drug}</span><span class="details"><strong>${drugNames[d.drug]}</strong><small>${d.time}${d.drug==='D'?' · 수술 당일':''}</small></span><div class="eye-checks">${boxes}</div></div>`;
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
 let html=datebar()+status()+`<div class="card"><div class="section-title">점안 현황</div><div class="stat">${done} / ${cells.length}회 완료</div><div class="track"><div class="fill" style="width:${cells.length?done/cells.length*100:0}%"></div></div><div class="note">왼쪽·오른쪽 눈을 각각 체크하세요. 회색 체크박스는 해당 눈의 점안 대상이 아닙니다.</div></div>`;
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
function drugEditor(){
 const catalog=editorCatalog||normalizeCatalog(state.catalog);
 return `<div class="card"><div class="section-title">안약별 · 눈별 처방 편집</div><p class="note">A·B·C는 기본 수술 단계별 일정을 유지하거나, 눈마다 시간을 직접 지정할 수 있습니다. 새 안약은 시간을 직접 추가합니다. 설정을 저장한 현재 시각 이후에만 적용됩니다.</p>
 ${catalog.map((d,i)=>`<div class="eye-settings" data-med="${i}">
 <div class="field"><label>안약 ${esc(d.id)} 이름</label><input data-name="${i}" maxlength="50" value="${esc(d.name)}" required></div>
 <label><input type="checkbox" data-enabled="${i}" ${d.enabled?'checked':''}> 사용 중 (끄면 미래 일정에서 제외)</label>
 ${['left','right'].map(eye=>`<div class="field"><strong>${eyeNames[eye]}</strong><label><input type="checkbox" data-eye-enabled="${i}|${eye}" ${d.eyes[eye].enabled?'checked':''}> 이 눈에 사용</label>
 <label><input type="checkbox" data-manual="${i}|${eye}" ${Array.isArray(d.eyes[eye].times)?'checked':''}> 점안 시간을 직접 지정${['A','B','C'].includes(d.id)?' (해제하면 기존 수술 단계별 일정)':''}</label>
 <div class="times-editor" data-times="${i}|${eye}" ${Array.isArray(d.eyes[eye].times)?'':'hidden'}>${(d.eyes[eye].times||[]).map(t=>timeRow(t)).join('')}<button type="button" class="button secondary" data-add="${i}|${eye}">+ 시간 추가</button></div>
 </div>`).join('')}
 </div>`).join('')}
 <button type="button" class="button secondary" id="add-med">+ 새 안약 추가</button>
 <p class="note">시간은 병원 처방에 따라 입력하세요. 약의 이름이나 시간을 바꾸더라도 이전 기록은 변경하지 않습니다. D(미드린피)는 수술 당일 자동 일정, 디쿠아스는 아래 전용 설정에서 계속 관리합니다.</p>
 </div>`;
}
const timeRow=t=>`<div class="medicine-time"><input aria-label="점안 시간" type="time" value="${esc(t)}" required><button type="button" class="remove-time" aria-label="시간 삭제">−</button></div>`;
function readEditor(){
 const newCatalog=(editorCatalog||state.catalog).map((d,i)=>{
  const name=document.querySelector(`[data-name="${i}"]`)?.value.trim()||d.name;
  const eyes={};for(const eye of ['left','right']){
   const manual=document.querySelector(`[data-manual="${i}|${eye}"]`)?.checked??false;
   const times=manual?[...document.querySelectorAll(`[data-times="${i}|${eye}"] input[type="time"]`)].map(input=>input.value).filter(Boolean):null;
   eyes[eye]={enabled:document.querySelector(`[data-eye-enabled="${i}|${eye}"]`)?.checked??true,times};
  }
  return {id:d.id,name,enabled:document.querySelector(`[data-enabled="${i}"]`)?.checked??true,eyes};
 });
 return normalizeCatalog(newCatalog);
}
function settings(){if(!editorCatalog)editorCatalog=normalizeCatalog(state.catalog);return `<form id="settings-form">${drugEditor()}<div class="card"><div class="section-title">눈별 수술 일정 및 완료 설정</div>${Object.entries(eyeNames).map(([e,name])=>`<div class="eye-settings"><strong>${name}</strong><div class="field"><label><input type="checkbox" id="${e}-enabled" ${state.eyes[e].enabled?'checked':''}> 일정 사용</label></div><div class="field"><label for="${e}-start">A·B·C 점안 시작일</label><input type="date" id="${e}-start" value="${esc(state.eyes[e].start)}" required></div><div class="field"><label for="${e}-visit">수술 당일 내원 일시</label><input type="datetime-local" id="${e}-visit" value="${esc(state.eyes[e].visit)}" required></div><div class="field"><label><input type="checkbox" id="${e}-completed" ${state.eyes[e].completed?'checked':''}> 수술 완료</label></div><div class="field"><label for="${e}-completedAt">수술 완료 날짜·시간</label><input type="datetime-local" id="${e}-completedAt" value="${esc(state.eyes[e].completedAt)}" required></div><div class="field"><label for="${e}-restart">수술 후 첫 점안 시작 시간</label><input type="time" id="${e}-restart" value="${esc(state.eyes[e].restart)}" required></div><div class="field"><label for="${e}-hourlyUntil">1시간 간격 종료 기준 (기본 18:00)</label><input type="time" id="${e}-hourlyUntil" value="${esc(state.eyes[e].hourlyUntil)}" required></div><p class="note">완료 체크를 하면 해당 눈의 완료 시각부터 D는 중지되고, 지정한 첫 점안 시각부터 수술 후 A·B 일정을 시작합니다. 수술 당일 기준 시각까지 1시간 간격, 이후 2시간 간격이며 다음 날부터는 아침~취침 전 2시간 간격입니다. C는 하루 두 번입니다. 완료·재개 시각은 병원에서 안내받은 실제 시각으로 입력하세요.</p></div>`).join('')}</div><div class="card"><div class="section-title">A·B·C 기본 시간 (수정 가능)</div>${state.sessions.split(',').map((t,i)=>`<div class="field"><label for="session-${i}">${['아침','점심','오후','밤'][i]} A 시작 시각</label><input type="time" id="session-${i}" value="${esc(t)}" required></div>`).join('')}<p class="note">수술 전 A→B→C는 설정한 간격을 따릅니다. C는 아침·밤에만 표시합니다. 한 눈의 수술 전 아침 회차가 D와 겹치면 양쪽 눈의 아침 시간을 함께 맞춥니다. 수술 후 A·B는 위 수술 후 간격에 따라, C는 하루 두 번 표시됩니다.</p><div class="section-title">전체 안약의 최소 점안 간격</div><div class="field"><label for="global-gap">안약 간 간격 (5~10분, 숫자 입력)</label><input type="number" id="global-gap" min="5" max="10" step="1" value="${state.gap}" required></div><p class="note">기본 10분. A·B 및 C의 시각 계산에 적용됩니다. 다른 안약과 겹치면 충돌을 알려주며 자동으로 옮기지 않습니다.</p><div class="section-title">디쿠아스에스 · 하루 6회</div><div class="field"><label><input type="checkbox" id="dry-enabled" ${state.dry.enabled?'checked':''}> 디쿠아스 일정 사용</label></div><div class="field"><label for="dry-start">상담일 / 점안 시작일</label><input type="date" id="dry-start" value="${esc(state.dry.start)}" required></div>${state.dry.times.map((t,i)=>`<div class="field"><label for="dry-${i}">${i+1}회 점안 시각</label><input type="time" id="dry-${i}" value="${esc(t)}" required></div>`).join('')}<p class="note">수술 당일에도 디쿠아스를 표시합니다. 종료일은 병원 안내에 따라 눈별로 변경해 주세요. 비워 두면 별도 종료일 없이 계속 표시됩니다.</p>${Object.entries(eyeNames).map(([eye,name])=>`<div class="field"><label for="dry-end-${eye}">${name} 디쿠아스 종료일 (선택)</label><input type="date" id="dry-end-${eye}" value="${esc(state.dry.endDates?.[eye]||'')}"></div>`).join('')}<div class="section-title">D 미드린피 · 수술 당일</div><p class="note">기존 앱의 D 일정(내원 1시간 전~3시간 후, 30분 간격)을 유지하되, 수술 완료를 체크하면 해당 눈의 완료 시각부터 D를 중지합니다.</p><div class="warn">안내문에는 D를 수술 전까지 점안하라고 적혀 있습니다. 수술 후 D 사용 여부와 A·B 재개 시점은 반드시 병원 지침에 따르세요. 앱은 점안 알림이 없는 기록용입니다.</div><p class="note">설정을 저장한 시각 이후의 일정에만 변경 사항을 반영합니다. 이전 일정과 체크 기록은 보존합니다.</p><button type="submit" class="button">설정 저장</button></div></form>`;}
function syncPage(){return `<div class="card"><div class="section-title">클라우드 동기화 <span class="version">v2.0</span></div><p class="note">어머니 휴대폰은 기록 입력, 보호자 아이폰은 기록 보기와 설정 수정이 가능합니다. 현재 연결 상태: <strong id="cloud-summary">${esc(window.eyeCloudStatus||'연결 전')}</strong></p><p class="note">기존 기록은 이 기기에 그대로 저장됩니다. 최초 연결 또는 재시도 시 누락된 기록을 확인해 전송합니다.</p><div id="sync-ui"><div class="note">연결 기능을 불러오는 중입니다.</div></div></div>`;}
function render(){if(window.eyeCloudRole==='mother'&&tab==='settings')tab='today';const settingsTab=document.querySelector('[data-tab="settings"]');if(settingsTab)settingsTab.hidden=window.eyeCloudRole==='mother';document.querySelector('#version').textContent='v'+VERSION;document.querySelector('#title').textContent=tab==='today'?'오늘의 안약':tab==='settings'?'일정 설정':'클라우드 연결';document.querySelector('#subtitle').textContent=tab==='settings'?'눈별 날짜와 수술 일정을 설정해요':tab==='sync'?'기기 연결 및 동기화 상태를 확인해요':'왼쪽·오른쪽 눈을 각각 체크해요';document.querySelector('#content').innerHTML=tab==='today'?today():tab==='settings'?settings():syncPage();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));if(tab==='sync')window.dispatchEvent(new Event('eye-sync-panel'));}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){if(b.dataset.tab==='settings'&&window.eyeCloudRole==='mother')return;tab=b.dataset.tab==='history'?'today':b.dataset.tab;render();return;}if(e.target.id==='go-today'){selected=dayOf(new Date());render();}});
document.addEventListener('click',e=>{
 if(e.target.closest('#add-med')){
  const formDraft=[...document.querySelectorAll('#settings-form input[id]')].map(el=>({id:el.id,checked:el.checked,value:el.value,type:el.type}));
  editorCatalog=readEditor();editorCatalog.push({id:'N'+Date.now().toString(36)+'_'+editorCatalog.length,name:'새 안약',enabled:true,eyes:{left:{enabled:false,times:[]},right:{enabled:false,times:[]}}});
  render();for(const old of formDraft){const input=document.getElementById(old.id);if(input){if(old.type==='checkbox')input.checked=old.checked;else input.value=old.value;}}return;
 }
 const add=e.target.closest('[data-add]');if(add){const group=document.querySelector(`[data-times="${add.dataset.add}"]`);group?.insertAdjacentHTML('afterbegin',timeRow('12:00'));return;}
 const del=e.target.closest('.remove-time');if(del){del.closest('.medicine-time')?.remove();return;}
});
document.addEventListener('change',e=>{if(e.target.matches('[data-manual]')){const group=document.querySelector(`[data-times="${e.target.dataset.manual}"]`);if(group)group.hidden=!e.target.checked;}if(e.target.id==='day'){selected=e.target.value;render();}if(e.target.matches('input[data-index][data-eye]')){const d=doses(selected)[Number(e.target.dataset.index)],eye=e.target.dataset.eye;if(d&&eligible(d,eye)&&window.eyeCloudRole!=='parent'){const k=doseKey(d,eye);state.done[k]=e.target.checked;save();if(window.eyeCloudRole==='mother'){const qk='eyedrop-cloud-pending-records-v18';try{const q=JSON.parse(localStorage.getItem(qk)||'{}');q[k]=e.target.checked;localStorage.setItem(qk,JSON.stringify(q));}catch{}}window.dispatchEvent(new CustomEvent('eye-record-change',{detail:{key:k,value:e.target.checked}}));render();}}});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();if(window.eyeCloudRole==='mother'){alert('어머니 기기에서는 설정을 변경할 수 없습니다. 보호자 아이폰에서 변경해 주세요.');render();return;}
 const oldConfig=configSnapshot();const nextCatalog=readEditor();
 if(nextCatalog.some(d=>!d.name.trim())){alert('안약 이름을 입력해 주세요.');return;}
 const nextEyes={};for(const eye of Object.keys(eyeNames)){
  const get=id=>document.getElementById(eye+'-'+id);
  nextEyes[eye]={start:get('start').value,visit:get('visit').value,enabled:get('enabled').checked,completed:get('completed').checked,completedAt:get('completedAt').value,restart:get('restart').value,hourlyUntil:get('hourlyUntil').value};
  if(nextEyes[eye].completed){
   const c=nextEyes[eye];
   if(c.completedAt.slice(0,10)<c.visit.slice(0,10)){alert('수술 완료 날짜가 내원 날짜보다 빠릅니다. '+eyeNames[eye]+' 날짜를 확인해 주세요.');return;}
   if(c.completedAt.slice(0,10)+'T'+c.restart<c.completedAt){alert(eyeNames[eye]+' 수술 후 첫 점안은 수술 완료 이후의 시각으로 입력해 주세요.');return;}
  }
 }
 const gap=Number(document.getElementById('global-gap').value);
 if(!Number.isInteger(gap)||gap<5||gap>10){alert('최소 점안 간격은 5~10 사이의 정수를 입력해 주세요.');return;}
 state.catalog=nextCatalog;state.eyes=nextEyes;state.sessions=[0,1,2,3].map(i=>document.getElementById('session-'+i).value).join(',');state.gap=gap;
 state.dry={enabled:document.getElementById('dry-enabled').checked,start:document.getElementById('dry-start').value,times:[0,1,2,3,4,5].map(i=>document.getElementById('dry-'+i).value),endDates:Object.fromEntries(Object.keys(eyeNames).map(e=>[e,document.getElementById('dry-end-'+e).value])),gap};
 recordRevision(oldConfig);save();if(window.eyeCloudRole==='parent')localStorage.setItem('eyedrop-cloud-pending-settings-v18',JSON.stringify(syncSettings()));editorCatalog=null;window.dispatchEvent(new CustomEvent('eye-settings-change',{detail:{settings:syncSettings()}}));alert('설정이 저장되었습니다.');render();});
render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
