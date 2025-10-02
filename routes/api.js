const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { connectToMongoDB, getDb } = require('../config/db');

// --- INICIO: Lógica de Equipos (adaptada de utils/teams.js) ---
const norm = (s) => {
  try {
    return String(s || '').normalize('NFD').replace(/\p{Diacritic}+/gu, '').trim().toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ');
  } catch { return ''; }
};

const TEAMS = {
  'team irania': { supervisor: 'irania serrano', agents: ['josue renderos', 'tatiana ayala', 'giselle diaz', 'miguel nunez', 'roxana martinez', 'irania serrano'] },
  'team bryan pleitez': { supervisor: 'bryan pleitez', agents: ['abigail galdamez', 'alexander rivera', 'diego mejia', 'evelin garcia', 'fabricio panameno', 'luis chavarria', 'steven varela'] },
  'team marisol beltran': { supervisor: 'marisol beltran', agents: ['fernanda castillo', 'jonathan morales', 'katerine gomez', 'kimberly iglesias', 'stefani martinez', 'eduardo rivas'] },
  'team roberto velasquez': { supervisor: 'roberto velasquez', agents: ['cindy flores', 'daniela bonilla', 'francisco aguilar', 'levy ceren', 'lisbeth cortez', 'lucia ferman', 'nelson ceren'] },
  'team randal martinez': { supervisor: 'randal martinez', agents: ['anderson guzman', 'carlos grande', 'guadalupe santana', 'julio chavez', 'priscila hernandez', 'riquelmi torres'] },
  'team lineas': { supervisor: 'jonathan figueroa', additionalSupervisors: ['luis gutierrez'], agents: ['lineas-carlos', 'lineas-cristian r', 'lineas-edward', 'lineas-jocelyn', 'lineas-oscar r', 'lineas-daniel', 'lineas-karla', 'lineas-sandy', 'lineas-angie', 'luis gutierrez'] }
};

const getAgentsBySupervisor = (supName) => {
  const normalizedSupName = norm(supName);
  for (const teamKey in TEAMS) {
    const team = TEAMS[teamKey];
    if (norm(team.supervisor) === normalizedSupName || (team.additionalSupervisors && team.additionalSupervisors.map(norm).includes(normalizedSupName))) {
      // Devolver nombres de agentes y también el del supervisor para que vea sus propios leads
      return [...(team.agents || []), team.supervisor, ...(team.additionalSupervisors || [])];
    }
  }
  return [];
};
// --- FIN: Lógica de Equipos ---

// Middleware para manejar la conexión a la base de datos
const withDatabase = async (req, res, next) => {
  try {
    let db;
    try {
      db = await connectToMongoDB();
    } catch (error) {
      console.log('[API] MongoDB no disponible, continuando con datos de prueba');
      db = null;
    }
    
    req.db = db;
    req.usingMockData = !db; // Flag para indicar si estamos usando datos de prueba
    next();
  } catch (error) {
    console.error('[ERROR] Error en el middleware de base de datos:', error);
    req.db = null;
    req.usingMockData = true;
    next(); // Continuar con datos de prueba
  }
};

