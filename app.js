 'use strict';
const VERSION='1.4';
const KEY='eyedrop-record-pwa-v06',OLD='eyedrop-record-pwa-v05'; // 기존 기록 유지
const DEFAULT={eyes:{left:{start:'2026-11-07',visit:'2026-11-10T08:00',enabled:true},right:{start:'2026-11-07',visit:'2026-11-11T11:00',enabled:true}},sessions:'07:00,12:00,17:00,21:00',dLeadHours:1,gap:10,drugSessions:{A:[0,1,2,3],B:[0,1,2,3],C:[0,3]},dry:{start:'2026-10-14',times:['07:30','10:00','12:30','15:00','17:30','20:00'],gap:10,enabled:true},done:{}};
const clone=x=>JSON.parse(JSON.stringify(x)),pad=n=>String(n).padStart(2,'0'),dayOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let state=clone(DEFAULT);try{const s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD)||'null');if(s&&s.eyes)state={...state,eyes:{left:{...DEFAULT.eyes.left,...s.eyes.left},right:{...DEFAULT.eyes.right,...s.eyes.right}},done:s.done||{},drugSessions:{...DEFAULT.drugSessions,...s.drugSessions},sessions:s.sessions||DEFAULT.sessions,dLeadHours:[1,2,3].includes(Number(s.dLeadHours))?Number(s.dLeadHours):1,gap:Number.isInteger(Number(s.gap??s.dry?.gap))&&Number(s.gap??s.dry?.gap)>=5&&Number(s.gap??s.dry?.gap)<=10?Number(s.gap??s.dry?.gap):10,dry:{...DEFAULT.dry,...s.dry}};}catch{}
if(state.sessions==='07:00,12:00,15:00,21:00')state.sessions='07:00,12:00,17:00,21:00';
// v0.9부터 기본 오후 시간을 17:00로 변경합니다. 이전 버전 기록도 유지합니다.
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));save();
let selected=dayOf(new Date()),tab='today';
const drugNames={A:'A 옵살로신',B:'B 프레드벨',C:'C 브로낙',D:'D 미드린피',E:'디쿠아스에스 (건조증 치료제)'};
const eyeNames={left:'왼쪽 눈',right:'오른쪽 눈'},colors={A:'#eaf0ff',B:'#f1ebff',C:'#fff0e6',D:'#e3f5f0',E:'#fff7d6'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const timeOf=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
function activeEye(day,eye,time){
 const c=state.eyes[eye];if(!c.enabled||day<c.start||day>c.visit.slice(0,10))return false;
 return day!==c.visit.slice(0,10)||time<c.visit.slice(11,16);
}
function doses(day){
 const out=[],slots=state.sessions.split(','),eyes=Object.keys(eyeNames),gap=state.gap;
 // 수술할 눈의 아침 A/B/C가 D 점안 구간과 겹치면 아침 회차를 이동합니다.
 // 같은 날 다른 눈도 점안 대상이면 동일한 아침 회차를 사용합니다.
 let sharedMorning=minutes(slots[0]);
 for(const eye of eyes){
  const c=state.eyes[eye];
  if(!c.enabled||day!==c.visit.slice(0,10)||day<c.start)continue;
  const visit=minutes(c.visit.slice(11,16));
  const dStart=Math.max(0,visit-60),dEnd=Math.min(1439,visit+180);
  const morningTimes=['A','B','C'].filter(drug=>state.drugSessions[drug].includes(0))
   .map(drug=>minutes(slots[0])+({A:0,B:gap,C:2*gap}[drug]));
  if(morningTimes.some(n=>n>=dStart&&n<=dEnd)){
   sharedMorning=Math.min(sharedMorning,Math.max(0,dStart-30));
  }
 }
 for(const eye of eyes){
  const c=state.eyes[eye];
  if(!c.enabled)continue;
  const surgery=day===c.visit.slice(0,10);
  const visit=minutes(c.visit.slice(11,16));
  const dStart=Math.max(0,visit-60),dEnd=Math.min(1439,visit+180);
  for(let i=0;i<slots.length;i++){
   if(surgery&&i!==0)continue;
   for(const [drug,offset] of [['A',0],['B',gap],['C',2*gap]]){
    if(!state.drugSessions[drug].includes(i))continue;
    const n=(i===0?sharedMorning:minutes(slots[i]))+offset;
    if(n<0||n>=1440)continue;
    const time=timeOf(n);
    if(!activeEye(day,eye,time))continue;
    // 수술하는 눈과 다른 눈이 같은 시간에 점안하면 하나의 행으로 묶습니다.
    let dose=out.find(d=>d.drug===drug&&d.time===time&&d.slot===i);
    if(!dose){dose={drug,time,eyes:[],slot:i,color:colors[drug],kind:surgery?'surgery':'normal'};out.push(dose);}
    if(!dose.eyes.includes(eye))dose.eyes.push(eye);
   }
  }
  if(surgery){
   for(let n=dStart;n<=dEnd;n+=30)out.push({drug:'D',time:timeOf(n),eyes:[eye],slot:n,color:colors.D,kind:'surgery'});
  }
 }
 // 디쿠아스는 각 눈의 수술 전날까지만 표시합니다. 수술 당일 이후는 일정에 넣지 않습니다.
 if(state.dry.enabled && day>=state.dry.start){
  for(let i=0;i<state.dry.times.length;i++){
   const time=state.dry.times[i];
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))continue;
   const eligibleEyes=eyes.filter(eye=>state.eyes[eye].enabled&&day<state.eyes[eye].visit.slice(0,10));
   if(eligibleEyes.length)out.push({drug:'E',time,eyes:eligibleEyes,slot:i,color:colors.E,kind:'dry'});
  }
 }
 return out.sort((a,b)=>a.time.localeCompare(b.time)||a.drug.localeCompare(b.drug));
}
const doseKey=(d,eye)=>`${selected}|${eye}|${d.drug}|${d.drug==='D'?(minutes(state.eyes[eye].visit.slice(11,16))-d.slot):d.slot}`;
const isDone=(d,e)=>!!state.done[doseKey(d,e)];
const eligible=(d,e)=>d.eyes.includes(e);
const allCells=items=>items.flatMap(d=>Object.keys(eyeNames).filter(e=>eligible(d,e)).map(e=>({d,e})));
function datebar(){return `<div class="card datebar"><div><div class="muted">선택한 날짜</div><strong>${esc(fmt(selected))}</strong></div><input aria-label="기록 날짜" type="date" id="day" value="${esc(selected)}"><button class="pill" id="go-today" style="border:0">오늘</button></div>`;}
function status(){return `<div class="card"><div class="section-title">수술 전 안약 사용 상태</div>${Object.entries(eyeNames).map(([eye,name])=>{const c=state.eyes[eye],on=c.enabled&&selected>=c.start&&selected<=c.visit.slice(0,10);return `<div class="historyrow"><span>${name}</span><strong class="${on?'on':'off'}">${!c.enabled?'사용 안 함':selected<c.start?'시작 전 · 비활성':selected>c.visit.slice(0,10)?'수술 후 · 비활성':'수술 전 · 시간별 적용'}</strong></div>`}).join('')}</div>`;}
function checklist(items){let last='';return items.map((d,i)=>{
 let header='';if(last!==d.time){last=d.time;header=`<div class="timehead">${d.time}</div>`;}
 const boxes=Object.entries(eyeNames).map(([e,name])=>{
  const enabled=eligible(d,e),checked=enabled&&isDone(d,e);
  return `<label class="eye-check ${enabled?'':'disabled'}"><span class="eye-label">${e==='left'?'왼쪽':'오른쪽'}</span><input type="checkbox" data-index="${i}" data-eye="${e}" aria-label="${d.drug} ${d.time} ${name} 점안 완료" ${checked?'checked':''} ${enabled?'':'disabled'}></label>`;
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
 return `<div class="card"><div class="warn"><strong>점안 간격 확인 필요 · ${hits.length}건</strong><p>${esc(fmt(context))} 일정에서 서로 다른 안약의 간격이 설정한 ${state.gap}분보다 짧습니다. 자동으로 시간을 이동하지 않습니다. 병원 지침을 확인한 뒤 설정에서 시간을 직접 수정하세요.</p>${hits.map(x=>`<div>• ${esc(eyeNames[x.eye])}: ${esc(x.a.time)} ${esc(drugNames[x.a.drug])} ↔ ${esc(x.b.time)} ${esc(drugNames[x.b.drug])} (${x.diff}분)</div>`).join('')}</div></div>`;
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
function settings(){return `<form id="settings-form"><div class="card"><div class="section-title">눈별 수술 일정</div>${Object.entries(eyeNames).map(([e,name])=>`<div class="eye-settings"><strong>${name}</strong><div class="field"><label><input type="checkbox" id="${e}-enabled" ${state.eyes[e].enabled?'checked':''}> 일정 사용</label></div><div class="field"><label for="${e}-start">A·B·C 점안 시작일</label><input type="date" id="${e}-start" value="${esc(state.eyes[e].start)}" required></div><div class="field"><label for="${e}-visit">수술 당일 내원 일시</label><input type="datetime-local" id="${e}-visit" value="${esc(state.eyes[e].visit)}" required></div></div>`).join('')}</div><div class="card"><div class="section-title">A·B·C 기본 시간 (수정 가능)</div>${state.sessions.split(',').map((t,i)=>`<div class="field"><label for="session-${i}">${['아침','점심','오후','밤'][i]} A 시작 시각</label><input type="time" id="session-${i}" value="${esc(t)}" required></div>`).join('')}<p class="note">B는 A보다 설정 간격 뒤, C는 A보다 설정 간격의 두 배 뒤입니다. C는 아침·밤 회차에만 표시됩니다. 수술 당일 해당 눈은 아침 회차만 표시합니다. 한쪽 눈의 아침 A·B·C가 D 점안 시간대와 겹치면 A를 D 첫 점안 30분 전으로 이동하고 B·C는 설정 간격에 따라 배치됩니다. 같은 날 다른 눈도 점안 대상이라면 아침 시간을 함께 맞추며, 체크 기록은 눈별로 따로 저장합니다. 겹치지 않으면 설정한 아침 시간을 그대로 사용합니다.</p><div class="section-title">전체 안약의 최소 점안 간격</div><div class="field"><label for="global-gap">A·B·C 및 디쿠아스 공통 간격 (5~10분, 숫자 입력)</label><input type="number" id="global-gap" min="5" max="10" step="1" value="${state.gap}" required></div><p class="note">기본 10분. A→B→C 시각 계산에도 적용됩니다. 디쿠아스와 다른 안약 시간이 겹치면 별도의 충돌 목록을 표시하므로 직접 시간을 조정하세요. D의 시간은 바꾸지 않습니다.</p><div class="section-title">디쿠아스에스 · 하루 6회</div><div class="field"><label><input type="checkbox" id="dry-enabled" ${state.dry.enabled?'checked':''}> 디쿠아스 일정 사용</label></div><div class="field"><label for="dry-start">상담일 / 점안 시작일</label><input type="date" id="dry-start" value="${esc(state.dry.start)}" required></div>${state.dry.times.map((t,i)=>`<div class="field"><label for="dry-${i}">${i+1}회 점안 시각</label><input type="time" id="dry-${i}" value="${esc(t)}" required></div>`).join('')}<p class="note">디쿠아스는 2026년 10월 14일부터 각 눈의 수술 전날까지만 표시됩니다. 수술 당일에는 해당 눈의 디쿠아스 일정을 표시하지 않습니다. 두 눈의 완료 기록은 별도로 저장됩니다. 다른 약과 설정한 간격보다 가까우면 경고를 표시하며, 처방 시간은 임의로 자동 변경하지 않습니다. 수술 당일 실제 점안 여부는 병원 지침을 확인하세요.</p><div class="section-title">D 안약 · 수술 당일</div><p class="note">내원 시각 기준 1시간 전부터 3시간 후까지 30분 간격으로 자동 표시합니다. D 시각은 A·B·C의 자동 조정과 무관하게 유지됩니다. 별도 시간 설정은 없습니다.</p><div class="warn">병원 안내문에는 내원 1시간 전부터 수술 전까지라고 적혀 있습니다. 내원 3시간 후까지의 점안은 안내문과 다르므로 반드시 병원에 확인한 뒤 사용하세요. 이 앱은 알림이 없는 기록용입니다.</div><p class="note">시간을 수정한 후 저장하면 선택한 날짜의 충돌 여부를 다시 계산합니다. 충돌 목록은 ‘오늘’ 탭에서 날짜를 선택해 확인할 수 있습니다.</p><button type="submit" class="button">설정 저장</button></div></form>`;}
function render(){document.querySelector('#version').textContent='v'+VERSION;document.querySelector('#title').textContent=tab==='today'?'오늘의 안약':tab==='history'?'점안 기록':'일정 설정';document.querySelector('#subtitle').textContent=tab==='settings'?'눈별 날짜와 수술 일정을 설정해요':'왼쪽·오른쪽 눈을 각각 체크해요';document.querySelector('#content').innerHTML=tab==='today'?today():tab==='history'?history():settings();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();return;}if(e.target.id==='go-today'){selected=dayOf(new Date());render();}});
document.addEventListener('change',e=>{if(e.target.id==='day'){selected=e.target.value;render();}if(e.target.matches('input[data-index][data-eye]')){const d=doses(selected)[Number(e.target.dataset.index)],eye=e.target.dataset.eye;if(d&&eligible(d,eye)){state.done[doseKey(d,eye)]=e.target.checked;save();render();}}});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();for(const eye of Object.keys(eyeNames))state.eyes[eye]={start:document.getElementById(eye+'-start').value,visit:document.getElementById(eye+'-visit').value,enabled:document.getElementById(eye+'-enabled').checked};state.sessions=[0,1,2,3].map(i=>document.getElementById('session-'+i).value).join(',');
 const gap=Number(document.getElementById('global-gap').value);
 if(!Number.isInteger(gap)||gap<5||gap>10){alert('최소 점안 간격은 5~10 사이의 정수를 입력해 주세요.');return;}
 state.gap=gap;state.dry={enabled:document.getElementById('dry-enabled').checked,start:document.getElementById('dry-start').value,times:[0,1,2,3,4,5].map(i=>document.getElementById('dry-'+i).value),gap};
 save();alert('설정이 저장되었습니다.');render();});
render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
