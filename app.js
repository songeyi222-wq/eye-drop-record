 'use strict';
const KEY='eyedrop-record-pwa-v06',OLD='eyedrop-record-pwa-v05'; // v0.7: keep existing saved records
const DEFAULT={eyes:{left:{start:'2026-11-07',visit:'2026-11-10T08:00',enabled:true},right:{start:'2026-11-07',visit:'2026-11-11T11:00',enabled:true}},sessions:'07:00,12:00,15:00,21:00',dStart:'06:30',drugSessions:{A:[0,1,2,3],B:[0,1,2,3],C:[0,3]},done:{}};
const clone=x=>JSON.parse(JSON.stringify(x)),pad=n=>String(n).padStart(2,'0'),dayOf=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
let state=clone(DEFAULT);try{const s=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(OLD)||'null');if(s&&s.eyes)state={...state,eyes:{left:{...DEFAULT.eyes.left,...s.eyes.left},right:{...DEFAULT.eyes.right,...s.eyes.right}},done:s.done||{},drugSessions:{...DEFAULT.drugSessions,...s.drugSessions}};}catch{}
// 이전 기록은 보존하지만 새로운 기본 시간표를 우선 적용한다.
state.sessions=DEFAULT.sessions;state.dStart=DEFAULT.dStart;
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));save();
let selected=dayOf(new Date()),tab='today';
const eyeNames={left:'왼쪽 눈',right:'오른쪽 눈'},colors={A:'#eaf0ff',B:'#f1ebff',C:'#fff0e6',D:'#e3f5f0'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(new Date(d+'T12:00:00'));
const minutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
const timeOf=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
function activeEye(day,eye,time){const c=state.eyes[eye];if(!c.enabled||day<c.start||day>c.visit.slice(0,10))return false;return day!==c.visit.slice(0,10)||time<c.visit.slice(11,16);}
function doses(day){
 const out=[],slots=state.sessions.split(',');
 for(let i=0;i<slots.length;i++)for(const [drug,offset] of [['A',0],['B',10],['C',20]]){
  if(!state.drugSessions[drug].includes(i))continue;
  const time=timeOf(minutes(slots[i])+offset);
  out.push({drug,time,eyes:Object.keys(eyeNames).filter(e=>activeEye(day,e,time)),slot:i,color:colors[drug]});
 }
 for(const eye of Object.keys(eyeNames)){
  const c=state.eyes[eye];if(!c.enabled||day!==c.visit.slice(0,10))continue;
  const end=minutes(c.visit.slice(11,16));
  for(let n=minutes(state.dStart);n<end;n+=30)out.push({drug:'D',time:timeOf(n),eyes:[eye],slot:n,color:colors.D});
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
 return header+`<div class="dose two-eyes"><span class="letter" style="background:${d.color}">${d.drug}</span><span class="details"><strong>${d.drug} 안약</strong><small>${d.time}${d.drug==='D'?' · 수술 당일':''}</small></span><div class="eye-checks">${boxes}</div></div>`;
 }).join('');}
function today(){const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 let html=datebar()+status()+`<div class="card"><div class="section-title">점안 현황</div><div class="stat">${done} / ${cells.length}회 완료</div><div class="track"><div class="fill" style="width:${cells.length?done/cells.length*100:0}%"></div></div><div class="note">왼쪽·오른쪽 눈을 각각 체크하세요. 회색 체크박스는 해당 눈의 점안 대상이 아닙니다.</div></div>`;
 return html+(items.length?checklist(items):'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
function history(){const items=doses(selected),cells=allCells(items),done=cells.filter(({d,e})=>isDone(d,e)).length;
 return datebar()+status()+`<div class="card"><div class="section-title">날짜별 점안 기록</div><div class="stat">${done} / ${cells.length}회 완료</div><div class="note">좌안과 우안 기록은 각각 독립적으로 저장됩니다. 체크 수정은 ‘오늘’ 탭에서 가능합니다.</div></div>`+(items.length?checklist(items):'<div class="card empty">이 날짜에 표시할 안약 일정이 없습니다.</div>');
}
function settings(){return `<form id="settings-form"><div class="card"><div class="section-title">눈별 수술 일정</div>${Object.entries(eyeNames).map(([e,name])=>`<div class="eye-settings"><strong>${name}</strong><div class="field"><label><input type="checkbox" id="${e}-enabled" ${state.eyes[e].enabled?'checked':''}> 일정 사용</label></div><div class="field"><label for="${e}-start">A·B·C 점안 시작일</label><input type="date" id="${e}-start" value="${esc(state.eyes[e].start)}" required></div><div class="field"><label for="${e}-visit">수술 당일 내원 일시</label><input type="datetime-local" id="${e}-visit" value="${esc(state.eyes[e].visit)}" required></div></div>`).join('')}</div><div class="card"><div class="section-title">A·B·C 기본 시간 (고정)</div><div class="fixed-times">07:00 · 12:00 · 15:00 · 21:00</div><p class="note">A 기준 시각입니다. B는 10분 뒤, C는 20분 뒤입니다. C는 아침과 저녁(21시 회차)에만 표시됩니다.</p><div class="section-title">D 안약 · 수술 당일만</div><div class="fixed-times">06:30 시작 · 30분 간격</div><p class="note">각 눈의 수술 당일에만 표시하고, 설정한 내원 시각 이전까지만 기록 항목을 생성합니다.</p><div class="warn">중요: 병원 안내문에는 D 안약을 내원 1시간 전부터 사용한다고 적혀 있습니다. 오전 6:30부터의 일정은 요청하신 테스트 설정이며, 특히 오른쪽 눈(오전 11시 내원)은 병원에 시작 시각과 횟수를 확인한 뒤 실제 점안에 사용하세요. 이 앱은 알림이 없는 기록용입니다.</div><button type="submit" class="button">설정 저장</button></div></form>`;}
function render(){document.querySelector('#title').textContent=tab==='today'?'오늘의 안약':tab==='history'?'점안 기록':'일정 설정';document.querySelector('#subtitle').textContent=tab==='settings'?'눈별 날짜와 수술 일정을 설정해요':'왼쪽·오른쪽 눈을 각각 체크해요';document.querySelector('#content').innerHTML=tab==='today'?today():tab==='history'?history():settings();document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));}
document.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();return;}if(e.target.id==='go-today'){selected=dayOf(new Date());render();}});
document.addEventListener('change',e=>{if(e.target.id==='day'){selected=e.target.value;render();}if(e.target.matches('input[data-index][data-eye]')){const d=doses(selected)[Number(e.target.dataset.index)],eye=e.target.dataset.eye;if(d&&eligible(d,eye)){state.done[doseKey(d,eye)]=e.target.checked;save();render();}}});
document.addEventListener('submit',e=>{if(e.target.id!=='settings-form')return;e.preventDefault();for(const eye of Object.keys(eyeNames))state.eyes[eye]={start:document.getElementById(eye+'-start').value,visit:document.getElementById(eye+'-visit').value,enabled:document.getElementById(eye+'-enabled').checked};save();alert('설정이 저장되었습니다.');render();});
render();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
