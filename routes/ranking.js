const express = require('express');
const router = express.Router();
const { getDb, connectToMongoDB } = require('../config/db');

// Datos de prueba para ranking cuando MongoDB no esté disponible
const datosRankingPrueba = [
  {
    id: '1',
    nombre: 'Daniel Martinez',
    ventas: 25,
    puntos: 87.5,
    promedio: 3.5,
    posicion: 1,
    cargo: 'Agente Ejecutivo'
  },
  {
    id: '2',
    nombre: 'Ana García',
    ventas: 22,
    puntos: 78.2,
    promedio: 3.6,
    posicion: 2,
    cargo: 'Agente Senior'
  },
  {
    id: '3',
    nombre: 'Carlos López',
    ventas: 20,
    puntos: 71.0,
    promedio: 3.6,
    posicion: 3,
    cargo: 'Agente Senior'
  },
  {
    id: '4',
    nombre: 'María Rodríguez',
    ventas: 18,
    puntos: 65.4,
    promedio: 3.6,
    posicion: 4,
    cargo: 'Agente'
  },
  {
    id: '5',
    nombre: 'Luis Hernández',
    ventas: 16,
    puntos: 58.8,
    promedio: 3.7,
    posicion: 5,
    cargo: 'Agente'
  },
  {
    id: '6',
    nombre: 'Sofia Martínez',
    ventas: 15,
    puntos: 52.5,
    promedio: 3.5,
    posicion: 6,
    cargo: 'Agente'
  },
  {
    id: '7',
    nombre: 'Pedro Sánchez',
    ventas: 12,
    puntos: 42.0,
    promedio: 3.5,
    posicion: 7,
    cargo: 'Agente'
  },
  {
    id: '8',
    nombre: 'Laura Torres',
    ventas: 10,
    puntos: 35.0,
    promedio: 3.5,
    posicion: 8,
    cargo: 'Agente Junior'
  },
  {
    id: '9',
    nombre: 'Miguel Flores',
    ventas: 8,
    puntos: 28.0,
    promedio: 3.5,
    posicion: 9,
    cargo: 'Agente Junior'
  },
  {
    id: '10',
    nombre: 'Carmen Díaz',
    ventas: 6,
    puntos: 21.0,
    promedio: 3.5,
    posicion: 10,
    cargo: 'Agente Junior'
  }
];

