import {firebaseConfig} from './firebase-config.js';
const CONFIG_OK=!!(firebaseConfig?.apiKey && firebaseConfig.apiKey!=='REPLACE_ME' && firebaseConfig?.projectId && firebaseConfig.projectId!=='REPLACE_ME');
const ROLE_KEY='eyedrop-cloud-role',FAMILY_KEY='eyedrop-cloud-family';
const PENDING_RECORDS='eyedrop-cloud-pending-records-v18',PENDING_SETTINGS='eyedrop-cloud-pending-settings-v18';
let role=localStorage.getItem(ROLE_KEY)||'',familyId=localStorage.getItem(FAMILY_KEY)||'';
let auth,db,user,familyRef,unsubFamily,unsubRecords,api,ready=false,migrationPromise=null,flushPromise=null;
let pendingRecords=read(PENDING_RECORDS,{}),pendingSettings=read(PENDING_SETTINGS,null);
let listenFamily=false,listenRecords=false;
const $=id=>document.getElementById(id);
function read(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value??fallback;}catch{return fallback;}}
function persist(){localStorage.setItem(PENDING_RECORDS,JSON.stringify(pendingRecords));if(pendingSettings)localStorage.setItem(PENDING_SETTINGS,JSON.stringify(pendingSettings));else localStorage.removeItem(PENDING_SETTINGS);}
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(message){window.eyeCloudStatus=message;const el=$('cloud-status');if(el)el.textContent=message;const summary=$('cloud-summary');if(summary)summary.textContent=message;}
function error(e){console.error(e);status('오류: '+(e?.code||e?.message||String(e)));}
function panel(){const target=$('sync-ui');if(!target)return;
 if(!CONFIG_OK){target.innerHTML='<div class="warn">Firebase 설정이 없습니다. 기존 v1.7에서 사용했던 firebase-config.js를 v1.8 폴더로 복사해야 연결됩니다. 기존 로컬 기록은 유지됩니다.</div>';return;}
 const logged=!!user,state=role==='mother'?'어머니 A33':role==='parent'?'보호자 아이폰':'역할 선택 전';
 target.innerHTML=`<div class="sync-muted">역할: ${safe(state)} · <span id="cloud-status">${safe(window.eyeCloudStatus||'대기')}</span></div>
 <div class="sync-block"><strong>기록 보호</strong><p class="sync-muted">현재 휴대폰의 기존 설정과 점안 기록을 JSON 파일로 보관할 수 있습니다. 파일은 외부에 공개하지 마세요.</p><button class="sync-button secondary" id="cloud-backup">현재 기기 기록 백업</button></div>
 ${!logged?`<div class="sync-block"><strong>어머니 A33 — 최초 1회 연결</strong><button class="sync-button" id="cloud-mother">어머니 기기 연결 시작</button><p class="sync-muted">익명 인증을 사용합니다. 앱/브라우저 데이터를 삭제하면 이 연결이 복구되지 않을 수 있습니다.</p></div><div class="sync-block"><strong>보호자 아이폰 — 계정 생성 또는 로그인</strong><input class="sync-input" type="email" id="cloud-email" placeholder="이메일 주소"><input class="sync-input" type="password" id="cloud-pass" placeholder="비밀번호 (6자 이상)"><button class="sync-button" id="cloud-register">보호자 계정 만들기</button><button class="sync-button" id="cloud-login">기존 보호자 계정 로그인</button></div>`:''}
 ${logged?`<div class="sync-block"><p class="sync-muted">내 사용자 ID: <strong>${safe(user.uid)}</strong></p><button class="sync-button secondary" id="cloud-copy-uid">내 사용자 ID 복사</button>${role==='mother'?`<strong>보호자 연결 승인</strong><input class="sync-input" id="cloud-caregiver" placeholder="아이폰에서 복사한 보호자 UID"><button class="sync-button" id="cloud-pair">보호자 연결 승인</button>`:`<strong>어머니 기록 연결</strong><input class="sync-input" id="cloud-family-id" placeholder="어머니 A33 사용자 UID" value="${safe(familyId)}"><button class="sync-button" id="cloud-join">어머니 기록 연결</button>`}</div>`:''}
 ${logged&&role==='mother'?`<div class="sync-block"><strong>기록 전송 상태</strong><p class="sync-muted">처음 연결하면 이미 체크한 점안 기록을 전송합니다. 누락이나 네트워크 오류가 있다면 재시도하세요. 기기 안 기록은 삭제하지 않습니다.</p><button class="sync-button secondary" id="cloud-retry">기존 기록 업로드 확인·재시도</button></div>`:''}
 <p class="sync-muted">☁ 연결됨이 표시되고 실제 두 기기의 체크 항목이 일치해야 연결 완료입니다. 인터넷이 없을 때 변경 사항은 이 기기에 보관되며 연결 복구 후 재전송을 시도합니다.</p>`;
 target.onclick=async e=>{const id=e.target?.id;if(!id)return;try{
  if(id==='cloud-backup')backup();
  if(id==='cloud-mother')await startMother();
  if(id==='cloud-register'||id==='cloud-login')await parentAuth(id==='cloud-register');
  if(id==='cloud-copy-uid'){if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(user.uid);else throw Error('UID를 길게 눌러 복사해 주세요.');status('사용자 ID 복사 완료');}
  if(id==='cloud-pair')await approveCaregiver($('cloud-caregiver').value.trim());
  if(id==='cloud-join')await joinFamily($('cloud-family-id').value.trim());
  if(id==='cloud-retry')await ensureMotherAndSubscribe(true);
 }catch(ex){error(ex);}}
}
function backup(){const blob=new Blob([JSON.stringify({version:'1.8',exportedAt:new Date().toISOString(),data:window.eyeBridge.exportBackup()},null,2)],{type:'application/json'});const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download='eyedrop-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status('기기 내 기록 백업 파일 생성됨');}
function queueRecord(detail){pendingRecords[detail.key]=!!detail.value;persist();status('기기에 저장됨 · 클라우드 전송 대기');if(ready)flush().catch(error);}
function queueSettings(detail){pendingSettings=detail.settings;persist();status('설정 저장됨 · 클라우드 전송 대기');if(ready)flush().catch(error);}
async function init(){if(!CONFIG_OK){status('Firebase 설정 필요');panel();return;}
 const [{initializeApp},{getAuth,onAuthStateChanged,signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword},{initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,getDoc,getDocsFromServer,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp}]=await Promise.all([
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
 api={signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword,doc,getDoc,getDocsFromServer,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp};
 window.addEventListener('eye-record-change',e=>{if(role==='mother')queueRecord(e.detail);});
 window.addEventListener('eye-settings-change',e=>{if(role==='mother'||role==='parent')queueSettings(e.detail);});
 window.addEventListener('online',()=>{if(role==='mother')ensureMotherAndSubscribe().catch(error);else flush().catch(error);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user){if(role==='mother')ensureMotherAndSubscribe().catch(error);else flush().catch(error);}});
 onAuthStateChanged(auth,async u=>{user=u;panel();if(!u){ready=false;status('로그인 또는 기기 연결이 필요합니다.');return;}
  try{if(role==='mother'){familyId=u.uid;localStorage.setItem(FAMILY_KEY,familyId);await ensureMotherAndSubscribe();}
   else if(role==='parent'&&familyId){await subscribe();}
   else status('로그인됨 · 기기 연결 대기');}catch(ex){error(ex);}
 });
 status('연결 기능 로드됨');panel();
}
async function migrateExistingRecords(){if(role!=='mother'||!user)return;
 const ref=api.doc(db,'families',user.uid);const family=await api.getDoc(ref);
 if(!family.exists())await api.setDoc(ref,{ownerUid:user.uid,caregiverUid:'',settings:window.eyeBridge.getSettings(),updatedAt:api.serverTimestamp()});
 // Always check the remote collection; a previous partial upload must be recoverable.
 const remote=await api.getDocsFromServer(api.collection(db,'families',user.uid,'records'));
 const existing=new Set(remote.docs.map(x=>x.id));
 const local=Object.entries(window.eyeBridge.getDone()).filter(([key,value])=>!!value && !existing.has(encodeURIComponent(key)) && !(key in pendingRecords));
 status('기존 점안 기록 확인 중 · 미전송 '+local.length+'건');
 for(let i=0;i<local.length;i+=300){const batch=api.writeBatch(db);for(const [key,value] of local.slice(i,i+300))batch.set(api.doc(db,'families',user.uid,'records',encodeURIComponent(key)),{value:!!value,updatedAt:api.serverTimestamp()});await batch.commit();}
 status('기존 기록 확인 완료 · 추가 전송 '+local.length+'건');
}
async function ensureMotherAndSubscribe(force=false){if(role!=='mother'||!user)return;if(migrationPromise)return migrationPromise;
 migrationPromise=(async()=>{ready=false;try{await migrateExistingRecords();await subscribe(force);await flush();}catch(e){status('기록 동기화 확인 실패 · 연결 탭에서 재시도 가능');throw e;}finally{migrationPromise=null;}})();return migrationPromise;
}
async function startMother(){if(!auth)throw Error('Firebase 설정이 필요합니다.');if(auth.currentUser&&role==='parent')throw Error('보호자 로그인된 브라우저에서는 어머니 연결을 시작할 수 없습니다.');
 role='mother';localStorage.setItem(ROLE_KEY,role);
 if(!auth.currentUser){const result=await api.signInAnonymously(auth);user=result.user;}else user=auth.currentUser;
 familyId=user.uid;localStorage.setItem(FAMILY_KEY,familyId);await ensureMotherAndSubscribe();panel();}
async function parentAuth(register){const email=$('cloud-email').value.trim(),pass=$('cloud-pass').value;if(!email||!pass)throw Error('이메일과 비밀번호를 입력하세요.');
 const result=register?await api.createUserWithEmailAndPassword(auth,email,pass):await api.signInWithEmailAndPassword(auth,email,pass);
 user=result.user;role='parent';localStorage.setItem(ROLE_KEY,role);window.eyeBridge.setRole('parent');status('로그인됨 · 어머니 기기에서 내 UID 승인 필요');panel();}
async function approveCaregiver(uid){if(role!=='mother'||!user)throw Error('어머니 기기에서만 승인할 수 있습니다.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid)||uid===user.uid)throw Error('보호자 UID를 확인해 주세요.');
 await api.updateDoc(api.doc(db,'families',user.uid),{caregiverUid:uid,updatedAt:api.serverTimestamp()});status('보호자 승인 완료 · 아이폰에 어머니 UID를 입력하세요.');}
async function joinFamily(uid){if(role!=='parent'||!user)throw Error('보호자 계정으로 로그인해 주세요.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid))throw Error('어머니 UID를 확인해 주세요.');
 const ref=api.doc(db,'families',uid),snap=await api.getDoc(ref);if(!snap.exists()||snap.data().caregiverUid!==user.uid)throw Error('A33에서 보호자 승인 여부를 확인해 주세요.');
 familyId=uid;localStorage.setItem(FAMILY_KEY,uid);await subscribe();panel();}
async function subscribe(){if(!user||!familyId)return;ready=false;listenFamily=false;listenRecords=false;
 if(unsubFamily)unsubFamily();if(unsubRecords)unsubRecords();
 familyRef=api.doc(db,'families',familyId);status('클라우드 연결 중…');
 unsubFamily=api.onSnapshot(familyRef,{includeMetadataChanges:true},snap=>{if(!snap.exists()){status('가족 데이터가 없습니다.');return;}
   if(snap.data().settings&&!pendingSettings)window.eyeBridge.applySettings(snap.data().settings);
   listenFamily=!snap.metadata.fromCache;updateConnectedStatus();
 },error);
 unsubRecords=api.onSnapshot(api.collection(db,'families',familyId,'records'),{includeMetadataChanges:true},snapshot=>{
  const result={};snapshot.docs.forEach(doc=>{try{const key=decodeURIComponent(doc.id);if(!(key in pendingRecords))result[key]=!!doc.data().value;}catch{}});
  window.eyeBridge.applyDone(result,role==='parent');listenRecords=!snapshot.metadata.fromCache;updateConnectedStatus();
 },error);
 window.eyeBridge.setRole(role);panel();ready=true;}
function updateConnectedStatus(){if(listenFamily&&listenRecords){const count=Object.keys(pendingRecords).length+(pendingSettings?1:0);status(count?'클라우드 연결됨 · 전송 대기 '+count+'건':'클라우드 연결됨 · '+new Date().toLocaleTimeString('ko-KR')+' 확인');}else status('로컬 기록 표시 중 · 서버 연결 확인 중');}
async function flush(){if(!ready||!user||!familyId||!navigator.onLine)return;if(flushPromise)return flushPromise;
 flushPromise=(async()=>{try{
  // Keep pending edits on device until each server write succeeds.
  if(pendingSettings){const value=pendingSettings;await api.updateDoc(api.doc(db,'families',familyId),{settings:value,updatedAt:api.serverTimestamp()});if(pendingSettings===value)pendingSettings=null;persist();}
  for(const [key,value] of Object.entries({...pendingRecords})){
    await api.setDoc(api.doc(db,'families',familyId,'records',encodeURIComponent(key)),{value,updatedAt:api.serverTimestamp()});
    if(pendingRecords[key]===value)delete pendingRecords[key];persist();
  }
  updateConnectedStatus();
 }catch(e){status('전송 대기 중 · 네트워크/권한 확인 필요');console.error(e);}finally{flushPromise=null;}})();return flushPromise;}
window.addEventListener('eye-sync-panel',panel);
init().catch(error);
