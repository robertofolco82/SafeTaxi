import {test, expect} from '@playwright/test';
import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

// Test contro lo stack Supabase locale (`npx supabase start`): database, autenticazione ed email (Mailpit).
// La chiave di servizio locale serve solo a simulare il moderatore dal "pannello".
let API, MAIL, SERVICE, PUBLISHABLE;
test.beforeAll(() => {
  const status = JSON.parse(execSync('npx supabase status -o json', {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));
  ({API_URL: API, MAILPIT_URL: MAIL, SERVICE_ROLE_KEY: SERVICE, PUBLISHABLE_KEY: PUBLISHABLE} = status);
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function lastEmailLink(to, subject){
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}" subject:"${subject}"`)}`)).json();
    if (list.messages && list.messages.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json();
      const m = msg.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?[^\s)\]]+/);
      if (m) return m[0];
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Nessuna email "${subject}" per ${to}`);
}
const serviceHeaders = () => ({apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json'});
async function rest(path, init = {}){
  const r = await fetch(`${API}/rest/v1/${path}`, {...init, headers: {...serviceHeaders(), ...(init.headers || {})}});
  expect(r.ok, await r.clone().text()).toBe(true);
  return r.status === 204 ? null : r.json();
}
// Piccolo file WAV (0,1 s di silenzio) per simulare una registrazione audio.
function wav(){
  const n = 800, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44);
  return b;
}
async function moderate(description, status){
  const r = await fetch(`${API}/rest/v1/reports?description=eq.${encodeURIComponent(description)}`, {
    method: 'PATCH', body: JSON.stringify({status}),
    headers: {apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal'}});
  expect(r.ok, await r.text()).toBe(true);
}

test.beforeEach(async ({page, context}) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  // MediaPipe scrive in console come "errore" un messaggio informativo sul motore TensorFlow Lite: non è un errore.
  page.on('console', m => { if (m.type() === 'error' && !/TensorFlow Lite XNNPACK/.test(m.text())) page.errors.push('console: ' + m.text()); });
  await context.route(u => !['127.0.0.1', 'localhost'].includes(u.hostname), route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('tile.openstreetmap.org')) return route.fulfill({contentType: 'image/png', body: PNG});
    if (url.pathname === '/reverse') return route.fulfill({json: {address: {road: 'Via del Viminale', city: 'Roma'}}});
    return route.abort();
  });
  await page.goto('/');
  await page.locator('#m-privacy').getByRole('button', {name: 'Ho capito'}).click();
});

test.afterEach(async ({page}) => {
  expect(page.errors, 'errori in console').toEqual([]);
});

test('i dati arrivano dal database: feed, Termometro e rating per targa', async ({page}) => {
  await expect(page.locator('#feed .feed-item').first()).toBeVisible();
  await expect(page.locator('#feed')).toContainText('•••');
  await expect(page.locator('#thermo .val')).not.toContainText('—');
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.fill('#lookupPlate', 'AB123CD');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate7');
  // Oltre al rating si vedono le segnalazioni di quel taxi, senza targa in chiaro.
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni su questo taxi');
  await expect(page.locator('#lookupResult .feed-item').first()).toBeVisible();
  await expect(page.locator('#lookupResult')).not.toContainText('AB123CD');
  // Targa e licenza insieme: stesso taxi, stesse 7 segnalazioni (IMP-02).
  await page.fill('#lookupLicense', '2468');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('targa e licenza');
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate7');
  await page.fill('#lookupLicense', '');
  await page.fill('#lookupPlate', 'ZZ999ZZ');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente: 0');
  // Limite di 5 ricerche all'ora per utente: la sesta è bloccata.
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', {name: 'Verifica'}).click();
    await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente');
  }
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('limite di 5 ricerche');
  // Il blocco (HTTP 400) è voluto: il browser lo registra in console.
  page.errors = page.errors.filter(e => !e.includes('status of 400'));
});

test('segnalazione da ospite: accesso anonimo, moderazione e nessuna pubblicazione immediata', async ({page}) => {
  const description = `Ospite ${Date.now()}: tassametro non avviato alla partenza della corsa.`;
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await page.fill('#reportForm [name=name]', 'Mario Rossi');
  await page.fill('#reportForm [name=licenza]', '1234');
  await page.fill('#reportForm [name=targa]', 'QX' + String(Date.now()).slice(-3) + 'ZZ');
  await page.selectOption('#reportCity', 'roma');
  await page.selectOption('#reportType', 'altro');
  await page.locator('#reportStars span').nth(1).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('anonima inviata: sarà pubblicata dopo la revisione');
  await expect(page.locator('#feed')).not.toContainText(description);
  await page.locator('#profileBtn').click();
  await expect(page.locator('#profileBox')).toContainText('Le tue segnalazioni');
  await expect(page.locator('#profileBox')).toContainText('In moderazione');
  await expect(page.locator('#profileBox')).toContainText('Ospite');
});

test('registrazione con conferma email, segnalazione verificata, punti alla pubblicazione e recupero password', async ({page}) => {
  const email = `test.${Date.now()}@example.com`, description = `Verificato ${Date.now()}: percorso molto più lungo del necessario.`;
  await page.locator('#profileBtn').click();
  await page.getByRole('button', {name: 'Accedi o registrati'}).click();
  await page.fill('#loginEmail', email);
  await page.fill('#loginPwd', 'password-di-prova-1');
  await page.getByRole('button', {name: 'Crea account'}).click();
  await expect(page.locator('#loginNote')).toContainText('Ti abbiamo inviato un\'email');

  // Senza conferma non si entra.
  await page.fill('#loginPwd', 'password-di-prova-1');
  await page.locator('#m-login').getByRole('button', {name: 'Accedi', exact: true}).click();
  await expect(page.locator('#toast')).toContainText('Email non ancora confermata');
  // Il rifiuto (HTTP 400) di questo tentativo è voluto: il browser lo registra in console.
  page.errors = page.errors.filter(e => !e.includes('status of 400'));

  // Link di conferma dall'email: l'app completa l'accesso al ritorno.
  await page.goto(await lastEmailLink(email, 'Confirm'));
  await expect(page.locator('#profileBtn')).toHaveAttribute('data-auth', 'in');
  await page.locator('#profileBtn').click();
  await expect(page.locator('#profileBox')).toContainText(email);
  await expect(page.locator('#profileBox')).toContainText('verificato');

  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await expect(page.locator('#anonNotice')).toContainText('Segnalazione verificata');
  await page.fill('#reportForm [name=name]', 'Giulia Verdi');
  await page.fill('#reportForm [name=licenza]', '4321');
  await page.fill('#reportForm [name=targa]', 'KW' + String(Date.now()).slice(-3) + 'YY');
  await page.selectOption('#reportCity', 'milano');
  await page.selectOption('#reportType', 'percorso');
  await page.locator('#reportStars span').nth(1).click();
  // Mentre scrive, l'app avvisa se usa un'etichetta di reato; scritto come fatto, l'avviso sparisce.
  await page.fill('#reportForm [name=description]', 'Il tassista è un truffatore, ha allungato la strada.');
  await expect(page.locator('#descHint')).toContainText('Descrivi cosa è successo');
  await page.fill('#reportForm [name=description]', description);
  await expect(page.locator('#descHint')).toBeHidden();
  await page.fill('#reportForm [name=meter]', '24');
  await page.fill('#reportForm [name=cost]', '38');
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  // Account verificato e testo corretto: pubblicata subito, con i 50 punti.
  await expect(page.locator('#toast')).toContainText('Segnalazione pubblicata: +50 punti');
  await page.reload();
  await expect(page.locator('#feed')).toContainText(description.slice(0, 30));
  await expect(page.locator('.feed-item', {hasText: description.slice(0, 30)})).toContainText('Tassametro € 24,00 · Pagato € 38,00');

  // Con un'etichetta di reato la segnalazione non va online subito: passa dalla revisione.
  const flagged = `Verificato ${Date.now()}: è un ladro, mi ha chiesto il doppio del tassametro.`;
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await page.fill('#reportForm [name=name]', 'Giulia Verdi');
  await page.fill('#reportForm [name=licenza]', '4321');
  await page.fill('#reportForm [name=targa]', 'KZ' + String(Date.now()).slice(-3) + 'YY');
  await page.selectOption('#reportCity', 'milano');
  await page.selectOption('#reportType', 'tariffa');
  await page.locator('#reportStars span').nth(0).click();
  await page.fill('#reportForm [name=description]', flagged);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('la pubblicherà un moderatore dopo la revisione');
  const [held] = await rest(`reports?description=eq.${encodeURIComponent(flagged)}&select=status,auto_flags`);
  expect(held).toEqual({status: 'in_moderazione', auto_flags: ['etichetta_reato']});
  await page.locator('#profileBtn').click();
  await expect(page.locator('#profileBox')).toContainText('Pubblicata');
  await expect(page.locator('#profileBox .thermo .val')).toHaveText('50');

  // Uscita e recupero password.
  await page.getByRole('button', {name: 'Esci'}).click();
  await expect(page.locator('#profileBox')).toContainText('Ospite');
  await page.getByRole('button', {name: 'Accedi o registrati'}).click();
  await page.fill('#loginEmail', email);
  await page.getByRole('button', {name: 'Password dimenticata?'}).click();
  await expect(page.locator('#loginNote')).toContainText('riceverai un link');
  await page.goto(await lastEmailLink(email, 'Reset'));
  await expect(page.locator('#m-newpwd')).toHaveClass(/open/);
  await page.fill('#newPwd', 'nuova-password-2');
  await page.getByRole('button', {name: 'Salva password'}).click();
  await expect(page.locator('#toast')).toContainText('Password aggiornata');
});

test('Google: il pulsante avvia il login OAuth di Supabase', async ({page}) => {
  await page.locator('#profileBtn').click();
  await page.getByRole('button', {name: 'Accedi o registrati'}).click();
  const [req] = await Promise.all([
    page.waitForRequest(r => r.url().startsWith(`${API}/auth/v1/authorize`)),
    page.getByRole('button', {name: /Continua con Google/}).click(),
  ]);
  const url = new URL(req.url());
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4174/');
  page.errors = [];  // la pagina di Supabase locale segnala che Google non è configurato in locale
});

test('allegati: foto ripulita e audio caricati, verificati dal server; la foto approvata compare nel feed', async ({page}) => {
  const description = `Allegati ${Date.now()}: tassista al telefono per tutta la corsa, audio e foto.`;
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await page.setInputFiles('#gallery', 'tests/fixtures/volto-con-gps.jpg');
  await expect(page.locator('#thumbs .faces')).toHaveText('1', {timeout: 30000});
  await page.setInputFiles('#micAudio', {name: 'registrazione.wav', mimeType: 'audio/wav', buffer: wav()});
  await expect(page.locator('#thumbs .thumb')).toHaveCount(2);
  await page.fill('#reportForm [name=name]', 'Paolo Neri');
  await page.fill('#reportForm [name=licenza]', '5678');
  await page.fill('#reportForm [name=targa]', 'PX' + String(Date.now()).slice(-3) + 'KK');
  await page.selectOption('#reportCity', 'roma');
  await page.selectOption('#reportType', 'comportamento');
  await page.locator('#reportStars span').nth(1).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('anonima inviata: sarà pubblicata dopo la revisione');
  await expect(page.locator('#toast')).not.toContainText('Allegati non caricati');

  const [report] = await rest(`reports?description=eq.${encodeURIComponent(description)}&select=id`);
  const rows = await rest(`attachments?report_id=eq.${report.id}&select=id,kind,mime_type,exif_stripped,faces_blurred,faces_detected,is_public&order=kind`);
  expect(rows.map(r => [r.kind, r.mime_type, r.exif_stripped, r.faces_blurred, r.faces_detected, r.is_public])).toEqual([
    ['foto', 'image/jpeg', true, true, 1, false],
    ['audio', 'audio/wav', false, false, null, false],
  ]);

  // Il moderatore pubblica la segnalazione e, dopo aver controllato le targhe, rende pubblica la foto.
  await rest(`reports?id=eq.${report.id}`, {method: 'PATCH', body: JSON.stringify({status: 'pubblicata'}), headers: {Prefer: 'return=minimal'}});
  await rest(`attachments?report_id=eq.${report.id}&kind=eq.foto`, {method: 'PATCH', body: JSON.stringify({plates_blurred: true, is_public: true}), headers: {Prefer: 'return=minimal'}});
  await page.reload();
  const item = page.locator('#feed .feed-item', {hasText: description.slice(0, 25)});
  await expect(item.locator('.feed-photos img')).toHaveCount(1);
  await expect.poll(() => item.locator('.feed-photos img').evaluate(img => img.complete && img.naturalWidth)).toBeGreaterThan(0);
});

test('il server rifiuta e cancella una foto che contiene ancora i metadati', async () => {
  const sb = createClient(API, PUBLISHABLE, {auth: {persistSession: false}});
  const {error: authError} = await sb.auth.signInAnonymously();
  expect(authError).toBeNull();
  const {data: reportId, error} = await sb.rpc('submit_report', {p_city: 'roma', p_type: 'altro', p_rating: 2,
    p_description: 'Prova di caricamento diretto senza passare dall\'app.', p_reporter_name: 'Test Diretto',
    p_plate: 'ZT' + String(Date.now()).slice(-3) + 'QQ', p_license: '999'});
  expect(error).toBeNull();
  const path = `${reportId}/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from('attachments').upload(path, readFileSync('tests/fixtures/volto-con-gps.jpg'), {contentType: 'image/jpeg'});
  expect(up.error).toBeNull();
  const res = await sb.functions.invoke('register-attachment', {body: {report_id: reportId, path, kind: 'foto', faces_detected: 0}});
  expect(res.error?.context?.status).toBe(422);
  expect((await res.error.context.json()).error).toContain('EXIF');
  expect(await rest(`attachments?report_id=eq.${reportId}&select=id`)).toEqual([]);
  const still = await fetch(`${API}/storage/v1/object/attachments/${path}`, {headers: serviceHeaders()});
  expect(still.ok).toBe(false);
  // E un altro utente non può registrare file sulla segnalazione altrui.
  const other = createClient(API, PUBLISHABLE, {auth: {persistSession: false}});
  await other.auth.signInAnonymously();
  const forbidden = await other.functions.invoke('register-attachment', {body: {report_id: reportId, path, kind: 'foto'}});
  expect(forbidden.error?.context?.status).toBe(403);
});

