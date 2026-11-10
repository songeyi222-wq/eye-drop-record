import {firebaseConfig} from './firebase-config.js';
const good=!!(firebaseConfig?.apiKey&&firebaseConfig.apiKey!=='REPLACE_ME'&&firebaseConfig?.projectId&&firebaseConfig.projectId!=='REPLACE_ME');
let auth,db,user,role=localStorage.getItem('eyedrop-cloud-role')||'',familyId=localStorage.getItem('eyedrop-cloud-family')||'',familyRef,unsubFamily,unsubRecords,busy=false;
let api=null;
const $=id=>document.getElementById(id);
const status=(s)=>{window.eyeCloudStatus=s; const el=$('cloud-status');if(el)el.textContent=s;};
const err=e=>{console.error(e);status('오류: '+(e?.code||e?.message||e));};
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function panel(){const target=$('sync-ui');if(!target)return;
 if(!good){target.innerHTML='<div class="warn">Firebase 설정이 아직 없습니다. 배포 전 firebase-config.js를 채우고 firestore.rules를 배포해야 합니다. 앱의 기존 로컬 기록은 계속 사용할 수 있습니다.</div>';return;}
 const logged=!!user;const state=role==='mother'?'어머니 A33':role==='parent'?'보호자 아이폰':'역할 선택 전';
 target.innerHTML=`<div class="sync-muted">역할: ${safe(state)} · <span id="cloud-status">${safe(window.eyeCloudStatus||'대기')}</span></div>
 ${!logged?`<div class="sync-block"><strong>어머니 A33 — 최초 1회 연결</strong><button class="sync-button" id="cloud-mother">어머니 기기 연결 시작</button><p class="sync-muted">익명 인증을 사용합니다. 앱/브라우저 데이터를 삭제하면 이 연결이 복구되지 않을 수 있어요.</p></div><div class="sync-block"><strong>보호자 아이폰 — 계정 생성 또는 로그인</strong><input class="sync-input" type="email" id="cloud-email" placeholder="이메일 주소"><input class="sync-input" type="password" id="cloud-pass" placeholder="비밀번호 (6자 이상)"><button class="sync-button" id="cloud-register">보호자 계정 만들기</button><button class="sync-button" id="cloud-login">기존 보호자 계정 로그인</button></div>`:``}
 ${logged?`<div class="sync-block"><div class="sync-muted">내 사용자 ID: <strong id="my-uid">${safe(user.uid)}</strong></div><button class="sync-button" id="cloud-copy-uid">내 사용자 ID 복사</button>${role==='mother'?`<strong>보호자에게 읽기·설정 권한 부여</strong><input class="sync-input" id="cloud-caregiver" placeholder="아이폰에서 복사한 보호자 사용자 ID"><button class="sync-button" id="cloud-pair">보호자 연결 승인</button><p class="sync-muted">승인 후 보호자 아이폰에서 아래 어머니 ID로 연결합니다.</p>`:`<strong>어머니 기기 연결</strong><input class="sync-input" id="cloud-family-id" placeholder="어머니 A33 사용자 ID" value="${safe(familyId)}"><button class="sync-button" id="cloud-join">어머니 기록 연결</button>`}</div>`:``}
 <div class="sync-muted">동기화는 인터넷과 Firebase 보안 규칙이 설정되어야 작동합니다. 완료 여부는 ‘연결됨’으로 표시된 후 양쪽에서 확인해 주세요.</div>`;
 target.onclick=async e=>{const id=e.target.id;if(!id)return;try{
  if(id==='cloud-mother')await startMother();
  if(id==='cloud-register'||id==='cloud-login')await parentAuth(id==='cloud-register');
  if(id==='cloud-copy-uid')await navigator.clipboard.writeText(user.uid).then(()=>status('사용자 ID 복사 완료'));
  if(id==='cloud-pair')await approveCaregiver($('cloud-caregiver').value.trim());
  if(id==='cloud-join')await joinFamily($('cloud-family-id').value.trim());
 }catch(e){err(e)} };
}
async function init(){if(!good){status('Firebase 설정 필요');panel();return;}
 const [{initializeApp},{getAuth,onAuthStateChanged,signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword},{initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,getDoc,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp}]=await Promise.all([
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'),
 import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js')]);
 const app=initializeApp(firebaseConfig);auth=getAuth(app);db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
 api={signInAnonymously,createUserWithEmailAndPassword,signInWithEmailAndPassword,doc,getDoc,setDoc,updateDoc,collection,writeBatch,onSnapshot,serverTimestamp};
 onAuthStateChanged(auth,async u=>{user=u;panel();if(u&&role&&familyId){if(role==='mother'&&familyId===u.uid)await subscribe();else if(role==='parent')await subscribe();}else if(u&&role==='mother'&&!familyId){familyId=u.uid;localStorage.setItem('eyedrop-cloud-family',familyId);await createMotherFamily();await subscribe();}else if(u)status('연결 대기');});
 window.addEventListener('eye-record-change',async e=>{if(role!=='mother'||!familyRef||!user)return;try{await api.setDoc(api.doc(db,'families',familyId,'records',encodeURIComponent(e.detail.key)),{value:!!e.detail.value,updatedAt:api.serverTimestamp()});status('기록 동기화됨')}catch(ex){err(ex)}});
 window.addEventListener('eye-settings-change',async e=>{if(!familyRef||!user||!['mother','parent'].includes(role))return;try{await api.updateDoc(familyRef,{settings:e.detail.settings,updatedAt:api.serverTimestamp()});status('설정 동기화됨')}catch(ex){err(ex)}});
}
async function createMotherFamily(){const ref=api.doc(db,'families',user.uid);const snap=await api.getDoc(ref);if(!snap.exists()){
 await api.setDoc(ref,{ownerUid:user.uid,caregiverUid:'',settings:window.eyeBridge.getSettings(),updatedAt:api.serverTimestamp()});
 // Cloud was empty: migrate only records already checked on A33. No local data is deleted.
 const records=Object.entries(window.eyeBridge.getDone()).filter(([,v])=>!!v);
 for(let j=0;j<records.length;j+=350){const batch=api.writeBatch(db);for(const [key,val] of records.slice(j,j+350))batch.set(api.doc(db,'families',user.uid,'records',encodeURIComponent(key)),{value:!!val,updatedAt:api.serverTimestamp()});await batch.commit();}
 status('기존 체크 기록 '+records.length+'건 업로드 완료');
 }}
async function startMother(){if(!auth)throw Error('Firebase를 먼저 설정하세요.');if(auth.currentUser&&role==='parent')throw Error('보호자 로그인 상태입니다. 다른 브라우저/기기에서 어머니 연결을 시작하세요.');
 role='mother';localStorage.setItem('eyedrop-cloud-role',role);
 if(!auth.currentUser){const r=await api.signInAnonymously(auth);user=r.user;}else user=auth.currentUser;
 familyId=user.uid;localStorage.setItem('eyedrop-cloud-family',familyId);await createMotherFamily();await subscribe();panel();}
async function parentAuth(register){const email=$('cloud-email').value.trim(),pass=$('cloud-pass').value;if(!email||!pass)throw Error('이메일과 비밀번호를 입력하세요.');
 const r=register?await api.createUserWithEmailAndPassword(auth,email,pass):await api.signInWithEmailAndPassword(auth,email,pass);
 user=r.user;role='parent';localStorage.setItem('eyedrop-cloud-role',role);window.eyeBridge.setRole('parent');status('로그인 완료 — 어머니 기기에서 내 사용자 ID 승인 필요');panel();}
async function approveCaregiver(uid){if(role!=='mother')throw Error('어머니 기기에서만 승인할 수 있습니다.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid)||uid===user.uid)throw Error('보호자 사용자 ID를 정확히 입력하세요.');
 await api.updateDoc(api.doc(db,'families',user.uid),{caregiverUid:uid,updatedAt:api.serverTimestamp()});status('보호자 연결 승인 완료');}
async function joinFamily(uid){if(role!=='parent')throw Error('보호자 계정으로 로그인해 주세요.');if(!/^[A-Za-z0-9]{15,128}$/.test(uid))throw Error('어머니 사용자 ID를 확인해 주세요.');
 // Confirm permission BEFORE saving or activating sharing.
 const ref=api.doc(db,'families',uid),snap=await api.getDoc(ref);if(!snap.exists()||snap.data().caregiverUid!==user.uid)throw Error('어머니 A33에서 보호자 ID 연결 승인이 필요합니다.');
 familyId=uid;localStorage.setItem('eyedrop-cloud-family',uid);await subscribe();panel();}
async function subscribe(){if(!user||!familyId)return;
 if(unsubFamily)unsubFamily();if(unsubRecords)unsubRecords();
 familyRef=api.doc(db,'families',familyId);status('연결 중…');
 unsubFamily=api.onSnapshot(familyRef,s=>{if(!s.exists()){status('연결된 가족 데이터가 없습니다.');return;}
 const data=s.data();if(data?.settings){window.eyeBridge.applySettings(data.settings);}
 status('설정 연결됨 · '+new Date().toLocaleTimeString('ko-KR'));
 },err);
 unsubRecords=api.onSnapshot(api.collection(db,'families',familyId,'records'),snapshot=>{
 const result={};snapshot.docs.forEach(x=>{try{result[decodeURIComponent(x.id)]=!!x.data().value;}catch{}});
 window.eyeBridge.applyDone(result);status('기록 연결됨 · '+new Date().toLocaleTimeString('ko-KR'));
 },err);
 window.eyeBridge.setRole(role);panel();}
window.addEventListener('eye-sync-panel',panel);
init().catch(err);
