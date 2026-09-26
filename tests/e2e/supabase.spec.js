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
  await page.fill('#lookupInput', 'AB123CD');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate7');
  await page.fill('#lookupInput', 'ZZ999ZZ');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente: 0');
});

test('segnalazione da ospite: accesso anonimo, moderazione e nessuna pubblicazione immediata', async ({page}) => {
  const description = `Ospite ${Date.now()}: tassametro non avviato alla partenza della corsa.`;
  await page.getByRole('button', {name: /Segnala/}).click();
  await page.fill('#reportForm [name=name]', 'Mario Rossi');
  await page.fill('#reportForm [name=licenza]', '1234');
  await page.fill('#reportForm [name=targa]', 'QX' + String(Date.now()).slice(-3) + 'ZZ');
  await page.selectOption('#reportCity', 'roma');
  await page.selectOption('#reportType', 'altro');
  await page.locator('#reportStars span').nth(1).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('anonima inviata: in moderazione');
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
  await page.getByRole('button', {name: 'Accedi', exact: true}).click();
  await expect(page.locator('#toast')).toContainText('Email non ancora confermata');
  // Il rifiuto (HTTP 400) di questo tentativo è voluto: il browser lo registra in console.
  page.errors = page.errors.filter(e => !e.includes('status of 400'));

  // Link di conferma dall'email: l'app completa l'accesso al ritorno.
  await page.goto(await lastEmailLink(email, 'Confirm'));
  await expect(page.locator('#profileBtn')).toHaveText('🙂');
  await page.locator('#profileBtn').click();
  await expect(page.locator('#profileBox')).toContainText(email);
  await expect(page.locator('#profileBox')).toContainText('verificato');

  await page.getByRole('button', {name: /Segnala/}).click();
  await expect(page.locator('#anonNotice')).toContainText('Segnalazione verificata');
  await page.fill('#reportForm [name=name]', 'Giulia Verdi');
  await page.fill('#reportForm [name=licenza]', '4321');
  await page.fill('#reportForm [name=targa]', 'KW' + String(Date.now()).slice(-3) + 'YY');
  await page.selectOption('#reportCity', 'milano');
  await page.selectOption('#reportType', 'percorso');
  await page.locator('#reportStars span').nth(1).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('Sarà pubblicata dopo la moderazione');

  // Il moderatore pubblica dal pannello: la segnalazione compare nel feed e arrivano 50 punti.
  await moderate(description, 'pubblicata');
  await page.reload();
  await expect(page.locator('#feed')).toContainText(description.slice(0, 30));
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
  await page.getByRole('button', {name: /Segnala/}).click();
  await page.setInputFiles('#gallery', 'tests/fixtures/volto-con-gps.jpg');
  await expect(page.locator('#thumbs .faces')).toHaveText('😶 1', {timeout: 30000});
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
  await expect(page.locator('#toast')).toContainText('anonima inviata: in moderazione');
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
  await page.getByRole('button', {name: /Segnala/}).click();
  await page.setInputFiles('#gallery', 'tests/fixtures/volto-con-gps.jpg');
  await expect(page.locator('#thumbs .faces')).toHaveText('😶 1', {timeout: 30000});
  await page.fill('#reportForm [name=name]', 'Paola Blu');
  await page.fill('#reportForm [name=licenza]', '4455');
  await page.fill('#reportForm [name=targa]', plate);
  await page.selectOption('#reportCity', 'torino');
  await page.selectOption('#reportType', 'tariffa');
  await page.locator('#reportStars span').nth(0).click();
  await page.fill('#reportForm [name=description]', description);
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('in moderazione');
  const [report] = await rest(`reports?description=eq.${encodeURIComponent(description)}&select=id`);
  const [photoBefore] = await rest(`attachments?report_id=eq.${report.id}&select=id,storage_path`);

  // 2. Il moderatore entra (browser "pulito") e trova la segnalazione con i dati riservati.
  const loginModerator = async () => {
    await page.locator('#profileBtn').click();
    await page.getByRole('button', {name: 'Accedi o registrati'}).click();
    await page.fill('#loginEmail', modEmail);
    await page.fill('#loginPwd', modPassword);
    await page.getByRole('button', {name: 'Accedi', exact: true}).click();
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
  await card.getByRole('button', {name: '🚗 Sfoca targhe'}).click();
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
  await card.getByRole('button', {name: '🌐 Targhe ok, pubblica'}).click();
  await expect(page.locator('#toast')).toContainText('Foto approvata');
  await card.getByRole('button', {name: '✅ Pubblica'}).click();
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
  await expect(replyCard).toContainText('✅ corrisponde alla segnalazione');
  await expect(replyCard).toContainText('tassista@example.com');
  await replyCard.getByRole('button', {name: '✅ Pubblica'}).click();
  await expect(page.locator('#toast')).toContainText('Pubblicata');
  await page.getByRole('button', {name: /Home/}).click();
  await expect(item.locator('.reply')).toContainText('la ricevuta lo dimostra');
});
