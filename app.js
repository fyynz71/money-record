// ===== Data (localStorage) =====
// tx: { id, type: 'in'|'out', amount, cat, date: 'YYYY-MM-DD', note }
// Pengeluaran: cat = 'primer' | 'sekunder' | 'tersier' | '' (belum dipilih). Pemasukan: cat = nama kategori.
const KEY = 'money-record';
const db = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  tx: [],
  incomeCats: ['Gaji', 'Hadiah', 'Bonus', 'Jualan', 'Lainnya'],
};
const persist = () => localStorage.setItem(KEY, JSON.stringify(db));

// Urutan = urutan menara dari atas ke bawah (primer sebagai pondasi)
const TIERS = {
  lain: { name: 'Tanpa tingkat', desc: 'Belum dipilih', color: '#9AA5A1' },
  tersier: { name: 'Tersier', desc: 'Gaya hidup', color: 'var(--tersier)' },
  sekunder: { name: 'Sekunder', desc: 'Membantu, tidak wajib', color: 'var(--sekunder)' },
  primer: { name: 'Primer', desc: 'Wajib tiap bulan', color: 'var(--primer)' },
};

// ===== Helpers =====
const $ = (s) => document.querySelector(s);
const rp = (n) => 'Rp' + n.toLocaleString('id-ID');
const iso = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, zona waktu lokal
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let month = new Date(); month.setDate(1);
let editing = null; // id transaksi yang sedang diubah

// ===== Beranda =====
function render() {
  const ym = iso(month).slice(0, 7);
  const label = month.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  $('#monthLabel').textContent = label;
  $('#monthPick').value = ym;
  $('#balanceLabel').textContent = ym === iso(new Date()).slice(0, 7) ? 'Sisa bulan ini' : 'Sisa ' + label;

  const txs = db.tx.filter((t) => t.date.startsWith(ym))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const sumIn = txs.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const byTier = { lain: 0, tersier: 0, sekunder: 0, primer: 0 };
  txs.filter((t) => t.type === 'out').forEach((t) => (byTier[t.cat || 'lain'] += t.amount));
  const sumOut = byTier.lain + byTier.tersier + byTier.sekunder + byTier.primer;

  $('#balance').textContent = (sumIn - sumOut < 0 ? '−' : '') + rp(Math.abs(sumIn - sumOut));
  $('#balance').classList.toggle('neg', sumIn - sumOut < 0);
  $('#sumIn').textContent = rp(sumIn);
  $('#sumOut').textContent = rp(sumOut);

  // Menara: tersier di atas, primer sebagai pondasi di bawah
  const tower = $('#tower');
  tower.classList.toggle('empty', !sumOut);
  tower.innerHTML = Object.entries(byTier).filter(([, v]) => v)
    .map(([k, v]) => `<i style="flex:${v};background:${TIERS[k].color}"></i>`).join('');
  $('#legend').innerHTML = Object.entries(byTier).filter(([k, v]) => k !== 'lain' || v).map(([k, v]) => `
    <li><b>${TIERS[k].name}</b><b>${rp(v)}</b>
    <small>${TIERS[k].desc}</small><small class="pct" style="color:${TIERS[k].color}">${sumOut ? Math.round((v / sumOut) * 100) : 0}%</small></li>`).join('');

  // Daftar per tanggal
  if (!txs.length) {
    $('#list').innerHTML = '<p class="empty-msg">Belum ada transaksi bulan ini.<br>Ketuk “Catat transaksi” untuk mulai.</p>';
    return;
  }
  let html = '', last = '';
  for (const t of txs) {
    if (t.date !== last) { html += `<h2>${dayLabel(t.date)}</h2>`; last = t.date; }
    const out = t.type === 'out';
    const tier = TIERS[t.cat || 'lain'];
    const cat = out ? tier.name : t.cat;
    html += `<button class="row" data-id="${t.id}" style="--c:${out ? tier.color : 'var(--in)'}">
      <span><b>${esc(t.note || cat)}</b><small>${esc(cat)}</small></span>
      <b class="amt ${out ? '' : 'in'}">${out ? '−' : '+'}${rp(t.amount)}</b></button>`;
  }
  $('#list').innerHTML = html;
}

