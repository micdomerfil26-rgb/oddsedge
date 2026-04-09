const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/value-bets', async (req, res) => {
  const { apiKey, bookmaker, league } = req.query;
  try {
    const url = `https://api.odds-api.io/v3/value-bets?apiKey=${apiKey}&bookmaker=${bookmaker}&league=${league}&minExpectedValue=0`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor rodando na porta ' + PORT));
