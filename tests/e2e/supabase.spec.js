import {test, expect} from '@playwright/test';
import {execSync} from 'node:child_process';

// Test contro lo stack Supabase locale (`npx supabase start`): database, autenticazione ed email (Mailpit).
// La chiave di servizio locale serve solo a simulare il moderatore dal "pannello".
let API, MAIL, SERVICE;
test.beforeAll(() => {
  const status = JSON.parse(execSync('npx supabase status -o json', {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));
  ({API_URL: API, MAILPIT_URL: MAIL, SERVICE_ROLE_KEY: SERVICE} = status);
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
async function moderate(description, status){
  const r = await fetch(`${API}/rest/v1/reports?description=eq.${encodeURIComponent(description)}`, {
    method: 'PATCH', body: JSON.stringify({status}),
    headers: {apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal'}});
  expect(r.ok, await r.text()).toBe(true);
}

test.beforeEach(async ({page, context}) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
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
