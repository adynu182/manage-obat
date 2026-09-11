// app.js
// Diekstrak dari index.html — Pantau Obat (Dashboard Stok Obat)
// Modul ini menggunakan Firebase (Auth + Firestore). window.FIREBASE_CONFIG
// harus sudah didefinisikan lebih dulu oleh firebase-config.js sebelum file ini dimuat.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot, increment,
  collection, addDoc, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if(!firebaseConfig){
  document.body.innerHTML = '<div style="padding:28px;font-family:system-ui,sans-serif;line-height:1.5;color:#142523">'
    + '<h2 style="margin:0 0 8px">Konfigurasi Firebase tidak ditemukan</h2>'
    + '<p>File <code>firebase-config.js</code> belum ada di folder yang sama dengan halaman ini, atau belum berisi <code>window.FIREBASE_CONFIG</code>.</p>'
    + '<p>Salin <code>firebase-config.example.js</code> menjadi <code>firebase-config.js</code>, isi dengan config project Firebase Anda, lalu muat ulang halaman.</p>'
    + '</div>';
  throw new Error('Missing window.FIREBASE_CONFIG — buat file firebase-config.js');
}
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* ---------------- multi-user state ----------------
 * Setiap akun yang masuk (email & kata sandi) punya data sendiri di Firestore,
 * disimpan di bawah users/{uid}/... Tidak ada data obat/jadwal bawaan (default) --
 * setiap akun baru mulai dari kosong dan mengisi sendiri daftar obatnya.
 */
let uid = null;
function userDoc(...segments){ return doc(db, 'users', uid, ...segments); }
function userCollection(...segments){ return collection(db, 'users', uid, ...segments); }

const COLORS = { ok:'#1d8a5f', warn:'#b8790f', bad:'#c6483d', border:'#e3ebe7', ink:'#142523', inkSoft:'#5b6b67' };

const ICONS = {
  sunrise:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 18h16"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 8v3"/><path d="M8.5 9.5 10 11"/><path d="M15.5 9.5 14 11"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.1"/><path d="M12 3v2.3M12 18.7V21M4.2 12H2M22 12h-2.2M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M5.6 18.4l1.5-1.5M16.9 7.1l1.5-1.5"/></svg>',
  sunset:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 18h16"/><path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 6v4"/><path d="m9 8 1.5 1.5"/><path d="m15 8-1.5 1.5"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.2 14.2c-.5 3.9-3.9 6.9-7.9 6.9-4.4 0-8-3.6-8-8 0-4 3-7.3 6.9-7.9.5-.1.9.4.6.8-.7 1.1-1.1 2.4-1.1 3.7 0 3.9 3.2 7.1 7.1 7.1 1.3 0 2.6-.4 3.7-1.1.4-.3.9.1.7.5Z"/></svg>',
};
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
const DAYS_SHORT=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const DAYS=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const SCHEDULE_EPOCH = '2026-09-05'; // fallback "mulai berlaku" untuk data lama yang belum punya tanggal

/* ---------------- state ---------------- */
const state = { stock:null, log:null, medDefs:null, schedule:null, notes:null, date: toDateStr(new Date()) };
let unsubLog = null;
let currentPage = 'jadwal';
let restockKeysSig = '';

/* ---------------- helpers ---------------- */
function toDateStr(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function humanDate(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  return DAYS[dt.getDay()]+', '+d+' '+MONTHS[m-1]+' '+y;
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/** Format jumlah obat untuk ditampilkan -- 0.5 jadi "½", 1.5 jadi "1½", dst,
 *  supaya dosis setengah tablet terbaca alami (bukan "0.5" mentah). */
function formatQty(n){
  if(n==null || isNaN(n)) return '0';
  const rounded = Math.round(n*100)/100;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded-whole)*100)/100;
  if(frac===0) return String(whole);
  if(frac===0.5) return (whole>0 ? whole+'½' : '½');
  return String(rounded);
}
function slugify(name){
  let base=String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return base || 'obat';
}
function uniqueKey(base, existingKeys){
  let key=base, i=1;
  while(existingKeys.includes(key)){ i++; key=base+'_'+i; }
  return key;
}
function iconForTime(hhmm){
  const h=parseInt((hhmm||'12:00').split(':')[0],10);
  if(isNaN(h)) return {icon:'sun', accent:'dawn'};
  if(h>=4 && h<11) return {icon:'sunrise', accent:'dawn'};
  if(h>=11 && h<15) return {icon:'sun', accent:'dawn'};
  if(h>=15 && h<19) return {icon:'sunset', accent:'dusk'};
  return {icon:'moon', accent:'night'};
}
function totalDoses(){
  return (state.schedule||[]).reduce((s,slot)=>s+slot.items.length,0);
}
function todayStr(){ return toDateStr(new Date()); }
function genUid(){ return 'i'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4); }
/**
 * Jadwal bersifat "effective-dated": tiap slot & item punya addedOn (mulai berlaku)
 * dan removedOn opsional (berhenti berlaku, exclusive). Menghapus/mengganti sesuatu
 * tidak pernah menghapus objeknya dari state.schedule -- hanya menandai removedOn -
 * sehingga hari-hari sebelum tanggal hapus tetap menampilkan data lama apa adanya.
 * Fungsi ini menghitung "potret" jadwal yang berlaku pada satu tanggal tertentu.
 */
function scheduleForDate(dateStr, keepEmpty){
  return (state.schedule||[])
    .filter(slot => (!slot.addedOn || slot.addedOn<=dateStr) && (!slot.removedOn || slot.removedOn>dateStr))
    .map(slot => ({
      ...slot,
      items: (slot.items||[]).filter(it => (!it.addedOn || it.addedOn<=dateStr) && (!it.removedOn || it.removedOn>dateStr))
    }))
    .filter(slot => keepEmpty || slot.items.length>0)
    .sort((a,b) => a.time.localeCompare(b.time)); // urutkan pagi -> malam
}
/** Slot & item yang masih aktif hari ini -- dipakai oleh editor jadwal (halaman "Atur").
 *  keepEmpty=true supaya slot yang baru dibuat (belum diisi obat) tetap tampil untuk diedit. */
function activeScheduleToday(){
  return scheduleForDate(todayStr(), true);
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>t.classList.remove('show'),2600);
}
function setSync(mode){
  const dot=document.getElementById('syncDot'), label=document.getElementById('syncLabel');
  dot.className='dot'+(mode==='busy'?' busy':mode==='err'?' err':'');
  label.textContent = mode==='busy'?'Menyimpan…':mode==='err'?'Gagal sinkron':mode==='loading'?'Memuat…':'Tersinkron';
}

