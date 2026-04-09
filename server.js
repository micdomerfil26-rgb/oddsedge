const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

const BASE = 'https://api.odds-api.io/v3';

async function fetchOdds(apiKey, bookmaker, league) {
  const url = `${BASE}/odds?apiKey=${apiKey}&bookmaker=${bookmaker}&league=${league}`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : (data.data || data.odds || data.events || []);
}

function calcFair(homeOdd, awayOdd, drawOdd) {
  if (!homeOdd || !awayOdd || homeOdd < 1.01 || awayOdd < 1.01) return null;
  const pH = 1 / homeOdd, pA = 1 / awayOdd;
  const pD = drawOdd && drawOdd > 1.01 ? 1 / drawOdd : 0;
  const over = pH + pA + pD;
  return {
    fairHome: parseFloat((over / pH).toFixed(4)),
    fairAway: parseFloat((over / pA).toFixed(4)),
    fairDraw: pD > 0 ? parseFloat((over / pD).toFixed(4)) : null,
    juice: parseFloat(((over - 1) / over * 100).toFixed(2)),
  };
}

app.get('/api/compare', async (req, res) => {
  const { apiKey, league } = req.query;
  try {
    const [dkRaw, pmRaw] = await Promise.all([
      fetchOdds(apiKey, 'DraftKings', league),
      fetchOdds(apiKey, 'Polymarket', league),
    ]);

    const dkMap = {};
    for (const ev of dkRaw) {
      const id = ev.eventId || ev.id;
      if (id) dkMap[id] = ev;
    }

    const opportunities = [];

    for (const pmEv of pmRaw) {
      const id = pmEv.eventId || pmEv.id;
      const dk = dkMap[id];
      if (!dk) continue;

      const dkHome = parseFloat(dk.odds?.home || dk.bookmakerOdds?.home || 0);
      const dkAway = parseFloat(dk.odds?.away || dk.bookmakerOdds?.away || 0);
      const dkDraw = parseFloat(dk.odds?.draw || dk.bookmakerOdds?.draw || 0) || null;

      const fair = calcFair(dkHome, dkAway, dkDraw);
      if (!fair) continue;

      const pmHome = parseFloat(pmEv.odds?.home || pmEv.bookmakerOdds?.home || 0);
      const pmAway = parseFloat(pmEv.odds?.away || pmEv.bookmakerOdds?.away || 0);
      const pmDraw = parseFloat(pmEv.odds?.draw || pmEv.bookmakerOdds?.draw || 0) || null;

      const sides = [
        { side:'home', pmOdd:pmHome, fairOdd:fair.fairHome, dkOdd:dkHome, team:pmEv.event?.home||pmEv.home||'Home' },
        { side:'away', pmOdd:pmAway, fairOdd:fair.fairAway, dkOdd:dkAway, team:pmEv.event?.away||pmEv.away||'Away' },
      ];
      if (pmDraw && fair.fairDraw) sides.push({ side:'draw', pmOdd:pmDraw, fairOdd:fair.fairDraw, dkOdd:dkDraw, team:'Empate' });

      for (const s of sides) {
        if (!s.pmOdd || s.pmOdd < 1.01 || !s.fairOdd || s.fairOdd < 1.01) continue;
        const edge = parseFloat(((s.pmOdd / s.fairOdd - 1) * 100).toFixed(2));
        if (edge <= 0) continue;

        opportunities.push({
          eventId: id,
          league,
          home: pmEv.event?.home || pmEv.home || 'Home',
          away: pmEv.event?.away || pmEv.away || 'Away',
          eventDate: pmEv.event?.date || pmEv.date || null,
          market: pmEv.market?.name || pmEv.marketType || 'ML',
          side: s.side, team: s.team,
          pmOdd: parseFloat(s.pmOdd.toFixed(3)),
          dkOdd: parseFloat(s.dkOdd.toFixed(3)),
          fairOdd: s.fairOdd,
          juice: fair.juice, edge,
        });
      }
    }

    opportunities.sort((a,b) => b.edge - a.edge);
    res.json({ ok:true, count:opportunities.length, opportunities });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta ' + PORT));
