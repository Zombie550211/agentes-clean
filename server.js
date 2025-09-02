const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
// Carga condicional de Helmet y Rate Limit (si están instalados)
let helmet = null;
let rateLimit = null;
try { helmet = require('helmet'); } catch { console.warn('[INIT] helmet no instalado, se recomienda instalarlo'); }
try { rateLimit = require('express-rate-limit'); } catch { console.warn('[INIT] express-rate-limit no instalado, se recomienda instalarlo'); }
// Carga condicional de cookie-parser (para soportar JWT en cookies si se usa)
let cookieParser = null;
try { cookieParser = require('cookie-parser'); } catch { console.warn('[INIT] cookie-parser no instalado (opcional si usas JWT en header)'); }

// Importar rutas
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const rankingRoutes = require('./routes/ranking');
const { connectToMongoDB, getDb } = require('./config/db');
// Middleware de autenticación unificado
const { protect, authorize } = require('./middleware/auth');

// Configuración de JWT
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_super_segura';
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET no definido en variables de entorno. Usa un valor fuerte en producción.');
}
const JWT_EXPIRES_IN = '24h'; // El token expira en 24 horas

// Silenciar logs en producción (mantener warn/error)
if (process.env.NODE_ENV === 'production' && process.env.DEBUG_LOGS !== '1') {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

// Configuración de rutas de archivos estáticos
const staticPath = path.join(__dirname, '/');
const publicPath = path.join(__dirname, '/');

// Helper para opciones de cookie dinámicas según request (soporte localhost:10000 en HTTP)
function cookieOptionsForReq(req, baseOpts) {
  const defaultOpts = baseOpts || {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
  const proto = (req.headers && req.headers['x-forwarded-proto']) || req.protocol;
  const isHttps = (proto === 'https') || req.secure;
  const host = (req.headers && req.headers.host) || '';
  const isLocal10000 = /localhost:10000$/i.test(host);
  if (isLocal10000 || !isHttps) {
    return { ...defaultOpts, secure: false, sameSite: 'lax' };
  }
  return defaultOpts;
}

// CORS endurecido con lista blanca desde .env (ALLOWED_ORIGINS) + origen propio en Render
const parseAllowedOrigins = (raw) => (raw || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const defaultAllowed = [
  'http://localhost:10000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:10000'
];
// Tomar el origen público si está configurado (Render expone RENDER_EXTERNAL_URL)
const selfOriginRaw = (process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || '').trim();
const selfOrigin = selfOriginRaw ? selfOriginRaw.replace(/\/$/, '') : '';
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS) || [];
if (selfOrigin && !allowedOrigins.includes(selfOrigin)) {
  allowedOrigins.push(selfOrigin);
}
const whitelist = allowedOrigins.length ? allowedOrigins : defaultAllowed;
const corsOptions = {
  origin: (origin, callback) => {
    // Permitir solicitudes sin origen (navegación directa) y orígenes en whitelist
    if (!origin || whitelist.includes(origin)) {
      return callback(null, true);
    }
    console.warn('[CORS] Origen no permitido:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

const app = express();
const PORT = process.env.PORT || 3002;

// Inicializar la conexión a la base de datos
let db;
(async () => {
  try {
    db = await connectToMongoDB();
    console.log('Conexión a la base de datos establecida correctamente');
  } catch (error) {
    console.error('Error al conectar a la base de datos en el arranque:', error?.message);
    console.warn('Continuando sin conexión inicial. Los endpoints intentarán reconectar bajo demanda...');
  }
})();

// Configuración de middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (cookieParser) {
  app.use(cookieParser());
}
// Helmet (si disponible)
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false
  }));
}
// Rate limiting (si disponible)
const makeLimiter = (opts) => rateLimit ? rateLimit.rateLimit(opts) : ((req, res, next) => next());
const authLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });
const loginLimiter = makeLimiter({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

// Servir archivos estáticos
app.use(express.static(staticPath, {
  extensions: ['html', 'htm'],
  setHeaders: (res, filePath) => {
    // Configurar los headers correctos para archivos estáticos
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Handle CORS preflight for all routes
app.options('*', cors(corsOptions));

// Usar rutas de autenticación (aplicar limiter suave al grupo si disponible)
app.use('/api/auth', authLimiter, authRoutes);
// Montar rutas de API públicas
app.use('/api', apiRoutes);
// Montar rutas de ranking
app.use('/api', rankingRoutes);

// Middleware inline (authenticateJWT) queda reemplazado por middleware/auth.js (protect)
// Wrapper mínimo por compatibilidad con referencias existentes
const authenticateJWT = (req, res, next) => protect(req, res, next);

// Favicon handler: servir un icono por defecto para evitar 404
app.get('/favicon.ico', (req, res) => {
  try {
    const iconPathPng = path.join(__dirname, 'images', 'avatar.png');
    if (fs.existsSync(iconPathPng)) {
      res.type('png');
      return res.sendFile(iconPathPng);
    }
  } catch {}
  // Fallback vacío para no loguear 404
  res.status(204).end();
});

// Ruta protegida de ejemplo (requiere autenticación)
app.get('/api/protected', protect, (req, res) => {
  res.json({ message: 'Ruta protegida', user: req.user });
});

// Endpoint para verificar que el servidor está funcionando
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor funcionando correctamente' });
});

// Endpoint para crear un usuario administrador inicial (solo desarrollo + secreto por .env)
app.post('/api/create-admin', async (req, res) => {
  try {
    // Bloquear en producción
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ success: false, message: 'No encontrado' });
    }

    const { username, password, secret } = req.body || {};
    const SETUP_SECRET = process.env.ADMIN_SETUP_SECRET;
    const headerSecret = req.headers['x-admin-setup-secret'];
    const providedSecret = headerSecret || secret;

    if (!SETUP_SECRET || !providedSecret || providedSecret !== SETUP_SECRET) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
    }

    // Verificar si la base de datos está conectada
    if (!db) {
      console.log('Base de datos no conectada, intentando conectar...');
      db = await connectToMongoDB();
    }

    // Verificar si el usuario ya existe
    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'El usuario ya existe' });
    }

    // Hashear la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear el usuario administrador
    const newUser = {
      username,
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('users').insertOne(newUser);
    // No devolver la contraseña
    delete newUser.password;

    return res.status(201).json({ success: true, message: 'Usuario administrador creado exitosamente', user: newUser });
  } catch (error) {
    console.error('Error al crear usuario administrador:', error);
    return res.status(500).json({ success: false, message: 'Error al crear el usuario administrador' });
  }
});

// Listar agentes desde la colección de usuarios (para hidratar sidebar)
app.get('/api/users/agents', protect, async (req, res) => {
  try {
    if (!db) await connectToMongoDB();
    const usersColl = db.collection('users');
    // Filtrar solo roles de agente (variantes comunes)
    const roleFilter = { role: { $in: ['agent', 'agente', 'Agent', 'AGENT'] } };
    const users = await usersColl
      .find(roleFilter)
      .project({ username: 1, name: 1, nombre: 1, fullName: 1, role: 1 })
      .toArray();
    const sanitized = users.map(u => ({
      id: (u._id && u._id.toString()) || null,
      username: u.username || null,
      name: u.name || u.nombre || u.fullName || u.username || null,
      role: u.role || 'agent'
    }));
    return res.json({ success: true, agents: sanitized });
  } catch (e) {
    console.error('[users-agents] error:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo agentes', error: e.message });
  }
});

// Endpoint para el login
// Endpoint para el login (aplicar rate limit si disponible)
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuario y contraseña son requeridos' 
      });
    }
    
    // Verificar si la base de datos está conectada
    if (!db) {
      console.log('Base de datos no conectada, intentando conectar...');
      await connectToMongoDB();
    }
    
    // Buscar el usuario en la base de datos
    const user = await db.collection('users').findOne({ username });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario o contraseña incorrectos' 
      });
    }
    
    // Verificar la contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario o contraseña incorrectos' 
      });
    }
    
    // Generar token JWT (usar clave 'id' de forma unificada)
    const token = jwt.sign(
      { 
        id: user._id?.toString(), 
        username: user.username,
        role: user.role || 'user'
      }, 
      JWT_SECRET, 
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Establecer cookie HttpOnly con el token (compatibilidad con lecturas desde cookie)
    try {
      const opts = cookieOptionsForReq(req, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.cookie && res.cookie('token', token, opts);
    } catch {}

    // Enviar respuesta exitosa sin la contraseña
    const { password: _, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token,
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor durante el inicio de sesión'
    });
  }
});

// Endpoint para obtener comentarios de un lead (usado por Costumer.html)
app.get('/api/comments', async (req, res) => {
  try {
    const { leadId } = req.query;
    if (!leadId) {
      return res.status(400).json({ success: false, message: 'Se requiere el parámetro leadId' });
    }
    if (!db) {
      await connectToMongoDB();
    }
    let leadObjectId;
    try {
      leadObjectId = new ObjectId(leadId);
    } catch {
      return res.status(400).json({ success: false, message: 'leadId inválido' });
    }
    const comments = await db
      .collection('Vcomments')
      .find({ leadId: leadObjectId })
      .sort({ createdAt: 1 })
      .toArray();
    // Adaptar para frontend: devolver arreglo en propiedad comments
    const payload = (comments || []).map(c => ({
      _id: c._id?.toString(),
      autor: c.autor || c.author || 'Desconocido',
      texto: c.texto || c.text || '',
      fecha: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString()
    }));
    return res.json({ success: true, comments: payload, message: 'Comentarios cargados correctamente' });
  } catch (error) {
    console.error('Error al obtener comentarios:', error);
    return res.status(500).json({ success: false, message: 'Error al cargar los comentarios', error: error.message });
  }
});

