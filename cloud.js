import {firebaseConfig} from './firebase-config.js';
const CONFIG_OK=!!(firebaseConfig?.apiKey && firebaseConfig.apiKey!=='REPLACE_ME' && firebaseConfig?.projectId && firebaseConfig.projectId!=='REPLACE_ME');
const ROLE_KEY='eyedrop-cloud-role',FAMILY_KEY='eyedrop-cloud-family';
const PENDING_RECORDS='eyedrop-cloud-pending-records-v18',PENDING_SETTINGS='eyedrop-cloud-pending-settings-v18';
const $=id=>document.getElementById(id),safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(k,defaultValue){try{return JSON.parse(localStorage.getItem(k))??defaultValue;}catch{return defaultValue;}}
let role=localStorage.getItem(ROLE_KEY)||'',familyId=localStorage.getItem(FAMILY_KEY)||'';
let pendingRecords=read(PENDING_RECORDS,{}),pendingSettings=read(PENDING_SETTINGS,null);
let auth,db,api,user,ready=false,unsubFamily,unsubRecords,flushPromise=null,refreshPromise=null,migrationPromise=null;
let gotFamily=false,gotRecords=false,lastServerCheck=0,lastError='',retryTimer=null,setupPromise=null;
let sendingSince=0,networkRecovering=false,lastSuccessAt=0,manualBusy=false;
function persist(){localStorage.setItem(PENDING_RECORDS,JSON.stringify(pendingRecords));if(pendingSettings)localStorage.setItem(PENDING_SETTINGS,JSON.stringify(pendingSettings));else localStorage.removeItem(PENDING_SETTINGS);}
function status(msg){window.eyeCloudStatus=msg;for(const id of ['cloud-status','cloud-summary']){const el=$(id);if(el)el.textContent=msg;}}
function statusFromSync(){const count=Object.keys(pendingRecords).length+(pendingSettings?1:0);
 if(count){const stalled=sendingSince&&Date.now()-sendingSince>12000?' · 서버 응답 지연':'';status(`클라우드 전송 대기 ${count}건${stalled}${lastError?' · '+lastError:''}`);return;}
 if(gotFamily&&gotRecords){status('클라우드 연결됨 · 서버 확인 '+new Date(lastServerCheck||Date.now()).toLocaleTimeString('ko-KR'));return;}
 status(user?'서버 연결 확인 중':'로그인 또는 기기 연결 대기');
}
function showError(err){lastError=String(err?.code||err?.message||err).slice(0,110);console.error('[eye cloud]',err);statusFromSync();if(!Object.keys(pendingRecords).length&&!pendingSettings)status('클라우드 오류: '+lastError);}
// Register event handlers BEFORE slow Firebase SDK imports or authentication restoration.
function queueRecord({key,value}){if(role!=='mother')return;pendingRecords={...read(PENDING_RECORDS,{}),...pendingRecords,[key]:!!value};persist();lastError='';statusFromSync();scheduleSend(0);}
function queueSettings({settings}){if(role!=='parent')return;pendingSettings=settings;persist();lastError='';statusFromSync();scheduleSend(0);}
window.addEventListener('eye-record-change',e=>queueRecord(e.detail));
window.addEventListener('eye-settings-change',e=>queueSettings(e.detail));
async function recoverNetwork(){if(networkRecovering||!db||!navigator.onLine)return;networkRecovering=true;try{await api.disableNetwork(db);await api.enableNetwork(db);lastError='네트워크 재연결 시도';}catch(ex){showError(ex);}finally{networkRecovering=false;statusFromSync();}}
function scheduleSend(delay=0){if(retryTimer)clearTimeout(retryTimer);retryTimer=setTimeout(()=>{retryTimer=null;flush().catch(showError);},delay);}
function panel(){const el=$('sync-ui');if(!el)return;
 if(!CONFIG_OK){el.innerHTML='<div class="warn">Firebase 설정이 없습니다. 기존 버전의 firebase-config.js를 복사해야 합니다. 기존 기록은 보존됩니다.</div>';return;}
 const logged=!!user,mode=role==='mother'?'어머니 A33':role==='parent'?'보호자 아이폰':'기기 선택 전';
 el.innerHTML=`<div class="sync-muted">역할: ${safe(mode)} · <span id="cloud-status">${safe(window.eyeCloudStatus||'준비 중')}</span></div>
 <div class="sync-block"><strong>기록 백업</strong><p class="sync-muted">연결 오류가 있어도 현재 기기의 기록을 보존합니다. 백업 파일은 공개하지 마세요.</p><button class="sync-button secondary" id="cloud-backup">현재 기기 기록 백업</button></div>
 ${!logged?`<div class="sync-block"><strong>어머니 기기 연결</strong><button class="sync-button" id="cloud-mother">어머니 기기 연결 시작</button></div><div class="sync-block"><strong>보호자 계정</strong><input class="sync-input" id="cloud-email" type="email" placeholder="이메일 주소"><input class="sync-input" id="cloud-pass" type="password" placeholder="비밀번호"><button class="sync-button" id="cloud-register">보호자 계정 만들기</button><button class="sync-button" id="cloud-login">기존 보호자 계정 로그인</button></div>`:''}
 ${logged?`<div class="sync-block"><p class="sync-muted">내 사용자 ID: <strong>${safe(user.uid)}</strong></p><button class="sync-button secondary" id="cloud-copy-uid">내 사용자 ID 복사</button>${role==='mother'?`<strong>보호자 연결 승인</strong><input class="sync-input" id="cloud-caregiver" placeholder="보호자 UID"><button class="sync-button" id="cloud-pair">보호자 연결 승인</button>`:`<strong>어머니 기록 연결</strong><input class="sync-input" id="cloud-family-id" placeholder="어머니 UID" value="${safe(familyId)}"><button class="sync-button" id="cloud-join">어머니 기록 연결</button>`}</div>`:''}
 ${logged?`<div class="sync-block"><strong>동기화 상태</strong><p class="sync-muted">전송 대기 건수: ${Object.keys(pendingRecords).length+(pendingSettings?1:0)}건 · 마지막 서버 확인: ${lastServerCheck?new Date(lastServerCheck).toLocaleString('ko-KR'):'아직 확인 전'}</p><button class="sync-button secondary" id="cloud-refresh">지금 동기화 확인·재시도</button>${role==='mother'?'<button class="sync-button secondary" id="cloud-migrate">기존 기록 누락 확인·재업로드</button>':''}</div>`:''}
 <p class="sync-muted">실제 서버 저장이 확인된 건만 전송 대기에서 사라집니다. 인터넷이 끊겨도 이 기기의 기록은 남지만, 다른 기기에서 보이기까지 지연될 수 있습니다.</p>`;
 el.onclick=async e=>{const id=e.target?.id;if(!id)return;try{
  if(id==='cloud-backup')backup();
  if(id==='cloud-mother')await startMother();
  if(id==='cloud-register'||id==='cloud-login')await parentAuth(id==='cloud-register');
  if(id==='cloud-copy-uid'){await navigator.clipboard.writeText(user.uid);status('사용자 ID 복사 완료');}
  if(id==='cloud-pair')await approveCaregiver($('cloud-caregiver').value.trim());
  if(id==='cloud-join')await joinFamily($('cloud-family-id').value.trim());
  if(id==='cloud-refresh')await manualSync();
  if(id==='cloud-migrate')await migrateRecords();
 }catch(ex){showError(ex);}}
}

