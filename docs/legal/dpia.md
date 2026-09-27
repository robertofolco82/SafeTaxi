# Valutazione d'impatto sulla protezione dei dati (DPIA) — Safe Taxi

> **BOZZA DI LAVORO — DA COMPLETARE E VALIDARE CON UN DPO/LEGALE.** Struttura secondo l'art. 35 GDPR e le linee
> guida WP248 rev.01. Le misure indicate come "in atto" sono verificabili nel codice e nei test del repository.

## 1. Perché serve

La DPIA è da considerare **obbligatoria**: il trattamento soddisfa almeno due criteri delle linee guida WP248 e
compare nell'elenco del Garante (provv. 11 ottobre 2018, n. 467):

- **valutazione o punteggio** di persone fisiche (rating dei conducenti);
- **dati di localizzazione** (posizione della corsa, condivisione in tempo reale, verifica della corsa);
- **dati relativi a interessati vulnerabili o non in grado di opporsi facilmente**: i conducenti non usano
  l'app e non ne sono informati singolarmente;
- trattamento potenzialmente **su larga scala** (app nazionale);
- possibile trattamento di **dati relativi a reati** (art. 10 GDPR): vedi rischio R1.

## 2. Descrizione del trattamento

Flussi (dettaglio nell'informativa, `docs/legal/informativa-privacy.md`): account; segnalazioni con targa,
licenza e nome del segnalatore in area riservata; allegati con volti sfocati sul dispositivo e targhe sfocate dal
moderatore; posizione solo su azione dell'utente; condivisione della corsa con link temporaneo; verifica della
corsa (durata e km); moderazione; repliche dei tassisti; segnalazioni di contenuti (DSA); news (nessun dato
personale degli utenti).

## 3. Necessità e proporzionalità

| Principio | Come è rispettato |
|---|---|
| Minimizzazione | Targa e licenza mai pubbliche; nome del segnalatore mai pubblico; coordinate pubbliche arrotondate (~100 m); del percorso il server conserva solo l'ultimo punto |
| Limitazione della conservazione | Decisione del titolare (27/09/2026): segnalazioni, targhe, licenze e account non si cancellano, perché lo storico di un servizio pubblico è la finalità stessa del trattamento; criterio da dichiarare in informativa (art. 13, par. 2, lett. a): per tutta la durata del servizio, salvo cancellazione dell'account o accoglimento di un'opposizione (art. 21). Si cancellano i dati tecnici non più necessari: condivisione della corsa a fine corsa (max 3 ore, righe dopo 24 ore), corse per la verifica dopo 7 giorni, news dopo 30 giorni. **Rischio**: il principio di limitazione della conservazione (art. 5, par. 1, lett. e) richiede di motivare la durata; va documentata la valutazione di bilanciamento con i diritti dei conducenti |
| Esattezza | Moderazione preventiva; diritto di replica; segnalazione di contenuti |
| Trasparenza | Informativa; pagina "Come verifichiamo le recensioni" |
| Diritti | Cancellazione dell'account dall'app; opposizione per i conducenti via email |

## 4. Rischi e misure

| # | Rischio | Probabilità / gravità (prima delle misure) | Misure in atto | Misure da adottare | Rischio residuo |
|---|---|---|---|---|---|
| R1 | **Segnalazioni che descrivono possibili reati** di un conducente (importo superiore al tassametro, guida pericolosa, aggressione): rischio di diffamazione e di trattamento di dati ex art. 10 GDPR / art. 2-octies Codice privacy | Alta / alta | Decisione del 27/09/2026: i fatti si pubblicano, le etichette di reato e gli insulti no (controlli automatici `text_flags`, revisione umana); il conducente non è individuabile dal pubblico (targa mascherata, nessun nome); diritto di replica; segnalazione DSA; Safe Taxi non accerta fatti né reati (termini d'uso); modello di pubblicazione delle grandi piattaforme (Reg. UE 2022/2065, artt. 6–7) | Linee guida scritte per i moderatori; valutazione specifica dell'art. 10 GDPR sulle categorie "tariffa" e "sicurezza"; analisi in `docs/legal/assessment-recensioni-e-reati.md` | Medio |
| R2 | Reidentificazione del conducente dalla targa mascherata + città + orario | Media / media | Maschera AB•••CD; coordinate arrotondate; nessuna licenza pubblica | Valutare di non mostrare l'orario esatto nel feed | Basso |
| R3 | Raccolta massiva di targhe tramite la ricerca per targa, che mostra anche le segnalazioni del taxi | Media / media | Rating e segnalazioni solo con ≥5 segnalazioni verificate; ricerca solo con un accesso (anche anonimo); limite di 5 ricerche all'ora per utente e 30 per indirizzo di rete (impronta dell'indirizzo, cancellata dopo 2 ore) | CAPTCHA sugli accessi anonimi (decisione aperta) | Basso-medio |
| R4 | Recensioni false o ritorsive contro un conducente | Media / alta | Email confermata; limiti di frequenza; una targa ogni 30 giorni; bollino "corsa verificata"; moderazione; replica | CAPTCHA; sospensione degli abusi (art. 23 DSA) | Basso-medio |
| R5 | Localizzazione dell'utente (stalking tramite link della corsa) | Bassa / alta | Link con token di 192 bit salvato come impronta; scadenza 3 ore; una condivisione per utente; posizioni cancellate a fine corsa | — | Basso |
| R6 | Volti e targhe di terzi nelle foto | Media / media | Volti sfocati sul dispositivo; targhe sfocate dal moderatore; foto pubbliche solo dopo revisione; video e audio mai pubblici; metadati rimossi e verificati dal server | — | Basso |
| R7 | Accesso non autorizzato al database | Bassa / alta | Accesso riga per riga (RLS); dati personali in schema separato; scritture solo tramite funzioni; test automatici delle regole | Piano Pro (backup), protezione password compromesse, revisione periodica degli avvisi di sicurezza | Basso |
| R8 | Trasferimenti extra UE (fornitori USA) | Media / media | Database in UE | Verificare DPA e Data Privacy Framework dei fornitori | Da valutare |
| R9 | Dati del segnalante di un contenuto (DSA) usati contro di lui | Bassa / media | Nome ed email visibili solo ai moderatori; cancellati con l'account | — | Basso |

## 5. Parere degli interessati

[DA VALUTARE: consultazione di un'associazione di consumatori e di un'associazione di categoria dei tassisti
(art. 35, par. 9).]

## 6. Conclusione

[DA COMPILARE dopo la validazione. Se dopo le misure il rischio R1 resta elevato, è necessaria la
consultazione preventiva del Garante (art. 36).]

Redatta il [DATA] · Versione [N] · Revisione prevista: prima del lancio e ad ogni nuova funzione che tratta dati
personali.