function computeUsage(stock){
  const usage={}; for(const k in state.medDefs) usage[k]=0;
  activeScheduleToday().forEach(slot=>slot.items.forEach(item=>{
    if(item.substitute){
      const useKey = (stock && stock[item.primary]>0) ? item.primary : item.backup;
      if(useKey in usage) usage[useKey]+=item.qty;
    } else if(item.key in usage) usage[item.key]+=item.qty;
  }));
  return usage;
}
function stockStatus(qty, use){
  if(qty<=0) return {level:'bad', label:'Stok habis'};
  if(use<=0) return {level:'ok', label:'Aman'};
  const days=Math.floor(qty/use);
  if(days<=3) return {level:'bad', label:'≈ '+days+' hari lagi'};
  if(days<=7) return {level:'warn', label:'≈ '+days+' hari lagi'};
  return {level:'ok', label:'≈ '+days+' hari lagi'};
}
/** Hitung berapa kali & berapa butir/kapsul per pemberian untuk tiap obat dari jadwal
 *  aktif hari ini -- dipakai kolom "Dosis/hari" pada laporan cetak stok. */
function computeDosagePerDay(){
  const info={}; for(const k in state.medDefs) info[k]={ times:0, qtySet:new Set(), total:0 };
  activeScheduleToday().forEach(slot=>slot.items.forEach(item=>{
    const key = item.substitute ? item.primary : item.key;
    if(info[key]){ info[key].times+=1; info[key].qtySet.add(item.qty); info[key].total+=item.qty; }
  }));
  return info;
}
function formatDosagePerDay(d){
  if(!d || d.times===0) return '–';
  if(d.qtySet.size===1) return d.times+'x'+formatQty([...d.qtySet][0]);
  return formatQty(d.total)+'/hari';
}

/* ---------------- firestore init ----------------
 * Dokumen baru dibuat kosong (bukan diisi obat contoh) -- setiap akun mengisi
 * sendiri daftar obatnya lewat halaman "Atur".
 */
async function ensureStock(){
  const ref=userDoc('medStock','current');
  const snap=await getDoc(ref);
  if(!snap.exists()) await setDoc(ref, {});
}
async function ensureMedDefs(){
  const ref=userDoc('medDefs','current');
  const snap=await getDoc(ref);
  if(!snap.exists()) await setDoc(ref, {});
}
async function ensureSchedule(){
  const ref=userDoc('schedule','current');
  const snap=await getDoc(ref);
  if(!snap.exists()) await setDoc(ref, { slots: [] });
}
/** Catatan disimpan per tanggal (notes/{tanggal}), persis seperti ceklisan (medLogs/{tanggal}) --
 *  jadi otomatis kosong lagi saat pindah ke tanggal yang belum ada catatannya. */
function listenNotesForDate(dateStr){
  if(unsubNotes) unsubNotes();
  state.notes=null;
  const ref=userDoc('notes', dateStr);
  unsubNotes=onSnapshot(ref, snap=>{
    state.notes = snap.exists() ? snap.data() : { schedule:'', stock:'' };
    const schedInput=document.getElementById('scheduleNoteInput');
    if(schedInput && document.activeElement!==schedInput) schedInput.value = state.notes.schedule||'';
  }, err=>{ console.error(err); toast('Gagal memuat catatan.'); });
}
function listenStock(){
  return onSnapshot(userDoc('medStock','current'), snap=>{ state.stock = snap.exists()?snap.data():{}; render(); },
    err=>{ console.error(err); setSync('err'); toast('Gagal memuat data stok. Periksa Firestore & aturan keamanan.'); });
}
function listenMedDefs(){
  return onSnapshot(userDoc('medDefs','current'), snap=>{ state.medDefs = snap.exists()?snap.data():{}; render(); },
    err=>{ console.error(err); setSync('err'); toast('Gagal memuat daftar obat.'); });
}
function normalizeSchedule(rawSlots){
  let changed=false;
  if(!Array.isArray(rawSlots)){
    console.warn('Field "slots" di dokumen schedule/current bukan array yang valid:', rawSlots);
    return {slots:[], changed:false};
  }
  const slots=rawSlots.filter(slot=>slot && typeof slot==='object').map(slot=>{
    const s={...slot};
    if(!s.id){ s.id='slot'+Math.random().toString(36).slice(2,8); changed=true; }
    if(!s.addedOn){ s.addedOn=SCHEDULE_EPOCH; changed=true; }
    const rawItems = Array.isArray(s.items) ? s.items : [];
    if(!Array.isArray(s.items)) changed=true;
    s.items = rawItems.filter(item=>item && typeof item==='object').map(item=>{
      const it={...item};
      if(!it.uid){ it.uid=genUid(); changed=true; }
      if(!it.addedOn){ it.addedOn=s.addedOn||SCHEDULE_EPOCH; changed=true; }
      return it;
    });
    return s;
  });
  return {slots, changed};
}
function listenSchedule(){
  return onSnapshot(userDoc('schedule','current'), snap=>{
    try{
      const raw = snap.exists()?(snap.data().slots||[]):[];
      const {slots, changed} = normalizeSchedule(raw);
      state.schedule = slots;
      render();
      // data lama (sebelum fitur jadwal-per-tanggal) belum punya addedOn/uid -> lengkapi sekali lalu simpan
      if(changed) persistSchedule();
    }catch(e){
      console.error('listenSchedule gagal memproses data:', e);
      setSync('err');
      toast('Data jadwal bermasalah. Buka console (F12) untuk detail teknis.');
      // tetap set array kosong supaya bagian lain (stok, dll) tidak ikut macet di "Memuat…"
      if(state.schedule===null) state.schedule=[];
      render();
    }
  }, err=>{ console.error(err); setSync('err'); toast('Gagal memuat jadwal.'); });
}
function listenLog(dateStr){
  if(unsubLog) unsubLog();
  state.log=null;
  const ref=userDoc('medLogs',dateStr);
  unsubLog=onSnapshot(ref, snap=>{ state.log = snap.exists()?snap.data():{}; render(); },
    err=>{ console.error(err); setSync('err'); toast('Gagal memuat jadwal harian.'); });
}
function listenRestockHistory(){
  const q = query(userCollection('restockLog'), orderBy('ts','desc'), limit(20));
  return onSnapshot(q, snap=>{
    const rows=[]; snap.forEach(d=>rows.push(d.data()));
    renderRestockHistory(rows);
  }, err=>{ console.error(err); document.getElementById('restockHistory').innerHTML='<p class="empty-note">Gagal memuat riwayat.</p>'; });
}