// HTTP writes are intentionally independent of Firestore's offline queue. Local pending
// edits are the durable source of truth until an authenticated server response arrives.
function firestoreField(value){
 if(value===null||value===undefined)return {nullValue:null};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(typeof value==='string')return {stringValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(firestoreField)}};
 if(typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,firestoreField(v)]))}};
 throw Error('지원하지 않는 설정값');
}
const restPath=(...segments)=>'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(firebaseConfig.projectId)+'/databases/(default)/documents/'+segments.map(encodeURIComponent).join('/');
async function serverRequest(url,{method='GET',body,timeout=12000}={}){
 if(!auth?.currentUser)throw Error('인증 미완료: 로그인 상태를 확인하세요');
 const token=await auth.currentUser.getIdToken();
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const res=await fetch(url,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error('HTTP '+res.status+' '+String(data.error?.message||res.statusText).slice(0,140));
  return data;
 }catch(ex){if(ex.name==='AbortError')throw Error('서버 응답 시간 초과(12초): 인터넷 또는 Firebase 연결 확인');throw ex;}
 finally{clearTimeout(timer);}
}
async function serverWriteSettings(settings){
 const u=new URL(restPath('families',familyId));u.searchParams.append('updateMask.fieldPaths','settings');u.searchParams.append('updateMask.fieldPaths','updatedAt');
 return serverRequest(u.toString(),{method:'PATCH',body:{fields:{settings:firestoreField(settings),updatedAt:{timestampValue:new Date().toISOString()}}}});
}
async function serverWriteRecord(key,value){
 return serverRequest(restPath('families',familyId,'records',encodeURIComponent(key)),{method:'PATCH',body:{fields:{value:{booleanValue:!!value},updatedAt:{timestampValue:new Date().toISOString()}}}});
}
function showSyncHint(message){const el=$('manual-sync-status');if(el)el.textContent=message;}

