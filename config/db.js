const { MongoClient } = require('mongodb');
require('dotenv').config();

// Soporta producción (Atlas) y desarrollo (local) sin warnings deprecados
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crmagente';
const dbName = process.env.MONGODB_DB; // opcional; si no se define, usa el de la URI
const client = new MongoClient(uri, {
  // Falla rápido si el servidor no responde (evita que se "cuelgue" el arranque)
  serverSelectionTimeoutMS: 5000
});

let db;

async function connectToMongoDB() {
  try {
    if (!db) {
      await client.connect();
      db = dbName ? client.db(dbName) : client.db();
      console.log(`Conectado a MongoDB (${db.databaseName})`);
    }
    return db;
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
    throw error;
  }
}

async function closeConnection() {
  try {
    if (client) {
      await client.close();
      console.log('Conexión a MongoDB cerrada');
    }
  } catch (error) {
    console.error('Error al cerrar la conexión a MongoDB:', error);
    throw error;
  }
}

module.exports = {
  connectToMongoDB,
  closeConnection,
  getDb: () => db
};
