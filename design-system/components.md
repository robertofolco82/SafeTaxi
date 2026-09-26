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

Mai un badge "a pillola" con sfondo pastello e testo colorato (il classico badge da
UI generata automaticamente): qui un badge è un piccolo tag **con solo contorno**,
maiuscolo, letter-spacing, con un puntino dello stesso colore del testo — mai un
riempimento colorato. L'unica eccezione è `.rec`, l'unico badge a **sfondo pieno**
di tutta l'app: proprio perché è pieno, resta un segno raro e riconoscibile.

- `.badge` — tag neutro (stato, contatore): contorno `--st-border-strong`, testo `--mut`.
- `.badge.b-ok` — contorno e testo `--st-accent`: "verificata/pubblicata".
- `.badge.b-demo` — come `.badge`, ma senza il puntino: dati DEMO/segnaposto
  (obbligatorio su ogni dato non reale).
- `.rec` — l'unico badge pieno: sfondo `--st-primary`, testo bianco, icona `trophy`.
  Solo per il bollo RECOMMENDED, mai altrove.

## Chip

- `.chip` — filtro/selezione singola (feed, prenotazione). Stato attivo: `.chip.on`,
  sfondo `--st-primary`.
- Le chip con icona (Recommended, 24/7, Aeroporti, App) hanno l'icona a sinistra del testo,
  16px, colore ereditato (`currentColor`).

## Card

- `.card` — contenitore base: sfondo `--st-surface`, `--st-radius-lg`, `--st-shadow-card`.
- Titolo di sezione dentro una card: icona 16–18px + testo, stesso font `--st-font-display`,
  peso 700. L'icona non sostituisce mai il testo, lo precede.

## Nota informativa (`.note`)

Box neutro (sfondo `--st-bg`, nessun bordo colorato, nessuna barra laterale) per testo
secondario/legale dentro una card o una modale. **Niente bordo colorato a sinistra +
sfondo pastello**: è lo stile tipico dei callout generati automaticamente ed è la prima
cosa che rende un'interfaccia riconoscibile come "fatta con un assistente AI".

## Icone nella tab bar e nell'header

- Tab bar: icona 20px sopra, etichetta 10px sotto; tab attiva in `--st-primary`, le altre in un
  grigio-blu smorzato (`--st-muted` schiarito, vedi `styles.css`).
- Header: icone dei bottoni (news, profilo) 17–18px, dentro `.icon-btn` (cerchio semi-trasparente
  su sfondo `--st-primary`).