// Endpoint para obtener datos del ranking de agentes
// Nota: este router se monta en server.js bajo '/api/ranking',
// por lo que el handler debe estar en '/'
router.get('/', async (req, res) => {
  try {
    console.log('=== ENDPOINT /api/ranking LLAMADO ===');
    console.log('Headers:', req.headers);
    
    let db;
    try {
      db = getDb();
    } catch (error) {
      console.log('[RANKING] getDb() falló. Intentando conectar a MongoDB...');
      try {
        await connectToMongoDB();
        db = getDb();
        console.log('[RANKING] Conexión a MongoDB restablecida.');
      } catch (err2) {
        console.log('[RANKING] No se pudo conectar a MongoDB. Se devolverán datos de prueba. Motivo:', err2.message);
        db = null;
      }
    }
    
    if (!db) {
      console.log('[RANKING] Devolviendo datos de prueba');
      return res.json({
        success: true,
        ranking: datosRankingPrueba,
        totalAgentes: datosRankingPrueba.length,
        totalClientes: 150,
        message: 'Datos de prueba - MongoDB no disponible'
      });
    }
    
    console.log('Conexión a BD establecida correctamente');

    // Filtro por fecha (por defecto, día actual) y orden ascendente por fecha_contratacion
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const hoyStr = `${yyyy}-${mm}-${dd}`;
    const mesInicioStr = `${yyyy}-${mm}-01`;

    // Por defecto: acumulado del mes en curso (01..hoy)
    const qStart = (req.query.fechaInicio && String(req.query.fechaInicio).trim()) || mesInicioStr;
    const qEnd = (req.query.fechaFin && String(req.query.fechaFin).trim()) || hoyStr;
    const forceAll = String(req.query.forceAll || '0').toLowerCase();
    const noDateFilter = forceAll === '1' || forceAll === 'true';
    const debugMode = ['1','true','yes','on'].includes(String(req.query.debug || '0').toLowerCase());

    // Filtro por mes usando:
    // - fecha_contratacion (string YYYY-MM-DD) entre qStart..qEnd
    // - dia_venta (string DD/MM/YYYY) que termine con /MM/YYYY
    // - createdAt (ISODate) entre los límites (por si aplica)
    let filter = {};
    if (!noDateFilter) {
      // Derivar MM y YYYY para regex de dia_venta
      const mmForRegex = (qStart || mesInicioStr).slice(5,7); // MM
      const yyyyForRegex = (qStart || mesInicioStr).slice(0,4); // YYYY
      const diaVentaRegex = new RegExp(`\\/${mmForRegex}\\/${yyyyForRegex}$`); // \/10\/2025$

      // Calcular límites ISO para createdAt (inicio inclusive, fin exclusivo +1 día)
      const startIso = new Date(`${qStart}T00:00:00.000Z`);
      const endDate = new Date(`${qEnd}T00:00:00.000Z`);
      // mover endDate al día siguiente para rango exclusivo
      const endIso = new Date(endDate.getTime() + 24*60*60*1000);

      filter = {
        $or: [
          { fecha_contratacion: { $gte: qStart, $lte: qEnd } },
          { dia_venta: { $regex: diaVentaRegex } },
          { createdAt: { $gte: startIso, $lt: endIso } }
        ]
      };
    }

    // Importante: si fecha_contratacion es string YYYY-MM-DD, sort lexicográfico funciona
    // Orden ASC para que una venta con fecha 01 se coloque junto a las del 01
    // Pipeline de agregación para calcular el ranking directamente en MongoDB
    const aggregationPipeline = [
      // 1. Filtrar documentos con algún identificador de agente (id o nombre)
      {
        $match: {
          $or: [
            { agenteId: { $exists: true, $ne: null } },
            { agenteNombre: { $exists: true, $ne: null, $ne: "" } },
            { agente: { $exists: true, $ne: null, $ne: "" } },
            { createdBy: { $exists: true, $ne: null, $ne: "" } }
          ]
        }
      },

      // 2. Filtrar documentos por fecha
      { $match: filter },

      // 3. Convertir 'puntaje' a número y calcular nombre evitando placeholders
      {
        $addFields: {
          puntajeNumerico: { $toDouble: { $ifNull: ["$puntaje", 0] } },
          nombreCalculado: {
            $let: {
              vars: {
                n1: { $ifNull: ["$agenteNombre", ""] },
                n2: { $ifNull: ["$agente", ""] },
                n3: { $ifNull: ["$createdBy", "Agente Desconocido"] }
              },
              in: {
                $let: {
                  vars: { a1: { $toLower: { $trim: { input: "$$n1" } } } },
                  in: {
                    $cond: [
                      { $in: ["$$a1", ["", "agente", "agente desconocido"]] },
                      {
                        $let: {
                          vars: { a2: { $toLower: { $trim: { input: "$$n2" } } } },
                          in: {
                            $cond: [
                              { $in: ["$$a2", ["", "agente", "agente desconocido"]] },
                              "$$n3",
                              "$$n2"
                            ]
                          }
                        }
                      },
                      "$$n1"
                    ]
                  }
                }
              }
            }
          }
        }
      },
      // 3b. Calcular clave de agente: usar agenteId; si no existe, usar nombre normalizado
      {
        $addFields: {
          agenteClave: {
            $ifNull: [
              "$agenteId",
              { $toLower: { $trim: { input: "$nombreCalculado" } } }
            ]
          }
        }
      },

      // 4. Agrupar por la clave calculada de agente y calcular ventas y puntos
      {
        $group: {
          _id: "$agenteClave", // Agrupar por ID si existe, de lo contrario por nombre
          nombre: { $first: "$nombreCalculado" },
          ventas: { $sum: 1 },
          puntos: { $sum: "$puntajeNumerico" }
        }
      },
      
      // 5. Ordenar por puntos de forma descendente
      { $sort: { puntos: -1 } },
      
      // La limitación se aplica dinámicamente más adelante
      
      // 6. Formatear la salida
      {
        $project: {
          _id: 0, // Excluir el _id del grupo
          id: "$_id",
          nombre: "$nombre",
          ventas: "$ventas",
          puntos: "$puntos",
          promedio: {
            $cond: [
              { $gt: ["$ventas", 0] },
              { $divide: ["$puntos", "$ventas"] },
              0
            ]
          }
        }
      }
    ];

    // Aplicar límite dinámico
    const qLimit = parseInt(req.query.limit, 10);
    const limit = !isNaN(qLimit) && qLimit > 0 ? qLimit : (req.query.limit === '0' ? 0 : 10);

    if (limit > 0) {
      aggregationPipeline.push({ $limit: limit });
    }

    const ranking = await db.collection('costumers').aggregate(aggregationPipeline).toArray();

    // Los puntajes ahora son exactos (sin redondeo)
    const formattedRanking = ranking.map(agent => ({
      ...agent,
      puntos: agent.puntos, // Puntaje exacto
      promedio: agent.promedio // Promedio exacto, se puede redondear en el frontend si es necesario
    }));

    // El ranking ya está ordenado y limitado por la agregación.
    // Simplemente asignamos posiciones y roles.
    const rankingConPosiciones = formattedRanking.map((agent, index) => {
      let cargo = 'Agente';
      if (index === 0) cargo = 'Agente Ejecutivo';
      else if (index === 1) cargo = 'Agente Senior';
      else if (index === 2) cargo = 'Agente Senior';
      else if (index >= 7) cargo = 'Agente Junior';
      
      return {
        ...agent,
        posicion: index + 1,
        cargo: cargo
      };
    });
    
    console.log(`Ranking generado con ${rankingConPosiciones.length} agentes.`);

    // Calcular totales por separado para no afectar el ranking principal
    const totalClientes = await db.collection('costumers').countDocuments(filter);
    const totalAgentesResult = await db.collection('costumers').aggregate([
      { $match: filter },
      { $group: { _id: "$agenteId" } },
      { $count: "count" }
    ]).toArray();
    const totalAgentes = totalAgentesResult.length > 0 ? totalAgentesResult[0].count : 0;
    
    const basePayload = {
      success: true,
      ranking: rankingConPosiciones,
      totalAgentes: totalAgentes,
      totalClientes: totalClientes,
      periodo: { fechaInicio: qStart, fechaFin: qEnd, sinFiltroFecha: noDateFilter }
    };

    if (debugMode) {
      // Resultado principal del ranking (ya formateado)
      const agentDebug = formattedRanking.map(a => ({
        id: a.id,
        nombre: a.nombre,
        ventas: a.ventas,
        puntos: a.puntos,
        promedio: a.promedio
      }));

      // Pipeline para identificar el detalle detrás de "Agente Desconocido"
      let desconocidoDetalle = [];
      try {
        const unknownPipeline = [
          // Mismo filtro de fecha
          { $match: filter },
          // Considerar documentos relevantes (algún identificador de agente o id)
          {
            $match: {
              $or: [
                { agenteId: { $exists: true, $ne: null } },
                { agenteNombre: { $exists: true, $ne: null, $ne: "" } },
                { agente: { $exists: true, $ne: null, $ne: "" } },
                { createdBy: { $exists: true, $ne: null, $ne: "" } }
              ]
            }
          },
          // Calcular nombre/claves como en el ranking
          {
            $addFields: {
              puntajeNumerico: { $toDouble: { $ifNull: ["$puntaje", 0] } },
              nombreCalculado: {
                $ifNull: [
                  "$agenteNombre",
                  { $ifNull: ["$agente", { $ifNull: ["$createdBy", "Agente Desconocido"] }] }
                ]
              }
            }
          },
          // Filtrar solo los que terminaron como Agente Desconocido
          { $match: { nombreCalculado: "Agente Desconocido" } },
          // Desglosar por posibles pistas de autoría
          {
            $group: {
              _id: { createdBy: "$createdBy", agenteId: "$agenteId" },
              ventas: { $sum: 1 },
              puntos: { $sum: "$puntajeNumerico" },
              ejemplos: { $push: { _id: "$_id", puntaje: "$puntajeNumerico" } }
            }
          },
          { $sort: { ventas: -1, puntos: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              createdBy: "$_id.createdBy",
              agenteId: "$_id.agenteId",
              ventas: 1,
              puntos: 1,
              ejemplos: { $slice: ["$ejemplos", 5] }
            }
          }
        ];
        desconocidoDetalle = await db.collection('costumers').aggregate(unknownPipeline).toArray();
      } catch (e) {
        desconocidoDetalle = [{ error: e.message }];
      }

      basePayload.debug = {
        usedFallback: false,
        aggregationResult: agentDebug,
        aggregationPipeline: JSON.stringify(aggregationPipeline, null, 2),
        desconocidoDetalle
      };
    }

    res.json(basePayload);
    
  } catch (error) {
    console.error('Error al obtener ranking:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener datos del ranking',
      error: error.message
    });
  }
});

module.exports = router;