/* ---------------- dose toggle (Jadwal page) ---------------- */
async function toggleDose(slot, item){
  if(!state.stock) return;
  const fieldKey = slot.id+'_'+item.key;
  const log = state.log || {};
  const currentlyChecked = !!log[fieldKey];
  const newChecked = !currentlyChecked;

  let medKeyUsed;
  if(item.substitute){
    if(newChecked){
      medKeyUsed = (state.stock[item.primary]>0) ? item.primary : item.backup;
      if((state.stock[medKeyUsed]||0) <= 0){
        toast('Stok '+state.medDefs[item.primary].name+' dan '+state.medDefs[item.backup].name+' sama-sama habis.');
        return;
      }
    } else {
      medKeyUsed = log[fieldKey+'_med'] || item.primary;
    }
  } else {
    medKeyUsed = item.key;
    if(newChecked && (state.stock[medKeyUsed]||0) <= 0){
      toast('Stok '+(state.medDefs[medKeyUsed]?state.medDefs[medKeyUsed].name:medKeyUsed)+' habis, tidak bisa dicatat.');
      return;
    }
  }

  const delta = newChecked ? -item.qty : item.qty;
  setSync('busy');
  try{
    await updateDoc(userDoc('medStock','current'), { [medKeyUsed]: increment(delta) });
    const payload = { [fieldKey]: newChecked };
    if(item.substitute) payload[fieldKey+'_med'] = medKeyUsed;
    await setDoc(userDoc('medLogs',state.date), payload, { merge:true });
    setSync('ok');
  }catch(e){
    console.error(e); setSync('err');
    toast('Gagal menyimpan. Coba lagi.');
  }
}

/* ---------------- generic modal ---------------- */
function closeModal(){ document.getElementById('overlay').classList.remove('show'); }
document.getElementById('modalCancel').onclick=closeModal;
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });

function openStockModal(key){
  const med=state.medDefs[key];
  document.getElementById('modalTitle').textContent='Koreksi stok — '+med.name;
  document.getElementById('modalSub').textContent='Dosis '+med.dose+' · satuan '+med.unit+'. Gunakan ini untuk mengoreksi jumlah persis (bukan menambah).';
  document.getElementById('modalBody').innerHTML =
    '<div class="modal-field"><label>Jumlah stok saat ini</label><input type="number" inputmode="decimal" min="0" step="0.5" id="mfStock" class="big-num" value="'+(state.stock[key]||0)+'"></div>';
  document.getElementById('overlay').classList.add('show');
  document.getElementById('modalSave').onclick=async()=>{
    const val=parseFloat(document.getElementById('mfStock').value);
    if(isNaN(val) || val<0){ toast('Masukkan angka yang valid.'); return; }
    setSync('busy');
    try{
      await setDoc(userDoc('medStock','current'), { [key]: val }, { merge:true });
      setSync('ok'); toast('Stok '+med.name+' diperbarui.');
    }catch(e){ console.error(e); setSync('err'); toast('Gagal menyimpan koreksi stok.'); }
    closeModal();
  };
}

function openEditMedModal(key){
  const med=state.medDefs[key];
  document.getElementById('modalTitle').textContent='Edit obat';
  document.getElementById('modalSub').textContent='Nama/dosis/satuan lama tetap tersimpan di riwayat sebelumnya.';
  document.getElementById('modalBody').innerHTML =
    '<div class="modal-field"><label>Nama obat</label><input type="text" id="mfName" value="'+escapeHtml(med.name)+'"></div>'
    + '<div class="modal-field"><label>Dosis</label><input type="text" id="mfDose" value="'+escapeHtml(med.dose)+'" placeholder="mis. 500 mg"></div>'
    + '<div class="modal-field"><label>Satuan</label><input type="text" id="mfUnit" value="'+escapeHtml(med.unit)+'" placeholder="mis. tablet, kapsul, ml"></div>'
    + '<div class="modal-field"><label>Deskripsi</label><textarea id="mfDesc" rows="2" placeholder="mis. Obat penurun tekanan darah">'+escapeHtml(med.desc||'')+'</textarea></div>';
  document.getElementById('overlay').classList.add('show');
  document.getElementById('modalSave').onclick=async()=>{
    const name=document.getElementById('mfName').value.trim();
    const dose=document.getElementById('mfDose').value.trim();
    const unit=document.getElementById('mfUnit').value.trim();
    const desc=document.getElementById('mfDesc').value.trim();
    if(!name){ toast('Nama obat tidak boleh kosong.'); return; }
    setSync('busy');
    try{
      await setDoc(userDoc('medDefs','current'), { [key]: { ...med, name, dose, unit, desc } }, { merge:true });
      setSync('ok'); toast('Data '+name+' diperbarui.');
    }catch(e){ console.error(e); setSync('err'); toast('Gagal menyimpan.'); }
    closeModal();
  };
}

/* ---------------- add / edit / delete medicine (Pengaturan page) ---------------- */
async function addMedicine(){
  const name=document.getElementById('newMedName').value.trim();
  const dose=document.getElementById('newMedDose').value.trim();
  const unit=document.getElementById('newMedUnit').value.trim() || 'tablet';
  const desc=document.getElementById('newMedDesc').value.trim();
  const stock=parseFloat(document.getElementById('newMedStock').value) || 0;
  if(!name){ toast('Nama obat wajib diisi.'); return; }
  const key=uniqueKey(slugify(name), Object.keys(state.medDefs||{}));
  setSync('busy');
  try{
    await setDoc(userDoc('medDefs','current'), { [key]: { name, dose, unit, desc, initialStock:stock, initialDate: toDateStr(new Date()) } }, { merge:true });
    await setDoc(userDoc('medStock','current'), { [key]: stock }, { merge:true });
    if(stock>0){
      await addDoc(userCollection('restockLog'), { medKey:key, medName:name, unit, qty:stock, date: toDateStr(new Date()), ts: serverTimestamp(), note:'Obat baru ditambahkan' });
    }
    setSync('ok'); toast('Obat '+name+' ditambahkan.');
    document.getElementById('newMedName').value='';
    document.getElementById('newMedDose').value='';
    document.getElementById('newMedUnit').value='';
    document.getElementById('newMedDesc').value='';
    document.getElementById('newMedStock').value='';
    renderMedList();
  }catch(e){ console.error(e); setSync('err'); toast('Gagal menambah obat.'); }
}
document.getElementById('addMedBtn').addEventListener('click', addMedicine);

async function deleteMedicine(key){
  const med=state.medDefs[key];
  const usedIn = activeScheduleToday().some(slot=>slot.items.some(it=> it.key===key || it.primary===key || it.backup===key));
  if(usedIn){ toast('Hapus dulu "'+med.name+'" dari jadwal sebelum menghapus obat ini.'); return; }
  if(!confirm('Hapus "'+med.name+'" dari daftar obat? Riwayat lama tetap tersimpan.')) return;
  setSync('busy');
  try{
    await updateDoc(userDoc('medDefs','current'), { [key]: deleteField() });
    await updateDoc(userDoc('medStock','current'), { [key]: deleteField() });
    setSync('ok'); toast('Obat '+med.name+' dihapus.');
    renderMedList();
  }catch(e){ console.error(e); setSync('err'); toast('Gagal menghapus.'); }
}