// Endpoints de comentarios por lead (usados por js/core/costumer-comments.js)
// Listar comentarios
app.get('/api/leads/:id/comentarios', async (req, res) => {
  try {
    const leadId = req.params.id;
    if (!db) await connectToMongoDB();
    let leadObjectId;
    try { leadObjectId = new ObjectId(leadId); } catch { return res.status(400).json({ success: false, message: 'leadId inválido' }); }
    const list = await db.collection('Vcomments').find({ leadId: leadObjectId }).sort({ createdAt: 1 }).toArray();
    const mapped = list.map(c => ({
      _id: c._id?.toString(),
      autor: c.autor || c.author || 'Desconocido',
      fecha: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      texto: c.texto || c.text || ''
    }));
    return res.json(mapped);
  } catch (err) {
    console.error('GET comentarios error:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener comentarios', error: err.message });
  }
});

// Crear comentario
app.post('/api/leads/:id/comentarios', protect, async (req, res) => {
  try {
    const leadId = req.params.id;
    const { texto, comentario, autor } = req.body || {};
    if (!db) await connectToMongoDB();
    let leadObjectId;
    try { leadObjectId = new ObjectId(leadId); } catch { return res.status(400).json({ success: false, message: 'leadId inválido' }); }
    const now = new Date();
    const doc = {
      leadId: leadObjectId,
      texto: (texto ?? comentario ?? '').toString().slice(0, 1000),
      autor: autor || req.user?.username || 'Sistema',
      createdAt: now,
      updatedAt: now
    };
    const result = await db.collection('Vcomments').insertOne(doc);
    return res.status(201).json({
      success: true,
      message: 'Comentario creado',
      data: { _id: result.insertedId.toString(), ...doc }
    });
  } catch (err) {
    console.error('POST comentario error:', err);
    return res.status(500).json({ success: false, message: 'Error al crear comentario', error: err.message });
  }
});

