const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';

// Middleware para proteger rutas
exports.protect = async (req, res, next) => {
  console.log('[AUTH] Iniciando verificación de autenticación');
  let token;

  // 1. Verificar si el token está en los headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    console.log('[AUTH] Token encontrado en headers');
  } 
  // 2. Verificar si el token está en una cookie
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    console.log('[AUTH] Token encontrado en cookies');
  }
  // 3. Verificar si el token está en el body (útil para WebSockets o casos especiales)
  else if (req.body && req.body.token) {
    token = req.body.token;
    console.log('[AUTH] Token encontrado en body');
  }

  // Asegurarse de que existe el token
  if (!token) {
    console.warn('[AUTH] No se encontró token de autenticación');
    console.log('[AUTH] Headers:', JSON.stringify(req.headers, null, 2));
    return res.status(401).json({
      success: false,
      message: 'No autorizado: Token de autenticación no proporcionado',
      code: 'MISSING_TOKEN',
      provided: {
        hasAuthHeader: !!req.headers.authorization,
        hasCookies: !!(req.cookies && Object.keys(req.cookies).length > 0)
      }
    });
  }

  try {
    console.log('[AUTH] Verificando token...');
    // Limpiar el token de posibles comillas o espacios en blanco
    const cleanToken = token.replace(/^['"]|['"]$/g, '').trim();
    
    // Verificar token
    const decoded = jwt.verify(cleanToken, JWT_SECRET, {
      issuer: 'dashboard-api',
      audience: 'dashboard-client',
      ignoreExpiration: false
    });
    
    console.log('[AUTH] Token decodificado exitosamente');
    
    // Log detallado del token decodificado (sin información sensible)
    console.log('[AUTH] Token payload:', { 
      id: decoded?.id ? 'presente' : 'ausente',
      userId: decoded?.userId ? 'presente' : 'ausente',
      username: decoded?.username || 'no especificado',
      role: decoded?.role || 'no especificado',
      team: decoded?.team || 'no especificado',
      hasPermissions: !!(decoded?.permissions && decoded.permissions.length > 0)
    });
    
    // Soportar tanto 'id' (authController) como 'userId' (server.js /api/login)
    const userId = decoded?.id || decoded?.userId;
    if (!userId) {
      console.warn('[AUTH] Token válido pero sin ID de usuario', { 
        decodedKeys: Object.keys(decoded || {}) 
      });
      return res.status(401).json({ 
        success: false, 
        message: 'Token inválido: falta el identificador de usuario',
        code: 'INVALID_TOKEN_MISSING_ID'
      });
    }
    
    try {
      // Intentar obtener el usuario de la base de datos
      const user = await User.findById(userId);
      
      if (user) {
        // Usuario encontrado en BD
        req.user = {
          _id: user._id,
          id: user._id?.toString?.() || user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          team: user.team || null,
          permissions: user.permissions || []
        };
        console.log(`[AUTH] Usuario autenticado desde BD: ${req.user.username} (${req.user.role})`);
      } else {
        // Usuario no encontrado en BD, pero el token es válido
        console.warn(`[AUTH] Usuario con ID ${userId} no encontrado en BD, usando datos del token`);
        req.user = {
          _id: userId,
          id: userId,
          username: decoded.username || decoded.email || `user_${userId.substring(0, 6)}`,
          email: decoded.email || null,
          role: (decoded.role || 'agent'), // Por defecto a 'agent' si no se especifica
          team: decoded.team || null,
          permissions: decoded.permissions || []
        };
      }
    } catch (dbError) {
      console.error('[AUTH] Error al buscar usuario en BD:', dbError);
      // Fallback a datos del token si hay error en BD
      req.user = {
        _id: userId,
        id: userId,
        username: decoded.username || decoded.email || `user_${userId.substring(0, 6)}`,
        email: decoded.email || null,
        role: (decoded.role || 'agent'),
        team: decoded.team || null,
        permissions: decoded.permissions || []
      };
    }
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

// Middleware para verificar si el usuario tiene acceso a la tabla de clientes
exports.hasTableAccess = (req, res, next) => {
  console.log('[AUTH] Verificando acceso a la tabla de clientes');
  
  // Solo los administradores pueden ver la tabla de clientes
  if (req.user && req.user.role === 'admin') {
    console.log(`[AUTH] Acceso concedido a la tabla de clientes para ${req.user.username}`);
    return next();
  }
  
  console.warn(`[AUTH] Acceso denegado a la tabla de clientes para ${req.user?.username || 'usuario no autenticado'}`);
  return res.status(403).json({
    success: false,
    message: 'Acceso denegado: No tienes permisos para ver la tabla de clientes',
    code: 'ACCESS_DENIED',
    requiredRole: 'admin',
    currentRole: req.user?.role || 'no autenticado'
  });
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

