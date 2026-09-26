# Configurazione dell'accesso (Supabase e Google)

Impostazioni da fare a mano nei pannelli di Supabase e Google: il codice dell'app è già pronto.
Progetto Supabase di sviluppo: `SafeTaxi` (ref `emgookqbvrehcroxpypx`).

> Le chiavi segrete (Client secret di Google, chiave `service_role` o `sb_secret_...` di Supabase) si incollano **solo** nei pannelli, mai nel codice, in chat o nel repository.

## 1. Supabase: URL dell'app

Supabase → progetto SafeTaxi → **Authentication → URL Configuration**:

- **Site URL**: l'indirizzo di produzione su Vercel (Vercel → progetto safetaxi → **Domains**), per esempio `https://safetaxi.vercel.app`.
- **Redirect URLs**, aggiungi:
  - `https://<dominio-di-produzione>/**`
  - `https://safetaxi-*-robertofolco-3821.vercel.app/**` (anteprime delle pull request)
  - `http://localhost:5173/**` (sviluppo in locale)

Servono per tornare nell'app dopo la conferma dell'email, il recupero password e l'accesso con Google.

## 2. Supabase: accesso anonimo ed email

**Authentication → Sign In / Providers**:

- **Allow anonymous sign-ins**: attivo. Serve per inviare valutazioni e segnalazioni senza account (non contano nei rating).
- **Email**: attivo, con **Confirm email** attivo. Solo gli account con email confermata contano nei rating.
- **Minimum password length**: 8.

**Invio delle email.** Il servizio email incluso in Supabase è pensato solo per le prove: invia pochissime email all'ora e, senza SMTP personalizzato, recapita solo agli indirizzi dei membri del team del progetto. Per far registrare altre persone serve un SMTP (per esempio Resend o Brevo, entrambi con un piano gratuito): **Authentication → Emails → SMTP Settings**.

**Testi delle email in italiano** (Authentication → Emails → Templates):

- *Confirm signup*, oggetto `Conferma il tuo account Safe Taxi`:
  `<h2>Benvenuto in Safe Taxi</h2><p>Per confermare il tuo account apri questo link:</p><p><a href="{{ .ConfirmationURL }}">Conferma l'email</a></p><p>Se non ti sei registrato, ignora questo messaggio.</p>`
- *Reset password*, oggetto `Nuova password per Safe Taxi`:
  `<h2>Nuova password</h2><p>Per sceglierne una nuova apri questo link:</p><p><a href="{{ .ConfirmationURL }}">Scegli la nuova password</a></p><p>Se non l'hai chiesto tu, ignora questo messaggio.</p>`

## 3. Google: credenziali OAuth

Su [console.cloud.google.com](https://console.cloud.google.com):

1. Crea un progetto, per esempio `SafeTaxi`.
2. **Google Auth Platform → Branding** (schermata di consenso OAuth): nome app `Safe Taxi`, email di assistenza, destinatari **Esterni**. Gli ambiti predefiniti (`openid`, `email`, `profile`) bastano.
3. **Google Auth Platform → Clients → Create client**:
   - tipo **Web application**, nome `Safe Taxi web`;
   - **Authorized JavaScript origins**: `https://<dominio-di-produzione>` e `http://localhost:5173`;
   - **Authorized redirect URIs**: `https://emgookqbvrehcroxpypx.supabase.co/auth/v1/callback`.
4. Copia **Client ID** e **Client secret**.
5. Finché l'app è in stato **Testing**, possono accedere solo gli utenti aggiunti in **Audience → Test users**: aggiungi i tuoi indirizzi di prova. La pubblicazione per tutti si fa più avanti, con l'informativa privacy pronta (punto 5 della roadmap).

Poi in Supabase → **Authentication → Sign In / Providers → Google**: attiva, incolla Client ID e Client secret, salva.

## 4. Verifica

Sull'app pubblicata da Vercel:

1. **Ospite**: invia una segnalazione senza accedere → messaggio "anonima inviata: in moderazione"; nel profilo compare in "Le tue segnalazioni".
2. **Email**: Profilo → Accedi o registrati → Crea account → apri il link nell'email → torni nell'app già dentro.
3. **Google**: Continua con Google → scegli l'account → torni nell'app già dentro.
4. **Moderazione**: in Table Editor → `reports` metti `status = pubblicata` → la segnalazione compare nel feed e l'autore verificato riceve i punti.

Se un passaggio non funziona, il messaggio di errore dell'app di solito indica la causa (per esempio "Invio senza account non ancora attivo" = punto 2 non fatto).
