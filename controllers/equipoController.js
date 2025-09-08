const Lead = require('../models/Lead');
const Costumer = require('../models/Costumer');
const { connectToMongoDB, getDb } = require('../config/db');
const mongoose = require('mongoose');

/**
 * Obtiene estadísticas de equipos
 */
exports.obtenerEstadisticasEquipos = async (req, res) => {
  try {
    // Rango de fechas: hoy por defecto, o por querystring (YYYY-MM-DD)
    const { fechaInicio, fechaFin } = req.query || {};
    const hoy = new Date();
    const yyyy = hoy.getUTCFullYear();
    const mm = String(hoy.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getUTCDate()).padStart(2, '0');
    const hoyStr = `${yyyy}-${mm}-${dd}`; // Formato YYYY-MM-DD, comparable lexicográficamente

    const start = (fechaInicio && String(fechaInicio).trim()) || hoyStr;
    const end = (fechaFin && String(fechaFin).trim()) || hoyStr;

    // Filtro principal por fecha_contratacion (guardada como string YYYY-MM-DD)
    const matchStage = {
      $match: {
        fecha_contratacion: { $gte: start, $lte: end },
        status: { $ne: 'cancelado' }
      }
    };

    // Asegurar conexión nativa a Mongo (no usar Mongoose aquí)
    let db = getDb();
    if (!db) db = await connectToMongoDB();

    // Resolver nombre de colección (Costumers vs costumers)
    const colls = await db.listCollections().toArray();
    const hasProper = colls.some(c => c.name === 'Costumers');
    const hasLower = colls.some(c => c.name === 'costumers');
    const collName = hasProper ? 'Costumers' : (hasLower ? 'costumers' : 'Costumers');
    const coll = db.collection(collName);

    // Agregación por team, contando ICON/BAMO, Total y sumando puntaje (normalizando mercado a mayúsculas)
    const pipeline = [
      matchStage,
      {
        $group: {
          _id: { $ifNull: ['$team', 'Sin equipo'] },
          ICON: { $sum: { $cond: [{ $eq: [{ $toUpper: { $ifNull: ['$mercado', ''] } }, 'ICON'] }, 1, 0] } },
          BAMO: { $sum: { $cond: [{ $eq: [{ $toUpper: { $ifNull: ['$mercado', ''] } }, 'BAMO'] }, 1, 0] } },
          Total: { $sum: 1 },
          Puntaje: { $sum: { $ifNull: ['$puntaje', 0] } }
        }
      },
      { $sort: { Total: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          TEAM: '$_id',
          ICON: 1,
          BAMO: 1,
          Total: 1,
          Puntaje: { $round: ['$Puntaje', 2] }
        }
      }
    ];

    const data = await coll.aggregate(pipeline, { maxTimeMS: 30000 }).toArray();

    // Agregación específica para TEAM LINEA (desglose por supervisor, contando ICON)
    const lineaPipeline = [
      matchStage,
      { $match: { team: { $in: ['LINEA','linea','Lineas','LINEAS','team lineas','TEAM LINEA'] } } },
      {
        $group: {
          _id: { $toUpper: { $ifNull: ['$supervisor', 'SIN NOMBRE'] } },
          ICON: { $sum: { $cond: [{ $eq: [{ $toUpper: { $ifNull: ['$mercado',''] } }, 'ICON'] }, 1, 0] } }
        }
      },
      { $project: { _id: 0, name: '$_id', ICON: 1 } },
      { $sort: { ICON: -1, name: 1 } }
    ];
    const lineasAgg = await coll.aggregate(lineaPipeline, { maxTimeMS: 30000 }).toArray();

    // Normalización y padding: asegurar los 6 equipos siempre presentes
    const normalizeTeam = (s) => {
      try {
        const up = String(s || '').toUpperCase().trim();
        return up.startsWith('TEAM ') ? up.slice(5).trim() : up;
      } catch { return ''; }
    };
    // Lista base en forma canónica (sin prefijo TEAM)
    // No incluir LINEA en la tabla principal
    const BASE_TEAMS = [
      'IRANIA',
      'ROBERTO VELASQUEZ',
      'BRYAN PLEITEZ',
      'MARISOL BELTRAN',
      'RANDAL MARTINEZ'
    ];
    // Alias conocidos desde la BD hacia los nombres base
    const ALIASES = new Map([
      ['IRANIA', 'IRANIA'],
      ['MARISOL', 'MARISOL BELTRAN'],
      ['ROBERTO', 'ROBERTO VELASQUEZ'],
      ['ROBERTO V', 'ROBERTO VELASQUEZ'],
      ['BRYAN', 'BRYAN PLEITEZ'],
      ['RANDAL', 'RANDAL MARTINEZ'],
      ['LINEAS', 'LINEA'],
      ['LINEA', 'LINEA']
    ]);
    const byKey = new Map();
    for (const r of (data || [])) {
      const rawK = normalizeTeam(r.TEAM);
      const k = ALIASES.get(rawK) || rawK;
      if (!k) continue;
      if (k === 'LINEA') continue; // excluir de la tabla principal
      byKey.set(k, {
        TEAM: `TEAM ${k}`,
        ICON: Number(r.ICON || 0),
        BAMO: Number(r.BAMO || 0),
        Total: Number(r.Total || 0),
        Puntaje: Number(r.Puntaje || 0)
      });
    }
    const padded = BASE_TEAMS.map(k => byKey.get(k) || ({ TEAM: `TEAM ${k}`, ICON: 0, BAMO: 0, Total: 0, Puntaje: 0 }));
    const lineasTotalICON = (lineasAgg || []).reduce((s, r) => s + Number(r.ICON || 0), 0);

    // Encabezados de diagnóstico
    res.set('X-Equipos-Source', 'aggregate');
    res.set('X-Equipos-Coll', collName);
    const payload = {
      success: true,
      message: `OK-MONGO-AGG PADDED-${padded.length} LINEAS-${lineasAgg.length}`,
      total: padded.length,
      fechaInicio: start,
      fechaFin: end,
      data: padded,
      lineas: lineasAgg,
      lineasTotalICON,
      debugCount: { rawCount: data.length, paddedCount: padded.length }
    };
    if (String(req.query?.debug || '').toLowerCase() === '1') {
      payload.dataRaw = data;
    }
    console.log('[equipos/estadisticas] counts => raw:', data.length, 'padded:', padded.length);
    return res.json(payload);
  } catch (error) {
    console.error('Error en obtenerEstadisticasEquipos:', error);
    res.set('X-Equipos-Source', 'error');
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas de equipos',
      error: error?.message || 'Unknown error'
    });
  }
};

/**
 * Debug: Información estática sin consultas
 */
exports.debugCostumers = async (req, res) => {
  res.json({
    success: true,
    debug: {
      message: 'Debug endpoint - sin consultas MongoDB',
      timestamp: new Date().toISOString(),
      status: 'OK'
    }
  });
};

/**
 * Obtiene los equipos únicos disponibles
 */
exports.obtenerListaEquipos = async (req, res) => {
  const equipos = [
    'TEAM IRANIA',
    'TEAM ROBERTO VELASQUEZ', 
    'TEAM BRYAN PLEITEZ',
    'TEAM MARISOL BELTRAN',
    'TEAM RANDAL MARTINEZ',
    'TEAM LINEA'
  ];
  
  res.json({
    success: true,
    data: equipos,
    total: equipos.length
  });
};
