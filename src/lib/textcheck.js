/* Controlli sul testo delle segnalazioni: stesse regole di private.text_flags nel database
   (supabase/migrations/20260927100000_pubblicazione_automatica.sql). Qui servono ad avvisare chi scrive;
   la decisione (pubblicazione immediata o revisione) la prende sempre il database. Principio: i fatti si
   pubblicano, etichette di reato, insulti e dati personali di terzi vanno in revisione. */

const START = '(?<![\\p{L}\\d])';  // inizio di parola, anche con lettere accentate
const re = (body, flags = 'iu') => new RegExp(body, flags);

const RULES = [
  {flag:'dati_personali', tests:[
    re('[^@\\s]+@[^@\\s]+\\.[a-z]{2,}'),
    re('(\\+39[ .-]?)?' + START + '3\\d{2}[ .-]?\\d{3}[ .-]?\\d{3,4}(?!\\d)'),
    re(START + '0\\d{1,3}[ ./-]?\\d{5,8}(?!\\d)'),
    re('(si chiama|di nome|il signor|la signora)\\s+[A-ZÀ-Ý][a-zà-ÿ]+', 'u')]},
  {flag:'etichetta_reato', tests:[
    re(START + '(truffator|truffatric|ladr[oi](?!\\p{L})|ladron|criminal|delinquent|mafios|estorsor|spacciator|stuprator|farabutt|imbroglion)')]},
  {flag:'insulto', tests:[
    re(START + '(stronz|bastard|coglion|merd|cazz|vaffancul|fancul|idiot|deficient|imbecill|cretin|porc[oa](?!\\p{L})|troi[ae](?!\\p{L})|puttan|zoccol|froci|negr[oi](?!\\p{L})|zingar|terron)')]},
];

export function textFlags(text){
  const t = String(text || '');
  return RULES.filter(r => r.tests.some(x => x.test(t))).map(r => r.flag);
}

export const FLAG_HINTS = {
  etichetta_reato:'Descrivi cosa è successo invece di etichettare la persona: per esempio «il tassametro segnava 24 €, mi ha chiesto 50 €» al posto di «è un truffatore».',
  insulto:'Togli insulti e parolacce: la segnalazione resta valida ed è più credibile.',
  dati_personali:'Non scrivere nomi, telefoni o email di altre persone: bastano targa e licenza, che non vengono pubblicate.',
};
