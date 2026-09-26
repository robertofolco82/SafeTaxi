# Componenti

Classi CSS definite in `src/styles.css`, valori presi da `tokens.css`. Un solo stile per ruolo:
non creare varianti nuove senza prima controllare qui.

## Bottoni

| Classe | Uso | Aspetto |
|---|---|---|
| `.btn` | Azione primaria della schermata (una sola per schermata, salvo eccezioni ovvie come "Cerca") | Pieno, `--st-primary`, testo bianco, `--st-radius-md`, full-width |
| `.btn.sec` | Azione secondaria | Contorno 1.5px `--st-primary`, sfondo bianco, stesso testo/peso del primario |
| `.btn.red` | Solo dentro il flusso SOS/emergenza (mai altrove) | Pieno, `--st-sos` |
| `.btn.sm` | Bottone inline, non full-width (dentro una row, una card) | Stessa forma, padding ridotto |
| `.sos-fab` | Solo il pulsante SOS flottante | Cerchio, `--st-sos`, bordo bianco, ombra `--st-shadow-fab` |

Ogni bottone con un'icona: icona a sinistra del testo, mai da sola salvo bottoni icona quadrati
(`.icon-btn`, es. header) con `aria-label` obbligatorio.

## Badge

- `.badge` — badge neutro (stato, contatore).
- `.badge.b-ok` — verde, "verificata/pubblicata".
- `.badge.b-demo` — viola, dati DEMO/segnaposto (obbligatorio su ogni dato non reale).
- `.badge.verified` — badge di fiducia con icona `shield-check`, sfondo `--st-accent-100`,
  testo `--st-accent-700`. Solo per segnalazioni/tassisti verificati, mai altrove.

## Chip

- `.chip` — filtro/selezione singola (feed, prenotazione). Stato attivo: `.chip.on`,
  sfondo `--st-primary`.
- Le chip con icona (Recommended, 24/7, Aeroporti, App) hanno l'icona a sinistra del testo,
  16px, colore ereditato (`currentColor`).

## Card

- `.card` — contenitore base: sfondo `--st-surface`, `--st-radius-lg`, `--st-shadow-card`.
- Titolo di sezione dentro una card: icona 16–18px + testo, stesso font `--st-font-display`,
  peso 700. L'icona non sostituisce mai il testo, lo precede.

## Icone nella tab bar e nell'header

- Tab bar: icona 20px sopra, etichetta 10px sotto; tab attiva in `--st-primary`, le altre in un
  grigio-blu smorzato (`--st-muted` schiarito, vedi `styles.css`).
- Header: icone dei bottoni (news, profilo) 17–18px, dentro `.icon-btn` (cerchio semi-trasparente
  su sfondo `--st-primary`).
