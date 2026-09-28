-- Safe Taxi · IMP-06: dati ufficiali per città con fonte, link, anno di riferimento e data di pubblicazione.
--
-- - Una riga per città e metrica: licenze taxi (ART) e tariffe (delibere comunali o regionali in vigore).
-- - Regola di aggiornamento applicata dall'app (src/lib/official.js, decisioni di Roberto del 28/09/2026):
--   pubblicazioni periodiche mostrate fino a 12 mesi, con avviso tra 12 e 24 mesi, nascoste oltre;
--   tariffe valide finché la delibera è in vigore.
-- - Stessi valori di src/lib/official-data.js (controllati da tests/unit/official.test.js); fonti in docs/fonti-dati.md.
-- - Non ci sono dati ufficiali per città su fabbisogno di licenze (metodologia ART) e redditi o ricavi dichiarati (MEF):
--   l'app lo dichiara e non mostra stime.
-- - Nessun vincolo verso public.cities: in locale le città arrivano dal seed, dopo le migrazioni.

create table public.official_figures (
  id bigint generated always as identity primary key,
  city_key text not null check (city_key ~ '^[a-z_]+$'),
  metric text not null check (metric in ('licenze_taxi', 'tariffa_partenza', 'tariffa_km', 'corsa_standard')),
  value numeric not null check (value >= 0),
  unit text not null,
  source_name text not null,
  source_url text not null check (source_url ~ '^https://'),
  reference_year integer not null check (reference_year between 2000 and 2100),
  published_on date not null,
  rule text not null check (rule in ('periodico', 'in_vigore')),
  unique (city_key, metric)
);

alter table public.official_figures enable row level security;
create policy "dati ufficiali: lettura pubblica" on public.official_figures for select to anon, authenticated using (true);
revoke all on public.official_figures from anon, authenticated;
grant select on public.official_figures to anon, authenticated;

