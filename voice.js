// Pembaca kalimat suara berbasis aturan (tanpa AI).
// Contoh: "pengeluaran 50 ribu, hari ini, beli galon"
//   → { type: 'out', amount: 50000, cat: '', date: '<hari ini>', note: 'Beli galon' }
// Urutan bagian kalimat bebas; yang tidak dikenali menjadi catatan.

const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const MULT = { ribu: 1e3, rb: 1e3, k: 1e3, juta: 1e6, jt: 1e6 };
const UNITS = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
const NUM_WORDS = new Set([...Object.keys(UNITS), 'sepuluh', 'sebelas', 'seratus', 'seribu', 'sejuta', 'setengah', 'belas', 'puluh', 'ratus', 'ribu', 'juta']);

// "dua juta tiga ratus lima puluh ribu" → 2350000
function wordsToNumber(words) {
  let total = 0, cur = 0, d = 0;
  for (const w of words) {
    if (w in UNITS) d = UNITS[w];
    else if (w === 'setengah') d = 0.5;
    else if (w === 'sepuluh') cur += 10;
    else if (w === 'sebelas') cur += 11;
    else if (w === 'seratus') cur += 100;
    else if (w === 'belas') { cur += d + 10; d = 0; }
    else if (w === 'puluh') { cur += d * 10; d = 0; }
    else if (w === 'ratus') { cur += d * 100; d = 0; }
    else if (w === 'seribu') total += 1e3;
    else if (w === 'sejuta') total += 1e6;
    else if (w === 'ribu') { total += (cur + d || 1) * 1e3; cur = d = 0; }
    else if (w === 'juta') { total += (cur + d || 1) * 1e6; cur = d = 0; }
  }
  return total + cur + d;
}

function parseSpeech(text, incomeCats, now = new Date()) {
  let s = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const take = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
  const ymd = (d) => d.toLocaleDateString('en-CA');

  // Jenis
  const t = take(/\b(pemasukan|pengeluaran)\b/);
  const type = t && t[1] === 'pemasukan' ? 'in' : 'out';

  // Tanggal
  const date = new Date(now);
  let m;
  if (take(/\bkemarin lusa\b/)) date.setDate(date.getDate() - 2);
  else if (take(/\bkemarin\b/)) date.setDate(date.getDate() - 1);
  else if (take(/\bhari ini\b/)) { /* hari ini */ }
  else if ((m = take(new RegExp(`\\b(?:tanggal |tgl )?(\\d{1,2}) (${MONTHS.join('|')})(?: (\\d{4}))?\\b`)))) {
    date.setFullYear(m[3] ? +m[3] : now.getFullYear(), MONTHS.indexOf(m[2]), +m[1]);
  } else if ((m = take(/\b(?:tanggal|tgl) (\d{1,2})\b/))) date.setDate(+m[1]);

  // Kategori: tingkat untuk pengeluaran (opsional), nama kategori untuk pemasukan
  let cat = '';
  if (type === 'out') {
    m = take(/\b(primer|sekunder|tersier)\b/);
    if (m) cat = m[1];
  } else {
    cat = incomeCats.find((c) => take(new RegExp(`\\b${c.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)))
      || (incomeCats.includes('Lainnya') ? 'Lainnya' : incomeCats[0]);
  }

  // Jumlah: "50 ribu", "1,5 juta", "Rp50.000", atau "lima puluh ribu"
  let amount = 0;
  if ((m = take(/(\d+(?:[.,]\d+)*) ?(ribu|rb|k|juta|jt)\b/))) {
    const n = /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? +m[1].replace(/\./g, '') : parseFloat(m[1].replace(',', '.'));
    amount = n * MULT[m[2]];
  } else if ((m = take(/\brp\.? ?(\d+(?:[.,]\d{3})*)/))) {
    amount = +m[1].replace(/[.,]/g, '');
  } else {
    // Angka tanpa satuan: ambil yang terbesar (mis. "50.000"), bukan "2" pada "beli 2 galon"
    const nums = [...s.matchAll(/\d+(?:[.,]\d{3})*/g)];
    if (nums.length) {
      const best = nums.reduce((a, b) => (+b[0].replace(/[.,]/g, '') > +a[0].replace(/[.,]/g, '') ? b : a));
      amount = +best[0].replace(/[.,]/g, '');
      s = s.replace(best[0], ' ');
    } else {
      const words = s.split(' ');
      const start = words.findIndex((w) => NUM_WORDS.has(w));
      if (start >= 0) {
        let end = start;
        while (end < words.length && NUM_WORDS.has(words[end])) end++;
        amount = wordsToNumber(words.slice(start, end));
        words.splice(start, end - start);
        s = words.join(' ');
      }
    }
  }

  // Sisa kalimat menjadi catatan
  const note = s.replace(/\b(rupiah|rp)\b/g, ' ').replace(/[,.;:!?]/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    type,
    amount: Math.round(amount),
    cat,
    date: ymd(date),
    note: note.charAt(0).toUpperCase() + note.slice(1),
  };
}