test('moderazione: dati riservati, sfocatura targhe, pubblicazione e replica del tassista', async ({page}) => {
  test.setTimeout(120000);
  const stamp = Date.now(), plate = 'MQ' + String(stamp).slice(-3) + 'RT';
  const description = `Moderazione ${stamp}: auto con il tassametro spento per tutto il tragitto.`;
  const modEmail = `moderatore.${stamp}@example.com`, modPassword = 'password-moderatore-1';
  // Moderatore creato come farebbe l'amministratore dal pannello: utente confermato e ruolo "moderatore".
  const created = await (await fetch(`${API}/auth/v1/admin/users`, {method: 'POST', headers: serviceHeaders(),
    body: JSON.stringify({email: modEmail, password: modPassword, email_confirm: true})})).json();
  await rest(`profiles?id=eq.${created.id}`, {method: 'PATCH', body: JSON.stringify({role: 'moderatore'}), headers: {Prefer: 'return=minimal'}});

  // 1. Un ospite invia la segnalazione con una foto.
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await page.setInputFiles('#gallery', 'tests/fixtures/volto-con-gps.jpg');
  await expect(page.locator('#thumbs .faces')).toHaveText('1', {timeout: 30000});
  await page.fill('#reportForm [name=name]', 'Paola Blu');
  await page.fill('#reportForm [name=licenza]', '4455');
  await page.fill('#reportForm [name=targa]', plate);
  await page.selectOption('#reportCity', 'torino');
  await page.selectOption('#reportType', 'tariffa');
  await page.locator('#reportStars span').nth(0).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('dopo la revisione di un moderatore');
  const [report] = await rest(`reports?description=eq.${encodeURIComponent(description)}&select=id`);
  const [photoBefore] = await rest(`attachments?report_id=eq.${report.id}&select=id,storage_path`);

  // 2. Il moderatore entra (browser "pulito") e trova la segnalazione con i dati riservati.
  const loginModerator = async () => {
    await page.locator('#profileBtn').click();
    await page.getByRole('button', {name: 'Accedi o registrati'}).click();
    await page.fill('#loginEmail', modEmail);
    await page.fill('#loginPwd', modPassword);
    await page.locator('#m-login').getByRole('button', {name: 'Accedi', exact: true}).click();
    await page.getByRole('button', {name: 'Apri la moderazione'}).click();
  };
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#m-privacy').getByRole('button', {name: 'Ho capito'}).click();
  await loginModerator();
  const card = page.locator(`[data-report="${report.id}"]`);
  await expect(card).toContainText('Paola Blu');
  await expect(card).toContainText(plate);
  await expect(card).toContainText('1 volto sfocato');

  // 3. Sfoca una targa trascinando sulla foto: la foto viene sostituita e le targhe risultano verificate.
  const download = async p => Buffer.from(await (await fetch(`${API}/storage/v1/object/attachments/${p}`, {headers: serviceHeaders()})).arrayBuffer()).toString('base64');
  const originalPhoto = await download(photoBefore.storage_path);
  await card.getByRole('button', {name: 'Sfoca targhe'}).click();
  const canvas = page.locator('#blurCanvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(c => c.width)).toBeGreaterThan(100);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width*0.2, box.y + box.height*0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width*0.6, box.y + box.height*0.85, {steps: 5});
  await page.mouse.up();
  await page.getByRole('button', {name: 'Salva e conferma targhe'}).click();
  await expect(page.locator('#toast')).toContainText('Targhe sfocate');
  const [photoAfter] = await rest(`attachments?id=eq.${photoBefore.id}&select=storage_path,plates_blurred,moderated_by,is_public`);
  expect(photoAfter.storage_path).not.toBe(photoBefore.storage_path);
  expect(photoAfter).toMatchObject({plates_blurred: true, moderated_by: created.id, is_public: false});
  expect((await fetch(`${API}/storage/v1/object/attachments/${photoBefore.storage_path}`, {headers: serviceHeaders()})).ok).toBe(false);
  // Confronto dei pixel: dentro il rettangolo la foto cambia molto (pixelata), fuori resta quasi uguale.
  const diff = await page.evaluate(async ([a, b]) => {
    const pixels = async b64 => { const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      return {w: bmp.width, h: bmp.height, d: x.getImageData(0, 0, bmp.width, bmp.height).data}; };
    const A = await pixels(a), B = await pixels(b);
    const mean = (x0, x1, y0, y1) => { let s = 0, n = 0; for (let y = Math.floor(y0*A.h); y < y1*A.h; y += 2) for (let x = Math.floor(x0*A.w); x < x1*A.w; x += 2) { const i = (y*A.w + x)*4; s += Math.abs(A.d[i] - B.d[i]); n++; } return s/n; };
    return {inside: mean(0.25, 0.55, 0.72, 0.83), outside: mean(0.05, 0.9, 0.05, 0.6)};
  }, [originalPhoto, await download(photoAfter.storage_path)]);
  expect(diff.inside).toBeGreaterThan(3*diff.outside);

  // 4. Approva la foto e pubblica la segnalazione: compare nel feed con la foto.
  await card.getByRole('button', {name: 'Targhe ok, pubblica'}).click();
  await expect(page.locator('#toast')).toContainText('Foto approvata');
  await card.getByRole('button', {name: 'Pubblica', exact: true}).click();
  await expect(page.locator(`[data-report="${report.id}"]`)).toHaveCount(0);
  await page.getByRole('button', {name: /Home/}).click();
  const item = page.locator('#feed .feed-item', {hasText: description.slice(0, 30)});
  await expect(item.locator('.feed-photos img')).toHaveCount(1);

  // 5. Il tassista replica (da ospite), il moderatore verifica e pubblica.
  await page.locator('#profileBtn').click();
  await page.getByRole('button', {name: 'Esci'}).click();
  await page.getByRole('button', {name: /Home/}).click();
  await item.getByRole('button', {name: 'Sei il tassista? Replica'}).click();
  await page.fill('#replyIdent', plate.toLowerCase());
  await page.fill('#replyContact', 'tassista@example.com');
  await page.fill('#replyBody', 'Il tassametro era acceso: la ricevuta lo dimostra, sono disponibile a chiarire.');
  await page.getByRole('button', {name: 'Invia replica'}).click();
  await expect(page.locator('#toast')).toContainText('Replica inviata');
  await expect(item.locator('.reply')).toHaveCount(0);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#m-privacy').getByRole('button', {name: 'Ho capito'}).click();
  await loginModerator();
  const replyCard = page.locator('[data-reply]', {hasText: 'la ricevuta lo dimostra'});
  await expect(replyCard).toContainText('corrisponde alla segnalazione');
  await expect(replyCard).toContainText('tassista@example.com');
  await replyCard.getByRole('button', {name: 'Pubblica', exact: true}).click();
  await expect(page.locator('#toast')).toContainText('Pubblicata');
  await page.getByRole('button', {name: /Home/}).click();
  await expect(item.locator('.reply')).toContainText('la ricevuta lo dimostra');
});

test('tracking live: il contatto segue la corsa dal link e a fine corsa non vede più la posizione', async ({page, browser}) => {
  test.setTimeout(120000);
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.fill('#lookupPlate', 'AB123CD');
  await page.evaluate(() => window.simulateRide());
  await expect(page.locator('#rideStreet')).toContainText('Via del Viminale', {timeout: 10000});
  await page.getByRole('button', {name: 'Condividi la corsa in tempo reale'}).click();
  await expect(page.locator('#liveState')).toContainText('Condivisione attiva fino alle');
  await expect(page.locator('#shareText')).toHaveValue(/Segui la corsa in tempo reale: http:\/\/127\.0\.0\.1:4174\/\?live=/);
  const link = (await page.locator('#shareText').inputValue()).match(/http:\/\/127\.0\.0\.1:4174\/\?live=[A-Za-z0-9_-]+/)[0];
  await page.locator('#m-share button.x').click();

  // Il contatto apre il link in un altro browser, senza account.
  const viewerCtx = await browser.newContext({locale: 'it-IT'});
  await viewerCtx.route(u => !['127.0.0.1', 'localhost'].includes(u.hostname), r => r.request().url().includes('tile.openstreetmap.org') ? r.fulfill({contentType: 'image/png', body: PNG}) : r.abort());
  const viewer = await viewerCtx.newPage();
  const viewerErrors = [];
  viewer.on('pageerror', e => viewerErrors.push(e.message));
  await viewer.goto(link);
  await expect(viewer.locator('#liveStatus')).toHaveText('In corso');
  await expect(viewer.locator('#liveStreet')).toContainText('Via del Viminale');
  await expect(viewer.locator('#liveInfo')).toContainText('Taxi AB•••CD');
  await expect(viewer.locator('#liveMap .leaflet-interactive')).not.toHaveCount(0);
  await expect(viewer.locator('.app')).toBeHidden();

  // Fine corsa: il contatto vede solo lo stato, le posizioni sono cancellate.
  await page.locator('#rideBtn').click();
  await expect(page.locator('#m-rate')).toHaveClass(/open/);
  await expect(viewer.locator('#liveStatus')).toHaveText('Corsa conclusa', {timeout: 15000});
  await expect(viewer.locator('#liveStreet')).toContainText('non è più visibile');
  await expect(viewer.locator('#liveMap .leaflet-interactive')).toHaveCount(0);
  const token = new URL(link).searchParams.get('live');
  const [share] = await rest(`ride_shares?select=id,token_hash,ended_at&order=created_at.desc&limit=1`);
  expect(share.token_hash).not.toBe(token);
  expect(share.ended_at).not.toBeNull();
  expect(await rest(`ride_share_points?share_id=eq.${share.id}&select=id`)).toEqual([]);
  expect(viewerErrors).toEqual([]);
  await viewerCtx.close();
});

test('cancellazione dell\'account dal sito: dati personali e contenuti non pubblicati spariscono', async ({page}) => {
  test.setTimeout(90000);
  const stamp = Date.now(), email = `cancella.${stamp}@example.com`, password = 'password-cancella-1';
  const user = await (await fetch(`${API}/auth/v1/admin/users`, {method: 'POST', headers: serviceHeaders(),
    body: JSON.stringify({email, password, email_confirm: true})})).json();
  // Due segnalazioni dell'utente: una già pubblicata, una in attesa con un audio allegato.
  const sb = createClient(API, PUBLISHABLE, {auth: {persistSession: false}});
  await sb.auth.signInWithPassword({email, password});
  const submit = async (d, plate) => (await sb.rpc('submit_report', {p_city: 'roma', p_type: 'altro', p_rating: 2, p_description: d,
    p_reporter_name: 'Utente Da Cancellare', p_plate: plate, p_license: '77'})).data;
  const published = await submit(`Pubblicata ${stamp}: resta anonima dopo la cancellazione.`, 'CA' + String(stamp).slice(-3) + 'NC');
  // Un'etichetta di reato la tiene in revisione (non pubblicata): deve sparire con l'account.
  const pending = await submit(`In attesa ${stamp}: è un ladro, sparisce con l'account.`, 'CB' + String(stamp).slice(-3) + 'NC');
  const audioPath = `${pending}/${crypto.randomUUID()}.wav`;
  expect((await sb.storage.from('attachments').upload(audioPath, wav(), {contentType: 'audio/wav'})).error).toBeNull();
  expect((await sb.functions.invoke('register-attachment', {body: {report_id: pending, path: audioPath, kind: 'audio'}})).error).toBeNull();
  await rest(`reports?id=eq.${published}`, {method: 'PATCH', body: JSON.stringify({status: 'pubblicata'}), headers: {Prefer: 'return=minimal'}});
  expect((await rest(`points_ledger?user_id=eq.${user.id}&select=delta`)).length).toBe(1);

  // Dal sito: il link ?account=elimina porta alla sezione di cancellazione.
  await page.goto('/?account=elimina');
  await expect(page.locator('#deleteCard')).toContainText('Per cancellare il tuo account accedi');
  await page.locator('#deleteCard').getByRole('button', {name: 'Accedi'}).click();
  await page.fill('#loginEmail', email);
  await page.fill('#loginPwd', password);
  await page.locator('#m-login').getByRole('button', {name: 'Accedi', exact: true}).click();
  await page.locator('#profileBtn').click();
  await page.locator('#deleteCard').getByRole('button', {name: 'Elimina account e dati'}).click();
  await page.locator('#cYes').click();
  await expect(page.locator('#toast')).toContainText('Account e dati cancellati');
  await expect(page.locator('#profileBox')).toContainText('Ospite');
  // Dopo la cancellazione supabase-js chiama comunque /logout, che risponde 403 (utente non più esistente):
  // la sessione locale viene cancellata lo stesso. Errore atteso, registrato dal browser in console.
  page.errors = page.errors.filter(e => !e.includes('status of 403'));

  expect((await fetch(`${API}/auth/v1/admin/users/${user.id}`, {headers: serviceHeaders()})).status).toBe(404);
  expect(await rest(`reports?id=eq.${pending}&select=id`)).toEqual([]);
  expect(await rest(`reports?id=eq.${published}&select=id,description`)).toHaveLength(1);
  expect(await rest(`points_ledger?user_id=eq.${user.id}&select=id`)).toEqual([]);
  expect((await fetch(`${API}/storage/v1/object/attachments/${audioPath}`, {headers: serviceHeaders()})).ok).toBe(false);
  // Con le vecchie credenziali non si entra più.
  expect((await createClient(API, PUBLISHABLE, {auth: {persistSession: false}}).auth.signInWithPassword({email, password})).error).not.toBeNull();
});

test('corsa verificata: la corsa registrata dal GPS dà il bollino alla valutazione, il server tiene solo durata e km', async ({page, context}) => {
  test.setTimeout(120000);
  const stamp = Date.now(), email = `corsa.${stamp}@example.com`, password = 'password-corsa-1';
  await fetch(`${API}/auth/v1/admin/users`, {method: 'POST', headers: serviceHeaders(), body: JSON.stringify({email, password, email_confirm: true})});
  await page.locator('#profileBtn').click();
  await page.getByRole('button', {name: 'Accedi o registrati'}).click();
  await page.fill('#loginEmail', email);
  await page.fill('#loginPwd', password);
  await page.locator('#m-login').getByRole('button', {name: 'Accedi', exact: true}).click();
  await expect(page.locator('#profileBox')).toContainText(email);

  // Corsa vera (GPS del browser simulato da Playwright), con la targa indicata prima di partire.
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.fill('#lookupPlate', 'CV' + String(stamp).slice(-3) + 'ZZ');  // targa propria: non altera i rating degli altri test
  await page.locator('#rideBtn').click();
  await expect(page.locator('#rideVerify')).toContainText('Corsa registrata per il bollino');
  const ride = async () => (await rest('rides?select=id,pings,distance_m,last_lat,report_id&order=started_at.desc&limit=1'))[0];
  await expect.poll(async () => (await ride()).pings, {timeout: 15000}).toBe(1);
  for (const lat of [41.9036, 41.9063]) {
    await page.waitForTimeout(6500);
    await context.setGeolocation({latitude: lat, longitude: 12.5010});
  }
  await expect.poll(async () => (await ride()).pings, {timeout: 15000}).toBe(3);
  const during = await ride();
  expect(during.distance_m).toBeGreaterThan(550);
  expect(during.last_lat).toBeCloseTo(41.9063, 4);
  // Il test non può durare 3 minuti: la partenza si sposta indietro come farebbe il tempo trascorso.
  await rest(`rides?id=eq.${during.id}`, {method: 'PATCH', body: JSON.stringify({started_at: new Date(Date.now() - 10 * 60000).toISOString()}), headers: {Prefer: 'return=minimal'}});

  await page.locator('#rideBtn').click();
  await expect(page.locator('#rateVerify')).toContainText('Corsa verificata');
  await page.locator('#rateDriver span').nth(4).click();
  await page.locator('#rateRide span').nth(4).click();
  const comment = `Corsa verificata ${stamp}: autista puntuale e percorso corretto.`;
  await page.fill('#rateComment', comment);
  await page.getByRole('button', {name: 'Invia valutazione'}).click();
  await expect(page.locator('#toast')).toContainText('Valutazione pubblicata');

  const [report] = await rest(`reports?description=eq.${encodeURIComponent(comment)}&select=id,ride_verified`);
  expect(report.ride_verified).toBe(true);
  const [after] = await rest(`rides?id=eq.${during.id}&select=report_id,last_lat`);
  expect(after.report_id).toBe(report.id);
  expect(after.last_lat).toBeNull();

  // Dopo la moderazione il bollino è nel feed; la pagina spiega come verifichiamo le recensioni.
  await moderate(comment, 'pubblicata');
  await page.reload();
  const item = page.locator('.feed-item', {hasText: comment});
  await expect(item.locator('.badge', {hasText: 'corsa verificata'})).toBeVisible();
  await page.getByRole('button', {name: 'Come verifichiamo le recensioni'}).first().click();
  await expect(page.locator('#m-verifica')).toContainText('almeno 3 minuti e 500 metri');
});

test('news: titoli dai feed con testata, data e link all\'articolo originale', async ({page}) => {
  const stamp = Date.now();
  const saved = await rest('rpc/save_news', {method: 'POST', body: JSON.stringify({p_items: [
    {title: `Taxi, nuove tariffe approvate ${stamp}`, source_name: 'Testata di prova', url: `https://example.com/taxi-${stamp}`,
     published_at: new Date(stamp - 2 * 3600e3).toISOString(), feed: 'google_news'},
    {title: `Tassisti e consumatori, incontro in Comune ${stamp}`, source_name: 'Consumerismo No Profit', url: `https://example.org/tassisti-${stamp}`,
     published_at: new Date(stamp - 3600e3).toISOString(), feed: 'consumerismo'}]})});
  expect(saved).toBe(2);
  await page.getByRole('button', {name: 'News'}).click();
  const first = page.locator('#newsList a.news-item').first();
  await expect(first).toContainText(`Tassisti e consumatori, incontro in Comune ${stamp}`);
  await expect(first).toContainText('Consumerismo No Profit');
  await expect(first).toHaveAttribute('href', `https://example.org/tassisti-${stamp}`);
  await expect(first).toHaveAttribute('target', '_blank');
  const google = page.locator('#newsList a.news-item', {hasText: `Taxi, nuove tariffe approvate ${stamp}`});
  await expect(google).toContainText('Testata di prova · 2 h fa · via Google News');
  await expect(page.locator('#newsBadge')).toBeHidden();
  await expect(page.locator('#newsList')).not.toContainText('Esempio ·');
});

test('segnalazione di un contenuto (DSA): un ospite segnala, il moderatore rimuove con motivazione, il segnalante vede l\'esito', async ({page, browser}) => {
  test.setTimeout(120000);
  const stamp = Date.now(), email = `autore.dsa.${stamp}@example.com`, password = 'password-autore-dsa-1';
  const modEmail = `moderatore.dsa.${stamp}@example.com`, modPassword = 'password-moderatore-dsa-1';
  // Una segnalazione pubblicata di un utente verificato, e un moderatore.
  await fetch(`${API}/auth/v1/admin/users`, {method: 'POST', headers: serviceHeaders(), body: JSON.stringify({email, password, email_confirm: true})});
  const mod = await (await fetch(`${API}/auth/v1/admin/users`, {method: 'POST', headers: serviceHeaders(),
    body: JSON.stringify({email: modEmail, password: modPassword, email_confirm: true})})).json();
  await rest(`profiles?id=eq.${mod.id}`, {method: 'PATCH', body: JSON.stringify({role: 'moderatore'}), headers: {Prefer: 'return=minimal'}});
  const sb = createClient(API, PUBLISHABLE, {auth: {persistSession: false}});
  await sb.auth.signInWithPassword({email, password});
  const description = `DSA ${stamp}: il tassista si chiama Mario Bianchi e abita in via Roma.`;
  const {data: reportId} = await sb.rpc('submit_report', {p_city: 'roma', p_type: 'comportamento', p_rating: 1, p_description: description,
    p_reporter_name: 'Autore Prova', p_plate: 'DS' + String(stamp).slice(-3) + 'AA', p_license: '12'});
  await rest(`reports?id=eq.${reportId}`, {method: 'PATCH', body: JSON.stringify({status: 'pubblicata'}), headers: {Prefer: 'return=minimal'}});

  // 1. Un ospite segnala il contenuto dal feed.
  await page.reload();
  const item = page.locator('.feed-item', {hasText: description});
  await item.getByRole('button', {name: 'Segnala contenuto'}).click();
  await page.selectOption('#noticeCategory', 'dati_personali');
  await page.fill('#noticeExplanation', 'Riporta nome, cognome e indirizzo di casa del tassista.');
  await page.fill('#noticeName', 'Lucia Neri');
  await page.fill('#noticeEmail', 'lucia.neri@example.com');
  await page.getByRole('button', {name: 'Invia la segnalazione'}).click();
  await expect(page.locator('#toast')).toContainText('Conferma la dichiarazione di buona fede');
  await page.check('#noticeGoodFaith');
  await page.getByRole('button', {name: 'Invia la segnalazione'}).click();
  await expect(page.locator('#toast')).toContainText('Segnalazione ricevuta');

  // 2. Il moderatore (altro browser) vede segnalante e motivo, e rimuove il contenuto con una motivazione.
  const modCtx = await browser.newContext({locale: 'it-IT'});
  await modCtx.route(u => !['127.0.0.1', 'localhost'].includes(u.hostname), r => r.request().url().includes('tile.openstreetmap.org') ? r.fulfill({contentType: 'image/png', body: PNG}) : r.abort());
  const m = await modCtx.newPage();
  await m.goto('/');
  await m.locator('#m-privacy').getByRole('button', {name: 'Ho capito'}).click();
  await m.locator('#profileBtn').click();
  await m.getByRole('button', {name: 'Accedi o registrati'}).click();
  await m.fill('#loginEmail', modEmail);
  await m.fill('#loginPwd', modPassword);
  await m.locator('#m-login').getByRole('button', {name: 'Accedi', exact: true}).click();
  await m.getByRole('button', {name: 'Apri la moderazione'}).click();
  const card = m.locator('[data-notice]', {hasText: description});
  await expect(card).toContainText('Lucia Neri · lucia.neri@example.com');
  await expect(card).toContainText('Riporta nome, cognome e indirizzo');
  await card.locator('textarea').fill('Contiene nome e indirizzo del tassista: dati personali di terzi.');
  await card.getByRole('button', {name: 'Rimuovi il contenuto'}).click();
  await expect(m.locator('#toast')).toContainText('Contenuto rimosso');
  await modCtx.close();

  const [report] = await rest(`reports?id=eq.${reportId}&select=status,rejection_reason`);
  expect(report).toEqual({status: 'rifiutata', rejection_reason: 'Rimossa dopo una segnalazione: Contiene nome e indirizzo del tassista: dati personali di terzi.'});

  // 3. Il segnalante trova l'esito nel profilo; il contenuto non è più nel feed.
  await page.reload();
  await expect(page.locator('.feed-item', {hasText: description})).toHaveCount(0);
  await page.locator('#profileBtn').click();
  await expect(page.locator('#profileBox')).toContainText('Contenuto rimosso');
  await expect(page.locator('#profileBox')).toContainText('Motivazione: Contiene nome e indirizzo del tassista');
});
