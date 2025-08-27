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
      // Si no se pasó agente por query, usar usuario autenticado (comportamiento anterior)
      filtro = { $or: [ { agenteNombre: usuarioAutenticado.username }, { agente: usuarioAutenticado.username } ] };
      console.log('Filtrando leads por usuario autenticado:', usuarioAutenticado.username);
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
    
    // Formatear los datos para las gráficas
    const datosGraficas = customers.map(customer => ({
      fecha: customer.fecha_creacion ? new Date(customer.fecha_creacion) : new Date(),
      producto: customer.tipo_servicio || 'Sin especificar',
      puntaje: parseInt(customer.puntaje) || 0,
      status: customer.status || 'PENDING',
      agente: customer.agenteNombre || customer.agente
    }));
    
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
