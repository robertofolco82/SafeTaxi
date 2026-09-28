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
  // IMP-05a: tachimetro con valore e giudizio anche in testo; "Seleziona città" porta alla ricerca nella Mappa.
  await expect(page.locator('#thermo svg.gauge')).toHaveAttribute('aria-label', /^Termometro \d+ su 100: /);
  await page.locator('#thermo').getByRole('button', {name: 'Seleziona città'}).click();
  await expect(page.locator('#tab-mappa')).toHaveClass(/active/);
  await expect(page.locator('#citySearch')).toBeFocused();
  // IMP-05b: andamento negli ultimi 12 mesi, con i dati anche in tabella.
  await page.locator('nav.tabs').getByRole('button', {name: /Home/}).click();
  await expect(page.locator('#trendItalia svg.trend')).toHaveAttribute('aria-label', /^Andamento del Termometro Italia: ultimo valore \d+ su 100/);
  await expect(page.locator('#trendItalia tbody tr')).toHaveCount(12);
  await expect(page.locator('#homeMap .leaflet-container, #homeMap.leaflet-container')).toHaveCount(1);
  const feed = await page.locator('#feed').innerText();
  expect(feed).toContain('•••');
  expect(feed).not.toMatch(/\b[A-Z]{2}\d{3}[A-Z]{2}\b/);
});

test('partenza modificabile, preferiti e recenti solo sul dispositivo (IMP-04)', async ({page}) => {
  const outgoing = [];
  page.on('request', r => { if (!/127\.0\.0\.1|localhost/.test(r.url())) outgoing.push(r.url()); });
  // Destinazione: finisce nei recenti; si salva come Casa.
  await page.fill('#destInput', 'Stazione Termini');
  await page.press('#destInput', 'Enter');
  await page.locator('#destResults button').first().click();
  await expect(page.locator('#estimateBox')).toContainText('Costo stimato');
  await expect(page.locator('#placesBox')).toContainText('Recenti');
  await page.fill('#favLabel', 'Casa');
  await page.getByRole('button', {name: 'Salva'}).click();
  await expect(page.locator('#placesBox').getByRole('button', {name: 'Casa'})).toBeVisible();
  // Partenza diversa dalla posizione attuale, scelta dai preferiti.
  await page.getByRole('button', {name: 'Cambia'}).click();
  await page.locator('#placesBox').getByRole('button', {name: 'Casa'}).click();
  await expect(page.locator('#startLabel')).toHaveText('Stazione Termini');
  await expect(page.locator('#estimateBox')).toContainText('Partenza: Stazione Termini');
  await page.getByRole('button', {name: 'Usa posizione attuale'}).click();
  await expect(page.locator('#startLabel')).toHaveText('Posizione attuale');
  // Restano dopo il riavvio, salvati solo sul dispositivo.
  await page.reload();
  await expect(page.locator('#placesBox').getByRole('button', {name: 'Casa'})).toBeVisible();
  expect(outgoing.filter(u => !/nominatim|tile\.openstreetmap/.test(u))).toEqual([]);
  // Profilo: rinomina ed elimina; cronologia cancellabile.
  await page.locator('#profileBtn').click();
  await page.fill('[data-fav]', 'Stazione');
  await page.getByRole('button', {name: 'Rinomina'}).click();
  await expect(page.locator('#profileBox')).toContainText('Destinazioni recenti');
  await page.locator('#profileBox').getByRole('button', {name: 'Cancella cronologia'}).click();
  await page.locator('#cYes').click();
  await page.getByRole('button', {name: 'Elimina Stazione'}).click();
  await expect(page.locator('#profileBox')).toContainText('Nessun preferito');
  await page.locator('nav.tabs').getByRole('button', {name: /Home/}).click();
  await expect(page.locator('#placesBox')).toBeEmpty();
});

test('mappa: attribuzione OpenStreetMap senza bandiera nel prefisso', async ({page}) => {
  const attr = page.locator('#homeMap .leaflet-control-attribution');
  await expect(attr).toContainText('OpenStreetMap contributors');
  await expect(attr.locator('.leaflet-attribution-flag')).toHaveCount(0);
});

test('prenota: numeri verificati e avviso su quelli da verificare', async ({page}) => {
  await page.locator('nav.tabs').getByRole('button', {name: 'Prenota'}).click();
  await page.selectOption('#bookCity', 'napoli');
  await expect(page.locator('#bookList')).toContainText('Consortaxi 2222');
  await expect(page.locator('#bookList')).not.toContainText('Numero da verificare');
  await page.selectOption('#bookCity', 'bari');
  await expect(page.locator('#bookList')).toContainText('Numero da verificare');
});

