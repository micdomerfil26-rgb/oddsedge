const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

const SPORTS = ['football', 'basketball', 'baseball', 'hockey', 'tennis'];

app.get('/api/value-bets', async (req, res) => {
  const { apiKey } = req.query;
  if (!apiKey) return res.status(400).json({ error: 'apiKey obrigatório' });

  try {
    const results = [];

    for (const sport of SPORTS) {
      // 1. Busca eventos do sport
      const eventsRes = await fetch(
        `https://api.odds-api.io/v3/events?apiKey=${apiKey}&sport=${sport}&limit=50`
      );
      const events = await eventsRes.json();
      if (!Array.isArray(events) || events.length === 0) continue;

      // 2. Processa em lotes de 10
      for (let i = 0; i < events.length; i += 10) {
        const batch = events.slice(i, i + 10);
        const eventIds = batch.map(e => e.id).join(',');

        const oddsRes = await fetch(
          `https://api.odds-api.io/v3/odds/multi?apiKey=${apiKey}&eventIds=${eventIds}&bookmakers=DraftKings,Polymarket`
        );
        const oddsData = await oddsRes.json();
        if (!Array.isArray(oddsData)) continue;

        for (const event of oddsData) {
          const dk = event.bookmakers?.DraftKings;
          const poly = event.bookmakers?.Polymarket;
          if (!dk || !poly) continue;

          const dkML = dk.find(m => m.name === 'ML');
          const polyML = poly.find(m => m.name === 'ML');
          if (!dkML?.odds?.[0] || !polyML?.odds?.[0]) continue;

          const dkOdds = dkML.odds[0];
          const polyOdds = polyML.odds[0];

          // Calcula margem da DraftKings
          const dkProbs = [];
          if (dkOdds.home) dkProbs.push(1 / parseFloat(dkOdds.home));
          if (dkOdds.draw) dkProbs.push(1 / parseFloat(dkOdds.draw));
          if (dkOdds.away) dkProbs.push(1 / parseFloat(dkOdds.away));
          const margin = dkProbs.reduce((a, b) => a + b, 0);
          if (margin === 0) continue;

          const outcomes = [
            { label: event.home, dkRaw: dkOdds.home, polyRaw: polyOdds.home },
            { label: 'Empate',   dkRaw: dkOdds.draw, polyRaw: polyOdds.draw },
            { label: event.away, dkRaw: dkOdds.away, polyRaw: polyOdds.away },
          ];

          for (const outcome of outcomes) {
            if (!outcome.dkRaw || !outcome.polyRaw) continue;
            const dkDecimal   = parseFloat(outcome.dkRaw);
            const polyDecimal = parseFloat(outcome.polyRaw);

            // Fair odd sem margem
            const fairProb = (1 / dkDecimal) / margin;
            const fairOdd  = 1 / fairProb;
            const edge     = ((polyDecimal / fairOdd) - 1) * 100;

            if (edge > 0) {
              results.push({
                liga:     event.league?.name || sport,
                jogo:     `${event.home} vs ${event.away}`,
                time:     outcome.label,
                oddPoly:  polyDecimal,
                fairDK:   parseFloat(fairOdd.toFixed(3)),
                edge:     parseFloat(edge.toFixed(2)),
                commence: event.date,
                polyUrl:  event.urls?.Polymarket || null,
              });
            }
          }
        }
      }
    }

    results.sort((a, b) => b.edge - a.edge);
    res.json({ bets: results, total: results.length });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor na porta ' + PORT));
