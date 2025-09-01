const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { MongoClient } = require('mongodb');

// Ruta para obtener datos para las gráficas
router.get('/leads', async (req, res) => {
  try {
    // Extraer información del usuario desde el token
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
    
    // Capturar filtros por query
    const agenteQuery = (req.query.agente || '').toString().trim();
    const statusQuery = (req.query.status || '').toString().trim();

    // Verificar si estamos en modo demo (sin base de datos)
    if (!process.env.MONGODB_URI) {
      // Modo demo: devolver datos de ejemplo filtrados por usuario
      const agenteName = agenteQuery || usuarioAutenticado?.username || 'Usuario Demo';
      const datosEjemplo = [
        { fecha: new Date(), producto: 'Internet', puntaje: 8, status: 'COMPLETED', agente: agenteName },
        { fecha: new Date(), producto: 'Televisión', puntaje: 7, status: 'PENDING', agente: agenteName },
        { fecha: new Date(Date.now() - 86400000), producto: 'Internet', puntaje: 9, status: 'COMPLETED', agente: agenteName },
        { fecha: new Date(Date.now() - 86400000), producto: 'Telefonía', puntaje: 6, status: 'CANCELLED', agente: agenteName }
      ];
      const filtrados = statusQuery ? datosEjemplo.filter(d => d.status === statusQuery) : datosEjemplo;
      return res.json(filtrados);
    }
    
    // Si hay conexión a MongoDB, obtener datos reales de costumers
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('crmagente');
    
    let filtro = {};
    // Priorizar filtro por query 'agente' si viene especificado
    if (agenteQuery) {
      filtro = { $or: [ { agenteNombre: agenteQuery }, { agente: agenteQuery } ] };
      console.log('Filtrando leads por query agente:', agenteQuery);
    } else if (usuarioAutenticado) {
      // Si no se pasó agente por query, decidir por rol
      const role = (usuarioAutenticado.role || '').toString().toLowerCase();
      const isPrivileged = ['admin', 'supervisor', 'backoffice'].includes(role);
      if (isPrivileged) {
        // Roles con vista global: no filtrar por usuario
        filtro = {};
        console.log(`Rol ${role} con permisos globales: devolviendo todos los leads`);
      } else {
        // Agentes: filtrar por su propio username
        filtro = { $or: [ { agenteNombre: usuarioAutenticado.username }, { agente: usuarioAutenticado.username } ] };
        console.log('Filtrando leads por usuario autenticado:', usuarioAutenticado.username);
      }
    } else {
      console.log('Sin filtro de agente ni usuario; devolviendo todos los leads');
    }
    
    // Aplicar filtro por estado si viene en query
    if (statusQuery) {
      filtro = { $and: [ filtro, { status: statusQuery } ] };
    }

    const customers = await db.collection('costumers').find(filtro).toArray();
    await client.close();
    
    console.log(`Encontrados ${customers.length} leads para el usuario ${usuarioAutenticado?.username || 'sin autenticar'}`);
    
    // Formatear los datos para las gráficas (mismo orden de prioridad que la gráfica)
    const tryDateFrom = (val) => {
      if (!val) return null;
      if (typeof val === 'string') {
        const s = val.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const [y, m, d] = s.split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        }
        if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
          const parts = s.split(/[\/\-]/).map(Number);
          const [d, m, y] = parts;
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900) {
            return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
          }
        }
      }
      if (typeof val === 'number') return new Date(val < 1e12 ? val * 1000 : val);
      const dt = new Date(val); return isNaN(dt) ? null : dt;
    };
    const getBy = (o, k) => (o && o[k] !== undefined ? o[k] : undefined);
    const firstOf = (o, keys) => { for (const k of keys) { const v = getBy(o, k); if (v !== undefined && v !== null && v !== '') return v; } };

    const datosGraficas = customers.map(customer => {
      // Prioridad: dia_venta/fecha_contratacion -> fechas de creación -> fallback hoy
      const diaVentaVal = firstOf(customer, ['dia_venta','diaVenta','fecha_contratacion']);
      let fecha = tryDateFrom(typeof diaVentaVal === 'string' ? diaVentaVal.trim() : diaVentaVal);
      if (!fecha) {
        const createdVal = firstOf(customer, ['creadoEn','fecha_creacion','createdAt','created_at','fecha']);
        fecha = tryDateFrom(createdVal);
      }
      if (!fecha) fecha = new Date();

      const v = customer.puntaje;
      const puntajeNum = typeof v === 'string' ? parseFloat(v) : Number(v);
      return {
        fecha,
        producto: customer.tipo_servicio || 'Sin especificar',
        puntaje: isNaN(puntajeNum) ? 0 : puntajeNum,
        status: customer.status || 'PENDING',
        agente: customer.agenteNombre || customer.agente
      };
    });
    
    res.json(datosGraficas);
  } catch (error) {
    console.error('Error al obtener leads:', error);
    res.status(500).json({ success: false, message: 'Error al obtener los leads' });
  }
});

