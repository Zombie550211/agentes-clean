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
    try { console.warn('[AUTH] Falta token. Authorization header:', req.headers?.authorization || '(none)'); } catch {}
    return res.status(401).json({
      success: false,
      message: 'No está autorizado para acceder a esta ruta'
    });
  }

  try {
    // Verificar token
    try { console.warn('[AUTH] Verificando token. len:', token?.length, 'prefix:', token?.slice(0, 12)); } catch {}
    const decoded = jwt.verify(token, JWT_SECRET);
    try { console.warn('[AUTH] Token decodificado:', JSON.stringify({ id: decoded?.id, userId: decoded?.userId, role: decoded?.role, exp: decoded?.exp }, null, 2)); } catch {}
    // Soportar tanto 'id' (authController) como 'userId' (server.js /api/login)
    const userId = decoded?.id || decoded?.userId;
    if (!decoded || !userId) {
      console.warn('Token válido pero sin id de usuario (id|userId ausente)');
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    // Obtener el usuario del token
    const user = await User.findById(userId);
    if (!user) {
      console.warn('Token válido pero usuario no encontrado en BD', { userId: decoded.id });
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      console.warn('[AUTH] Token expirado');
      return res.status(401).json({ success: false, message: 'Token expirado' });
    }
    try { console.error('[AUTH] Error en verificación JWT:', { name: err?.name, message: err?.message }); } catch {}
    console.error('Error en autenticación:', err?.message || err);
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

// Middleware para autorizar por roles
exports.authorize = (...roles) => {
  const allowed = roles.map(r => r.toString().toLowerCase());
  return (req, res, next) => {
    const roleRaw = (req.user && req.user.role) ? req.user.role : '';
    const role = roleRaw.toString().toLowerCase();
    const roleCanonical = role === 'administrador' ? 'admin' : role;
    if (!allowed.includes(roleCanonical)) {
      return res.status(403).json({
        success: false,
        message: `El rol ${roleRaw} no tiene acceso a esta ruta`
      });
    }
    next();
  };
};

