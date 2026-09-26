# Cookie, archiviazione locale e pubblicità — Safe Taxi

> **BOZZA — DA VERIFICARE CON UN LEGALE.** Riferimenti: art. 122 Codice privacy; Linee guida del Garante su cookie
> e altri strumenti di tracciamento (10 giugno 2021); Reg. UE 2022/2065 (DSA), artt. 26 e 28.

## 1. Situazione attuale (verificata nel codice)

L'app **non usa cookie di profilazione né strumenti di analisi o pubblicità**. Nel browser o nel telefono salva
solo dati tecnici necessari al funzionamento:

| Dato | Dove | Scopo | Consenso |
|---|---|---|---|
| Sessione di accesso (Supabase) | Archiviazione locale | Restare collegati | Non serve (strettamente necessario) |
| Preferenze (risparmio energetico, informativa letta, contatti di emergenza) | Archiviazione locale | Funzionamento | Non serve |
| Tile delle mappe e ricerca indirizzi (OpenStreetMap) | Richieste dirette | Mappe | Non serve; va citato nell'informativa |

**Oggi non serve un banner cookie.** Basta l'informativa.

## 2. Quando arriverà la pubblicità

La pubblicità cambia il quadro. Scelte da fare prima di attivarla:

1. **Pubblicità contestuale senza tracciamento** (consigliata per partire): annunci scelti in base alla pagina,
   senza identificatori né profilazione. Non richiede consenso per i cookie se non installa identificatori; resta
   l'informativa.
2. **Pubblicità profilata** (Google AdSense/AdMob o simili): richiede
   - una piattaforma di gestione del consenso (CMP) certificata IAB TCF 2.2, obbligatoria per Google nello Spazio
     economico europeo [COSTO: da valutare];
   - banner con "Accetta" e "Rifiuta" di pari evidenza, senza consenso preimpostato;
   - su iOS, anche la richiesta di autorizzazione App Tracking Transparency;
   - aggiornamento delle dichiarazioni sugli store (docs/store).

Obblighi DSA per la pubblicità (art. 26), qualunque sia la scelta: ogni annuncio deve essere riconoscibile come
tale, indicare per conto di chi è mostrato e chi lo paga, e i parametri principali con cui è stato scelto.
**Divieto** di pubblicità basata su profilazione con dati sensibili e di pubblicità profilata ai minori (art. 28).

Vincoli di prodotto già fissati: pubblicità non invasiva; mai nelle schermate SOS e durante la corsa [PROPOSTA].

## 3. Cosa manca nel codice (quando si deciderà)

- Componente di consenso con scelta granulare e revoca dal profilo.
- Nessuno script pubblicitario caricato prima del consenso.
- Etichetta "Pubblicità · per conto di …" sugli annunci.
