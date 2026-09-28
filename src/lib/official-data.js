/* Dati ufficiali per città (IMP-06): ogni valore con fonte, link, anno di riferimento e data di pubblicazione.
   Verifiche e documenti in docs/fonti-dati.md. Stessi valori nella tabella public.official_figures
   (supabase/migrations/20260928160000_dati_ufficiali.sql, controllati da tests/unit/official.test.js).
   rule: 'periodico' = pubblicazione ricorrente (regola dei 12 mesi); 'in_vigore' = delibera valida finché è in vigore. */

const ART = {source:'ART, dataset "Diffusione TAXI e NCC"', url:'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32',
  year:2024, published:'2025-09-24', rule:'periodico'};
const LICENZE = {roma:7701, milano:4855, napoli:2364, torino:1501, genova:868, firenze:724, bologna:722, palermo:319, catania:188, bari:150, venezia:120};

// Tariffe diurne feriali: quota di partenza, prima fascia al km, corsa standard ART (5 km + 5 minuti) se il Comune la pubblica.
const TARIFFE = {
  roma:    {start:3.5, km:1.33, standard:13.10, act:'Roma Capitale, Delibera G.C. n. 157 del 21/05/2026', published:'2026-05-21',
            url:'https://www.comune.roma.it/web-resources/cms/documents/TariffarioTaxi_giugno2026.pdf'},
  milano:  {start:4.1, km:1.32, standard:13.60, act:'Regione Lombardia, D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025', published:'2025-05-26',
            url:'https://www.regione.lombardia.it/infrastrutture-trasporti-e-mobilita/taxi-collegamenti-aeroportuali-e-noleggio/servizio-e-tariffe-taxi-nel-bacino-aeroportuale'},
  napoli:  {start:4.0, km:1.19, standard:12.10, act:'Comune di Napoli, Delibera G.C. n. 258 del 27/06/2024', published:'2024-06-27',
            url:'https://static-www.comune.napoli.it/wp-content/uploads/2025/05/Tariffario_Taxi_2024.pdf'},
  torino:  {start:3.5, km:1.75, standard:null, act:'Città Metropolitana di Torino, D.C.R. n. 186 del 14/06/2023', published:'2023-06-14',
            url:'https://www.cittametropolitana.torino.it/sites/default/files/pagina/ub0_uc3/documenti/TAXI%20E%20NCC/TARIFFE_PER_GLI_UTENTI.pdf'},
  firenze: {start:3.8, km:1.10, standard:null, act:'Comune di Firenze, tabella tariffe taxi in vigore dal 1/5/2024', published:'2024-05-01',
            url:'https://servizi.comune.fi.it/sites/www.comune.fi.it/files/all._3_tariffe_fase_2-16052023_df.pdf'},
  bologna: {start:3.9, km:1.45, standard:null, act:'Comune di Bologna, tariffe in vigore dal 1/1/2025', published:'2025-01-01',
            url:'https://www.comune.bologna.it/servizi-informazioni/tariffe-servizio-taxi'}
};

export const OFFICIAL = [
  ...Object.entries(LICENZE).map(([city, value]) => ({city, metric:'licenze_taxi', value, unit:'licenze', ...ART})),
  ...Object.entries(TARIFFE).flatMap(([city, t]) => [['tariffa_partenza', t.start, '€'], ['tariffa_km', t.km, '€/km'], ['corsa_standard', t.standard, '€']]
    .filter(([, v]) => v != null)
    .map(([metric, value, unit]) => ({city, metric, value, unit, source:t.act, url:t.url, year:+t.published.slice(0, 4), published:t.published, rule:'in_vigore'})))
];
