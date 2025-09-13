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

// Ajuste dinámico para desarrollo local
function cookieOptionsForReq(req) {
  const host = (req.headers && req.headers.host) || '';
  const isLocalhost = /localhost:\d+$/i.test(host);
  
  // Configuración para desarrollo local
  if (isLocalhost || process.env.NODE_ENV !== 'production') {
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 día
      path: '/'
    };
  }
  
  // Configuración para producción
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000, // 1 día
    path: '/'
  };
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

    // Función auxiliar para definir permisos por rol
    function getRolePermissions(role) {
      const rolePermissions = {
        admin: ['read:all', 'write:all', 'delete:all', 'manage:users'],
        supervisor: ['read:all', 'write:own', 'read:team', 'write:team'],
        agent: ['read:own', 'write:own'],
        backoffice: ['read:all', 'write:all']
      };
      return rolePermissions[role] || ['read:own'];
    }

    // Generar token JWT con información extendida
    const token = jwt.sign(
      { 
        id: user._id, 
        userId: user._id, // Compatibilidad con código existente
        username: user.username, 
        email: user.email,
        role: user.role, 
        team: user.team,
        // Incluir permisos específicos basados en el rol
        permissions: getRolePermissions(user.role)
      },
      JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'dashboard-api',
        audience: 'dashboard-client'
      }
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

// Verificar la sesión actual del usuario
exports.verify = (req, res) => {
  try {
    // Verificar que el usuario esté autenticado
    if (!req.user || !req.user._id) {
      console.warn('[AUTH] Intento de verificación sin usuario autenticado');
      return res.status(401).json({
        success: false,
        message: 'No autorizado: sesión inválida o expirada',
        code: 'UNAUTHORIZED'
      });
    }

    // Obtener información adicional del usuario
    const userInfo = {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email || null,
      role: req.user.role,
      team: req.user.team || null,
      permissions: req.user.permissions || [],
      timestamp: new Date().toISOString()
    };

    console.log(`[AUTH] Verificación de sesión exitosa para usuario: ${userInfo.username} (${userInfo.role})`);
    
    // Enviar respuesta exitosa con información del usuario
    return res.status(200).json({ 
      success: true, 
      message: 'Sesión válida',
      user: userInfo
    });
    
  } catch (error) {
    console.error('[AUTH] Error al verificar sesión:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al verificar la sesión',
      code: 'SERVER_ERROR'
    });
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
    console.log('[AUTH] Intento de inicio de sesión recibido');
    const { username, password } = req.body;

    // Validar datos de entrada
    if (!username || !password) {
      console.warn('[AUTH] Faltan credenciales', { username: !!username });
      return res.status(400).json({
        success: false,
        message: 'Por favor, proporcione nombre de usuario y contraseña'
      });
    }

    console.log(`[AUTH] Buscando usuario: ${username}`);
    // Buscar usuario por nombre de usuario
    const user = await User.findByUsername(username);
    if (!user) {
      console.warn('[AUTH] Usuario no encontrado', { username });
      // Usar un mensaje genérico por seguridad
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    console.log(`[AUTH] Usuario encontrado, verificando contraseña para: ${username}`);
    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn('[AUTH] Contraseña incorrecta', { username });
      // Usar el mismo mensaje genérico
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    console.log(`[AUTH] Contraseña válida para: ${username}`);
    // Helper function to define role-based permissions
    function getRolePermissions(role) {
      const rolePermissions = {
        admin: ['read:all', 'write:all', 'delete:all', 'manage:users'],
        supervisor: ['read:all', 'write:own', 'read:team', 'write:team'],
        agent: ['read:own', 'write:own'],
        backoffice: ['read:all', 'write:all']
      };
      return rolePermissions[role] || ['read:own'];
    }

    console.log(`[AUTH] Generando token JWT para: ${username}`);
    // Generate JWT token with extended information
    const token = jwt.sign(
      { 
        id: user._id, 
        userId: user._id, // For backward compatibility
        username: user.username,
        email: user.email,
        role: user.role,
        team: user.team,
        permissions: getRolePermissions(user.role)
      },
      JWT_SECRET,
      { 
        expiresIn: '24h',
        issuer: 'dashboard-api',
        audience: 'dashboard-client'
      }
    );

    console.log(`[AUTH] Token generado para: ${username}`);
    // Configurar cookie
    const cookieOptions = cookieOptionsForReq(req);
    console.log('[AUTH] Configuración de cookies:', cookieOptions);
    
    try {
      res.cookie('token', token, cookieOptions);
      console.log('[AUTH] Cookie configurada exitosamente');
    } catch (cookieError) {
      console.error('[AUTH] Error al configurar la cookie:', cookieError);
      // Continuar aunque falle la cookie, ya que también tenemos el token en la respuesta
    }

    console.log(`[AUTH] Inicio de sesión exitoso para: ${username}`);
    // Enviar respuesta exitosa
    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token, // Enviar token en la respuesta para almacenamiento en localStorage
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        permissions: getRolePermissions(user.role)
      }
    });
    
  } catch (error) {
    console.error('[AUTH] Error en el inicio de sesión:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor al intentar iniciar sesión',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