test('feed: filtro per città, parola chiave e pagine (IMP-03)', async ({page}) => {
  await expect(page.locator('#feed .feed-item')).toHaveCount(12);
  await expect(page.locator('#feedMore')).toBeVisible();
  await page.locator('#feedMore').click();
  await expect(page.locator('#feed .feed-item')).toHaveCount(24);
  await page.selectOption('#feedCity', 'milano');
  await expect(page.locator('#feed .feed-item').first()).toContainText('Milano');
  expect(new Set(await page.locator('#feed .feed-item > .row b').allInnerTexts())).toEqual(new Set(['Milano']));
  await page.fill('#feedQuery', 'parola-che-non-esiste');
  await page.press('#feedQuery', 'Enter');
  await expect(page.locator('#feed')).toContainText('Nessuna segnalazione con questi filtri');
  await page.fill('#feedQuery', '');
  await page.press('#feedQuery', 'Enter');
  await page.selectOption('#feedCity', '');
  await expect(page.locator('#feed .feed-item')).toHaveCount(12);
});

test('stima del costo verso una destinazione', async ({page}) => {
  await page.fill('#destInput', 'Stazione Termini');
  await page.press('#destInput', 'Enter');
  await page.locator('#destResults button').first().click();
  await expect(page.locator('#estimateBox')).toContainText('Costo stimato');
});

test('rating del tassista per targa, con targa mascherata', async ({page}) => {
  await page.getByRole('button', {name: /Corsa/}).click();
  await page.fill('#lookupPlate', 'AB123CD');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('AB•••CD');
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate');
  await page.fill('#lookupPlate', 'ZZ999ZZ');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente');
  // IMP-02: basta la licenza; con targa e licenza devono corrispondere entrambe.
  await page.fill('#lookupPlate', '');
  await page.fill('#lookupLicense', '2468');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Segnalazioni verificate');
  await page.fill('#lookupPlate', 'AB123CD');
  await page.fill('#lookupLicense', '9999');
  await page.getByRole('button', {name: 'Verifica'}).click();
  await expect(page.locator('#lookupResult')).toContainText('Storico insufficiente: 0');
});

test('segnalazione da ospite: campi obbligatori e invio', async ({page}) => {
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
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

test('descrizione: con 4–5 stelle basta "OK", con 1–3 servono 20 caratteri', async ({page}) => {
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
  await page.fill('#reportForm [name=name]', 'Mario Rossi');
  await page.fill('#reportForm [name=licenza]', '1234');
  await page.fill('#reportForm [name=targa]', 'CD456EF');
  await page.selectOption('#reportCity', 'roma');
  await page.selectOption('#reportType', 'positiva');
  await page.check('#reportForm [name=consent]');
  await page.locator('#reportStars span').nth(1).click();
  await expect(page.locator('#descHelp')).toContainText('descrivi l\'accaduto, almeno 20 caratteri');
  await page.fill('#reportForm [name=description]', 'OK');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('descrizione dell\'accaduto (min. 20 caratteri)');
  await page.locator('#reportStars span').nth(4).click();
  await expect(page.locator('#descHelp')).toContainText('basta anche solo "OK"');
  await page.locator('#reportForm').evaluate(f => f.requestSubmit());
  await expect(page.locator('#toast')).toContainText('Segnalazione anonima inviata');
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
  // IMP-06: dati ufficiali con fonte e link; nessuna stima inventata.
  await expect(page.locator('#cityStats')).toContainText('Dati ufficiali');
  await expect(page.locator('#cityStats a', {hasText: 'ART'})).toHaveAttribute('href', /autorita-trasporti\.it/);
  await expect(page.locator('#cityStats')).toContainText('D.G.R. XII/2569');
  await expect(page.locator('#cityStats')).not.toContainText('Richieste giornaliere');
  await expect(page.locator('#cityStats')).not.toContainText('Ricavo lordo orario');
  await expect(page.locator('#cityStats svg.gauge')).toHaveAttribute('aria-label', /Termometro/);
  await expect(page.locator('#trendCity svg.trend, #trendCity p')).toHaveCount(1);
  await expect(page.locator('#nationalStats .gauge-mini svg.gauge').first()).toHaveAttribute('aria-label', /^Termometro \d+ su 100: /);
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
  await page.locator('nav.tabs').getByRole('button', {name: /Segnala/}).click();
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