// Actualizar comentario
app.put('/api/leads/:id/comentarios/:comentarioId', protect, async (req, res) => {
  try {
    const { id, comentarioId } = req.params;
    const { texto } = req.body || {};
    if (!db) await connectToMongoDB();
    let leadObjectId, commentObjectId;
    try { leadObjectId = new ObjectId(id); commentObjectId = new ObjectId(comentarioId); } catch { return res.status(400).json({ success: false, message: 'IDs inválidos' }); }
    const result = await db.collection('Vcomments').findOneAndUpdate(
      { _id: commentObjectId, leadId: leadObjectId },
      { $set: { texto: (texto ?? '').toString().slice(0, 1000), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    const c = result.value;
    return res.json({ success: true, message: 'Comentario actualizado', data: { _id: c._id.toString(), autor: c.autor, texto: c.texto, fecha: new Date(c.createdAt).toISOString() } });
  } catch (err) {
    console.error('PUT comentario error:', err);
    return res.status(500).json({ success: false, message: 'Error al actualizar comentario', error: err.message });
  }
});

// Eliminar comentario
app.delete('/api/leads/:id/comentarios/:comentarioId', protect, async (req, res) => {
  try {
    const { id, comentarioId } = req.params;
    if (!db) await connectToMongoDB();
    let leadObjectId, commentObjectId;
    try { leadObjectId = new ObjectId(id); commentObjectId = new ObjectId(comentarioId); } catch { return res.status(400).json({ success: false, message: 'IDs inválidos' }); }
    const result = await db.collection('Vcomments').deleteOne({ _id: commentObjectId, leadId: leadObjectId });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, message: 'Comentario no encontrado' });
    return res.json({ success: true, message: 'Comentario eliminado' });
  } catch (err) {
    console.error('DELETE comentario error:', err);
    return res.status(500).json({ success: false, message: 'Error al eliminar comentario', error: err.message });
  }
});

// Actualizar el "status" de un lead/cliente
app.put('/api/leads/:id/status', protect, authorize('admin','backoffice','b:o','b.o','b-o','bo'), async (req, res) => {
  try {
    // Verificar conexión a BD
    if (!db) await connectToMongoDB();

    // Roles permitidos: admin, supervisor y variantes de backoffice/B.O
    const role = (req.user?.role || '').toLowerCase();
    console.log('[PUT /api/leads/:id/status] Rol del usuario:', role);
    const allowedRoles = ['admin', 'backoffice', 'b:o', 'b.o', 'b-o', 'bo'];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'No autorizado para actualizar el estado' });
    }

    // Validar ID
    const { id } = req.params;
    let leadObjectId = null;
    try { leadObjectId = new ObjectId(id); } catch { /* puede ser string */ }
    console.log('[PUT /api/leads/:id/status] ID recibido:', id, 'ObjectId válido:', !!leadObjectId);

    // Validar body
    const allowed = ['pending', 'hold', 'cancelled', 'rescheduled', 'completed'];
    const rawStatus = (req.body?.status || '').toString().trim();
    const status = rawStatus.toLowerCase();
    console.log('[PUT /api/leads/:id/status] Status recibido:', rawStatus);
    if (!rawStatus) {
      return res.status(400).json({ success: false, message: 'El campo status es requerido' });
    }
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status inválido. Permitidos: ${allowed.join(', ')}` });
    }

    // Normalizar a Capitalized para almacenar (opcional)
    const capitalized = status.charAt(0).toUpperCase() + status.slice(1);

    // Intentar actualización por etapas para evitar rarezas con $or
    const coll = db.collection('costumers');
    let result = null;

    // 1) Intentar por _id:ObjectId si es válido
    if (leadObjectId) {
      console.log('[PUT /api/leads/:id/status] Intentando update por _id:ObjectId');
      result = await coll.findOneAndUpdate(
        { _id: leadObjectId },
        { $set: { status: capitalized, actualizadoEn: new Date() } },
        { returnDocument: 'after' }
      );
      console.log('[PUT /api/leads/:id/status] Resultado _id:ObjectId:', !!(result && result.value));
    }

    // 2) Si no funcionó, intentar por _id:string
    if (!result || !result.value) {
      console.log('[PUT /api/leads/:id/status] Intentando update por _id:string');
      result = await coll.findOneAndUpdate(
        { _id: id },
        { $set: { status: capitalized, actualizadoEn: new Date() } },
        { returnDocument: 'after' }
      );
      console.log('[PUT /api/leads/:id/status] Resultado _id:string:', !!(result && result.value));
    }

    // 3) Si no funcionó, intentar por campo alterno id:string
    if (!result || !result.value) {
      console.log('[PUT /api/leads/:id/status] Intentando update por id:string');
      result = await coll.findOneAndUpdate(
        { id: id },
        { $set: { status: capitalized, actualizadoEn: new Date() } },
        { returnDocument: 'after' }
      );
      console.log('[PUT /api/leads/:id/status] Resultado id:string:', !!(result && result.value));
    }

    if (!result || !result.value) {
      // Diagnóstico adicional: comprobar cada criterio por separado
      try {
        const tests = [];
        if (leadObjectId) tests.push({ name: '_id:ObjectId', q: { _id: leadObjectId } });
        tests.push({ name: '_id:string', q: { _id: id } });
        tests.push({ name: 'id:string', q: { id: id } });
        for (const t of tests) {
          const found = await coll.findOne(t.q);
          console.log(`[PUT /api/leads/:id/status] Test criterio ${t.name}:`, found ? 'ENCONTRADO' : 'NO_ENCONTRADO');
        }
        // Intentar updateOne directo y loguear matched/modified para aislar el problema
        if (leadObjectId) {
          console.log('[PUT /api/leads/:id/status] Fallback updateOne por _id:ObjectId');
          const upd = await coll.updateOne(
            { _id: leadObjectId },
            { $set: { status: capitalized, actualizadoEn: new Date() } }
          );
          console.log('[PUT /api/leads/:id/status] updateOne resultado:', { matchedCount: upd.matchedCount, modifiedCount: upd.modifiedCount, acknowledged: upd.acknowledged });
          if (upd.matchedCount > 0) {
            console.log('[PUT /api/leads/:id/status] updateOne aplicó cambios, devolviendo éxito');
            return res.json({ success: true, message: 'Status actualizado correctamente (fallback updateOne)', data: { id, status: capitalized } });
          }
        }
      } catch (e) {
        console.warn('[PUT /api/leads/:id/status] Error durante diagnóstico de criterios:', e?.message);
      }
      console.warn('[PUT /api/leads/:id/status] Lead no encontrado con ninguno de los criterios para id:', id);
      return res.status(404).json({ success: false, message: 'Lead no encontrado' });
    }

    return res.json({ success: true, message: 'Status actualizado correctamente', data: { id, status: capitalized } });
  } catch (error) {
    console.error('Error al actualizar status del lead:', error);
    return res.status(500).json({ success: false, message: 'Error al actualizar el status', error: error.message });
  }
});

// Endpoint para obtener clientes desde la base de datos (PROTEGIDO + RBAC)
app.get('/api/customers', protect, authorize('admin','supervisor','agent'), async (req, res) => {
  try {
    console.log('Solicitud recibida en /api/customers');
    
    // Verificar si la base de datos está conectada
    if (!db) {
      console.log('Base de datos no conectada, intentando conectar...');
      await connectToMongoDB();
    }

    // Obtener los parámetros de paginación y filtros
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;
    const fechaInicio = req.query.fechaInicio ? new Date(req.query.fechaInicio) : null;
    const fechaFin = req.query.fechaFin ? new Date(req.query.fechaFin) : null;

    console.log(`Parámetros - Página: ${page}, Límite: ${limit}, Saltar: ${skip}`);

    // Verificar colecciones disponibles
    const collections = await db.listCollections().toArray();
    console.log('Colecciones disponibles en crmagente:', collections.map(c => c.name));

    // Usamos la colección 'costumers' específicamente
    const collectionName = 'costumers';
    console.log(`Intentando acceder a la colección: ${collectionName}`);
    
    // Verificar si la colección existe
    const collectionExists = collections.some(c => c.name === collectionName);
    if (!collectionExists) {
      console.error(`La colección "${collectionName}" no existe en la base de datos crmagente`);
      return res.status(404).json({
        success: false,
        message: `La colección "${collectionName}" no existe en la base de datos`,
        availableCollections: collections.map(c => c.name)
      });
    }
    
    const customersCollection = db.collection(collectionName);
    
    // Construir el filtro de consulta
    let query = {};
    const forceAllRaw = String(req.query.forceAll || 'false').toLowerCase();
    const forceAll = forceAllRaw === 'true' || forceAllRaw === '1';

    // Reglas de negocio de visibilidad:
    // - Agent: NUNCA puede ver "todos". Ignorar forceAll y filtrar por su propio agenteId.
    // - Supervisor: NUNCA puede ver "todos". Ignorar forceAll y filtrar por su equipo (agentes asignados a su supervisorId).
    // - Admin/Backoffice: pueden ver todos (sin filtro) y no necesitan forceAll.
    if (req.user) {
      const currentUserId = (req.user?._id?.toString?.() || req.user?.id?.toString?.() || String(req.user?._id || req.user?.id || ''));
      const role = (req.user.role || '').toLowerCase();
      console.log(`[DEBUG] Usuario autenticado - ID: ${currentUserId}, Rol: ${role}, forceAll=${forceAll}`);

      // Lista de posibles campos de asignación de agente en los documentos (IDs)
      const agentFieldCandidates = [
        'agenteId', 'agente_id', 'idAgente', 'agentId',
        'createdBy', 'creadoPor', 'creado_por',
        'ownerId', 'owner_id',
        'assignedId', 'assigned_to_id', 'assigned_toId',
        'salesAgentId', 'registeredById'
      ];

      if (role === 'agent') {
        // Aplicar SIEMPRE filtro por su propio ID en múltiples variantes de campo
        let oid = null;
        try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) oid = new ObjectId(currentUserId); } catch {}
        const bothTypes = oid ? { $in: [currentUserId, oid] } : currentUserId;
        const idOr = agentFieldCandidates.map(f => ({ [f]: bothTypes }));

        // Fallback adicional por nombres del agente en campos de texto (case-insensitive)
        const nameCandidatesRaw = [req.user?.username, req.user?.name, req.user?.nombre, req.user?.fullName]
          .filter(v => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim());
        const seen = new Set();
        const nameCandidates = nameCandidatesRaw.filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
        const regexes = nameCandidates.map(n => {
          try {
            const escaped = normalize(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Coincidencia flexible (insensible a mayúsculas/minúsculas)
            return new RegExp(escaped, 'i');
          } catch { return null; }
        }).filter(Boolean);
        // Solo campos explícitos de agente para evitar sobre-inclusión
        const textFields = [
          'agente', 'agent', 'agenteNombre', 'agentName',
          'nombre_agente', 'agente_nombre'
        ];
        // Además, recopilar nombres reales en documentos que ya coinciden por ID (distinct)
        let dynamicNameRegexes = [];
        try {
          const baseMatch = { $or: idOr };
          const distinctPromises = textFields.map(f => db.collection('costumers').distinct(f, baseMatch));
          const distinctResults = await Promise.allSettled(distinctPromises);
          const fromDb = [];
          for (const r of distinctResults) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              for (const v of r.value) {
                if (typeof v === 'string' && v.trim()) fromDb.push(v.trim());
              }
            }
          }
          const merged = [...nameCandidates, ...fromDb];
          const uniq = Array.from(new Set(merged.map(s => normalize(s).toLowerCase())));
          dynamicNameRegexes = uniq.map(k => {
            try { return new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch { return null; }
          }).filter(Boolean);
        } catch {}
        const allRegexes = (dynamicNameRegexes.length ? dynamicNameRegexes : regexes);
        const nameOrSimple = allRegexes.length ? textFields.map(f => ({ [f]: { $in: allRegexes } })) : [];

        // Condición: solo aceptar coincidencia por NOMBRE si no hay IDs establecidos (evitar traer de otros agentes)
        const idFields = ['agenteId','agente_id','idAgente','agentId','createdBy','creadoPor','creado_por','ownerId','assignedId'];
        const idEmptyOrMissing = {
          $and: idFields.map(f => ({ $or: [ { [f]: { $exists: false } }, { [f]: null }, { [f]: '' } ] }))
        };
        const nameAndIfNoIds = (nameOrSimple.length ? { $and: [ { $or: nameOrSimple }, idEmptyOrMissing ] } : null);

        query.$or = nameAndIfNoIds ? [...idOr, nameAndIfNoIds] : [...idOr];
        console.log('[DEBUG] Rol agent: forceAll ignorado. Filtro por IDs aplicado en:', agentFieldCandidates, ' y fallback por nombre en campos:', textFields, ' names:', nameCandidates);
      } else if (role === 'supervisor') {
        // Ver solo los de su equipo (soportar ObjectId y string) SIEMPRE
        // 1) Intentar por IDs de agentes que tengan supervisorId = currentUserId (string u ObjectId)
        let supOid = null;
        try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) supOid = new ObjectId(currentUserId); } catch {}
        const agentes = await db.collection('users').find({
          $or: [
            { supervisorId: currentUserId },
            ...(supOid ? [{ supervisorId: supOid }] : [])
          ]
        }).toArray();
        const agentesIds = agentes.map(a => a._id).filter(Boolean);
        // Incluir también el propio ID del supervisor por si tiene asignaciones directas
        try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) agentesIds.push(new ObjectId(currentUserId)); } catch {}
        const bothTypesArray = [];
        agentesIds.forEach(id => { bothTypesArray.push(id, id.toString()); });
        const idInFilter = bothTypesArray.length ? { $in: bothTypesArray } : null;

        // 2) Fallback adicional por campos de texto de supervisor y/o nombre del supervisor en documentos
        //    Esto cubre casos donde los usuarios-agente no tienen supervisorId poblado en la colección users.
        const supNameCandidatesRaw = [req.user?.username, req.user?.name, req.user?.nombre, req.user?.fullName]
          .filter(v => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim());
        const seenSup = new Set();
        const supNameCandidates = supNameCandidatesRaw.filter(n => { const k = n.toLowerCase(); if (seenSup.has(k)) return false; seenSup.add(k); return true; });
        const normalize = (s) => s.replace(/\s+/g, ' ').trim();
        const supRegexes = supNameCandidates.map(n => {
          try {
            const escaped = normalize(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, 'i');
          } catch { return null; }
        }).filter(Boolean);
        const supervisorTextFields = ['supervisor','team','teamName','supervisorName','supervisor_nombre','supervisorNombre'];
        const supervisorTextOr = supRegexes.length ? supervisorTextFields.map(f => ({ [f]: { $in: supRegexes } })) : [];

        // 2b) Fallback por NOMBRES DE LOS AGENTES DEL EQUIPO en campos de texto de agente
        //     Útil cuando los documentos solo guardan nombre del agente y no ID.
        const agentTextFields = [
          'agente','agent','agenteNombre','agentName','nombre_agente','agente_nombre','createdByName',
          'vendedor','seller','salesAgent','nombreAgente','ejecutivo',
          'asignadoA','asignado_a','assignedTo','assigned_to',
          'usuario','owner','registeredBy','ownerName'
        ];
        const agentNameCandidatesRaw = [];
        try {
          for (const a of agentes) {
            const vals = [a?.username, a?.name, a?.nombre, a?.fullName].filter(v => typeof v === 'string' && v.trim());
            vals.forEach(v => agentNameCandidatesRaw.push(v.trim()));
          }
        } catch {}
        // Si no encontramos nombres por users, intentar derivarlos desde la colección costumers
        if (agentNameCandidatesRaw.length === 0 && supRegexes.length) {
          try {
            const supOr = { $or: supervisorTextFields.map(f => ({ [f]: { $in: supRegexes } })) };
            const namesFromCostumers = new Set();
            for (const f of agentTextFields) {
              try {
                const vals = await db.collection('costumers').distinct(f, supOr);
                (vals || []).forEach(v => { if (typeof v === 'string' && v.trim()) namesFromCostumers.add(v.trim()); });
              } catch {}
            }
            if (namesFromCostumers.size) {
              agentNameCandidatesRaw.push(...Array.from(namesFromCostumers));
            }
          } catch {}
        }
        const seenAgent = new Set();
        const agentNameCandidates = agentNameCandidatesRaw.filter(n => { const k = normalize(n).toLowerCase(); if (seenAgent.has(k)) return false; seenAgent.add(k); return true; });
        const agentNameRegexes = agentNameCandidates.map(n => {
          try { return new RegExp(normalize(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch { return null; }
        }).filter(Boolean);
        const agentNamesTextOr = agentNameRegexes.length ? agentTextFields.map(f => ({ [f]: { $in: agentNameRegexes } })) : [];

        // 3) Construir query.$or combinando ID de agentes (si existe) y fallback por supervisor en texto (si existe)
        const orConds = [];
        // Diagnóstico: si ?debug=1, contar por sub-condición antes de fijar query.$or
        const debugFlag = (req.query && (req.query.debug === '1' || req.query.debug === 'true'));
        if (debugFlag) {
          try {
            const baseQuery = { ...query };
            delete baseQuery.$or;
            const col = db.collection('costumers');
            console.log('[DEBUG] Supervisor diag - agentesIds (bothTypesArray):', (bothTypesArray||[]).map(x=>x.toString()));
            console.log('[DEBUG] Supervisor diag - supNameCandidates:', supNameCandidates);
            console.log('[DEBUG] Supervisor diag - agentNameCandidates:', agentNameCandidates);
            if (idInFilter) {
              const idsOr = agentFieldCandidates.map(f => ({ [f]: idInFilter }));
              const c1 = await col.countDocuments({ ...baseQuery, $or: idsOr });
              console.log('[DEBUG] Subcuenta supervisor - IDs de agentes coincide:', c1);
            }
            if (supervisorTextOr.length) {
              const c2 = await col.countDocuments({ ...baseQuery, $or: supervisorTextOr });
              console.log('[DEBUG] Subcuenta supervisor - Texto de supervisor coincide:', c2);
            }
            if (agentNamesTextOr.length) {
              const c3 = await col.countDocuments({ ...baseQuery, $or: agentNamesTextOr });
              console.log('[DEBUG] Subcuenta supervisor - Nombres de agentes coincide:', c3);
            }
          } catch (e) {
            console.warn('[WARN] Error en diagnóstico supervisor (?debug=1):', e?.message);
          }
        }
        if (idInFilter) {
          orConds.push(...agentFieldCandidates.map(f => ({ [f]: idInFilter })));
        }
        if (supervisorTextOr.length) {
          orConds.push(...supervisorTextOr);
        }
        if (agentNamesTextOr.length) {
          orConds.push(...agentNamesTextOr);
        }
        // Si por algún motivo no hay condiciones, asegurar que no devuelva todo (forzar none)
        query.$or = orConds.length ? orConds : [{ _id: null }];
        console.log('[DEBUG] Rol supervisor: forceAll ignorado. Filtro aplicado. IDs agentes:', bothTypesArray.map(x=>x.toString()), ' | Campos supervisor:', supervisorTextFields, ' | Nombres sup:', supNameCandidates, ' | Campos agente:', agentTextFields, ' | Nombres agentes:', agentNameCandidates);
      } else {
        // Solo roles privilegiados ven todo; para cualquier otro rol, filtrar por su propio ID
        const privileged = ['admin','backoffice','b:o','b.o','b-o','bo'];
        if (privileged.includes(role)) {
          console.log('[DEBUG] Rol privilegiado (admin/backoffice): sin filtro por agenteId');
        } else {
          // Filtro estricto por ID del usuario
          let oid = null;
          try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) oid = new ObjectId(currentUserId); } catch {}
          const bothTypes = oid ? { $in: [currentUserId, oid] } : currentUserId;
          const agentFieldCandidates = [
            'agenteId','agente_id','idAgente','agentId','createdBy','creadoPor','creado_por','ownerId','assignedId'
          ];
          query.$or = agentFieldCandidates.map(f => ({ [f]: bothTypes }));
          console.log('[DEBUG] Rol no privilegiado: aplicando filtro propio por ID en campos:', agentFieldCandidates);
        }
      }

      console.log(`[DEBUG] Filtro aplicado:`, JSON.stringify(query, null, 2));
    }
    
    // Filtro por agenteId directo si se especifica via query ?agenteId=
    const agenteIdParamRaw = (req.query.agenteId || '').toString().trim();
    if (agenteIdParamRaw) {
      console.log('[DEBUG] Parámetro agenteId recibido:', agenteIdParamRaw);
      if (req.user && req.user.role === 'agent') {
        // Un agente siempre se filtra a sí mismo 
        const currentUserId = (req.user?._id?.toString?.() || req.user?.id?.toString?.() || String(req.user?._id || req.user?.id || ''));
        // Mantener restricción propia, ignorando el parámetro explícito
        let oid = null;
        try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) oid = new ObjectId(currentUserId); } catch {}
        const bothTypes = oid ? { $in: [currentUserId, oid] } : currentUserId;
        const agentFieldCandidates = ['agenteId', 'agente_id', 'idAgente', 'agentId', 'createdBy', 'creadoPor', 'creado_por', 'ownerId', 'assignedId'];
        query.$or = agentFieldCandidates.map(f => ({ [f]: bothTypes }));
        console.log('[DEBUG] Rol agent + agenteId param: se aplica filtro propio en múltiples campos');
      } else {
        // Soportar ObjectId y string
        let oid = null;
        try { if (/^[a-fA-F0-9]{24}$/.test(agenteIdParamRaw)) oid = new ObjectId(agenteIdParamRaw); } catch {}
        const bothTypes = oid ? { $in: [oid, agenteIdParamRaw] } : agenteIdParamRaw;
        // Aplicar el filtro al conjunto de campos candidatos; si ya existe un $or previo, intentar intersección
        const agentFieldCandidates = ['agenteId', 'agente_id', 'idAgente', 'agentId', 'createdBy', 'creadoPor', 'creado_por', 'ownerId', 'assignedId'];
        const paramOr = agentFieldCandidates.map(f => ({ [f]: bothTypes }));
        if (query.$or && Array.isArray(query.$or)) {
          // Intersecar ambos $or aproximando: mantener condiciones que tengan solape en $in (si lo hay)
          const allowed = [];
          query.$or.forEach(cond => {
            const k = Object.keys(cond)[0];
            const v = cond[k];
            if (v && v.$in) allowed.push(...v.$in.map(x=>x.toString()));
          });
          const candidates = Array.isArray(bothTypes.$in) ? bothTypes.$in.map(x=>x.toString()) : [bothTypes.toString()];
          const overlap = candidates.some(x => allowed.includes(x));
          query.$or = overlap ? paramOr : [{ _id: new ObjectId('000000000000000000000000') }];
        } else {
          query.$or = paramOr;
        }
      }
    }

    // Filtro adicional por agente si se especifica via query ?agente=
    const agenteParam = (req.query.agente || '').toString().trim();
    if (!agenteIdParamRaw && agenteParam) {
      console.log('[DEBUG] Parámetro agente recibido:', agenteParam);
      // Si el usuario autenticado es 'agent', forzamos su propio ID y omitimos el parámetro
      if (req.user && req.user.role === 'agent') {
        console.log('[DEBUG] Rol agent: ignorando parámetro agente y usando su propio ID con filtro tolerante');
        const currentUserId = (req.user?._id?.toString?.() || req.user?.id?.toString?.() || String(req.user?._id || req.user?.id || ''));
        // Construir filtro robusto por múltiples campos de ID con soporte string y ObjectId
        let oid = null;
        try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) oid = new ObjectId(currentUserId); } catch {}
        const bothTypes = oid ? { $in: [currentUserId, oid] } : currentUserId;
        const agentFieldCandidates = ['agenteId', 'agente_id', 'idAgente', 'agentId', 'createdBy', 'creadoPor', 'creado_por', 'ownerId', 'assignedId'];
        const idOr = agentFieldCandidates.map(f => ({ [f]: bothTypes }));

        // Fallback por nombre SOLO si todos los campos de ID del documento están vacíos/ausentes
        const nameCandidatesRaw = [req.user?.username, req.user?.name, req.user?.nombre, req.user?.email]
          .filter(v => typeof v === 'string' && v.trim().length > 0)
          .map(v => v.trim());
        const unique = new Set();
        const nameCandidates = nameCandidatesRaw.filter(n => { const k = n.toLowerCase(); if (unique.has(k)) return false; unique.add(k); return true; });
        const regexes = nameCandidates.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
        const textFields = ['agente', 'agent', 'agenteNombre', 'agentName'];
        const nameOrSimple = regexes.length ? textFields.map(f => ({ [f]: { $in: regexes } })) : [];
        const idEmptyOrMissing = { $and: agentFieldCandidates.map(f => ({ $or: [ { [f]: { $exists: false } }, { [f]: null }, { [f]: '' } ] })) };
        const nameAndIfNoIds = (nameOrSimple.length ? { $and: [ { $or: nameOrSimple }, idEmptyOrMissing ] } : null);

        query.$or = nameAndIfNoIds ? [...idOr, nameAndIfNoIds] : [...idOr];
        console.log('[DEBUG] Filtro agent aplicado (IDs + fallback por nombre si faltan IDs)');
      } else {
        // Intentar resolver por ObjectId válido
        let resolvedId = null;
        let resolvedIds = null; // soporte para múltiples coincidencias por nombre
        try {
          if (/^[a-fA-F0-9]{24}$/.test(agenteParam)) {
            resolvedId = new ObjectId(agenteParam);
          }
        } catch {}
        // Si no es ObjectId, resolver por nombre/username en colección users
        if (!resolvedId) {
          try {
            const safe = agenteParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(safe, 'i');
            const usuarios = await db.collection('users').find({
              $or: [
                { username: rx },
                { name: rx },
                { nombre: rx },
                { fullName: rx }
              ]
            }, { projection: { _id: 1 } }).toArray();
            if (usuarios.length > 0) {
              resolvedIds = usuarios.map(u => u._id);
              console.log(`[DEBUG] Coincidencias de usuarios para agente="${agenteParam}":`, resolvedIds.map(x => x.toString()));
            }
          } catch (e) {
            console.warn('[WARN] Error buscando usuarios por regex para agente:', e?.message);
          }
        }
        // Si se pudo resolver a uno o varios IDs, filtrar por agenteId
        if (resolvedId || (resolvedIds && resolvedIds.length)) {
          const ids = resolvedIds && resolvedIds.length ? resolvedIds : [resolvedId];
          const bothTypesArray = [];
          ids.forEach(id => { bothTypesArray.push(id, id.toString()); });
          const bothTypes = { $in: bothTypesArray };
          if (query.agenteId && query.agenteId.$in) {
            const allowed = query.agenteId.$in.map(x => x.toString());
            const overlap = bothTypesArray.some(x => allowed.includes(x.toString()));
            if (overlap) {
              query.agenteId = bothTypes;
            } else {
              query.agenteId = new ObjectId('000000000000000000000000');
            }
          } else {
            query.agenteId = bothTypes;
          }
          console.log('[DEBUG] Filtro por agenteId aplicado (ids encontrados):', bothTypesArray.map(x=>x.toString()));
        } else {
          // Como fallback, filtrar por campos de texto presentes en costumers
          // con coincidencia PARCIAL (case-insensitive)
          const safe = agenteParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const containsCI = new RegExp(safe, 'i');
          query.$or = [
            { agente: containsCI },
            { agent: containsCI },
            { agenteNombre: containsCI },
            { agentName: containsCI }
          ];
          console.log('[DEBUG] Filtro por nombre de agente (texto, partial, i) aplicado:', agenteParam);
        }
      }
    }

    // Aplicar filtro por rango de fechas si viene en la query (usar campo 'creadoEn')
    if (fechaInicio || fechaFin) {
      query.creadoEn = {};
      if (fechaInicio) {
        query.creadoEn.$gte = fechaInicio;
      }
      if (fechaFin) {
        const finDia = new Date(fechaFin);
        finDia.setHours(23, 59, 59, 999);
        query.creadoEn.$lte = finDia;
      }
    }

    // Obtener el total de documentos para la paginación
    // Log detallado del query final y parámetros recibidos para diagnóstico
    try {
      console.log('[DEBUG] req.query recibido en /api/customers:', JSON.stringify(req.query));
      console.log('[DEBUG] Query final a usar en MongoDB:', JSON.stringify(query));
    } catch { /* noop */ }
    const total = await customersCollection.countDocuments(query);
    console.log(`Total de documentos en la colección: ${total}`);
    
    // Consulta con paginación y ordenados por fecha de creación descendente
    const customers = await customersCollection
      .find(query)
      .sort({ creadoEn: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    console.log(`Documentos encontrados: ${customers.length}`);
    if (customers.length > 0) {
      console.log('Primer documento de ejemplo:', JSON.stringify(customers[0], null, 2));
    }

    // Helpers de enriquecimiento
    const norm = (s) => {
      try { return String(s || '').normalize('NFD').replace(/\p{Diacritic}+/gu,'').trim().toLowerCase().replace(/\s+/g,' ');} catch { return ''; }
    };
    const AGENT_TO_SUP = new Map([
      // TEAM IRANIA
      ['josue renderos','irania serrano'],
      ['tatiana ayala','irania serrano'],
      ['giselle diaz','irania serrano'],
      ['miguel nunez','irania serrano'],
      ['roxana martinez','irania serrano'],
      ['irania serrano','irania serrano'],
      // TEAM BRYAN PLEITEZ
      ['abigail galdamez','bryan pleitez'],
      ['alexander rivera','bryan pleitez'],
      ['diego mejia','bryan pleitez'],
      ['evelin garcia','bryan pleitez'],
      ['fabricio panameno','bryan pleitez'],
      ['luis chavarria','bryan pleitez'],
      ['steven varela','bryan pleitez'],
      // TEAM ROBERTO VELASQUEZ
      ['cindy flores','roberto velasquez'],
      ['daniela bonilla','roberto velasquez'],
      ['francisco aguilar','roberto velasquez'],
      ['levy ceren','roberto velasquez'],
      ['lisbeth cortez','roberto velasquez'],
      ['lucia ferman','roberto velasquez'],
      ['nelson ceren','roberto velasquez'],
      // TEAM RANDAL MARTINEZ
      ['anderson guzman','randal martinez'],
      ['carlos grande','randal martinez'],
      ['guadalupe santana','randal martinez'],
      ['julio chavez','randal martinez'],
      ['priscila hernandez','randal martinez'],
      ['riquelmi torres','randal martinez']
    ]);
    const inferSupervisorByAgent = (agentName) => {
      const key = norm(agentName);
      return key ? (AGENT_TO_SUP.get(key) || '') : '';
    };
    const extractZipFromAddress = (addr) => {
      try {
        const s = String(addr || '');
        const m = s.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/); // último ZIP de 5 dígitos
        return m ? m[1] : '';
      } catch { return ''; }
    };

    // Flag de enriquecimiento opcional (solo si el cliente lo solicita)
    const enrichMode = (req.query.enrich === '1' || req.query.enrich === 'true');

    // Mapear los campos según lo que espera el frontend
    const mappedCustomers = customers.map(customer => {
      // Mapeo completo basado en la estructura que espera el frontend
      const mapped = {
        // Información básica
        _id: customer._id ? customer._id.toString() : 'sin-id',
        nombre_cliente: customer.nombre_cliente || customer.nombre || customer.name || '',
        telefono_principal: (
          customer.telefono_principal ||
          customer.telefono ||
          customer.phone ||
          customer.celular ||
          customer.mobile ||
          customer.phone1 ||
          (customer._raw && (customer._raw.telefono_principal || customer._raw.telefono || customer._raw.phone || customer._raw.celular || customer._raw.mobile || customer._raw.phone1)) ||
          ''
        ),
        telefono_alterno: (
          customer.telefono_alterno ||
          customer.telefono_secundario ||
          customer.telefono2 ||
          customer.phone2 ||
          customer.secondary_phone ||
          (customer._raw && (customer._raw.telefono_alterno || customer._raw.telefono_secundario || customer._raw.telefono2 || customer._raw.phone2 || customer._raw.secondary_phone)) ||
          ''
        ),
        numero_cuenta: (
          customer.numero_cuenta ||
          customer.numeroCuenta ||
          customer.cuenta ||
          customer.account_number ||
          customer.accountNumber ||
          (customer._raw && (customer._raw.numero_cuenta || customer._raw.numeroCuenta || customer._raw.cuenta || customer._raw.account_number || customer._raw.accountNumber)) ||
          ''
        ),
        
        // Dirección y ubicación
        direccion: (
          customer.direccion ||
          customer.direccion_completa ||
          customer.address ||
          customer.address_line ||
          customer.addressLine ||
          (customer._raw && (customer._raw.direccion || customer._raw.direccion_completa || customer._raw.address || customer._raw.address_line || customer._raw.addressLine)) ||
          'Sin dirección'
        ),
        zip_code: (
          customer.zip_code ||
          customer.zip ||
          customer.codigo_postal ||
          customer.postal_code ||
          customer.postalCode ||
          customer.zipcode ||
          customer.cp ||
          customer.codigoPostal ||
          (customer._raw && (customer._raw.zip_code || customer._raw.zip || customer._raw.codigo_postal || customer._raw.postal_code || customer._raw.postalCode || customer._raw.zipcode || customer._raw.cp || customer._raw.codigoPostal)) ||
          ''
        ),
        
        // Información del servicio
        tipo_servicios: (
          customer.tipo_servicio ||
          customer.tipo_servicios ||
          customer.tipoServicio ||
          customer.tipoServicios ||
          customer.producto_contratado ||
          customer.producto ||
          customer.product ||
          customer.servicio ||
          customer.servicios ||
          (customer._raw && (customer._raw.tipo_servicio || customer._raw.tipo_servicios || customer._raw.tipoServicio || customer._raw.tipoServicios || customer._raw.producto_contratado || customer._raw.producto || customer._raw.product || customer._raw.servicio || customer._raw.servicios)) ||
          ''
        ),
        servicios: customer.servicios || customer.tipo_servicio || customer.producto_contratado || customer.producto || customer.product || '',
        sistema: (
          customer.sistema ||
          customer.system ||
          customer.sistema_operativo ||
          customer.platform ||
          customer.plataforma ||
          (customer._raw && (customer._raw.sistema || customer._raw.system || customer._raw.sistema_operativo || customer._raw.platform || customer._raw.plataforma)) ||
          ''
        ),
        riesgo: (
          customer.riesgo ||
          customer.nivel_riesgo ||
          customer.risk ||
          customer.risk_level ||
          (customer._raw && (customer._raw.riesgo || customer._raw.nivel_riesgo || customer._raw.risk || customer._raw.risk_level)) ||
          ''
        ),
        
        // Fechas importantes
        dia_venta: (
          customer.dia_venta ||
          customer.fecha_contratacion ||
          customer.diaVenta ||
          customer.fecha_venta ||
          customer.fechaVenta ||
          (customer._raw && (customer._raw.dia_venta || customer._raw.fecha_contratacion || customer._raw.diaVenta || customer._raw.fecha_venta || customer._raw.fechaVenta)) ||
          ''
        ),
        dia_instalacion: (
          customer.dia_instalacion ||
          customer.fecha_instalacion ||
          customer.fecha_instalación ||
          customer.diaInstalacion ||
          customer.installation_date ||
          customer.installationDate ||
          customer.install_date ||
          customer.installDate ||
          customer.fecha_instalacion_programada ||
          customer.installationScheduled ||
          customer.installation_schedule ||
          (customer._raw && (customer._raw.dia_instalacion || customer._raw.fecha_instalacion || customer._raw.fecha_instalación || customer._raw.diaInstalacion || customer._raw.installation_date || customer._raw.installationDate || customer._raw.install_date || customer._raw.installDate || customer._raw.fecha_instalacion_programada || customer._raw.installationScheduled || customer._raw.installation_schedule)) ||
          ''
        ),
        
        // Estado y puntuación
        status: customer.status || '',
        puntaje: typeof customer.puntaje === 'number' ? customer.puntaje : 0,
        
        // Información de equipo
        supervisor: (
          customer.supervisor ||
          customer.supervisorName ||
          customer.supervisor_nombre ||
          customer.supervisorNombre ||
          customer.team ||
          customer.teamName ||
          (customer._raw && (customer._raw.supervisor || customer._raw.supervisorName || customer._raw.supervisor_nombre || customer._raw.supervisorNombre || customer._raw.team || customer._raw.teamName)) ||
          ''
        ),
        mercado: customer.mercado || '',
        
        // Comentarios
        comentario: (
          customer.comentario ||
          customer.comentarios ||
          customer.comment ||
          customer.comments ||
          customer.nota ||
          customer.notas ||
          customer.notes ||
          customer.observaciones ||
          (customer._raw && (customer._raw.comentario || customer._raw.comentarios || customer._raw.comment || customer._raw.comments || customer._raw.nota || customer._raw.notas || customer._raw.notes || customer._raw.observaciones)) ||
          ''
        ),
        motivo_llamada: (
          customer.motivo_llamada ||
          customer.motivo ||
          customer.motivoLlamada ||
          customer.reason ||
          customer.call_reason ||
          (customer._raw && (customer._raw.motivo_llamada || customer._raw.motivo || customer._raw.motivoLlamada || customer._raw.reason || customer._raw.call_reason)) ||
          ''
        ),
        
        // Información adicional
        autopago: (
          (customer.autopago !== undefined ? customer.autopago :
            (customer.auto_pago !== undefined ? customer.auto_pago :
              (customer.autopay !== undefined ? customer.autopay :
                (customer.autoPay !== undefined ? customer.autoPay : false))))
        ),

        // Exponer campos de agente (IDs y nombres) para permitir asignación en frontend
        agenteId: customer.agenteId || customer.agente_id || customer.idAgente || customer.agentId || customer.createdBy || customer.creadoPor || customer.creado_por || customer.ownerId || customer.assignedId || '',
        agenteNombre: customer.agenteNombre || customer.nombreAgente || customer.agente || customer.agent || customer.vendedor || customer.seller || customer.nombre_agente || customer.agente_nombre || customer.agentName || customer.salesAgent || customer.asignadoA || customer.asignado_a || customer.assignedTo || customer.assigned_to || customer.usuario || customer.owner || customer.registeredBy || '',
        // También exponer variantes (no sensibles) útiles para diagnóstico limitado
        creadoPor: customer.creadoPor || customer.creado_por || '',
        createdBy: customer.createdBy || '',
        ownerId: customer.ownerId || '',
        assignedId: customer.assignedId || ''
      };
      
      // Asegurarse de que los valores booleanos se conviertan a string para la visualización
      if (typeof mapped.autopago === 'boolean') {
        mapped.autopago = mapped.autopago ? 'Sí' : 'No';
      }
      
      // Convertir fechas a formato ISO si es necesario
      if (mapped.fecha_creacion && !(mapped.fecha_creacion instanceof Date)) {
        try {
          mapped.fecha_creacion = new Date(mapped.fecha_creacion).toISOString();
        } catch (e) {
          console.error('Error al formatear fecha:', e);
          mapped.fecha_creacion = new Date().toISOString();
        }
      }
      
      // Enriquecimientos finales opcionales (solo si enrich=1)
      if (enrichMode) {
        if ((!mapped.supervisor || mapped.supervisor === '') && mapped.agenteNombre) {
          const sup = inferSupervisorByAgent(mapped.agenteNombre);
          if (sup) mapped.supervisor = sup;
        }
        if ((!mapped.zip_code || mapped.zip_code === '') && mapped.direccion) {
          const zip = extractZipFromAddress(mapped.direccion);
          if (zip) mapped.zip_code = zip;
        }
      }

      return mapped;
    });
    
    // Construir respuesta (con debug opcional enriquecido)
    const debugMode = (req.query.debug === '1' || req.query.debug === 'true');
    const sampleCount = Math.min(mappedCustomers.length, 3);
    const samples = debugMode ? customers.slice(0, sampleCount) : [];
    const enrich = (req.query.enrich === '1' || req.query.enrich === 'true');

    const response = {
      success: true,
      leads: mappedCustomers,
      total,
      page,
      pages: Math.ceil(total / limit),
      message: 'Datos de clientes cargados correctamente',
      debug: debugMode ? {
        collection: collectionName,
        database: db.databaseName,
        totalDocuments: total,
        documentsReturned: mappedCustomers.length,
        availableCollections: collections.map(c => c.name),
        sampleOriginalKeys: samples.map((s, i) => ({ idx: i, keys: Object.keys(s) })),
        sampleMappedKeys: mappedCustomers.slice(0, sampleCount).map((m, i) => ({ idx: i, keys: Object.keys(m) })),
        sampleOriginalDocs: samples,
        sampleMappedDocs: mappedCustomers.slice(0, sampleCount),
        enrich
      } : undefined
    };
    
    console.log('Enviando respuesta con', mappedCustomers.length, 'clientes');
    res.json(response);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cargar los clientes',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Resumen de agentes disponibles en la data de clientes (diagnóstico)
app.get('/api/customers/agents-summary', protect, async (req, res) => {
  try {
    if (!db) await connectToMongoDB();
    const coll = db.collection('costumers');
    // Agrupar por agenteId y agenteNombre para ver cuántos clientes tiene cada agente
    const pipeline = [
      {
        $group: {
          _id: { id: '$agenteId', nombre: '$agenteNombre' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ];
    const rows = await coll.aggregate(pipeline).toArray();
    // También recolectar valores de campos alternos por si los datos usan otras llaves
    const distintos = {
      agente: await coll.distinct('agente'),
      agent: await coll.distinct('agent'),
      agenteNombre: await coll.distinct('agenteNombre'),
      agentName: await coll.distinct('agentName')
    };
    return res.json({
      success: true,
      summary: rows.map(r => ({ agenteId: r._id.id || null, agenteNombre: r._id.nombre || null, count: r.count })),
      distincts: distintos
    });
  } catch (e) {
    console.error('[agents-summary] error:', e);
    return res.status(500).json({ success: false, message: 'Error generando resumen de agentes', error: e.message });
  }
});

// Middleware para verificar autenticación
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.redirect('/login.html');
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.redirect('/login.html');
    }
    req.user = user;
    next();
  });
};

// Ruta raíz - Redirigir a login.html
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Ruta de la aplicación principal (protección vía frontend con auth-check.js)
app.get('/inicio', (req, res) => {
  res.sendFile(path.join(publicPath, 'lead.html'));
});

// Manejar rutas de la aplicación (SPA)
app.get('*', (req, res) => {
  // Si la ruta es una extensión de archivo, devolver 404
  if (req.path.includes('.')) {
    return res.status(404).send('Archivo no encontrado');
  }
  // Para cualquier otra ruta, servir lead.html (útil para SPA)
  res.sendFile(path.join(publicPath, 'lead.html'));
});

// Conexión a MongoDB
let mongoClient; // Variable para mantener la referencia al cliente
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crmagente';

// La función connectToMongoDB ahora se importa desde ./config/db.js

// Endpoint unificado para obtener clientes con soporte para paginación y datos de gráficas
app.get('/api/leads', async (req, res) => {
  try {
    const { 
      page, 
      limit = 10, 
      status, 
      desde, 
      hasta,
      telefono,
      // Parámetros específicos para gráficas
      agente,
      fechaInicio,
      fechaFin,
      // Flag para indicar si se necesitan datos para gráfica
      paraGrafica = 'false'
    } = req.query;
    
    // Si es para gráfica, devolver datos agregados
    if (paraGrafica === 'true') {
      const filtro = {};
      
      // Aplicar filtros según el rol del usuario
      if (req.user) {
        // Si es agente, solo ver sus datos
        if (req.user.role === 'agent') {
          filtro.agenteId = req.user.id;
        }
        // Si es supervisor, ver datos de su equipo
        else if (req.user.role === 'supervisor') {
          const agentes = await db.collection('users').find({ 
            supervisorId: req.user.id 
          }).toArray();
          
          const agentesIds = agentes.map(a => a._id);
          agentesIds.push(new ObjectId(req.user.id));
          
          filtro.agenteId = { $in: agentesIds };
        }
        // Admin no necesita filtro (ve todo)
      }
      
      // Filtro adicional por agente si se especifica
      if (agente) {
        filtro.agenteId = agente;
      }
      
      // Filtrar por rango de fechas si se proporciona
      if (fechaInicio || fechaFin) {
        filtro.creadoEn = {};
        if (fechaInicio) {
          filtro.creadoEn.$gte = new Date(fechaInicio);
        }
        if (fechaFin) {
          // Ajustar para incluir todo el día
          const finDia = new Date(fechaFin);
          finDia.setHours(23, 59, 59, 999);
          filtro.creadoEn.$lte = finDia;
        }
      }
      
      console.log('Consultando leads con filtro para gráfica:', JSON.stringify(filtro, null, 2));
      
      // Obtener los leads que coincidan con el filtro
      const leads = await db.collection('costumers').find(filtro).toArray();
      
      // Procesar los datos para la gráfica
      const datosGrafica = [];
      const ventasPorDia = {};
      
      leads.forEach(lead => {
        if (!lead.creadoEn) return;
        
        const fecha = new Date(lead.creadoEn);
        const fechaStr = fecha.toISOString().split('T')[0];
        
        if (!ventasPorDia[fechaStr]) {
          ventasPorDia[fechaStr] = {
            fecha: fechaStr,
            ventas: 0,
            puntaje: 0,
            conteo: 0
          };
        }
        
        ventasPorDia[fechaStr].ventas += 1;
        ventasPorDia[fechaStr].puntaje += Number(lead.puntaje) || 0;
        ventasPorDia[fechaStr].conteo += 1;
      });
      
      // Calcular promedios y formatear datos para la gráfica
      Object.values(ventasPorDia).forEach(dia => {
        datosGrafica.push({
          fecha: dia.fecha,
          ventas: dia.ventas,
          puntaje: dia.conteo > 0 ? dia.puntaje / dia.conteo : 0
        });
      });
      
      // Ordenar por fecha
      datosGrafica.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      
      console.log(`Datos de gráfica generados: ${datosGrafica.length} puntos de datos`);
      
      // Asegurarse de que la respuesta sea JSON
      res.setHeader('Content-Type', 'application/json');
      return res.json(datosGrafica);
    }
    
    // Si no es para gráfica, devolver datos paginados
    const skip = page ? (parseInt(page) - 1) * parseInt(limit) : 0;
    const query = {};
    
    // Aplicar filtros
    if (status) query.status = status;
    if (telefono) query.telefono_principal = { $regex: telefono, $options: 'i' };
    
    // Filtrar por rango de fechas
    if (desde || hasta) {
      query.fecha_creacion = {};
      if (desde) query.fecha_creacion.$gte = new Date(desde);
      if (hasta) {
        const hastaDate = new Date(hasta);
        hastaDate.setHours(23, 59, 59, 999);
        query.fecha_creacion.$lte = hastaDate;
      }
    }
    
    const [leads, total] = await Promise.all([
      db.collection('costumers')
        .find(query)
        .sort({ fecha_creacion: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection('costumers').countDocuments(query)
    ]);
    
    res.json({ 
      success: true, 
      data: leads,
      pagination: {
        total,
        page: parseInt(page || 1),
        totalPages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error al obtener los leads:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al cargar los leads',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Función para eliminar el índice único de telefono_principal si existe
async function removeUniqueIndexIfExists() {
  try {
    const indexes = await db.collection('costumers').indexes();
    const telefonoIndex = indexes.find(index => 
      index.key && index.key.telefono_principal === 1 && index.unique
    );
    
    if (telefonoIndex) {
      console.log('Eliminando índice único de telefono_principal...');
      await db.collection('costumers').dropIndex(telefonoIndex.name);
      console.log('Índice único eliminado exitosamente');
    } else {
      console.log('No se encontró un índice único en telefono_principal');
    }
  } catch (error) {
    console.error('Error al verificar/eliminar índices:', error);
  }
}

// Endpoint para crear un nuevo cliente (customer)
app.post('/api/customers', protect, async (req, res) => {
  // Configuración CORS
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  
  // Manejar preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('=== NUEVA SOLICITUD EN /api/customers ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body recibido:', JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      console.error('Error: No se recibieron datos en el cuerpo de la petición');
      return res.status(400).json({
        success: false,
        message: 'No se recibieron datos en la petición'
      });
    }
    
    const customerData = req.body;
    
    // Verificar autenticación
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado. Debe iniciar sesión para crear clientes.'
      });
    }

    // Validar que la conexión a la base de datos esté activa
    if (!db) {
      console.error('Error: No hay conexión a la base de datos');
      return res.status(500).json({
        success: false,
        message: 'Error de conexión con la base de datos'
      });
    }

    // Normalizar datos
    if (customerData.telefono && !customerData.telefono_principal) {
      customerData.telefono_principal = customerData.telefono;
    }

    // Validar datos requeridos
    const requiredFields = ['telefono_principal', 'nombre_cliente', 'direccion'];
    const missingFields = requiredFields.filter(field => !customerData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Faltan campos requeridos: ${missingFields.join(', ')}`
      });
    }

    // Eliminada la validación de duplicados para permitir guardar cualquier cliente
    // Agregar fechas de creación y actualización
    const now = new Date();
    
    // Depuración: Mostrar información del usuario autenticado
    console.log('=== INFORMACIÓN DEL USUARIO AUTENTICADO ===');
    console.log('Usuario completo:', JSON.stringify(req.user, null, 2));
    console.log('ID del usuario:', req.user?.id);
    console.log('Rol del usuario:', req.user?.role);
    
    // Determinar ID del usuario autenticado en string y en ObjectId (con fallbacks robustos)
    function getIdFromUser(u) {
      if (!u) return null;
      try { if (u._id && typeof u._id.toHexString === 'function') return u._id.toHexString(); } catch {}
      try { if (u._id && typeof u._id.toString === 'function') return u._id.toString(); } catch {}
      try { if (u.id) return String(u.id); } catch {}
      return null;
    }
    let currentUserIdStr = getIdFromUser(req.user);
    // Fallback: decodificar token si no se obtuvo del user
    if (!currentUserIdStr) {
      try {
        const rawToken = (req.headers.authorization && req.headers.authorization.startsWith('Bearer'))
          ? req.headers.authorization.split(' ')[1]
          : (req.cookies && req.cookies.token) ? req.cookies.token : null;
        if (rawToken && rawToken !== 'temp-token-dev') {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(rawToken, process.env.JWT_SECRET || 'tu_clave_secreta_super_segura');
          currentUserIdStr = String(decoded.userId || decoded.id || '');
        }
      } catch (e) {
        console.warn('[POST /api/customers] No se pudo extraer userId desde token:', e?.message);
      }
    }
    // Normalizar valor vacío a null
    if (!currentUserIdStr) currentUserIdStr = null;
    // Fallback final: si no hay userId pero tenemos username, usar un marcador estable basado en username
    if (!currentUserIdStr) {
      const uname = (req.user?.username || req.user?.name || req.user?.nombre || '').toString().trim();
      if (uname) {
        currentUserIdStr = `user:${uname}`;
        console.warn('[POST /api/customers] Fallback aplicado: usando agenteId string derivado de username:', currentUserIdStr);
      } else {
        currentUserIdStr = 'user:anonymous';
        console.warn('[POST /api/customers] Fallback aplicado: username no disponible, usando agenteId="user:anonymous"');
      }
    }
    let currentUserIdObj = null;
    try { if (currentUserIdStr && /^[a-fA-F0-9]{24}$/.test(currentUserIdStr)) { currentUserIdObj = new ObjectId(currentUserIdStr); } } catch {}
    console.log('[POST /api/customers] currentUserIdStr:', currentUserIdStr, ' | hasObjectId:', !!currentUserIdObj);

    const customerToSave = {
      nombre_cliente: customerData.nombre_cliente || 'Sin nombre',
      telefono_principal: customerData.telefono_principal || '',
      direccion: customerData.direccion || '',
      tipo_servicio: customerData.tipo_servicio || 'desconocido',
      creadoEn: now,
      actualizadoEn: now,
      status: (customerData.status || 'Nuevo').toString(),
      puntaje: parseFloat(customerData.puntaje) || 0,
      autopago: customerData.autopago === 'true' || customerData.autopago === true,
      // Asociar el cliente al usuario que lo crea (guardar ambos formatos: string y ObjectId)
      agenteId: currentUserIdStr,
      creadoPor: currentUserIdStr,
      createdBy: currentUserIdStr,
      ownerId: currentUserIdStr,
      agentId: currentUserIdObj || undefined,
      registeredById: currentUserIdObj || undefined,
      agenteNombre: (req.user?.username || req.user?.name || req.user?.nombre || 'Sistema'),
      // Agregar un timestamp único para evitar conflictos
      timestampUnico: now.getTime() + Math.random().toString(36).substr(2, 9)
    };
    
    console.log('=== DATOS A GUARDAR ===');
    console.log('agenteId que se intentará guardar:', customerToSave.agenteId);
    console.log('Datos completos a guardar:', JSON.stringify(customerToSave, null, 2));
    
    // Asegurarse de que no haya un _id en los datos para que MongoDB genere uno nuevo
    delete customerToSave._id;

    try {
      console.log('=== INTENTANDO GUARDAR EN LA BASE DE DATOS ===');
      console.log('Colección:', 'costumers');
      console.log('Datos a guardar:', JSON.stringify(customerToSave, null, 2));
      
      // 1. Primero intentar eliminar el índice único si existe
      await removeUniqueIndexIfExists();
      
      // 2. Intentar insertar el cliente
      try {
        const result = await db.collection('costumers').insertOne(customerToSave);
        
        console.log('=== CLIENTE GUARDADO EXITOSAMENTE ===');
        console.log('ID del cliente:', result.insertedId);
        
        // Verificar que el cliente realmente se guardó
        const clienteGuardado = await db.collection('costumers').findOne({ _id: result.insertedId });
        console.log('Cliente verificado en la base de datos:', clienteGuardado ? 'ENCONTRADO' : 'NO ENCONTRADO');
        
        return res.status(201).json({
          success: true,
          message: 'Cliente creado exitosamente',
          id: result.insertedId
        });
      } catch (insertError) {
        // Si hay un error de duplicado, intentar forzar la inserción
        if (insertError.code === 11000) {
          console.log('=== INTENTO FALLIDO - CLIENTE DUPLICADO ===');
          console.log('Error de duplicado:', insertError.message);
          
          // Generar un ID único para forzar la inserción
          customerToSave._id = new require('mongodb').ObjectId();
          console.log('Nuevo ID generado para evitar duplicado:', customerToSave._id);
          
          // Intentar insertar con el nuevo ID
          const result = await db.collection('costumers').insertOne(customerToSave);
          console.log('Cliente guardado con nuevo ID:', result.insertedId);
          
          return res.status(201).json({
            success: true,
            message: 'Cliente creado exitosamente (se generó un nuevo ID único)',
            id: result.insertedId,
            wasDuplicate: true
          });
        }
        throw insertError; // Relanzar otros errores
      }
    } catch (insertError) {
      console.error('=== ERROR AL GUARDAR EL CLIENTE ===');
      console.error('Código de error:', insertError.code);
      console.error('Mensaje de error:', insertError.message);
      console.error('Stack trace:', insertError.stack);
      
      // Si es un error de duplicado, devolver éxito pero marcado como duplicado
      if (insertError.code === 11000) {
        return res.status(200).json({
          success: true,
          message: 'Cliente procesado (duplicado ignorado)',
          isDuplicate: true
        });
      }
      
      // Para otros errores, devolver error 500
      return res.status(500).json({
        success: false,
        message: 'Error al guardar el cliente',
        error: insertError.message
      });
    }
  } catch (error) {
    console.error('Error al crear cliente:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error al crear el cliente',
      error: error.message,
      errorCode: error.code
    });
  }
});