function renderMedList(){
  const el=document.getElementById('medManageList');
  if(!state.medDefs){ el.innerHTML='<p class="empty-note">Memuat…</p>'; return; }
  const keys=Object.keys(state.medDefs);
  if(!keys.length){ el.innerHTML='<p class="empty-note">Belum ada obat.</p>'; return; }
  el.innerHTML = keys.map(k=>{
    const med=state.medDefs[k];
    const descHtml = med.desc ? '<div class="med-manage-desc">'+escapeHtml(med.desc)+'</div>' : '';
    return '<div class="med-manage-row" data-key="'+k+'">'
      + '<div class="med-manage-info"><div class="med-manage-name">'+escapeHtml(med.name)+'</div>'
      + '<div class="med-manage-meta">'+escapeHtml(med.dose)+' · '+escapeHtml(med.unit)+'</div>'+descHtml+'</div>'
      + '<button class="icon-btn-sm edit-med" aria-label="Edit obat">'+EDIT_ICON+'</button>'
      + '<button class="icon-btn-sm danger del-med" aria-label="Hapus obat">'+TRASH_ICON+'</button>'
      + '</div>';
  }).join('');
  el.querySelectorAll('.edit-med').forEach(btn=>btn.addEventListener('click', ()=>openEditMedModal(btn.closest('.med-manage-row').dataset.key)));
  el.querySelectorAll('.del-med').forEach(btn=>btn.addEventListener('click', ()=>deleteMedicine(btn.closest('.med-manage-row').dataset.key)));
}

/* ---------------- schedule editor (Pengaturan page) ---------------- */
async function persistSchedule(){
  setSync('busy');
  try{ await setDoc(userDoc('schedule','current'), { slots: state.schedule }); setSync('ok'); }
  catch(e){ console.error(e); setSync('err'); toast('Gagal menyimpan jadwal.'); }
}
function updateSlot(slotId, mutateFn){
  const slot = state.schedule.find(s=>s.id===slotId);
  if(slot) mutateFn(slot);
  renderScheduleEditor();
  persistSchedule();
}
function renderScheduleEditor(){
  const el=document.getElementById('scheduleEditor');
  if(!state.schedule || !state.medDefs){ el.innerHTML='<p class="empty-note">Memuat…</p>'; return; }
  const activeSlots = activeScheduleToday(); // hanya slot & obat yang berlaku hari ini yang bisa diedit
  if(!activeSlots.length){ el.innerHTML='<p class="empty-note">Belum ada jadwal. Tambahkan waktu baru di bawah.</p>'; return; }
  const medOptions = Object.keys(state.medDefs).map(k=>'<option value="'+k+'">'+escapeHtml(state.medDefs[k].name)+'</option>').join('');

  el.innerHTML = activeSlots.map(slot=>{
    const items = slot.items.map(item=>{
      let name, note='';
      if(item.substitute){
        const primMed=state.medDefs[item.primary], backMed=state.medDefs[item.backup];
        name = primMed?primMed.name:item.primary;
        note = '<span class="note">Otomatis diganti '+escapeHtml(backMed?backMed.name:item.backup)+' kalau stok habis</span>';
      } else {
        const med=state.medDefs[item.key];
        name = med?med.name:'(obat sudah dihapus)';
      }
      return '<div class="slot-editor-item" data-uid="'+item.uid+'">'
        + '<span class="slot-editor-item-name">'+escapeHtml(name)+note+'</span>'
        + '<input type="number" inputmode="decimal" min="0.5" step="0.5" class="item-qty" value="'+item.qty+'">'
        + '<button class="icon-btn-sm danger remove-item" aria-label="Hapus obat dari slot ini">'+TRASH_ICON+'</button>'
        + '</div>';
    }).join('');
    return '<div class="slot-editor-card" data-slot="'+slot.id+'">'
      + '<div class="slot-editor-head">'
      + '<input type="time" class="slot-time" value="'+slot.time+'">'
      + '<input type="text" class="slot-label" value="'+escapeHtml(slot.label)+'">'
      + '<button class="icon-btn-sm danger remove-slot" aria-label="Hapus waktu ini">'+TRASH_ICON+'</button>'
      + '</div>'
      + items
      + '<div class="slot-editor-add">'
      + '<select class="add-item-select">'+medOptions+'</select>'
      + '<input type="number" inputmode="decimal" min="0.5" step="0.5" value="1" class="add-item-qty">'
      + '<button type="button" class="add-item-btn">+ Tambah</button>'
      + '</div>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.slot-editor-card').forEach(card=>{
    const slotId=card.dataset.slot;
    // Ganti jam/label mengubah slot yang sama secara langsung (ini koreksi metadata,
    // bukan "penghapusan", jadi berlaku untuk semua tanggal termasuk histori).
    card.querySelector('.slot-time').addEventListener('change', e=>{
      updateSlot(slotId, s=>{ s.time=e.target.value; const ic=iconForTime(s.time); s.icon=ic.icon; s.accent=ic.accent; });
    });
    card.querySelector('.slot-label').addEventListener('change', e=>{
      const v=e.target.value.trim();
      updateSlot(slotId, s=>{ if(v) s.label=v; });
    });
    // Hapus waktu = soft delete (tandai removedOn hari ini), bukan splice, supaya
    // histori hari-hari sebelumnya untuk waktu ini tetap utuh & bisa dilihat.
    card.querySelector('.remove-slot').addEventListener('click', ()=>{
      const label=card.querySelector('.slot-label').value;
      if(!confirm('Hapus waktu "'+label+'" beserta semua obat di dalamnya? Riwayat hari-hari sebelumnya tetap tersimpan.')) return;
      updateSlot(slotId, s=>{ s.removedOn=todayStr(); });
    });
    // Hapus satu obat dari slot = soft delete item (removedOn hari ini). Objeknya
    // tetap ada di state.schedule, jadi hari-hari sebelumnya tetap menampilkannya.
    card.querySelectorAll('.remove-item').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const uid=btn.closest('.slot-editor-item').dataset.uid;
        updateSlot(slotId, s=>{
          const it=s.items.find(i=>i.uid===uid);
          if(it) it.removedOn=todayStr();
        });
      });
    });
    // Ubah jumlah = tutup versi lama (removedOn hari ini) & buka versi baru mulai hari ini,
    // supaya jumlah yang tercatat di hari-hari sebelumnya tidak ikut berubah.
    card.querySelectorAll('.item-qty').forEach(input=>{
      input.addEventListener('change', ()=>{
        const uid=input.closest('.slot-editor-item').dataset.uid;
        const val=Math.max(0.5, parseFloat(input.value)||1);
        updateSlot(slotId, s=>{
          const old=s.items.find(i=>i.uid===uid);
          if(!old || old.qty===val) return;
          const today=todayStr();
          if(old.addedOn && old.addedOn>=today){
            old.qty=val; // baru ditambahkan hari ini juga -> belum ada histori untuk dijaga
          } else {
            old.removedOn=today;
            const clone={...old, uid:genUid(), qty:val, addedOn:today};
            delete clone.removedOn;
            s.items.push(clone);
          }
        });
      });
    });
    card.querySelector('.add-item-btn').addEventListener('click', ()=>{
      const sel=card.querySelector('.add-item-select');
      const qtyInput=card.querySelector('.add-item-qty');
      const key=sel.value;
      const qty=Math.max(0.5, parseFloat(qtyInput.value)||1);
      if(!key) return;
      updateSlot(slotId, s=>{
        const existing=s.items.find(it=>!it.substitute && it.key===key && !it.removedOn);
        if(existing) existing.qty += qty;
        else s.items.push({uid:genUid(), key, qty, addedOn:todayStr()});
      });
    });
  });
}
document.getElementById('addSlotBtn').addEventListener('click', ()=>{
  const id='slot'+Math.random().toString(36).slice(2,8);
  const time='12:00';
  const ic=iconForTime(time);
  state.schedule.push({ id, time, label:'Waktu baru', icon:ic.icon, accent:ic.accent, addedOn:todayStr(), items:[] });
  renderScheduleEditor();
  persistSchedule();
});