// Ruta de ejemplo
router.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'API funcionando correctamente' 
  });
});

// Métricas para panel Costumer: ventasHoy, ventasMes, pendientes, total clientes
router.get('/agente/costumer-metricas', async (req, res) => {
  try {
    // Decodificar usuario desde Authorization (opcional)
    let usuarioAutenticado = null;
    const token = req.headers.authorization?.split(' ')[1];
    if (token && token !== 'temp-token-dev') {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret-key-default');
        usuarioAutenticado = {
          id: decoded.userId || decoded.id,
          username: decoded.username || decoded.name || decoded.email,
          role: (decoded.role || '').toString().toLowerCase()
        };
      } catch (_) {}
    }

    // Si no hay DB -> demo
    if (!process.env.MONGODB_URI) {
      const now = new Date();
      return res.json({ ventasHoy: 0, ventasMes: 0, leadsPendientes: 0, clientes: 0, now });
    }

    // Conectar a Mongo
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('crmagente');

    // Filtros por rol (alineados a /api/customers)
    const agenteQuery = (req.query.agente || '').toString().trim();
    const agenteIdParamRaw = (req.query.agenteId || '').toString().trim();
    let filtroBase = {};
    const { ObjectId } = require('mongodb');

    // Roles privilegiados: vista global
    const role = (usuarioAutenticado?.role || '').toString().toLowerCase();
    const isPrivileged = ['admin', 'supervisor', 'backoffice', 'b:o', 'b.o', 'b-o', 'bo'].includes(role);

    if (!isPrivileged && role === 'agent') {
      // Construir filtro robusto por múltiples campos de ID con fallback por nombre SOLO si faltan IDs
      const currentUserId = String(usuarioAutenticado?.id || '').trim();
      let oid = null; try { if (/^[a-fA-F0-9]{24}$/.test(currentUserId)) oid = new ObjectId(currentUserId); } catch {}
      const bothTypes = oid ? { $in: [currentUserId, oid] } : currentUserId;

      const agentFieldCandidates = [
        'agenteId','agentId','createdBy','ownerId','assignedId','usuarioId','userId','registeredBy','asignadoId','asignadoAId'
      ];
      const idOr = agentFieldCandidates.map(f => ({ [f]: bothTypes }));

      // Fallback por nombre si TODOS los campos de ID están vacíos/ausentes
      const nameCandidatesRaw = [usuarioAutenticado?.username, usuarioAutenticado?.name, usuarioAutenticado?.email]
        .filter(v => typeof v === 'string' && v.trim().length > 0)
        .map(v => v.trim());
      const nameRegexes = nameCandidatesRaw.map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
      const nameFields = ['agenteNombre','agente','agentName','nombreAgente','nombre_agente','agente_nombre','salesAgent','asignadoA','assignedTo','usuario','owner','registeredBy','seller','vendedor'];
      const nameOrSimple = [];
      nameFields.forEach(f => nameRegexes.forEach(rx => nameOrSimple.push({ [f]: rx })));
      const idEmptyOrMissing = { $and: agentFieldCandidates.map(f => ({ $or: [ { [f]: { $exists: false } }, { [f]: null }, { [f]: '' } ] })) };
      const nameAndIfNoIds = (nameOrSimple.length ? { $and: [ { $or: nameOrSimple }, idEmptyOrMissing ] } : null);

      filtroBase = nameAndIfNoIds ? { $or: [...idOr, nameAndIfNoIds] } : { $or: [...idOr] };
    }

    // Si viene agenteId por query (para admin/supervisor/backoffice)
    if (isPrivileged && agenteIdParamRaw) {
      let oid = null;
      try { if (/^[a-fA-F0-9]{24}$/.test(agenteIdParamRaw)) oid = new ObjectId(agenteIdParamRaw); } catch {}
      const bothTypes = oid ? { $in: [agenteIdParamRaw, oid] } : agenteIdParamRaw;
      filtroBase = { agenteId: bothTypes };
    } else if (isPrivileged && !agenteIdParamRaw && agenteQuery) {
      // Admin/supervisor/backoffice: permitir filtro por nombre (parcial) si se especifica
      const safe = agenteQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const containsCI = new RegExp(safe, 'i');
      filtroBase = {
        $or: [
          { agente: containsCI },
          { agent: containsCI },
          { agenteNombre: containsCI },
          { agentName: containsCI }
        ]
      };
    }

    // Obtener todos los costumers visibles para el usuario
    const costumers = await db.collection('costumers').find(filtroBase).toArray();

    // Helpers de fecha: misma lógica que la gráfica (UTC-6)
    const BUSINESS_TZ_OFFSET_MIN = -6 * 60; // UTC-6 fijo
    const toISOInTZ = (date, tzOffsetMinutes) => {
      const target = new Date(date.getTime() + tzOffsetMinutes * 60000);
      const y = target.getUTCFullYear();
      const m = String(target.getUTCMonth() + 1).padStart(2, '0');
      const d = String(target.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    const getByPath = (obj, path) => {
      try { return path.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj); }
      catch { return undefined; }
    };
    const findFirst = (obj, paths) => {
      for (const p of paths) {
        const v = getByPath(obj, p);
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };
    const tryDateFrom = (val) => {
      if (!val) return null;
      if (typeof val === 'string') {
        const s = val.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          const [y, m, d] = s.split('-').map(Number);
          return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        }
        if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
          const parts = s.split(/[\/\-]/).map(Number);
          const [d, m, y] = parts;
          if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900) {
            return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
          }
        }
      }
      if (typeof val === 'number') return new Date(val < 1e12 ? val * 1000 : val);
      const dt = new Date(val); return isNaN(dt) ? null : dt;
    };

    const hoyISO = toISOInTZ(new Date(), BUSINESS_TZ_OFFSET_MIN);
    const createdPaths = [
      // raíz
      'creadoEn','fecha_creacion','fechaCreacion','createdAt','created_at','createdon','createdOn','created','fecha','fecha_lead',
      'insertedAt','inserted_at','createdDate','created_date','created_datetime',
      // _raw
      '_raw.creadoEn','_raw.fecha_creacion','_raw.fechaCreacion','_raw.createdAt','_raw.created_at','_raw.createdon','_raw.createdOn','_raw.created','_raw.fecha','_raw.fecha_lead',
      '_raw.insertedAt','_raw.inserted_at','_raw.createdDate','_raw.created_date','_raw.created_datetime',
      // metadata
      'metadata.createdAt','metadata.created_at','metadata.createdon','metadata.createdOn',
      // audit/timestamps
      'audit.createdAt','audit.created_at','audit.createdon','audit.createdOn',
      'timestamps.createdAt','timestamps.created_at','timestamps.createdon','timestamps.createdOn'
    ];
    const diaVentaPaths = ['dia_venta','diaVenta','dia','_raw.dia_venta','_raw.diaVenta','_raw.dia','fecha_contratacion','_raw.fecha_contratacion'];

    let ventasHoy = 0;
    let ventasMes = 0;
    let leadsPendientes = 0;
    const clientes = costumers.length;

    // Calcular el primer día del mes actual en UTC-6
    const hoy = new Date();
    const hoyISO_ = toISOInTZ(hoy, BUSINESS_TZ_OFFSET_MIN);
    const [hy, hm] = hoyISO_.split('-').map(Number);
    const primerDiaMesUTC = new Date(Date.UTC(hy, hm - 1, 1, 12, 0, 0));
    const inicioMesISO = toISOInTZ(primerDiaMesUTC, BUSINESS_TZ_OFFSET_MIN);

    const debugMode = (req.query.debug === '1' || req.query.debug === 'true');
    const debugInfo = debugMode ? { hoyISO, inicioMesISO, matchedToday: [], matchedMonth: 0, pending: 0, examined: 0, fallbacksToToday: 0 } : null;

    for (const c of costumers) {
      // Fecha de negocio priorizando dia_venta; luego fechas de creación
      const diaVentaVal = findFirst(c, diaVentaPaths);
      let fecha = tryDateFrom(typeof diaVentaVal === 'string' ? diaVentaVal.trim() : diaVentaVal);
      if (!fecha) {
        const fechaCreacionVal = findFirst(c, createdPaths);
        fecha = tryDateFrom(fechaCreacionVal);
      }
      // Fallback: si no hay fecha válida, usar hoy (igual que la gráfica)
      let fechaStr = fecha ? toISOInTZ(fecha, BUSINESS_TZ_OFFSET_MIN) : null;
      if (!fechaStr) {
        fechaStr = hoyISO;
        if (debugMode) debugInfo.fallbacksToToday++;
      }
      if (fechaStr === hoyISO) ventasHoy += 1;
      if (fechaStr && fechaStr >= inicioMesISO) ventasMes += 1;

      const st = (c.status || c.estado || '').toString().toUpperCase();
      if (st === 'PENDING' || st === 'PENDIENTE') leadsPendientes += 1;

      if (debugMode) {
        debugInfo.examined++;
        if (fechaStr === hoyISO) {
          debugInfo.matchedToday.push({ _id: c._id, dia_venta: diaVentaVal, fechaStr, status: st });
        }
        if (fechaStr && fechaStr >= inicioMesISO) debugInfo.matchedMonth++;
        if (st === 'PENDING' || st === 'PENDIENTE') debugInfo.pending++;
      }
    }

    await client.close();

    const payload = { ventasHoy, ventasMes, leadsPendientes, clientes, hoyISO };
    if (debugMode) payload.debug = debugInfo;
    return res.json(payload);
  } catch (error) {
    console.error('Error en /agente/costumer-metricas:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener métricas', error: error.message });
  }
});