// Ruta para obtener leads completos (accesible a autenticados con filtros por rol)
router.get('/leads', protect, withDatabase, async (req, res) => {
  console.error('\n===========================================');
  console.error('🚀 ENDPOINT /api/leads EJECUTÁNDOSE');
  console.error('===========================================');
  
  const db = req.db;
  let filtro = {}; 
  let usuarioAutenticado = req.user || null;
  
  try {
    const { 
      paraGrafica = 'false', 
      fecha,
      status: statusQuery,
      fechaInicio,
      fechaFin,
      agente: agenteQuery
    } = req.query;

    console.error('🔥 [ENDPOINT] /api/leads ejecutándose');
    console.error('[DEBUG] Query params:', req.query);
    console.error('[DEBUG] Usuario autenticado:', usuarioAutenticado || 'No autenticado');

    // Obtener la colección
    let collection;
    try {
      collection = db.collection('costumers');
      console.error('[DEBUG] Colección costumers obtenida correctamente');
    } catch (error) {
      console.error('[ERROR] Error al obtener la colección costumers:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error al acceder a la colección de clientes',
        error: error.message 
      });
    }

    // Construir el filtro de consulta
    const allFilters = [];
    
    // Determinar rol y normalizar
    const rol = (usuarioAutenticado && usuarioAutenticado.role) ? String(usuarioAutenticado.role).toLowerCase() : '';
    const esAdmin = ['admin', 'administrador', 'administrativo'].includes(rol);
    const esBackoffice = ['backoffice','b:o','b.o','b-o','bo'].includes(rol);
    const esSupervisor = rol === 'supervisor';
    const esTeamLineas = rol === 'teamlineas' || (usuarioAutenticado?.username || '').toLowerCase().startsWith('lineas-');

    console.error('[DEBUG] Rol del usuario:', usuarioAutenticado?.role || 'no autenticado');
    
    // Filtros de visibilidad por rol - REACTIVADO
    if (esSupervisor) {
      const supervisorName = (usuarioAutenticado?.username || '').trim();
      console.error(`[DEBUG] Rol Supervisor detectado: ${supervisorName}`);
      
      const agentsOfSupervisor = getAgentsBySupervisor(supervisorName);
      // Normalizar nombres para la consulta
      const normalizedAgents = agentsOfSupervisor.map(norm).filter(Boolean);

      console.error(`[DEBUG] Agentes encontrados para supervisor:`, normalizedAgents);

      if (normalizedAgents.length > 0) {
        // Crear expresiones regulares para búsqueda case-insensitive
        const agentRegexps = normalizedAgents.map(agent => new RegExp(`^${agent.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i'));

        console.error(`[DEBUG] Expresiones regulares para agentes:`, agentRegexps);

        const supervisorFilter = {
          $or: [
            { agenteNombre: { $in: agentRegexps } },
            { agente: { $in: agentRegexps } },
            { createdBy: { $in: agentRegexps } },
            { owner: { $in: agentRegexps } },
            { registradoPor: { $in: agentRegexps } },
            { usuario: { $in: agentRegexps } },
            // Fallback a los nombres normalizados por si acaso
            { agenteNombre: { $in: normalizedAgents } },
            { agente: { $in: normalizedAgents } }
          ]
        };
        allFilters.push(supervisorFilter);
      } else {
        // Si el supervisor no tiene agentes, no debería ver nada (o solo lo suyo)
        // Para seguridad, filtramos por su propio nombre como fallback.
        allFilters.push({ agenteNombre: supervisorName });
      }
    } else if (!esAdmin && !esBackoffice) {
      const userName = (usuarioAutenticado?.username || '').trim();
      const userId = usuarioAutenticado?._id?.toString() || usuarioAutenticado?.id?.toString() || '';
      
      console.error('[DEBUG] Aplicando filtro individual para usuario:', userName);
      console.error('[DEBUG] ID del usuario:', userId);
      
      // Crear filtro por ID del usuario (más confiable que nombres)
      const filtroAgente = { 
        $or: [
          // Filtros por ID (más confiables)
          { agenteId: userId },
          { createdBy: userId },
          { ownerId: userId },
          { agentId: userId },
          { registeredById: userId },
          { creadoPor: userId },
          // Filtros por nombre como fallback
          { agenteNombre: userName },
          { agente: userName },
          { createdBy: userName },
          { owner: userName },
          { registradoPor: userName },
          { usuario: userName }
        ]
      };
      
      console.error('[DEBUG] Filtro de agente creado:', JSON.stringify(filtroAgente, null, 2));
      allFilters.push(filtroAgente);
    }

    // Si se especificó un agente en la consulta (para administradores y backoffice)
    if (agenteQuery && (esAdmin || esBackoffice)) {
      console.log('[DEBUG] Filtro de agente para administrador:', agenteQuery);
      allFilters.push({ 
        $or: [
          { agente: agenteQuery },
          { agenteNombre: agenteQuery },
          { createdBy: agenteQuery },
          { agente: { $regex: agenteQuery, $options: 'i' } },
          { agenteNombre: { $regex: agenteQuery, $options: 'i' } },
          { createdBy: { $regex: agenteQuery, $options: 'i' } }
        ]
      });
    }
    
    // Aplicar filtro por estado si se especificó
    if (statusQuery) {
      filtro.status = statusQuery;
    }
    
    // Aplicar filtro por rango de fechas si se especificó
    if (fechaInicio || fechaFin) {
      const fechaFiltro = {};
      
      // Función para convertir fecha local de El Salvador a UTC
      const localElSalvadorToUTC = (fechaStr, inicioDia = true) => {
        try {
          if (!fechaStr) {
            console.log('[DEBUG] Usando fecha actual para El Salvador');
            const ahora = new Date();
            const offsetElSalvador = 6 * 60 * 60 * 1000; // 6 horas en milisegundos (UTC-6)
            return new Date(ahora.getTime() - offsetElSalvador);
          }
          
          // Intentar con formato YYYY-MM-DD
          const match = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (!match) {
            throw new Error('Formato de fecha no válido, se esperaba YYYY-MM-DD: ' + fechaStr);
          }
          
          const [_, year, month, day] = match;
          
          // Crear fecha en UTC (sin ajuste de zona horaria)
          let fechaUTC;
          if (inicioDia) {
            // Para inicio del día: 00:00:00 El Salvador = 06:00:00 UTC
            fechaUTC = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
          } else {
            // Para fin del día: 23:59:59.999 El Salvador = 05:59:59.999 UTC del día siguiente
            fechaUTC = new Date(Date.UTC(year, month - 1, day, 29, 59, 59, 999));
          }
          
          console.log(`[DEBUG] localElSalvadorToUTC: ${fechaStr} -> ${fechaUTC.toISOString()}`);
          return fechaUTC;
          
        } catch (error) {
          console.error('[ERROR] Error al convertir fecha:', fechaStr, error);
          throw error;
        }
      };
      
      // Obtener fecha actual en El Salvador (UTC-6)
      const ahora = new Date();
      const offsetElSalvador = 6 * 60 * 60 * 1000; // 6 horas en milisegundos (UTC-6)
      
      // Obtener componentes de la fecha actual en UTC
      const diaUTC = ahora.getUTCDate();
      const mesUTC = ahora.getUTCMonth();
      const anioUTC = ahora.getUTCFullYear();
      const horaUTC = ahora.getUTCHours();
      
      // Calcular la fecha actual en El Salvador
      const ahoraElSalvador = new Date(ahora);
      ahoraElSalvador.setHours(ahoraElSalvador.getHours() - 6);
      
      // Obtener componentes de la fecha en El Salvador
      const diaElSalvador = ahoraElSalvador.getDate();
      const mesElSalvador = ahoraElSalvador.getMonth();
      const anioElSalvador = ahoraElSalvador.getFullYear();
      
      // Crear fecha de hoy a medianoche en El Salvador (00:00:00 El Salvador = 06:00:00 UTC)
      const hoyElSalvador = new Date(Date.UTC(anioElSalvador, mesElSalvador, diaElSalvador, 6, 0, 0));
      
      // Crear fecha de mañana a medianoche en El Salvador
      const mananaElSalvador = new Date(Date.UTC(anioElSalvador, mesElSalvador, diaElSalvador + 1, 6, 0, 0));
      
      // Formatear fechas como YYYY-MM-DD
      const hoyStr = hoyElSalvador.toISOString().split('T')[0];
      
      console.log('[DEBUG] Fechas calculadas:', {
        servidorUTC: ahora.toISOString(),
        horaUTC: `${horaUTC}:${ahora.getUTCMinutes()}:${ahora.getUTCSeconds()}`,
        elSalvador: ahoraElSalvador.toISOString(),
        hoyElSalvador: hoyElSalvador.toISOString(),
        mananaElSalvador: mananaElSalvador.toISOString(),
        hoyStr,
        diaElSalvador,
        mesElSalvador: mesElSalvador + 1,
        anioElSalvador
      });
      
      // Usar la fecha de hoy si no se especifica fechaInicio
      const fechaInicioAjustada = fechaInicio || hoyStr;
      
      // Usar la fecha de hoy si no se especifica fechaFin
      const fechaFinAjustada = fechaFin || hoyStr;
      
      console.log('[DEBUG] ====== MANEJO DE FECHAS ======');
      console.log(`- Fecha/hora servidor: ${ahora.toISOString()}`);
      console.log(`- Fecha/hora El Salvador: ${ahoraElSalvador.toISOString()}`);
      console.log(`- Fecha actual El Salvador: ${hoyStr}`);
      console.log(`- Filtro inicio: ${fechaInicioAjustada} (${fechaInicio ? 'especificada' : 'hoy'})`);
      console.log(`- Filtro fin: ${fechaFinAjustada} (${fechaFin ? 'especificada' : 'hoy'})`);
      console.log('====================================');
      
      // Aplicar filtros de fecha
      if (fechaInicioAjustada || fechaFinAjustada) {
        const filtroFecha = {};
        
        if (fechaInicioAjustada) {
          const inicio = localElSalvadorToUTC(fechaInicioAjustada, true);
          filtroFecha.$gte = inicio;
          console.log(`[DEBUG] Filtro fecha inicio (El Salvador): ${fechaInicioAjustada} -> UTC: ${inicio.toISOString()}`);
        } else {
          // Si no se especifica fecha de inicio, usar hoy a medianoche
          const inicio = hoyElSalvador;
          filtroFecha.$gte = inicio;
          console.log(`[DEBUG] Fecha inicio no especificada, usando hoy: ${inicio.toISOString()}`);
        }
        
        if (fechaFinAjustada) {
          const fin = localElSalvadorToUTC(fechaFinAjustada, false);
          filtroFecha.$lte = fin;
          console.log(`[DEBUG] Filtro fecha fin (El Salvador): ${fechaFinAjustada} -> UTC: ${fin.toISOString()}`);
        } else {
          // Si no se especifica fecha de fin, usar mañana a medianoche (exclusivo)
          const fin = mananaElSalvador;
          filtroFecha.$lt = fin; // Usar $lt para no incluir la medianoche de mañana
          console.log(`[DEBUG] Fecha fin no especificada, usando mañana: ${fin.toISOString()}`);
        }
        
        // Crear un array de condiciones OR para los campos de fecha
        const condicionesFecha = [
          { 'fecha_contratacion': { ...filtroFecha } },
          { 'fechaContratacion': { ...filtroFecha } },
          { 'fecha': { ...filtroFecha } },
          { 'createdAt': { ...filtroFecha } },
          { 'fecha_creacion': { ...filtroFecha } },
          { 'fechaCreacion': { ...filtroFecha } },
          { 'fecha_lead': { ...filtroFecha } },
          { 'dia_venta': { ...filtroFecha } }
        ];
        
        console.log('[DEBUG] Condiciones de fecha a aplicar:', JSON.stringify(condicionesFecha, null, 2));
        
        // Si no hay condiciones OR previas, crear un nuevo array
        if (!filtro.$or) {
          filtro.$or = condicionesFecha;
        } else {
          // Si ya hay condiciones OR, combinarlas con AND
          filtro = { $and: [
            { $or: condicionesFecha },
            { $or: filtro.$or }
          ]};
        }
      }
      
      // Campos de fecha para búsqueda adicional (si es necesario)
      const camposFecha = [
        'fecha', 
        'createdAt', 
        'fecha_creacion', 
        'fechaCreacion', 
        'fecha_lead',
        'dia_venta',
        'fecha_venta',
        'fechaVenta',
        'fecha_contratacion',
        'fechaContratacion',
        'creadoEn',
        'fecha_registro',
        'fechaRegistro'
      ];
      const filtrosFecha = camposFecha.map(campo => ({
        [campo]: fechaFiltro
      }));
      
      // Combinar con filtros existentes
      if (Object.keys(filtro).length > 0) {
        filtro = {
          $and: [
            filtro,
            { $or: filtrosFecha }
          ]
        };
      } else {
        filtro = { $or: filtrosFecha };
      }
    }
    
    // Aplicar filtros de agente si existen
    if (allFilters.length > 0) {
      filtro = {
        ...filtro,
        $or: [...(filtro.$or || []), ...allFilters]
      };
    }
    
    console.error('[DEBUG] Filtro aplicado:', JSON.stringify(filtro, null, 2));
    console.error('[DEBUG] Usuario:', usuarioAutenticado?.username);
    console.error('[DEBUG] Rol:', rol);
    console.error('[DEBUG] Es Admin:', esAdmin);
    console.error('[DEBUG] Es Backoffice:', esBackoffice);
    console.error('[DEBUG] Filtros de agente aplicados:', allFilters.length > 0);
    
    // Ejecutar la consulta
    let customers = [];
    try {
      console.error('[DEBUG] Ejecutando consulta con filtro:', JSON.stringify(filtro, null, 2));
      customers = await collection.find(filtro).toArray();
      console.error(`[DEBUG] Se encontraron ${customers.length} registros`);
      
      // Procesar los resultados
      customers = customers.map(customer => {
        // Asegurar que todos los campos necesarios existan
        const defaultValues = {
          nombre_cliente: 'Sin nombre',
          telefono_principal: 'Sin teléfono',
          direccion: 'Sin dirección',
          tipo_servicios: 'Sin especificar',
          sistema: 'Sin especificar',
          mercado: 'Sin especificar',
          riesgo: 'Sin especificar',
          dia_venta: 'Sin especificar',
          dia_instalacion: 'Sin especificar',
          servicios: 'Sin servicios',
          supervisor: 'Sin supervisor',
          comentario: '',
          motivo_llamada: '',
          zip_code: '',
          telefono_alterno: '',
          autopago: 'No',
          cantidad_lineas: 1,
          pin_seguridad: '',
          numero_cuenta: ''
        };
        
        // Aplicar valores por defecto solo si el campo no existe
        Object.entries(defaultValues).forEach(([key, defaultValue]) => {
          if (customer[key] === undefined || customer[key] === null) {
            customer[key] = defaultValue;
          }
        });
        
        return customer;
      });
      
    } catch (error) {
      console.error('[ERROR] Error al ejecutar la consulta:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al consultar la base de datos',
        error: error.message
      });
    }
    
    // Si se solicitan datos para gráficas, formatear la salida
    if (paraGrafica === 'true') {
      console.log('[DEBUG] Procesando datos para gráfica...');
      
      const datosPorFecha = {};
      
      // Función para obtener la fecha en formato YYYY-MM-DD (Honduras UTC-6)
      const toHondurasDate = (fechaInput) => {
        try {
          let fecha;
          
          // Si no hay fecha de entrada, usar la fecha actual en Honduras
          if (!fechaInput) {
            console.log('[DEBUG] Usando fecha actual de Honduras');
            const ahora = new Date();
            // Ajustar a zona horaria de Honduras (UTC-6)
            const offsetHonduras = 6 * 60 * 60 * 1000; // 6 horas en milisegundos
            fecha = new Date(ahora.getTime() - offsetHonduras);
          } else {
            // Intentar crear fecha a partir del input
            fecha = new Date(fechaInput);
            
            // Si no es una fecha válida, intentar con formato YYYY-MM-DD
            if (isNaN(fecha.getTime())) {
              const partes = String(fechaInput).match(/^(\d{4})-(\d{2})-(\d{2})/);
              if (partes) {
                const [_, year, month, day] = partes;
                fecha = new Date(Date.UTC(year, month - 1, day, 6, 0, 0)); // 00:00 Honduras = 06:00 UTC
              }
            }
            
            // Si sigue sin ser válida, usar la fecha actual en Honduras
            if (isNaN(fecha.getTime())) {
              console.warn('[WARN] No se pudo parsear la fecha, usando actual:', fechaInput);
              const ahora = new Date();
              const offsetHonduras = 6 * 60 * 60 * 1000; // 6 horas en milisegundos
              fecha = new Date(ahora.getTime() - offsetHonduras);
            }
          }
          
          // Asegurarse de que la fecha esté en la zona horaria correcta
          const fechaHonduras = new Date(fecha.getTime() - (6 * 60 * 60 * 1000));
          
          // Obtener componentes de la fecha en formato local
          const year = fechaHonduras.getUTCFullYear();
          const month = String(fechaHonduras.getUTCMonth() + 1).padStart(2, '0');
          const day = String(fechaHonduras.getUTCDate()).padStart(2, '0');
          
          const fechaFormateada = `${year}-${month}-${day}`;
          console.log(`[DEBUG] toHondurasDate: ${fechaInput} -> ${fechaFormateada}`);
          return fechaFormateada;
        } catch (e) {
          console.error('[ERROR] Error al convertir fecha:', fechaInput, e);
          return 'error-fecha';
        }
      };
      
      // Procesar clientes para la gráfica
      customers.forEach(customer => {
        try {
          // Obtener la fecha del registro (probar diferentes campos de fecha)
          const posiblesCamposFecha = [
            'fecha_creacion', 'fecha', 'createdAt', 'updatedAt', 
            'fecha_venta', 'dia_venta', 'fechaContratacion', 'fecha_contratacion'
          ];
          
          // Buscar el primer campo de fecha válido
          let fechaHonduras = 'fecha-no-encontrada';
          
          for (const campo of posiblesCamposFecha) {
            if (customer[campo]) {
              const fechaConvertida = toHondurasDate(customer[campo]);
              if (fechaConvertida && !fechaConvertida.startsWith('error') && 
                  !fechaConvertida.startsWith('fecha-no')) {
                fechaHonduras = fechaConvertida;
                break;
              }
            }
          }
          
          // Si no se encontró fecha válida, usar la fecha actual de Honduras
          if (fechaHonduras === 'fecha-no-encontrada') {
            const ahora = new Date();
            const offsetHonduras = 6 * 60 * 60 * 1000;
            const ahoraHonduras = new Date(ahora.getTime() - offsetHonduras);
            const [fechaActual] = ahoraHonduras.toISOString().split('T');
            fechaHonduras = fechaActual;
            console.log(`[DEBUG] Usando fecha actual para cliente sin fecha: ${fechaHonduras}`);
          }
          
          // Inicializar el objeto para esta fecha si no existe
          if (!datosPorFecha[fechaHonduras]) {
            datosPorFecha[fechaHonduras] = {
              fecha: fechaHonduras,
              total: 0,
              icon: 0,
              bamo: 0,
              puntaje: 0,
              registros: 0 // Contador de registros por fecha para depuración
            };
          }
          
          // Incrementar contador de registros para esta fecha
          datosPorFecha[fechaHonduras].registros += 1;
          
          // Sumar al total
          datosPorFecha[fechaHonduras].total += 1;
          
          // Contar ICON/BAMO (insensible a mayúsculas/minúsculas)
          if (customer.mercado && typeof customer.mercado === 'string') {
            if (customer.mercado.toLowerCase() === 'icon') {
              datosPorFecha[fechaHonduras].icon += 1;
            } else if (customer.mercado.toLowerCase() === 'bamo') {
              datosPorFecha[fechaHonduras].bamo += 1;
            }
          }
          
          // Sumar puntaje (manejar diferentes formatos de puntaje)
          let puntaje = 0;
          if (typeof customer.puntaje === 'number') {
            puntaje = customer.puntaje;
          } else if (typeof customer.puntaje === 'string') {
            puntaje = parseFloat(customer.puntaje) || 0;
          }
          
          datosPorFecha[fechaHonduras].puntaje += puntaje;
          
        } catch (error) {
          console.error('[ERROR] Error procesando cliente:', error);
        }
      });
      
      // Convertir el objeto de fechas a un array para la respuesta
      const resultado = Object.values(datosPorFecha);
      
      // Ordenar por fecha (más reciente primero)
      resultado.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      
      return res.json({
        success: true,
        data: resultado,
        total: resultado.length
      });
    }
    
    // Si no es para gráfica, devolver los datos completos
    console.error(`[DEBUG] Devolviendo ${customers.length} registros al frontend`);
    console.error('[DEBUG] Primeros 2 registros:', JSON.stringify(customers.slice(0, 2), null, 2));
    return res.json({
      success: true,
      data: customers,
      total: customers.length
    });
    
  } catch (error) {
    console.error('[ERROR] Error en el endpoint /leads:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al procesar la solicitud',
      error: error.message 
    });
  }
});

// Ruta temporal para verificar todas las colecciones disponibles
router.get('/debug/collections', protect, withDatabase, async (req, res) => {
  console.error('\n===========================================');
  console.error('📊 VERIFICANDO COLECCIONES EN BD');
  console.error('===========================================');

  const db = req.db;

  try {
    const collections = await db.listCollections().toArray();
    console.error('[DEBUG] Colecciones disponibles:', collections.map(c => c.name));

    // Verificar específicamente la colección "costumers"
    const costumersCollection = collections.find(c => c.name === 'costumers');
    console.error('[DEBUG] Colección costumers encontrada:', !!costumersCollection);

    if (costumersCollection) {
      const collection = db.collection('costumers');
      const totalRegistros = await collection.countDocuments();
      const primeros3 = await collection.find().limit(3).toArray();

      console.error(`[DEBUG] Total de registros en costumers: ${totalRegistros}`);
      console.error('[DEBUG] Ejemplo de registros:', JSON.stringify(primeros3, null, 2));

      return res.json({
        success: true,
        message: 'Información de colecciones',
        collections: collections.map(c => c.name),
        costumersInfo: {
          exists: true,
          count: totalRegistros,
          sample: primeros3
        }
      });
    } else {
      return res.json({
        success: true,
        message: 'Colección costumers no encontrada',
        collections: collections.map(c => c.name),
        costumersInfo: {
          exists: false,
          count: 0,
          sample: []
        }
      });
    }

  } catch (error) {
    console.error('[ERROR] Error verificando colecciones:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar colecciones',
      error: error.message
    });
  }
});

// Ruta GET para obtener un lead específico por ID
router.get('/leads/:id', protect, withDatabase, async (req, res) => {
  console.log('\n===========================================');
  console.log('🔍 ENDPOINT GET /api/leads/:id EJECUTÁNDOSE');
  console.log('===========================================');
  
  const db = req.db;
  const leadId = req.params.id;
  const usuarioAutenticado = req.user || null;

  try {
    // Validar que tenemos una base de datos
    if (!db) {
      return res.status(503).json({
        success: false,
        message: 'Base de datos no disponible'
      });
    }

    // Validar ID
    if (!leadId || !ObjectId.isValid(leadId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de registro inválido'
      });
    }

    console.log('[GET /leads/:id] ID del lead:', leadId);
    console.log('[GET /leads/:id] Usuario:', usuarioAutenticado?.username || 'Desconocido');

    // Obtener la colección
    const collection = db.collection('costumers');

    // Buscar el registro
    const registro = await collection.findOne({ _id: new ObjectId(leadId) });
    
    if (!registro) {
      return res.status(404).json({
        success: false,
        message: 'Registro no encontrado'
      });
    }

    console.log('[GET /leads/:id] ✅ Registro encontrado');

    return res.status(200).json({
      success: true,
      data: registro
    });

  } catch (error) {
    console.error('[ERROR GET /leads/:id]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al obtener el registro',
      error: error.message
    });
  }
});

// Ruta PUT para actualizar un lead por ID
router.put('/leads/:id', protect, withDatabase, async (req, res) => {
  console.log('\n===========================================');
  console.log('📝 ENDPOINT PUT /api/leads/:id EJECUTÁNDOSE');
  console.log('===========================================');
  
  const db = req.db;
  const leadId = req.params.id;
  const datosActualizados = req.body;
  const usuarioAutenticado = req.user || null;

  try {
    // Validar que tenemos una base de datos
    if (!db) {
      return res.status(503).json({
        success: false,
        message: 'Base de datos no disponible'
      });
    }

    // Validar ID
    if (!leadId || !ObjectId.isValid(leadId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de registro inválido'
      });
    }

    console.log('[PUT /leads/:id] ID del lead:', leadId);
    console.log('[PUT /leads/:id] Usuario:', usuarioAutenticado?.username || 'Desconocido');
    console.log('[PUT /leads/:id] Datos a actualizar:', datosActualizados);

    // Obtener la colección
    const collection = db.collection('costumers');

    // Verificar que el registro existe
    const registroExistente = await collection.findOne({ _id: new ObjectId(leadId) });
    
    if (!registroExistente) {
      return res.status(404).json({
        success: false,
        message: 'Registro no encontrado'
      });
    }

    // Verificar permisos: solo admin, backoffice y supervisor pueden editar
    const userRole = (usuarioAutenticado?.role || '').toLowerCase();
    const rolesPermitidos = ['admin', 'administrador', 'backoffice', 'supervisor'];
    
    if (!rolesPermitidos.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para editar registros'
      });
    }

    // Preparar los datos para actualizar (solo campos permitidos)
    const camposPermitidos = {
      nombre_cliente: datosActualizados.nombre_cliente,
      telefono_principal: datosActualizados.telefono_principal,
      telefono_alterno: datosActualizados.telefono_alterno,
      numero_cuenta: datosActualizados.numero_cuenta,
      autopago: datosActualizados.autopago,
      direccion: datosActualizados.direccion,
      tipo_servicios: datosActualizados.tipo_servicios,
      sistema: datosActualizados.sistema,
      riesgo: datosActualizados.riesgo,
      dia_venta: datosActualizados.dia_venta,
      dia_instalacion: datosActualizados.dia_instalacion,
      status: datosActualizados.status,
      mercado: datosActualizados.mercado,
      supervisor: datosActualizados.supervisor,
      comentario: datosActualizados.comentario,
      motivo_llamada: datosActualizados.motivo_llamada,
      zip_code: datosActualizados.zip_code,
      puntaje: datosActualizados.puntaje
    };

    // Agregar metadatos de actualización
    camposPermitidos.actualizadoEn = new Date();
    camposPermitidos.actualizadoPor = usuarioAutenticado?.username || usuarioAutenticado?.id || 'Sistema';

    // Actualizar el registro
    const resultado = await collection.updateOne(
      { _id: new ObjectId(leadId) },
      { $set: camposPermitidos }
    );

    if (resultado.modifiedCount === 0) {
      console.warn('[PUT /leads/:id] No se modificó ningún registro');
      return res.status(200).json({
        success: true,
        message: 'No hubo cambios en el registro',
        data: registroExistente
      });
    }

    // Obtener el registro actualizado
    const registroActualizado = await collection.findOne({ _id: new ObjectId(leadId) });

    console.log('[PUT /leads/:id] ✅ Registro actualizado exitosamente');

    return res.status(200).json({
      success: true,
      message: 'Registro actualizado exitosamente',
      data: registroActualizado
    });

  } catch (error) {
    console.error('[ERROR PUT /leads/:id]', error);
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el registro',
      error: error.message
    });
  }
});

module.exports = router;
