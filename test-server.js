const express = require('express');
const app = express();
const PORT = 3001;

app.get('/', (req, res) => {
  res.send('Servidor de prueba funcionando');
});

app.listen(PORT, () => {
  console.log(`Servidor de prueba corriendo en puerto ${PORT}`);
});