// Ruta para obtener estadísticas de agentes (ventas y puntajes)
router.get('/agent-stats', async (req, res) => {
  try {
    // Verificar si estamos en modo demo (sin base de datos)
    if (!process.env.MONGODB_URI) {
      // Modo demo: devolver datos de ejemplo
      const datosEjemplo = {
        success: true,
        data: [
          { agente: 'Juan Pérez', ventas: 15, puntajeTotal: 120, puntajePromedio: 8 },
          { agente: 'María García', ventas: 12, puntajeTotal: 108, puntajePromedio: 9 },
          { agente: 'Carlos López', ventas: 8, puntajeTotal: 64, puntajePromedio: 8 }
        ]
      };
      return res.json(datosEjemplo);
    }
    
    // Conectar a MongoDB
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db('crmagente');
    
    // Agregación para obtener estadísticas por agente
    const pipeline = [
      {
        $match: {
          status: 'COMPLETED', // Solo leads completados
          agente: { $exists: true, $ne: null } // Que tengan agente asignado
        }
      },
      {
        $group: {
          _id: '$agente',
          ventas: { $sum: 1 },
          puntajeTotal: { $sum: { $toInt: '$puntaje' } },
          puntajePromedio: { $avg: { $toInt: '$puntaje' } }
        }
      },
      {
        $project: {
          _id: 0,
          agente: '$_id',
          ventas: 1,
          puntajeTotal: 1,
          puntajePromedio: { $round: ['$puntajePromedio', 2] }
        }
      },
      { $sort: { ventas: -1 } } // Ordenar por número de ventas (descendente)
    ];
    
    const estadisticas = await db.collection('costumers').aggregate(pipeline).toArray();
    await client.close();
    
    res.json({
      success: true,
      data: estadisticas
    });
    
  } catch (error) {
    console.error('Error al obtener estadísticas de agentes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener las estadísticas de agentes',
      error: error.message
    });
  }
});

// Ruta simulada para registro de usuario
router.post('/register', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Por favor ingrese nombre y correo' 
    });
  }

  // Simular respuesta exitosa sin guardar en base de datos
  res.status(201).json({
    success: true,
    message: 'Usuario registrado exitosamente (modo demo)',
    user: {
      id: 'demo-user-123',
      name,
      email,
      role: 'agent'
    }
  });
});


module.exports = router;