function dayLabel(date) {
  const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
  if (date === iso(today)) return 'Hari ini';
  if (date === iso(y)) return 'Kemarin';
  return new Date(date + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

const shift = (n) => { month.setMonth(month.getMonth() + n); render(); };
$('#prev').onclick = () => shift(-1);
$('#next').onclick = () => shift(1);

// Ketuk label bulan → pemilih bulan & tahun bawaan HP
$('#monthLabel').onclick = () => {
  try { $('#monthPick').showPicker(); } catch { $('#monthPick').focus(); }
};
$('#monthPick').onchange = (e) => {
  if (!e.target.value) return;
  month = new Date(e.target.value + '-01T00:00');
  render();
};

// Geser layar kiri/kanan untuk pindah bulan
let touch = null;
$('#home').addEventListener('touchstart', (e) => { touch = e.touches[0]; }, { passive: true });
$('#home').addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.clientX;
  const dy = e.changedTouches[0].clientY - touch.clientY;
  touch = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
}, { passive: true });
$('#addBtn').onclick = () => openForm();

$('#list').onclick = (e) => { const r = e.target.closest('.row'); if (r) openForm(db.tx.find((t) => t.id === +r.dataset.id)); };

// ===== Form =====
const form = $('#form');
const amountInput = $('#amount');

function renderChips(selected) {
  $('#chips').innerHTML = db.incomeCats.map((c) =>
    `<label><input type="radio" name="inCat" value="${esc(c)}" ${c === selected ? 'checked' : ''}><span>${esc(c)}</span></label>`
  ).join('') + '<button type="button" id="newCat">+ Kategori baru</button>';
}

function setType(type) {
  form.type.value = type;
  $('#outCats').hidden = type !== 'out';
  $('#inCats').hidden = type !== 'in';
  amountInput.classList.toggle('in', type === 'in');
}

function openForm(t) {
  editing = t ? t.id : null;
  form.reset();
  $('#formTitle').textContent = t ? 'Ubah transaksi' : 'Catat transaksi';
  $('#save').textContent = t ? 'Simpan perubahan' : 'Simpan';
  $('#del').hidden = !t;
  setType(t ? t.type : 'out');
  renderChips(t && t.type === 'in' ? t.cat : db.incomeCats[0]);
  if (t && t.type === 'out' && t.cat) form.tier.value = t.cat;
  amountInput.value = t ? rp(t.amount) : '';
  $('#date').value = t ? t.date : iso(new Date());
  $('#note').value = t ? t.note : '';
  $('#home').hidden = true;
  form.hidden = false;
  window.scrollTo(0, 0);
  if (!t) amountInput.focus();
}

// Tingkat pengeluaran opsional: ketuk pilihan yang sudah terpilih untuk membatalkannya
let tierWasChecked = false;
$('#outCats').addEventListener('pointerdown', (e) => {
  const input = e.target.closest('.opt')?.querySelector('input');
  tierWasChecked = !!input && input.checked;
});
$('#outCats').addEventListener('click', (e) => {
  if (e.target.name === 'tier' && tierWasChecked) { e.target.checked = false; tierWasChecked = false; }
});

function closeForm() {
  form.hidden = true;
  $('#home').hidden = false;
  render();
}

form.addEventListener('change', (e) => { if (e.target.name === 'type') setType(e.target.value); });
amountInput.oninput = () => {
  const n = +amountInput.value.replace(/\D/g, '');
  amountInput.value = n ? rp(n) : '';
};
$('#chips').onclick = (e) => {
  if (e.target.id !== 'newCat') return;
  const name = (prompt('Nama kategori pemasukan baru') || '').trim();
  if (!name) return;
  if (!db.incomeCats.includes(name)) { db.incomeCats.push(name); persist(); }
  renderChips(name);
};
$('#cancel').onclick = closeForm;

form.onsubmit = (e) => {
  e.preventDefault();
  const amount = +amountInput.value.replace(/\D/g, '');
  if (!amount) { amountInput.focus(); return; }
  const type = form.type.value;
  const data = {
    type,
    amount,
    cat: type === 'out' ? form.tier.value : form.inCat.value,
    date: $('#date').value,
    note: $('#note').value.trim(),
  };
  if (editing) Object.assign(db.tx.find((t) => t.id === editing), data);
  else db.tx.push({ id: Date.now(), ...data });
  persist();
  month = new Date(data.date + 'T00:00'); month.setDate(1);
  closeForm();
};

$('#del').onclick = () => {
  if (!confirm('Hapus transaksi ini?')) return;
  db.tx = db.tx.filter((t) => t.id !== editing);
  persist();
  closeForm();
};

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