/* ---------------- add stock (Tambah Stok page) ---------------- */
async function addStock(key, qty){
  setSync('busy');
  try{
    await updateDoc(userDoc('medStock','current'), { [key]: increment(qty) });
    await addDoc(userCollection('restockLog'), {
      medKey:key, medName:state.medDefs[key].name, unit:state.medDefs[key].unit, qty,
      date: toDateStr(new Date()), ts: serverTimestamp()
    });
    setSync('ok');
    toast('Stok '+state.medDefs[key].name+' +'+qty+' ditambahkan.');
  }catch(e){ console.error(e); setSync('err'); toast('Gagal menambah stok.'); }
}
function ensureRestockList(){
  const keys=Object.keys(state.medDefs||{});
  const sig=keys.slice().sort().join(',');
  if(sig===restockKeysSig) return;
  restockKeysSig=sig;
  const el=document.getElementById('restockList');
  if(!keys.length){ el.innerHTML='<p class="empty-note">Belum ada obat. Tambahkan lewat halaman Atur.</p>'; return; }
  el.innerHTML = keys.map(k=>{
    const med=state.medDefs[k];
    return '<div class="restock-row" data-key="'+k+'">'
      + '<div class="restock-top"><div class="restock-name">'+escapeHtml(med.name)+' <span class="muted">'+escapeHtml(med.dose)+'</span></div>'
      + '<button class="edit-icon" aria-label="Koreksi stok manual">'+EDIT_ICON+'</button></div>'
      + '<div class="restock-current">Stok saat ini: <b id="cur-'+k+'">–</b> '+escapeHtml(med.unit)+'</div>'
      + '<div class="restock-actions">'
      + '<input type="number" inputmode="decimal" min="0.5" step="0.5" class="restock-input" placeholder="Jumlah">'
      + '<button class="restock-add" type="button">+ Tambah</button>'
      + '</div></div>';
  }).join('');
  el.querySelectorAll('.restock-row').forEach(row=>{
    const key=row.dataset.key;
    const input=row.querySelector('.restock-input');
    row.querySelector('.restock-add').addEventListener('click', ()=>{
      const qty=parseFloat(input.value);
      if(!qty || qty<=0){ toast('Masukkan jumlah yang valid.'); return; }
      addStock(key, qty);
      input.value='';
    });
    row.querySelector('.edit-icon').addEventListener('click', ()=>openStockModal(key));
  });
  updateRestockNumbers();
}
function updateRestockNumbers(){
  if(!state.stock || !state.medDefs) return;
  Object.keys(state.medDefs).forEach(k=>{
    const el=document.getElementById('cur-'+k);
    if(el) el.textContent = formatQty(state.stock[k]||0);
  });
}
function renderRestockHistory(rows){
  const el=document.getElementById('restockHistory');
  if(!rows.length){ el.innerHTML='<p class="empty-note">Belum ada riwayat penambahan stok.</p>'; return; }
  el.innerHTML = rows.map(r=>{
    let when=r.date||'';
    if(r.ts && typeof r.ts.toDate==='function'){
      const dt=r.ts.toDate();
      when=String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+' · '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    }
    return '<div class="restock-hist-row"><div><div class="restock-hist-name">'+escapeHtml(r.medName||'')+'</div>'
      + '<div class="restock-hist-meta">'+escapeHtml(when)+'</div></div>'
      + '<div class="restock-hist-qty">+'+formatQty(r.qty)+' '+escapeHtml(r.unit||'')+'</div></div>';
  }).join('');
}

/* ---------------- rendering: Jadwal page ---------------- */
function render(){
  document.getElementById('dateLabel').textContent = humanDate(state.date);
  if(!state.stock || !state.log || !state.medDefs || !state.schedule){ setSync('loading'); return; }

  try{
    const usage = computeUsage(state.stock);
    renderAlerts(usage);
    renderTimeline();
    ensureRestockList();
    updateRestockNumbers();
    if(currentPage==='laporan'){ renderStockChart(); renderStatusList(); }
    setSync('ok');
  }catch(e){
    console.error('render() gagal:', e);
    setSync('err');
    toast('Gagal menampilkan data. Buka console (F12) untuk detail teknis.');
  }
}

function renderAlerts(usage){
  const box=document.getElementById('alertBox');
  const bad=[], warn=[];
  for(const k in state.medDefs){
    const qty=state.stock[k]||0;
    const st=stockStatus(qty, usage[k]);
    if(st.level==='bad') bad.push(state.medDefs[k].name);
    else if(st.level==='warn') warn.push(state.medDefs[k].name);
  }
  let html='';
  if(bad.length) html += '<div class="alert bad"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span><b>Segera isi ulang:</b> '+escapeHtml(bad.join(', '))+'.</span></div>';
  if(warn.length) html += '<div class="alert warn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span><b>Stok menipis:</b> '+escapeHtml(warn.join(', '))+'.</span></div>';
  box.innerHTML=html;
  box.classList.toggle('show', !!html);
}

function doseDisplay(slot, item){
  const fieldKey = slot.id+'_'+item.key;
  const checked = !!state.log[fieldKey];
  let medKey, isBackup=false;
  if(item.substitute){
    medKey = checked ? (state.log[fieldKey+'_med'] || item.primary)
                      : ((state.stock[item.primary]>0) ? item.primary : item.backup);
    isBackup = medKey===item.backup;
  } else medKey = item.key;
  const med = state.medDefs[medKey] || { name:'(obat tidak ditemukan)', dose:'', unit:'' };
  const outOfStock = !checked && (state.stock[medKey]||0) <= 0;
  return { fieldKey, checked, med, isBackup, outOfStock };
}

