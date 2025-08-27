const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// Endpoint para obtener datos del ranking de agentes
router.get('/ranking', async (req, res) => {
  try {
    console.log('=== ENDPOINT /api/ranking LLAMADO ===');
    console.log('Headers:', req.headers);
    
    const db = getDb();
    
    if (!db) {
      console.error('No hay conexión a la base de datos');
      return res.status(500).json({
        success: false,
        message: 'Error de conexión con la base de datos'
      });
    }
    
    console.log('Conexión a BD establecida correctamente');

    // Obtener todos los customers de la colección costumers
    const customers = await db.collection('costumers').find({}).toArray();
    
    // Agrupar por agente y calcular estadísticas
    const agentStats = {};
    
    customers.forEach(customer => {
      const agenteId = customer.agenteId || customer.creadoPor;
      const agenteNombre = customer.agenteNombre || 'Agente Desconocido';
      
      if (!agenteId) return; // Saltar si no hay agente asignado
      
      if (!agentStats[agenteId]) {
        agentStats[agenteId] = {
          id: agenteId,
          nombre: agenteNombre,
          ventas: 0,
          puntos: 0,
          clientes: []
        };
      }
      
      agentStats[agenteId].ventas += 1;
      agentStats[agenteId].puntos += parseFloat(customer.puntaje) || 0;
      agentStats[agenteId].clientes.push(customer);
    });
    
    // Convertir a array y ordenar por puntos
    const ranking = Object.values(agentStats)
      .map(agent => ({
        id: agent.id,
        nombre: agent.nombre,
        ventas: agent.ventas,
        puntos: Math.round(agent.puntos * 10) / 10, // Redondear a 1 decimal
        promedio: agent.ventas > 0 ? Math.round((agent.puntos / agent.ventas) * 10) / 10 : 0
      }))
      .sort((a, b) => b.puntos - a.puntos) // Ordenar por puntos descendente
      .slice(0, 10); // Top 10
    
    // Asignar posiciones y roles
    const rankingConPosiciones = ranking.map((agent, index) => {
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
    
    console.log(`Ranking generado con ${rankingConPosiciones.length} agentes`);
    
    res.json({
      success: true,
      ranking: rankingConPosiciones,
      totalAgentes: Object.keys(agentStats).length,
      totalClientes: customers.length
    });
    
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