function backup(){const blob=new Blob([JSON.stringify({version:'2.2',exportedAt:new Date().toISOString(),data:window.eyeBridge.exportBackup()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='eyedrop-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status('기록 백업 파일 생성됨');}
async function init(){if(!CONFIG_OK){status('Firebase 설정 필요');panel();return;}
 const [{initializeApp},{getAuth,onAuthStateChanged,signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword},{initializeFirestore,memoryLocalCache,doc,getDoc,getDocFromServer,getDocsFromServer,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp,disableNetwork,enableNetwork}]=await Promise.all([
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);
 const app=initializeApp(firebaseConfig);auth=getAuth(app);
 db=initializeFirestore(app,{localCache:memoryLocalCache()});
 api={signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword,doc,getDoc,getDocFromServer,getDocsFromServer,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp,disableNetwork,enableNetwork};
 onAuthStateChanged(auth,u=>{user=u;ready=false;panel();if(!u){status('로그인 또는 기기 연결 필요');return;}
  if(role==='mother'){familyId=u.uid;localStorage.setItem(FAMILY_KEY,familyId);window.eyeBridge.setRole('mother');setupMother().catch(showError);}
  else if(role==='parent'){window.eyeBridge.setRole('parent');if(familyId)subscribe();else status('로그인됨 · 어머니 연결 대기');}
  else status('기기 역할 선택 필요');
 });
 for(const type of ['pageshow','focus','online'])window.addEventListener(type,()=>resume());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
 // A fallback check also recovers from mobile browsers that silently suspend listeners.
 setInterval(()=>{if(!document.hidden&&navigator.onLine&&user&&familyId){if(sendingSince&&Date.now()-sendingSince>18000)showSyncHint('응답이 지연됩니다. 재연결 후 다시 시도하세요.');scheduleSend(0);if(!sendingSince)refreshFromServer().catch(showError);}},8000);
 status('Firebase 로그인 복원 중');panel();
}
async function setupMother(){if(!user||role!=='mother')return;if(setupPromise)return setupPromise;
 setupPromise=(async()=>{const ref=api.doc(db,'families',user.uid),doc=await api.getDoc(ref);
 if(!doc.exists())await api.setDoc(ref,{ownerUid:user.uid,caregiverUid:'',settings:window.eyeBridge.getSettings(),updatedAt:api.serverTimestamp()});
 subscribe();scheduleSend(0);
 // Only migrate after pending edits have had a chance to reach the server.
 flush().then(()=>{if(!Object.keys(pendingRecords).length)migrateRecords().catch(showError);}).catch(showError);})().finally(()=>setupPromise=null);return setupPromise;
}
async function startMother(){if(auth.currentUser&&role==='parent')throw Error('보호자 계정과 어머니 기기를 같은 브라우저에서 연결하지 마세요.');
 role='mother';localStorage.setItem(ROLE_KEY,role);pendingSettings=null;persist();window.eyeBridge.setRole('mother');
 if(!auth.currentUser){const x=await api.signInAnonymously(auth);user=x.user;}else user=auth.currentUser;
 familyId=user.uid;localStorage.setItem(FAMILY_KEY,familyId);await setupMother();panel();}
async function parentAuth(register){const email=$('cloud-email')?.value.trim(),pass=$('cloud-pass')?.value;if(!email||!pass)throw Error('이메일·비밀번호를 입력하세요.');
 const result=register?await api.createUserWithEmailAndPassword(auth,email,pass):await api.signInWithEmailAndPassword(auth,email,pass);
 role='parent';localStorage.setItem(ROLE_KEY,role);user=result.user;window.eyeBridge.setRole('parent');status('보호자 로그인 완료');panel();if(familyId)subscribe();}
async function approveCaregiver(uid){if(role!=='mother'||!user)throw Error('어머니 기기에서만 승인할 수 있습니다.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid)||uid===user.uid)throw Error('보호자 UID를 확인해 주세요.');
 await api.updateDoc(api.doc(db,'families',user.uid),{caregiverUid:uid,updatedAt:api.serverTimestamp()});status('보호자 승인 완료');}
async function joinFamily(uid){if(role!=='parent'||!user)throw Error('보호자 로그인 후 진행해 주세요.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid))throw Error('어머니 UID를 확인해 주세요.');
 const snap=await api.getDocFromServer(api.doc(db,'families',uid));if(!snap.exists()||snap.data().caregiverUid!==user.uid)throw Error('어머니 기기에서 보호자 승인 여부를 확인해 주세요.');
 familyId=uid;localStorage.setItem(FAMILY_KEY,uid);subscribe();panel();}
function subscribe(){if(!user||!familyId)return;
 if(unsubFamily)unsubFamily();if(unsubRecords)unsubRecords();gotFamily=false;gotRecords=false;
 const path=api.doc(db,'families',familyId);
 unsubFamily=api.onSnapshot(path,{includeMetadataChanges:true},snap=>{
  if(!snap.exists()){status('가족 문서를 찾을 수 없습니다.');return;}
  if(snap.data().settings&&!pendingSettings)window.eyeBridge.applySettings(snap.data().settings);
  gotFamily=!snap.metadata.fromCache;if(gotFamily)lastServerCheck=Date.now();statusFromSync();
 },showError);
 unsubRecords=api.onSnapshot(api.collection(db,'families',familyId,'records'),{includeMetadataChanges:true},snap=>{
  const records={};snap.docs.forEach(d=>{try{const k=decodeURIComponent(d.id);if(!(k in pendingRecords))records[k]=!!d.data().value;}catch{}});
  window.eyeBridge.applyDone(records,role==='parent');gotRecords=!snap.metadata.fromCache;if(gotRecords)lastServerCheck=Date.now();statusFromSync();
 },showError);
 ready=true;statusFromSync();scheduleSend(0);panel();
}
async function migrateRecords(){if(role!=='mother'||!user||!ready)return;if(migrationPromise)return migrationPromise;
 migrationPromise=(async()=>{
  // Missing true records only; a local pending false edit must never be overwritten by migration.
  const remote=await api.getDocsFromServer(api.collection(db,'families',user.uid,'records'));
  const existing=new Set(remote.docs.map(d=>d.id));
  const missing=Object.entries(window.eyeBridge.getDone()).filter(([k,v])=>v===true&&!existing.has(encodeURIComponent(k))&&!(k in pendingRecords));
  for(let i=0;i<missing.length;i+=200){const batch=api.writeBatch(db);for(const [k] of missing.slice(i,i+200))batch.set(api.doc(db,'families',user.uid,'records',encodeURIComponent(k)),{value:true,updatedAt:api.serverTimestamp()});await batch.commit();}
  if(missing.length)status('기존 기록 '+missing.length+'건 추가 업로드 완료');
 })().finally(()=>migrationPromise=null);return migrationPromise;
}
async function flush(){
 if(!ready||!user||!familyId||!navigator.onLine){statusFromSync();return false;}
 if(flushPromise)return flushPromise;
 pendingRecords={...read(PENDING_RECORDS,{}),...pendingRecords};
 if(role==='parent'&&!pendingSettings)pendingSettings=read(PENDING_SETTINGS,null);
 sendingSince=Date.now();
 flushPromise=(async()=>{
  let failed=false;
  try{
   if(role==='parent'&&pendingSettings){
    const value=pendingSettings;
    await serverWriteSettings(value);
    if(pendingSettings===value)pendingSettings=null;
    persist();lastSuccessAt=Date.now();
   }
   if(role==='mother')for(const [key,value] of Object.entries({...pendingRecords})){
    await serverWriteRecord(key,value);
    if(pendingRecords[key]===value)delete pendingRecords[key];
    persist();lastSuccessAt=Date.now();
   }
   lastError='';statusFromSync();return true;
  }catch(ex){failed=true;lastError=String(ex?.message||ex).slice(0,155);statusFromSync();showSyncHint('전송 실패: '+lastError);console.error('[eye cloud send]',ex);return false;
  }finally{
   sendingSince=0;flushPromise=null;
   if((Object.keys(pendingRecords).length||pendingSettings)&&navigator.onLine)scheduleSend(failed?12000:1000);
  }
 })();return flushPromise;
}
// Manual sync: send local changes first, then fetch latest from server.
async function manualSync(){
 if(manualBusy)return;
 if(!ready||!user||!familyId){showSyncHint('연결을 확인해 주세요. ☁ 연결 탭에서 로그인/기기 연결 상태를 확인하세요.');return;}
 if(!navigator.onLine){showSyncHint('인터넷에 연결되지 않았습니다. 기존 체크 기록은 기기에 보관됩니다.');return;}
 manualBusy=true;showSyncHint('서버에 전송하고 최신 정보를 확인하는 중…');
 try{
  const sent=await flush();
  if(sent===false&&Object.keys(pendingRecords).length+(pendingSettings?1:0)>0){showSyncHint('전송 대기 유지: '+(lastError||'서버 저장을 확인하지 못했습니다.'));return;}
  await refreshFromServer();
  const remaining=Object.keys(pendingRecords).length+(pendingSettings?1:0);
  showSyncHint(remaining?'전송 대기 '+remaining+'건':'동기화 완료 · 서버 확인 '+new Date().toLocaleTimeString('ko-KR'));
 }catch(ex){showError(ex);showSyncHint('동기화 실패: '+String(ex.message||ex).slice(0,150));}
 finally{manualBusy=false;statusFromSync();}
}
window.eyeCloudManualSync=manualSync;

function firestoreValue(v){
 if(!v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('timestampValue'in v)return v.timestampValue;
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(firestoreValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,firestoreValue(x)]));
 return null;
}
async function refreshFromServer(){
 if(!ready||!user||!familyId||!navigator.onLine||document.hidden)return;
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  const family=await serverRequest(restPath('families',familyId));
  if(family.fields?.settings&&!pendingSettings)window.eyeBridge.applySettings(firestoreValue(family.fields.settings));
  const records={};let nextToken='';let count=0;
  do{
   const url=new URL(restPath('families',familyId,'records'));url.searchParams.set('pageSize','300');
   if(nextToken)url.searchParams.set('pageToken',nextToken);
   const page=await serverRequest(url.toString());
   for(const d of page.documents||[]){
    try{const raw=d.name.split('/').pop();const key=decodeURIComponent(decodeURIComponent(raw));if(!(key in pendingRecords))records[key]=!!firestoreValue(d.fields?.value);}catch{}
   }
   nextToken=page.nextPageToken||'';count++;if(count>30)throw Error('기록 조회량이 많아 확인을 중단했습니다.');
  }while(nextToken);
  window.eyeBridge.applyDone(records,role==='parent');
  gotFamily=true;gotRecords=true;lastServerCheck=Date.now();lastError='';statusFromSync();
 })().finally(()=>{refreshPromise=null;});return refreshPromise;
}

function resume(){if(!user||!familyId||!navigator.onLine||document.hidden)return;
 // Re-establish subscriptions when browsers resume after a frozen/backgrounded PWA.
 if(!ready){if(role==='mother')setupMother().catch(showError);else if(role==='parent')subscribe();return;}
 scheduleSend(0);refreshFromServer().catch(showError);
}
window.addEventListener('eye-sync-panel',panel);
init().catch(showError);