function renderTimeline(){
  const el=document.getElementById('timeline');
  const daySchedule = scheduleForDate(state.date);
  if(!state.schedule.length){ el.innerHTML='<p class="empty-note">Belum ada jadwal. Atur di halaman "Atur".</p>'; return; }
  if(!daySchedule.length){ el.innerHTML='<p class="empty-note">Tidak ada jadwal obat di tanggal ini.</p>'; return; }
  el.innerHTML = daySchedule.map(slot=>{
    const rows = slot.items.map(item=>{
      const d = doseDisplay(slot, item);
      const rowClass = 'dose-row'+(d.checked?' done':'')+(d.outOfStock?' locked':'');
      const subTag = d.isBackup ? '<span class="tag-sub">pengganti</span>' : '';
      const outTag = d.outOfStock ? '<span class="tag-out">habis</span>' : '';
      return '<div class="'+rowClass+'" data-slot="'+slot.id+'" data-uid="'+item.uid+'">'
        + '<div class="checkbox" role="checkbox" aria-checked="'+d.checked+'" tabindex="0" aria-label="'+escapeHtml(d.med.name)+'">'+CHECK_ICON+'</div>'
        + '<div class="dose-info"><div class="dose-name">'+escapeHtml(d.med.name)+'</div>'
        + '<div class="dose-meta">'+escapeHtml(d.med.dose)+' · '+formatQty(item.qty)+' '+escapeHtml(d.med.unit)+subTag+outTag+'</div></div>'
        + '</div>';
    }).join('');
    return '<div class="slot" data-accent="'+slot.accent+'">'
      + '<div class="slot-marker">'+(ICONS[slot.icon]||ICONS.sun)+'</div>'
      + '<div class="slot-heading"><span class="slot-time">'+slot.time+'</span><span class="slot-label">'+escapeHtml(slot.label)+'</span></div>'
      + '<div class="slot-card">'+rows+'</div>'
      + '</div>';
  }).join('');

  el.querySelectorAll('.dose-row').forEach(rowEl=>{
    const fire=()=>{
      // Cari objek slot/item asli (bukan hasil filter) lewat id+uid supaya toggle
      // tetap mengenai entri yang benar walau ada versi lama/baru dengan key yang sama.
      const slot = state.schedule.find(s=>s.id===rowEl.dataset.slot);
      const item = slot && slot.items.find(i=>i.uid===rowEl.dataset.uid);
      if(slot && item) toggleDose(slot, item);
    };
    rowEl.addEventListener('click', fire);
    const cb=rowEl.querySelector('.checkbox');
    cb.addEventListener('keydown', e=>{
      if(e.key===' ' || e.key==='Enter'){ e.preventDefault(); fire(); }
    });
  });
}

/* ---------------- rendering: Laporan page ---------------- */
function renderStockChart(){
  const el=document.getElementById('stockChart');
  if(!state.stock || !state.medDefs){ el.innerHTML='<p class="chart-loading">Memuat grafik…</p>'; return; }
  const keys=Object.keys(state.medDefs);
  if(!keys.length){ el.innerHTML='<p class="empty-note">Belum ada obat.</p>'; return; }
  const usage=computeUsage(state.stock);
  const rowH=28, top=6, chartW=300, trackX=104, trackW=chartW-trackX-38;
  const height = keys.length*rowH + top*2;
  let svg='';
  [0,25,50,75,100].forEach(p=>{
    const x = trackX + trackW*p/100;
    svg += '<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+height+'" stroke="'+COLORS.border+'" stroke-width="1"/>';
  });
  keys.forEach((k,i)=>{
    const med=state.medDefs[k];
    const qty=state.stock[k]||0;
    const base=med.initialStock>0?med.initialStock:Math.max(qty,1);
    const pct=Math.max(0,Math.min(100, qty/base*100));
    const st=stockStatus(qty, usage[k]);
    const color = st.level==='bad'?COLORS.bad:st.level==='warn'?COLORS.warn:COLORS.ok;
    const y = top + i*rowH;
    const barY = y + 7;
    const w = Math.max(trackW*pct/100, pct>0?4:0);
    svg += '<text x="0" y="'+(barY+9.5)+'" font-size="9.3" fill="'+COLORS.ink+'">'+escapeHtml(med.name)+'</text>';
    svg += '<rect x="'+trackX+'" y="'+barY+'" width="'+trackW+'" height="13" rx="4" fill="#eef2f0"/>';
    svg += '<rect x="'+trackX+'" y="'+barY+'" width="'+w+'" height="13" rx="4" fill="'+color+'"/>';
    svg += '<text x="'+(trackX+trackW+6)+'" y="'+(barY+10)+'" font-size="9.3" fill="'+COLORS.inkSoft+'">'+formatQty(qty)+'/'+formatQty(med.initialStock)+'</text>';
  });
  el.innerHTML = '<svg viewBox="0 0 '+chartW+' '+height+'" style="width:100%;height:auto;display:block;font-family:Inter,sans-serif">'+svg+'</svg>';
}

async function fetchWeekAdherence(endDateStr){
  const [ey,em,ed] = endDateStr.split('-').map(Number);
  const end = new Date(ey, em-1, ed);
  const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(end); d.setDate(d.getDate()-i); days.push(toDateStr(d)); }
  const results = await Promise.all(days.map(async ds=>{
    const daySchedule = scheduleForDate(ds);
    const total = daySchedule.reduce((s,slot)=>s+slot.items.length,0);
    let data=null;
    if(ds===state.date && state.log){ data=state.log; }
    else{
      try{ const snap=await getDoc(userDoc('medLogs',ds)); data = snap.exists()? snap.data() : null; }
      catch(e){ data=null; }
    }
    if(!data || total<=0) return {date:ds, pct:null};
    let done=0;
    daySchedule.forEach(slot=>slot.items.forEach(item=>{ if(data[slot.id+'_'+item.key]) done++; }));
    return {date:ds, pct:Math.round(done/total*100)};
  }));
  return results;
}

async function renderAdherenceChart(){
  const el=document.getElementById('adherenceChart');
  el.innerHTML='<p class="chart-loading">Memuat grafik…</p>';
  const data = await fetchWeekAdherence(state.date);
  const w=300, h=150, top=14, bottom=26, gap=8;
  const chartH = h-top-bottom;
  const barW = (w - gap*(data.length+1))/data.length;
  let svg='';
  [0,25,50,75,100].forEach(p=>{
    const y = top + chartH*(1-p/100);
    svg += '<line x1="0" y1="'+y+'" x2="'+w+'" y2="'+y+'" stroke="'+COLORS.border+'" stroke-width="1" stroke-dasharray="2,3"/>';
  });
  data.forEach((d,i)=>{
    const x = gap + i*(barW+gap);
    const [y,mn,dd] = d.date.split('-').map(Number);
    const dow = new Date(y,mn-1,dd).getDay();
    const label = DAYS_SHORT[dow]+' '+dd+'/'+mn;
    if(d.pct===null){
      svg += '<rect x="'+x+'" y="'+(top+chartH-4)+'" width="'+barW+'" height="4" rx="2" fill="'+COLORS.border+'"/>';
    } else {
      const bh = Math.max(chartH*d.pct/100, d.pct>0?3:0);
      const by = top+chartH-bh;
      const color = d.pct>=100?COLORS.ok:d.pct>0?COLORS.warn:COLORS.bad;
      svg += '<rect x="'+x+'" y="'+by+'" width="'+barW+'" height="'+bh+'" rx="4" fill="'+color+'"/>';
      svg += '<text x="'+(x+barW/2)+'" y="'+(by-4)+'" font-size="8" text-anchor="middle" fill="'+COLORS.ink+'">'+d.pct+'%</text>';
    }
    svg += '<text x="'+(x+barW/2)+'" y="'+(h-8)+'" font-size="7.5" text-anchor="middle" fill="'+COLORS.inkSoft+'">'+label+'</text>';
  });
  el.innerHTML = '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:auto;display:block;font-family:Inter,sans-serif">'+svg+'</svg>';
}

