import {test, expect} from '@playwright/test';

// PNG trasparente 1×1 al posto delle tile: i test non devono dipendere da OSM né pesare sui suoi server.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({page, context}) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  // MediaPipe scrive in console come "errore" un messaggio informativo sul motore TensorFlow Lite: non è un errore.
  page.on('console', m => { if (m.type() === 'error' && !/TensorFlow Lite XNNPACK/.test(m.text())) page.errors.push('console: ' + m.text()); });
  await context.route(u => !['127.0.0.1', 'localhost'].includes(u.hostname), route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('tile.openstreetmap.org')) return route.fulfill({contentType: 'image/png', body: PNG});
    if (url.pathname === '/reverse') return route.fulfill({json: {address: {road: 'Via del Viminale', house_number: '36', city: 'Roma'}}});
    if (url.pathname === '/search') return route.fulfill({json: [{lat: '41.9010', lon: '12.5018', display_name: 'Stazione Termini, Piazza dei Cinquecento, Roma, Lazio, Italia'}]});
    return route.abort();
  });
  await page.goto('/');
  await page.locator('#m-privacy').getByRole('button', {name: 'Ho capito'}).click();
});

test.afterEach(async ({page}) => {
  expect(page.errors, 'errori in console').toEqual([]);
});

test('home: Termometro, feed con targhe mascherate e mappa', async ({page}) => {
  await expect(page.locator('#thermo')).toContainText('Termometro Safe Taxi');
  await expect(page.locator('#thermo')).toContainText('DATI DEMO');
  await expect(page.locator('#homeMap .leaflet-container, #homeMap.leaflet-container')).toHaveCount(1);
  const feed = await page.locator('#feed').innerText();
  expect(feed).toContain('•••');
  expect(feed).not.toMatch(/\b[A-Z]{2}\d{3}[A-Z]{2}\b/);
});

test('stima del costo verso una destinazione', async ({page}) => {
  await page.fill('#destInput', 'Stazione Termini');
  await page.press('#destInput', 'Enter');
  await page.locator('#destResults button').first().click();
  await expect(page.locator('#estimateBox')).toContainText('Costo stimato');
});

test('rating del tassista per targa, con targa mascherata', async ({page}) => {
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.fill('#lookupInput', 'AB123CD');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('AB•••CD');
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate');
  await page.fill('#lookupInput', 'ZZ999ZZ');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente');
});

test('segnalazione da ospite: campi obbligatori e invio', async ({page}) => {
  await page.getByRole('button', {name: /Segnala/}).click();
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('Completa: nome e cognome');
  await page.fill('#reportForm [name=name]', 'Mario Rossi');
  await page.fill('#reportForm [name=licenza]', '1234');
  await page.fill('#reportForm [name=targa]', 'ab123cd');
  await page.selectOption('#reportCity', 'roma');
  await page.selectOption('#reportType', 'percorso');
  await page.locator('#reportStars span').nth(1).click();
  await page.fill('#reportForm [name=description]', 'Percorso molto più lungo del necessario rispetto al navigatore.');
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('Segnalazione anonima inviata');
  await expect(page.locator('#feed')).not.toContainText('Mario Rossi');
});

test('SOS: il 112 non parte mai senza conferma', async ({page}) => {
  const navigations = [];
  page.on('framenavigated', f => navigations.push(f.url()));
  await page.locator('.sos-fab').click();
  await expect(page.locator('#m-sos')).toHaveClass(/open/);
  await expect(page.locator('#sosLoc')).toContainText('Via del Viminale');
  await page.getByRole('button', {name: /Chiama il 112/}).click();
  await expect(page.locator('#m-confirm')).toHaveClass(/open/);
  await page.locator('#cNo').click();
  expect(navigations.filter(u => u.startsWith('tel:'))).toEqual([]);
});

test('corsa simulata con il nome della via', async ({page}) => {
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.evaluate(() => window.simulateRide());
  await expect(page.locator('#rideStreet')).toContainText('Via del Viminale', {timeout: 10000});
  await page.locator('#rideBtn').click();
  await expect(page.locator('#m-rate')).toHaveClass(/open/);
});

test('mappa Italia e prenotazione', async ({page}) => {
  await page.getByRole('button', {name: /Mappa/}).click();
  await page.fill('#citySearch', 'Milano');
  await page.locator('#citySearch').dispatchEvent('change');
  await expect(page.locator('#cityStats')).toContainText('Milano');
  await page.getByRole('button', {name: /Prenota/}).last().click();
  await expect(page.locator('#bookList')).toContainText('Uber');
  await expect(page.locator('#bookList')).toContainText('Cosa significa RECOMMENDED');
});

test('export dati aperti senza targhe né licenze', async ({page}) => {
  await page.locator('#profileBtn').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'CSV'}).click()]);
  const csv = await (await download.createReadStream()).toArray().then(c => Buffer.concat(c).toString());
  expect(csv.split('\n')[0]).not.toMatch(/targa|licenza|nome/);
  expect(csv).not.toContain('AB123CD');
});

test('foto allegata: metadati rimossi e volto sfocato sul dispositivo', async ({page}) => {
  await page.getByRole('button', {name: /Segnala/}).click();
  await page.setInputFiles('#gallery', 'tests/fixtures/volto-con-gps.jpg');
  await expect(page.locator('#thumbs .faces')).toHaveText('1', {timeout: 30000});
  await expect(page.locator('#thumbs .thumb')).toHaveAttribute('title', /1 volto sfocato/);
  const out = await page.locator('#thumbs img').evaluate(async img => {
    const b = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    const head = String.fromCharCode(...b.subarray(0, 4096));
    return {jpeg: b[0] === 0xff && b[1] === 0xd8, exif: head.includes('Exif'), camera: head.includes('FotocameraDiProva')};
  });
  expect(out).toEqual({jpeg: true, exif: false, camera: false});
  await page.locator('#thumbs .thumb button').click();
  await expect(page.locator('#thumbs .thumb')).toHaveCount(0);
});

test('news in modalità demo: solo esempi segnaposto, senza link', async ({page}) => {
  await page.getByRole('button', {name: 'News'}).click();
  await expect(page.locator('#newsList .news-item')).toHaveCount(3);
  await expect(page.locator('#newsBadge')).toBeVisible();
  await expect(page.locator('#newsList a')).toHaveCount(0);
});
