const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';
const isProd = process.env.NODE_ENV === 'production';
const oneDayMs = 24 * 60 * 60 * 1000;
const cookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: oneDayMs,
  path: '/'
};

// Ajuste dinámico para desarrollo local en http://localhost:10000 aun si NODE_ENV=production
function cookieOptionsForReq(req) {
  const proto = (req.headers && req.headers['x-forwarded-proto']) || (req.protocol);
  const isHttps = (proto === 'https') || req.secure;
  const host = (req.headers && req.headers.host) || '';
  const isLocal10000 = /localhost:10000$/i.test(host);
  if (isLocal10000 || !isHttps) {
    return { ...cookieOpts, secure: false, sameSite: 'lax' };
  }
  return cookieOpts;
}

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
      { id: user._id?.toString(), username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Establecer cookie HttpOnly con el token (ajuste dinámico para local http)
    try { res.cookie && res.cookie('token', token, cookieOptionsForReq(req)); } catch {}

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

// Logout: limpiar cookie del token
exports.logout = async (req, res) => {
  try {
    try { res.clearCookie && res.clearCookie('token', { ...cookieOptionsForReq(req), maxAge: undefined }); } catch {}
    return res.json({ success: true, message: 'Sesión cerrada' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
  }
};

// Controlador para restablecer la contraseña de un usuario (solo ADMIN)
exports.resetPassword = async (req, res) => {
  try {
    const { username, newPassword } = req.body;

    if (!username || !newPassword) {
      return res.status(400).json({ success: false, message: 'username y newPassword son requeridos' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const result = await User.updatePasswordByUsername(username, newPassword);
    if (!result.updated) {
      if (result.reason === 'not_found') {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
      return res.status(500).json({ success: false, message: 'No se pudo actualizar la contraseña' });
    }

    return res.json({ success: true, message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    return res.status(500).json({ success: false, message: 'Error al restablecer la contraseña' });
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

    // Crear token JWT (asegurar id como string)
    const token = jwt.sign(
      { id: user._id?.toString(), username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Establecer cookie HttpOnly con el token (ajuste dinámico para local http)
    try { res.cookie && res.cookie('token', token, cookieOptionsForReq(req)); } catch {}

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