function renderStatusList(){
  const el=document.getElementById('statusList');
  document.getElementById('statusDateLabel').textContent = humanDate(state.date);
  if(!state.stock || !state.log || !state.medDefs || !state.schedule){ el.innerHTML=''; return; }
  const daySchedule = scheduleForDate(state.date);
  if(!daySchedule.length){ el.innerHTML='<p class="empty-note">Tidak ada jadwal obat di tanggal ini.</p>'; return; }
  el.innerHTML = daySchedule.map(slot=>{
    const rows = slot.items.map(item=>{
      const d=doseDisplay(slot,item);
      const icon = d.checked ? CHECK_ICON : X_ICON;
      const subNote = d.isBackup ? '<em>pengganti</em>' : '';
      return '<div class="status-row '+(d.checked?'done':'pending')+'">'
        + '<span class="status-icon">'+icon+'</span>'
        + '<span class="status-name">'+escapeHtml(d.med.name)+' · '+escapeHtml(d.med.dose)+subNote+'</span>'
        + '<span class="status-tag">'+(d.checked?'Diminum':'Belum')+'</span>'
        + '</div>';
    }).join('');
    return '<div class="status-slot"><div class="status-slot-title">'+slot.time+' · '+escapeHtml(slot.label)+'</div>'+rows+'</div>';
  }).join('');
}

async function renderLaporan(){
  renderStockChart();
  renderStatusList();
  await renderAdherenceChart();
}

/* ---------------- print report ---------------- */
/** Bangun blok "Catatan" di bagian bawah laporan cetak (kosong -> tidak ditampilkan). */
function noteBlockHtml(text){
  const t=(text||'').trim();
  if(!t) return '';
  return '<div class="poster-note"><div class="poster-note-label">Catatan</div><div class="poster-note-text">'+escapeHtml(t).replace(/\n/g,'<br>')+'</div></div>';
}
document.getElementById('printBtn').addEventListener('click', ()=>{
  if(!state.stock || !state.medDefs || !state.schedule){ toast('Data belum siap.'); return; }
  const usage = computeUsage(state.stock);
  const dosage = computeDosagePerDay();

  let stockRows='';
  Object.keys(state.medDefs).forEach(k=>{
    const med=state.medDefs[k];
    const qty=state.stock[k]||0;
    const st=stockStatus(qty, usage[k]);
    const cls = st.level==='bad'?'p-bad':st.level==='warn'?'p-warn':'p-ok';
    stockRows += '<tr>'
      + '<td>'+escapeHtml(med.name)+' '+escapeHtml(med.dose)+'</td>'
      + '<td>'+escapeHtml(med.desc||'–')+'</td>'
      + '<td>'+escapeHtml(formatDosagePerDay(dosage[k]))+'</td>'
      + '<td>'+formatQty(med.initialStock)+' '+escapeHtml(med.unit)+'</td>'
      + '<td>'+formatQty(qty)+' '+escapeHtml(med.unit)+'</td>'
      + '<td class="'+cls+'">'+st.label+'</td>'
      + '</tr>';
  });

  document.getElementById('printReport').innerHTML =
    '<p class="p-h1">Laporan Stok Obat</p>'
    + '<p class="p-sub">Dicetak '+humanDate(toDateStr(new Date()))+'</p>'
    + '<table><thead><tr><th>Obat</th><th>Deskripsi</th><th>Dosis/hari</th><th>Stok awal</th><th>Stok saat ini</th><th>Estimasi habis</th></tr></thead>'
    + '<tbody>'+(stockRows || '<tr><td colspan="6">Belum ada obat.</td></tr>')+'</tbody></table>';

  window.print();
});

/* Catatan jadwal & catatan laporan stok -- disimpan ke Firestore (users/{uid}/notes/current)
 * supaya ikut tercetak di laporan & tersimpan permanen, bukan cuma di layar. */
let noteSaveTimer=null;
function saveNote(field, value){
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(()=>{
    setDoc(userDoc('notes', state.date), { [field]: value }, { merge:true }).catch(e=>{
      console.error(e); toast('Gagal menyimpan catatan.');
    });
  }, 600);
}
function flushNoteSave(field, value){
  clearTimeout(noteSaveTimer);
  setDoc(userDoc('notes', state.date), { [field]: value }, { merge:true })
    .then(()=> toast('Catatan tersimpan.'))
    .catch(e=>{ console.error(e); toast('Gagal menyimpan catatan.'); });
}
const scheduleNoteInput=document.getElementById('scheduleNoteInput');
scheduleNoteInput.addEventListener('input', e=> saveNote('schedule', e.target.value));
scheduleNoteInput.addEventListener('blur', e=> flushNoteSave('schedule', e.target.value));

/* Cetak jadwal minum obat dalam format besar & ringkas supaya bisa ditempel di
 * dinding -- daftar per waktu, urut pagi ke malam (sudah diurutkan oleh scheduleForDate). */
document.getElementById('printScheduleBtn').addEventListener('click', ()=>{
  if(!state.medDefs || !state.schedule){ toast('Data belum siap.'); return; }
  const slots = scheduleForDate(state.date);

  let body='';
  slots.forEach(slot=>{
    let itemsHtml='';
    (slot.items||[]).forEach(item=>{
      let med, note='';
      if(item.substitute){
        med = state.medDefs[item.primary];
        const backMed = state.medDefs[item.backup];
        if(backMed) note = ' <span class="poster-item-note">(pengganti: '+escapeHtml(backMed.name)+' bila habis)</span>';
      } else {
        med = state.medDefs[item.key];
      }
      if(!med) return;
      itemsHtml += '<div class="poster-item">• '+escapeHtml(med.name)+' '+escapeHtml(med.dose)+' — '+formatQty(item.qty)+' '+escapeHtml(med.unit)+note+'</div>';
      if(med.desc) itemsHtml += '<div class="poster-item-desc">'+escapeHtml(med.desc)+'</div>';
    });
    if(!itemsHtml) return;
    body += '<div class="poster-slot">'
      + '<span class="poster-time">'+slot.time+'</span><span class="poster-label">'+escapeHtml(slot.label)+'</span>'
      + itemsHtml
      + '</div>';
  });

  document.getElementById('printReport').innerHTML =
    '<p class="p-h1">Jadwal Minum Obat</p>'
    + '<p class="p-sub">Untuk '+humanDate(state.date)+'</p>'
    + (body || '<p class="poster-empty">Belum ada jadwal yang diatur. Tambahkan lewat halaman Atur.</p>')
    + noteBlockHtml(state.notes && state.notes.schedule);

  window.print();
});

