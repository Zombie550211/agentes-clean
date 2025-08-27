const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';

// Middleware para proteger rutas
exports.protect = async (req, res, next) => {
  let token;

  // Verificar si el token está en los headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // O también podría venir en una cookie
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  // Asegurarse de que existe el token
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No está autorizado para acceder a esta ruta'
    });
  }

  try {
    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.id) {
      console.warn('Token válido pero sin id de usuario');
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    // Obtener el usuario del token
    const user = await User.findById(decoded.id);
    if (!user) {
      console.warn('Token válido pero usuario no encontrado en BD', { userId: decoded.id });
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Error en autenticación:', err);
    return res.status(401).json({
      success: false,
      message: 'No está autorizado para acceder a esta ruta'
    });
  }
};

// Middleware para autorizar por roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `El rol ${req.user.role} no tiene acceso a esta ruta`
      });
    }
    next();
  };
};
