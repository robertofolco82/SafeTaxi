/* Calendario italiano per lo storico delle attese (IMP-07, parte 2): regole pure, senza DOM.
   Tipi di giorno, sempre nell'ora italiana (Europe/Rome):
   - 'festivo': domenica e festività nazionali (L. 260/1949 e successive modifiche);
   - 'sabato';
   - 'lavorativo': da lunedì a venerdì non festivi.
   San Francesco (4 ottobre) è festa nazionale dal 2026: L. 8 ottobre 2025 n. 151 (GU n. 236 del 10/10/2025),
   https://www.gazzettaufficiale.it/eli/id/2025/10/10/25G00153/sg
   I santi patroni delle singole città non sono compresi (festa solo locale): DA VERIFICARE città per città.
   Stessa regola nel database: private.holiday_name e private.day_type (migrazione dello storico delle attese). */

export const DAY_TYPES = {lavorativo:'Giorno lavorativo', sabato:'Sabato', festivo:'Domenica o festivo'};

const FIXED = [
  ['01-01', 'Capodanno'], ['01-06', 'Epifania'], ['04-25', 'Festa della Liberazione'], ['05-01', 'Festa del Lavoro'],
  ['06-02', 'Festa della Repubblica'], ['08-15', 'Ferragosto'], ['11-01', 'Ognissanti'], ['12-08', 'Immacolata Concezione'],
  ['12-25', 'Natale'], ['12-26', 'Santo Stefano']
];
const pad = n => String(n).padStart(2, '0');

// Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher): 'AAAA-MM-GG'.
export function easterSunday(y){
  const a = y % 19, b = Math.floor(y/100), c = y % 100, d = Math.floor(b/4), e = b % 4, f = Math.floor((b + 8)/25),
    g = Math.floor((b - f + 1)/3), h = (19*a + b - d - g + 15) % 30, i = Math.floor(c/4), k = c % 4,
    l = (32 + 2*e + 2*i - h - k) % 7, m = Math.floor((a + 11*h + 22*l)/451),
    month = Math.floor((h + l - 7*m + 114)/31), day = ((h + l - 7*m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

// Nome della festività nazionale di una data 'AAAA-MM-GG', oppure null.
export function holidayName(iso){
  const y = +iso.slice(0, 4), md = iso.slice(5, 10);
  const fixed = FIXED.find(([d]) => d === md);
  if (fixed) return fixed[1];
  if (md === '10-04' && y >= 2026) return 'San Francesco';
  const e = new Date(easterSunday(y) + 'T12:00:00Z'); e.setUTCDate(e.getUTCDate() + 1);
  if (e.toISOString().slice(0, 10) === iso) return 'Lunedì dell\'Angelo';
  return null;
}

// Tipo di giorno di una data 'AAAA-MM-GG'.
export function dayType(iso){
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay();
  if (dow === 0 || holidayName(iso)) return 'festivo';
  return dow === 6 ? 'sabato' : 'lavorativo';
}

const romeFmt = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});

// Data e ora italiane di un istante (ms): {date:'AAAA-MM-GG', hour, minute}.
export function romeParts(ts){
  const p = Object.fromEntries(romeFmt.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, hour:+p.hour, minute:+p.minute};
}

// Istante (ms) di una data e ora italiane: serve ai dati DEMO e ai test.
export function romeTime(iso, hour = 0, minute = 0){
  const guess = Date.parse(`${iso}T${pad(hour)}:${pad(minute)}:00Z`);
  let ts = guess - 3600e3;
  for (let i = 0; i < 2; i++) {
    const p = romeParts(ts), shown = Date.parse(`${p.date}T${pad(p.hour)}:${pad(p.minute)}:00Z`);
    ts += guess - shown;
  }
  return ts;
}

// Aggiunge giorni a una data 'AAAA-MM-GG'.
export function addDays(iso, n){
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
