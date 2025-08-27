const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';

// Controlador para registrar un nuevo usuario
exports.register = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Validar datos de entrada
    if (!username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, proporcione nombre de usuario, contraseña y rol'
      });
    }

    // Validar que el rol sea válido
    const validRoles = ['admin', 'agent', 'supervisor', 'backoffice'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rol no válido. Los roles válidos son: admin, agent, supervisor, backoffice'
      });
    }

    // Crear y guardar el nuevo usuario
    const user = new User(username, password, role);
    await user.save();

    // Crear token JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Enviar respuesta exitosa
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al registrar el usuario'
    });
  }
};

// Controlador para iniciar sesión
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validar datos de entrada
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, proporcione nombre de usuario y contraseña'
      });
    }

    // Buscar usuario por nombre de usuario
    const user = await User.findByUsername(username);
    if (!user) {
      console.warn('Login fallido: usuario no encontrado', { username });
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn('Login fallido: contraseña inválida', { username });
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Crear token JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Enviar respuesta exitosa
    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en el inicio de sesión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión'
    });
  }
};