// Endpoint para obtener leads con filtros
app.get('/api/leads', async (req, res) => {
  try {
    const { agente, fechaInicio, fechaFin } = req.query;
    
    // Construir el filtro de consulta
    const filtro = {};
    
    // Extraer información del usuario desde el token si existe
    let usuarioAutenticado = null;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token && token !== 'temp-token-dev') {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-default');
        usuarioAutenticado = {
          id: decoded.userId || decoded.id,
          username: decoded.username,
          role: decoded.role
        };
        console.log('Usuario autenticado desde token:', usuarioAutenticado);
      } catch (jwtError) {
        console.log('Error decodificando token:', jwtError.message);
      }
    }

    // Si hay usuario autenticado, filtrar por agente
    if (usuarioAutenticado) {
      filtro.$or = [
        { agenteNombre: usuarioAutenticado.username },
        { agente: usuarioAutenticado.username }
      ];
      console.log(`Filtrando leads para el usuario: ${usuarioAutenticado.username}`);
    } else if (agente) {
      // Si es un administrador o supervisor y se especifica un agente
      filtro.agente = agente;
      console.log('Sin usuario autenticado, devolviendo todos los leads');
    }
    
    // Filtrar por rango de fechas si se proporciona
    if (fechaInicio || fechaFin) {
      filtro.creadoEn = {};
      if (fechaInicio) {
        filtro.creadoEn.$gte = new Date(fechaInicio);
      }
      if (fechaFin) {
        // Ajustar para incluir todo el día
        const finDia = new Date(fechaFin);
        finDia.setHours(23, 59, 59, 999);
        filtro.creadoEn.$lte = finDia;
      }
    }
    
    console.log('Consultando leads con filtro:', JSON.stringify(filtro, null, 2));
    
    // Obtener los leads que coincidan con el filtro
    const leads = await db.collection('costumers').find(filtro).toArray();
    
    // Procesar los datos para la gráfica
    const datosGrafica = [];
    const ventasPorDia = {};
    
    leads.forEach(lead => {
      if (!lead.creadoEn) return;
      
      const fecha = new Date(lead.creadoEn);
      const fechaStr = fecha.toISOString().split('T')[0];
      
      if (!ventasPorDia[fechaStr]) {
        ventasPorDia[fechaStr] = {
          fecha: fechaStr,
          ventas: 0,
          puntaje: 0,
          conteo: 0
        };
      }
      
      ventasPorDia[fechaStr].ventas += 1;
      ventasPorDia[fechaStr].puntaje += Number(lead.puntaje) || 0;
      ventasPorDia[fechaStr].conteo += 1;
    });
    
    // Calcular promedios y formatear datos para la gráfica
    Object.values(ventasPorDia).forEach(dia => {
      datosGrafica.push({
        fecha: dia.fecha,
        ventas: dia.ventas,
        puntaje: dia.conteo > 0 ? dia.puntaje / dia.conteo : 0
      });
    });
    
    // Ordenar por fecha
    datosGrafica.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    console.log(`Datos de gráfica generados: ${datosGrafica.length} puntos de datos`);
    
    res.json(datosGrafica);
    
  } catch (error) {
    console.error('Error al obtener datos para la gráfica:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos para la gráfica',
      error: error.message
    });
  }
});