/* ---------------- page navigation ---------------- */
function showPage(name){
  currentPage=name;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id==='page-'+name));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===name));
  if(name==='laporan') renderLaporan();
  if(name==='pengaturan'){ renderMedList(); renderScheduleEditor(); }
}
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click', ()=>showPage(btn.dataset.page)));

/* ---------------- date navigation ---------------- */
const datePicker=document.getElementById('datePicker');
datePicker.value=state.date;
document.getElementById('calBtn').addEventListener('click',()=>{
  if(datePicker.showPicker){ try{ datePicker.showPicker(); }catch(e){ datePicker.focus(); datePicker.click(); } }
  else datePicker.focus();
});
datePicker.addEventListener('change',()=>{
  if(!datePicker.value) return;
  state.date=datePicker.value;
  listenLog(state.date);
  listenNotesForDate(state.date);
  render();
  if(currentPage==='laporan') renderLaporan();
});
document.getElementById('todayBtn').addEventListener('click',()=>{
  state.date=toDateStr(new Date());
  datePicker.value=state.date;
  listenLog(state.date);
  listenNotesForDate(state.date);
  render();
  if(currentPage==='laporan') renderLaporan();
});

/* ---------------- auth: login / register / logout (email & password) ---------------- */
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const authErrorEl = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
const authForgotBtn = document.getElementById('authForgotBtn');
const authSubtitleEl = document.getElementById('authSubtitle');
let authMode = 'login'; // 'login' | 'register'

function setAuthError(msg){
  authErrorEl.textContent = msg || '';
  authErrorEl.classList.toggle('show', !!msg);
}
function setAuthMode(mode){
  authMode = mode;
  setAuthError('');
  if(mode==='login'){
    authSubtitleEl.textContent = 'Masuk untuk mencatat stok & jadwal minum obatmu sendiri. Data setiap akun tersimpan terpisah dan hanya bisa diakses oleh akun itu sendiri.';
    authSubmitBtn.textContent = 'Masuk';
    authToggleBtn.textContent = 'Belum punya akun? Daftar di sini';
    authForgotBtn.style.display = '';
  } else {
    authSubtitleEl.textContent = 'Buat akun baru dengan email & kata sandi. Data obatmu nanti hanya bisa diakses lewat akun ini.';
    authSubmitBtn.textContent = 'Daftar';
    authToggleBtn.textContent = 'Sudah punya akun? Masuk di sini';
    authForgotBtn.style.display = 'none';
  }
}
authToggleBtn.addEventListener('click', ()=> setAuthMode(authMode==='login' ? 'register' : 'login'));

function authErrorMessage(code){
  const map = {
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/missing-password': 'Kata sandi wajib diisi.',
    'auth/user-not-found': 'Akun dengan email ini tidak ditemukan.',
    'auth/wrong-password': 'Kata sandi salah.',
    'auth/invalid-credential': 'Email atau kata sandi salah.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar. Coba masuk saja.',
    'auth/weak-password': 'Kata sandi minimal 6 karakter.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
    'auth/network-request-failed': 'Gagal terhubung ke jaringan. Periksa koneksi internet.',
    'auth/operation-not-allowed': 'Login email & kata sandi belum diaktifkan di Firebase Console.',
  };
  return map[code] || 'Terjadi kesalahan. Coba lagi.';
}

authSubmitBtn.addEventListener('click', async ()=>{
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if(!email || !password){ setAuthError('Email dan kata sandi wajib diisi.'); return; }
  setAuthError('');
  authSubmitBtn.disabled = true;
  const busyLabel = authMode==='login' ? 'Masuk…' : 'Mendaftar…';
  authSubmitBtn.textContent = busyLabel;
  try{
    if(authMode==='login') await signInWithEmailAndPassword(auth, email, password);
    else await createUserWithEmailAndPassword(auth, email, password);
    authPasswordInput.value='';
  }catch(e){
    console.error(e);
    setAuthError(authErrorMessage(e.code));
  }finally{
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode==='login' ? 'Masuk' : 'Daftar';
  }
});

authForgotBtn.addEventListener('click', async ()=>{
  const email = authEmailInput.value.trim();
  if(!email){ setAuthError('Isi email dulu, lalu ketuk "Lupa kata sandi?" lagi.'); return; }
  try{
    await sendPasswordResetEmail(auth, email);
    setAuthError('');
    toast('Link reset kata sandi sudah dikirim ke '+email+'.');
  }catch(e){
    console.error(e);
    setAuthError(authErrorMessage(e.code));
  }
});

document.getElementById('signOutBtn').addEventListener('click', async ()=>{
  if(!confirm('Keluar dari akun ini?')) return;
  try{ await signOut(auth); }
  catch(e){ console.error(e); toast('Gagal keluar. Coba lagi.'); }
});

let unsubStock=null, unsubMedDefs=null, unsubSchedule=null, unsubRestock=null, unsubNotes=null;
function teardownListeners(){
  if(unsubStock) unsubStock();
  if(unsubMedDefs) unsubMedDefs();
  if(unsubSchedule) unsubSchedule();
  if(unsubRestock) unsubRestock();
  if(unsubNotes) unsubNotes();
  if(unsubLog) unsubLog();
  unsubStock=unsubMedDefs=unsubSchedule=unsubRestock=unsubNotes=unsubLog=null;
}
function resetAppState(){
  state.stock=null; state.log=null; state.medDefs=null; state.schedule=null; state.notes=null;
  state.date=toDateStr(new Date());
  datePicker.value=state.date;
  currentPage='jadwal';
  showPage('jadwal');
  restockKeysSig='';
  document.getElementById('scheduleNoteInput').value='';
}

async function bootApp(){
  setSync('loading');
  try{
    await Promise.all([ensureStock(), ensureMedDefs(), ensureSchedule()]);
    unsubStock = listenStock();
    unsubMedDefs = listenMedDefs();
    unsubSchedule = listenSchedule();
    listenLog(state.date);
    listenNotesForDate(state.date);
    unsubRestock = listenRestockHistory();
  }catch(e){
    console.error(e); setSync('err');
    toast('Tidak dapat terhubung ke Firestore. Pastikan Firestore sudah diaktifkan & aturan keamanan mengizinkan akun ini.');
  }
}

/* ---------------- boot ---------------- */
onAuthStateChanged(auth, async (user)=>{
  if(user){
    uid = user.uid;
    document.getElementById('accountEmail').textContent = user.email || '';
    document.getElementById('accountAvatar').textContent = (user.email||'?').charAt(0).toUpperCase();
    document.getElementById('authScreen').classList.remove('show');
    document.getElementById('appRoot').classList.add('show');
    await bootApp();
  } else {
    teardownListeners();
    uid = null;
    resetAppState();
    authEmailInput.value='';
    authPasswordInput.value='';
    setAuthMode('login');
    document.getElementById('appRoot').classList.remove('show');
    document.getElementById('authScreen').classList.add('show');
  }
});
