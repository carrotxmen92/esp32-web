const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

let lastData = {};

app.post('/api/data', (req, res) => {
  lastData = req.body;
  console.log("📥 Data:", lastData);
  res.sendStatus(200);
});

app.get('/api/data', (req, res) => {
  res.json(lastData);
});

app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