insert into public.official_figures (city_key, metric, value, unit, source_name, source_url, reference_year, published_on, rule) values
  ('roma', 'licenze_taxi', 7701, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('milano', 'licenze_taxi', 4855, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('napoli', 'licenze_taxi', 2364, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('torino', 'licenze_taxi', 1501, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('genova', 'licenze_taxi', 868, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('firenze', 'licenze_taxi', 724, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('bologna', 'licenze_taxi', 722, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('palermo', 'licenze_taxi', 319, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('catania', 'licenze_taxi', 188, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('bari', 'licenze_taxi', 150, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('venezia', 'licenze_taxi', 120, 'licenze', 'ART, dataset "Diffusione TAXI e NCC"', 'https://bdt.autorita-trasporti.it/catalogo-opendata/dataset?id=32', 2024, '2025-09-24', 'periodico'),
  ('roma', 'tariffa_partenza', 3.5, '€', 'Roma Capitale, Delibera G.C. n. 157 del 21/05/2026', 'https://www.comune.roma.it/web-resources/cms/documents/TariffarioTaxi_giugno2026.pdf', 2026, '2026-05-21', 'in_vigore'),
  ('roma', 'tariffa_km', 1.33, '€/km', 'Roma Capitale, Delibera G.C. n. 157 del 21/05/2026', 'https://www.comune.roma.it/web-resources/cms/documents/TariffarioTaxi_giugno2026.pdf', 2026, '2026-05-21', 'in_vigore'),
  ('roma', 'corsa_standard', 13.1, '€', 'Roma Capitale, Delibera G.C. n. 157 del 21/05/2026', 'https://www.comune.roma.it/web-resources/cms/documents/TariffarioTaxi_giugno2026.pdf', 2026, '2026-05-21', 'in_vigore'),
  ('milano', 'tariffa_partenza', 4.1, '€', 'Regione Lombardia, D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025', 'https://www.regione.lombardia.it/infrastrutture-trasporti-e-mobilita/taxi-collegamenti-aeroportuali-e-noleggio/servizio-e-tariffe-taxi-nel-bacino-aeroportuale', 2025, '2025-05-26', 'in_vigore'),
  ('milano', 'tariffa_km', 1.32, '€/km', 'Regione Lombardia, D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025', 'https://www.regione.lombardia.it/infrastrutture-trasporti-e-mobilita/taxi-collegamenti-aeroportuali-e-noleggio/servizio-e-tariffe-taxi-nel-bacino-aeroportuale', 2025, '2025-05-26', 'in_vigore'),
  ('milano', 'corsa_standard', 13.6, '€', 'Regione Lombardia, D.G.R. XII/2569 del 17/06/2024, confermata dalla D.G.R. XII/4445 del 26/05/2025', 'https://www.regione.lombardia.it/infrastrutture-trasporti-e-mobilita/taxi-collegamenti-aeroportuali-e-noleggio/servizio-e-tariffe-taxi-nel-bacino-aeroportuale', 2025, '2025-05-26', 'in_vigore'),
  ('napoli', 'tariffa_partenza', 4, '€', 'Comune di Napoli, Delibera G.C. n. 258 del 27/06/2024', 'https://static-www.comune.napoli.it/wp-content/uploads/2025/05/Tariffario_Taxi_2024.pdf', 2024, '2024-06-27', 'in_vigore'),
  ('napoli', 'tariffa_km', 1.19, '€/km', 'Comune di Napoli, Delibera G.C. n. 258 del 27/06/2024', 'https://static-www.comune.napoli.it/wp-content/uploads/2025/05/Tariffario_Taxi_2024.pdf', 2024, '2024-06-27', 'in_vigore'),
  ('napoli', 'corsa_standard', 12.1, '€', 'Comune di Napoli, Delibera G.C. n. 258 del 27/06/2024', 'https://static-www.comune.napoli.it/wp-content/uploads/2025/05/Tariffario_Taxi_2024.pdf', 2024, '2024-06-27', 'in_vigore'),
  ('torino', 'tariffa_partenza', 3.5, '€', 'Città Metropolitana di Torino, D.C.R. n. 186 del 14/06/2023', 'https://www.cittametropolitana.torino.it/sites/default/files/pagina/ub0_uc3/documenti/TAXI%20E%20NCC/TARIFFE_PER_GLI_UTENTI.pdf', 2023, '2023-06-14', 'in_vigore'),
  ('torino', 'tariffa_km', 1.75, '€/km', 'Città Metropolitana di Torino, D.C.R. n. 186 del 14/06/2023', 'https://www.cittametropolitana.torino.it/sites/default/files/pagina/ub0_uc3/documenti/TAXI%20E%20NCC/TARIFFE_PER_GLI_UTENTI.pdf', 2023, '2023-06-14', 'in_vigore'),
  ('firenze', 'tariffa_partenza', 3.8, '€', 'Comune di Firenze, tabella tariffe taxi in vigore dal 1/5/2024', 'https://servizi.comune.fi.it/sites/www.comune.fi.it/files/all._3_tariffe_fase_2-16052023_df.pdf', 2024, '2024-05-01', 'in_vigore'),
  ('firenze', 'tariffa_km', 1.1, '€/km', 'Comune di Firenze, tabella tariffe taxi in vigore dal 1/5/2024', 'https://servizi.comune.fi.it/sites/www.comune.fi.it/files/all._3_tariffe_fase_2-16052023_df.pdf', 2024, '2024-05-01', 'in_vigore'),
  ('bologna', 'tariffa_partenza', 3.9, '€', 'Comune di Bologna, tariffe in vigore dal 1/1/2025', 'https://www.comune.bologna.it/servizi-informazioni/tariffe-servizio-taxi', 2025, '2025-01-01', 'in_vigore'),
  ('bologna', 'tariffa_km', 1.45, '€/km', 'Comune di Bologna, tariffe in vigore dal 1/1/2025', 'https://www.comune.bologna.it/servizi-informazioni/tariffe-servizio-taxi', 2025, '2025-01-01', 'in_vigore');
