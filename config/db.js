const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
});

let db;

async function connectToMongoDB() {
  try {
    if (!db) {
      await client.connect();
      db = client.db();
      console.log('Conectado a MongoDB Atlas');
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