// Endpoint para crear un nuevo lead
app.post('/api/leads', protect, async (req, res) => {
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const leadData = req.body;
    console.log('=== NUEVA SOLICITUD EN /api/leads ===');
    console.log('Datos recibidos:', leadData);
    
    // Validar datos del lead
    const requiredFields = ['telefono_principal', 'direccion', 'tipo_servicio', 'nombre_cliente'];
    const missingFields = requiredFields.filter(field => {
      const value = leadData[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      console.error('Campos faltantes o inválidos:', missingFields);
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos o son inválidos',
        missingFields: missingFields
      });
    }
    
    // Se ha eliminado la validación de duplicados para permitir guardar cualquier lead
    console.log('Guardando nuevo lead sin validación de duplicados');
    
    // Crear nuevo lead con formato consistente
    const newLead = {
      ...leadData,
      fecha_creacion: new Date(),
      status: leadData.status || 'PENDING',
      creadoEn: new Date(),
      actualizadoEn: new Date(),
      // Agregar campos adicionales con valores por defecto
      puntaje: leadData.puntaje || 0,
      fuente: leadData.fuente || 'WEB',
      asignadoA: leadData.asignadoA || null,
      notas: leadData.notas || [],
      // Agregar el ID del agente que creó el lead
      agenteId: req.user?.id, // ID del usuario autenticado
      historial: [{
        accion: 'CREADO',
        fecha: new Date(),
        usuario: req.user?.username || leadData.usuario || 'SISTEMA',
        detalles: 'Lead creado a través del formulario web',
        agenteId: req.user?.id // Incluir también el ID del agente en el historial
      }]
    };
    
    // Insertar en la base de datos
    const result = await db.collection('costumers').insertOne(newLead);
    
    console.log('Lead creado exitosamente con ID:', result.insertedId);
    
    // Responder con éxito
    return res.status(201).json({
      success: true,
      message: 'Lead creado exitosamente',
      data: {
        id: result.insertedId,
        ...newLead
      }
    });
    
  } catch (error) {
    console.error('Error al procesar el lead:', error);
    
    // Manejar errores de duplicados
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un lead con este número de teléfono',
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error al procesar el lead',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'
    });
  }
});

// Iniciar el servidor
const server = app.listen(PORT, '0.0.0.0', async () => {
  await connectToMongoDB();
  const lines = [
    '',
    '=== Configuración del Servidor ===',
    `Servidor corriendo en el puerto: ${PORT}`,
    `Entorno: ${process.env.NODE_ENV || 'development'}`,
    '',
    '=== URLs de Acceso ===',
    `- Local: http://localhost:${PORT}`,
    `- Red local: http://${getLocalIp()}:${PORT}`,
    '======================================',
    ''
  ];
  process.stdout.write(lines.join('\n'));
});

// Función para obtener la IP local
function getLocalIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  
  for (const iface of Object.values(ifaces)) {
    for (const details of iface) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  
  return 'localhost';
}

// Manejo de cierre del servidor
process.on('SIGINT', () => {
  console.log('\nApagando el servidor...');
  server.close(() => {
    console.log('Servidor apagado');
    process.exit(0);
  });
});
