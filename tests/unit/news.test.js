import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {FEEDS, parseFeed, selectNews, isRelevant, decodeXml} from '../../supabase/functions/_shared/news.js';

const google = readFileSync('tests/fixtures/news-google.xml', 'utf8');
const consumerismo = readFileSync('tests/fixtures/news-consumerismo.xml', 'utf8');
const NOW = Date.parse('2026-09-27T00:00:00Z');

describe('news dal settore taxi', () => {
  it('legge i feed di Google News con testata e titolo ripulito', () => {
    const items = parseFeed(google, FEEDS[0]);
    expect(items).toHaveLength(9);
    const ansa = items.find(n => n.source === 'ANSA');
    expect(ansa.title).toBe('Caro carburanti, salasso per camionisti, tassisti e rappresentanti commercio');
    expect(ansa.url).toMatch(/^https:\/\/news\.google\.com\/rss\/articles\//);
    expect(ansa.publishedAt).toBeGreaterThan(Date.parse('2026-09-01'));
    expect(ansa.feed).toBe('google_news');
  });

  it('legge un feed WordPress con la testata della fonte', () => {
    const items = parseFeed(consumerismo, FEEDS[1]);
    expect(items[0]).toMatchObject({title:'Taxi a Roma, Consumerismo sostiene assessore Onorato', source:'Consumerismo No Profit'});
    expect(items[0].url).toMatch(/^https:\/\/www\.consumerismo\.it\//);
  });

  it('scarta taxi acquei, film, videogiochi, omonimi e notizie non pertinenti', () => {
    const kept = selectNews([...parseFeed(google, FEEDS[0]), ...parseFeed(consumerismo, FEEDS[1])], NOW).map(n => n.title);
    expect(kept).toContain('Caro carburanti, salasso per camionisti, tassisti e rappresentanti commercio');
    expect(kept).toContain('Taxi a Roma, Consumerismo sostiene assessore Onorato');
    expect(kept.some(t => /acqueo|Taxi Driver|Crazy Taxi|corone|Neo sposi|Borsa della Spesa|Oasis/.test(t))).toBe(false);
    expect(kept).toHaveLength(5);
  });

  it('riconosce NCC solo in maiuscolo', () => {
    expect(isRelevant('Taxi e Ncc chiedono aiuti')).toBe(true);
    expect(isRelevant('Nuove licenze NCC a Guidonia')).toBe(true);
    expect(isRelevant('Il gruppo ncc presenta i conti')).toBe(false);
  });

  it('toglie doppioni, notizie vecchie e link non validi', () => {
    const base = {source:'Test', feed:'google_news', publishedAt:NOW - 3600e3};
    const out = selectNews([
      {...base, title:'Taxi, nuove tariffe', url:'https://a.it/1'},
      {...base, title:'TAXI: nuove tariffe!', url:'https://b.it/2'},
      {...base, title:'Taxi introvabili a Bari', url:'https://a.it/1'},
      {...base, title:'Taxi a Milano', url:'javascript:alert(1)'},
      {...base, title:'Taxi di un anno fa', url:'https://c.it/3', publishedAt:NOW - 365 * 864e5},
    ], NOW);
    expect(out.map(n => n.url)).toEqual(['https://a.it/1']);
    expect(out[0]).toMatchObject({title:'Taxi, nuove tariffe', source_name:'Test', feed:'google_news'});
  });

  it('decodifica entità e CDATA', () => {
    expect(decodeXml('<![CDATA[Taxi &amp; NCC]]> d&#8217;Europa &#x2013; ok')).toBe('Taxi & NCC d’Europa – ok');
  });
});
