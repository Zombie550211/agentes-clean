const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { connectToMongoDB, getDb } = require('../config/db');

// Función auxiliar para obtener la instancia de la base de datos
async function getDatabase() {
  try {
    const db = getDb();
    if (!db) {
      return await connectToMongoDB();
    }
    return db;
  } catch (error) {
    console.error('Error al obtener la instancia de la base de datos:', error);
    throw error;
  }
}

class User {
  constructor(username, password, role) {
    this.username = username;
    this.password = password;
    this.role = role;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  // Método para guardar un nuevo usuario
  async save() {
    try {
      const db = await getDatabase();
      // Verificar si el usuario ya existe
      const existingUser = await db.collection('users').findOne({ username: this.username });
      
      if (existingUser) {
        throw new Error('El nombre de usuario ya está en uso');
      }

      // Hashear la contraseña
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);

      // Insertar el nuevo usuario
      const result = await db.collection('users').insertOne(this);
      return result.insertedId;
    } catch (error) {
      console.error('Error al guardar el usuario:', error);
      throw error;
    }
  }

  // Método estático para buscar un usuario por nombre de usuario
  static async findByUsername(username) {
    try {
      const db = await getDatabase();
      return await db.collection('users').findOne({ username });
    } catch (error) {
      console.error('Error al buscar usuario por nombre de usuario:', error);
      throw error;
    }
  }

  // Método estático para buscar un usuario por ID
  static async findById(id) {
    try {
      const db = await getDatabase();
      const _id = typeof id === 'string' ? new ObjectId(id) : id;
      return await db.collection('users').findOne({ _id });
    } catch (error) {
      console.error('Error al buscar usuario por ID:', error);
      throw error;
    }
  }

  // Método para verificar la contraseña
  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }
}

module.exports = User;
