const express = require('express');
const path = require('path');
const port = process.env.PORT || 4200;
const app = express();
const dist = path.join(__dirname, '..', 'dist', 'statco-frontend');
app.use(express.static(dist));
app.use((req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});
app.listen(port, () => {
  console.log('Static server running on', port);
});
