 'use strict';
const VERSION='1.0';
const KEY='eyedrop-record-pwa-v06',OLD='eyedrop-record-pwa-v05'; // 기존 기록 유지
const DEFAULT={eyes:{left:{start:'2026-11-07',visit:'2026-11-10T08:00',enabled:true},right:{start:'2026-11-07',visit:'2026-11-11T11:00',enabled:true}},sessions:'07:00,12:00,17:00,21:00',dLeadHours:1,drugSessions:{A:[0,1,2,3],B:[0,1,2,3],C:[0,3]},done:{}};
const clone=x=>JSON.parse(JSON.stringify(x)),pad=n=>String(n).padStart(2,'0'),dayOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let state=clone(DEFAULT);try{const s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD)||'null');if(s&&s.eyes)state={...state,eyes:{left:{...DEFAULT.eyes.left,...s.eyes.left},right:{...DEFAULT.eyes.right,...s.eyes.right}},done:s.done||{},drugSessions:{...DEFAULT.drugSessions,...s.drugSessions},sessions:s.sessions||DEFAULT.sessions,dLeadHours:[1,2,3].includes(Number(s.dLeadHours))?Number(s.dLeadHours):1};}catch{}
if(state.sessions==='07:00,12:00,15:00,21:00')state.sessions='07:00,12:00,17:00,21:00';
// v0.9부터 기본 오후 시간을 17:00로 변경합니다. 이전 버전 기록도 유지합니다.
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));save();
let selected=dayOf(new Date()),tab='today';
const drugNames={A:'A 옵살로신',B:'B 프레드벨',C:'C 브로낙',D:'D 미드린피'};
const eyeNames={left:'왼쪽 눈',right:'오른쪽 눈'},colors={A:'#eaf0ff',B:'#f1ebff',C:'#fff0e6',D:'#e3f5f0'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const timeOf=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
function activeEye(day,eye,time){
 const c=state.eyes[eye];if(!c.enabled||day<c.start||day>c.visit.slice(0,10))return false;
 return day!==c.visit.slice(0,10)||time<c.visit.slice(11,16);
}
function doses(day){
 const out=[],slots=state.sessions.split(',');
 const isSurgeryDay=Object.values(state.eyes).some(c=>c.enabled&&day===c.visit.slice(0,10));
 // 수술 당일의 해당 눈은 아침 06:30 회차만 표시, 다른 눈은 평소 일정 유지.
 for(let i=0;i<slots.length;i++)for(const [drug,offset] of [['A',0],['B',10],['C',20]]){
  if(!state.drugSessions[drug].includes(i))continue;
  const normalTime=timeOf(minutes(slots[i])+offset);
  const normalEyes=Object.keys(eyeNames).filter(e=>day!==state.eyes[e].visit.slice(0,10));
  // 수술 당일 아침 회차는 06:30/06:40/06:50으로 고정
  if(i===0){
   const surgeryEyes=Object.keys(eyeNames).filter(e=>state.eyes[e].enabled&&day===state.eyes[e].visit.slice(0,10));
   if(surgeryEyes.length)out.push({drug,time:timeOf(390+offset),eyes:surgeryEyes.filter(e=>activeEye(day,e,timeOf(390+offset))),slot:i,color:colors[drug],kind:'surgery'});
  }
  if(normalEyes.length||!isSurgeryDay)out.push({drug,time:normalTime,eyes:normalEyes.filter(e=>activeEye(day,e,normalTime)),slot:i,color:colors[drug],kind:'normal'});
 }
 for(const eye of Object.keys(eyeNames)){
  const c=state.eyes[eye];if(!c.enabled||day!==c.visit.slice(0,10))continue;
  const visit=minutes(c.visit.slice(11,16)),start=Math.max(0,visit-60),end=Math.min(1439,visit+180);
  for(let n=start;n<=end;n+=30)out.push({drug:'D',time:timeOf(n),eyes:[eye],slot:n,color:colors.D,kind:'surgery'});
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
function today(){const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 let html=datebar()+status()+`<div class="card"><div class="section-title">점안 현황</div><div class="stat">${done} / ${cells.length}회 완료</div><div class="track"><div class="fill" style="width:${cells.length?done/cells.length*100:0}%"></div></div><div class="note">왼쪽·오른쪽 눈을 각각 체크하세요. 회색 체크박스는 해당 눈의 점안 대상이 아닙니다.</div></div>`;
 return html+(items.length?checklist(items):'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
function history(){
 const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 const eyeSummary=Object.entries(eyeNames).map(([e,name])=>{const ec=cells.filter(x=>x.e===e),n=ec.filter(x=>isDone(x.d,e)).length;return `<div class="history-eye"><span>${name}</span><strong>${n} / ${ec.length}</strong><div class="track"><div class="fill" style="width:${ec.length?n/ec.length*100:0}%"></div></div></div>`;}).join('');
 const grouped=Object.entries(items.reduce((acc,d)=>{(acc[d.drug]??=[]).push(d);return acc;},{})).map(([drug,ds])=>`<div class="card"><div class="history-group"><span class="letter" style="background:${colors[drug]}">${drug}</span><strong>${drugNames[drug]}</strong></div><div class="history-columns"><span>시간</span><span>왼쪽</span><span>오른쪽</span></div>${ds.map(d=>`<div class="history-line"><span>${d.time}</span>${Object.keys(eyeNames).map(e=>!eligible(d,e)?'<span class="history-na">—</span>':isDone(d,e)?'<span class="history-yes" aria-label="완료">✓ 완료</span>':'<span class="history-no">미완료</span>').join('')}</div>`).join('')}</div>`).join('');
 return `<div class="history-intro">날짜별 기록 보기 <span>읽기 전용</span></div>`+datebar()+`<div class="card"><div class="section-title">점안 기록 요약</div><div class="stat">${done} / ${cells.length}회</div><div class="note">지난 기록은 이 화면에서 변경할 수 없습니다. 수정이 필요하면 ‘오늘’ 탭에서 해당 날짜를 선택하세요.</div><div class="history-eyes">${eyeSummary}</div></div>`+(items.length?grouped:'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
function settings(){return `<form id="settings-form"><div class="card"><div class="section-title">눈별 수술 일정</div>${Object.entries(eyeNames).map(([e,name])=>`<div class="eye-settings"><strong>${name}</strong><div class="field"><label><input type="checkbox" id="${e}-enabled" ${state.eyes[e].enabled?'checked':''}> 일정 사용</label></div><div class="field"><label for="${e}-start">A·B·C 점안 시작일</label><input type="date" id="${e}-start" value="${esc(state.eyes[e].start)}" required></div><div class="field"><label for="${e}-visit">수술 당일 내원 일시</label><input type="datetime-local" id="${e}-visit" value="${esc(state.eyes[e].visit)}" required></div></div>`).join('')}</div><div class="card"><div class="section-title">A·B·C 기본 시간 (수정 가능)</div>${state.sessions.split(',').map((t,i)=>`<div class="field"><label for="session-${i}">${['아침','점심','오후','밤'][i]} A 시작 시각</label><input type="time" id="session-${i}" value="${esc(t)}" required></div>`).join('')}<p class="note">B는 A보다 10분 뒤, C는 A보다 20분 뒤입니다. C는 아침·밤 회차에만 표시됩니다. 수술 당일 해당 눈의 A·B·C는 아침 06:30·06:40·06:50만 표시됩니다.</p><div class="section-title">D 안약 · 수술 당일</div><p class="note">내원 시각 기준 1시간 전부터 3시간 후까지 30분 간격으로 자동 표시합니다. 별도 시간 설정은 없습니다.</p><div class="warn">병원 안내문에는 내원 1시간 전부터 수술 전까지라고 적혀 있습니다. 내원 3시간 후까지의 점안은 안내문과 다르므로 반드시 병원에 확인한 뒤 사용하세요. 이 앱은 알림이 없는 기록용입니다.</div><button type="submit" class="button">설정 저장</button></div></form>`;}
function render(){document.querySelector('#version').textContent='v'+VERSION;document.querySelector('#title').textContent=tab==='today'?'오늘의 안약':tab==='history'?'점안 기록':'일정 설정';document.querySelector('#subtitle').textContent=tab==='settings'?'눈별 날짜와 수술 일정을 설정해요':'왼쪽·오른쪽 눈을 각각 체크해요';document.querySelector('#content').innerHTML=tab==='today'?today():tab==='history'?history():settings();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();return;}if(e.target.id==='go-today'){selected=dayOf(new Date());render();}});
document.addEventListener('change',e=>{if(e.target.id==='day'){selected=e.target.value;render();}if(e.target.matches('input[data-index][data-eye]')){const d=doses(selected)[Number(e.target.dataset.index)],eye=e.target.dataset.eye;if(d&&eligible(d,eye)){state.done[doseKey(d,eye)]=e.target.checked;save();render();}}});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();for(const eye of Object.keys(eyeNames))state.eyes[eye]={start:document.getElementById(eye+'-start').value,visit:document.getElementById(eye+'-visit').value,enabled:document.getElementById(eye+'-enabled').checked};state.sessions=[0,1,2,3].map(i=>document.getElementById('session-'+i).value).join(',');save();alert('설정이 저장되었습니다.');render();});
render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
