/**
 * @file script.js
 * @description Lógica central para la página de clientes (Costumer.html).
 * Se encarga de cargar datos, renderizar la tabla, actualizar tarjetas y manejar interacciones.
 */

// --- INICIALIZACIÓN ---

document.addEventListener("DOMContentLoaded", () => {
  console.log("[DEBUG] DOM completamente cargado, inicializando página...");
  initializeCustomerPage();
});

/**
 * Orquesta la inicialización de la página de clientes.
 */
function initializeCustomerPage() {
  console.log("[DEBUG] Inicializando página...");
  setupEventListeners();
  
  // Detectar si el usuario es de Team Líneas
  detectUserProfile().then(userProfile => {
    if (userProfile && userProfile.isTeamLineas) {
      console.log("[DEBUG] Usuario Team Líneas detectado, activando vista especializada");
      window.costumerViewMode = 'teamlineas';
      window.currentTeamFilter = 'TEAM LINEAS'; // Filtrar solo Team Líneas
    } else {
      // Vista normal para otros usuarios
      window.costumerViewMode = 'normal';
      window.currentTeamFilter = 'todos';
    }
    
    try { sessionStorage.removeItem('costumerViewMode'); } catch {}
    cargarDatosDesdeServidor();
  });
}

// --- DEFINICIÓN DINÁMICA DE COLUMNAS ---
function getColumnsForMode(mode) {
    // Vista NORMAL: sin Team Líneas y sin columna 'CANTIDAD DE LÍNEAS'
    const commonNormal = [
        { key: 'nombre_cliente', title: 'NOMBRE CLIENTE' },
        { key: 'telefono_principal', title: 'TELÉFONO PRINCIPAL' },
        { key: 'telefono_alterno', title: 'TELÉFONO ALTERNO' },
        // cantidad_lineas se oculta en modo normal
        { key: 'autopago', title: 'AUTOPAGO' },
        { key: 'direccion', title: 'DIRECCIÓN' },
        { key: 'tipo_servicios', title: 'TIPO DE SERVICIOS' },
        { key: 'sistema', title: 'SISTEMA' },
        { key: 'riesgo', title: 'RIESGO' },
        { key: 'dia_venta', title: 'DÍA DE VENTA' },
        { key: 'dia_instalacion', title: 'DÍA DE INSTALACIÓN' },
        { key: 'status', title: 'STATUS', render: (c) => c.status },
        { key: 'servicios', title: 'SERVICIOS' },
        { key: 'mercado', title: 'MERCADO' },
        { key: 'supervisor', title: 'SUPERVISOR' },
        { key: 'comentario', title: 'COMENTARIO' },
        { key: 'motivo_llamada', title: 'MOTIVO LLAMADA' },
        { key: 'zip_code', title: 'ZIP CODE' },
        { key: 'puntaje', title: 'PUNTAJE' },
        { title: 'ACCIONES', render: (c) => `
          <button class="action-btn" onclick="gestionarComentarios('${c._id}')"><i class="fas fa-comment"></i> Ver</button>
          <button class="action-btn" onclick="verAcciones('${c._id}')"><i class="fas fa-ellipsis-h"></i></button>
        `}
    ];

    if (mode === 'teamlineas') {
        // Vista TEAM LÍNEAS: incluir 'CANTIDAD DE LÍNEAS' y columnas sensibles
        const teamOnlySensitive = [
            { key: 'pin_seguridad', title: 'PIN DE SEGURIDAD' },
            { key: 'numero_cuenta', title: 'NÚMERO DE CUENTA' },
        ];
        const withCantidad = [];
        for (const col of commonNormal) {
            // Insertar 'CANTIDAD DE LÍNEAS' justo después de TELÉFONO ALTERNO
            if (col.key === 'telefono_alterno') {
                withCantidad.push(col);
                withCantidad.push({ key: 'cantidad_lineas', title: 'CANTIDAD DE LÍNEAS' });
                // luego columnas sensibles propias de Team Líneas
                withCantidad.push(...teamOnlySensitive);
                continue;
            }
            withCantidad.push(col);
        }
        return withCantidad;
    }
    return commonNormal;
}

// --- MANEJO DE EVENTOS ---

/**
 * Configura todos los listeners de eventos para los controles de la UI.
 */
function setupEventListeners() {
  const searchInput = document.getElementById('costumer-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => filterTable(e.target.value));
  }

  const refreshButton = document.getElementById('refresh-table');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
        console.log("[DEBUG] Botón de refrescar presionado.");
        cargarDatosDesdeServidor();
    });
  }

  // Alternar entre vista normal y Team Líneas
  const toggleForce = document.getElementById('toggle-forceall');
  if (toggleForce) {
    // Para usuarios Team Líneas, mostrar botón para alternar vista
    if (window.costumerViewMode === 'teamlineas') {
      toggleForce.style.display = 'inline-block';
      toggleForce.title = 'Alternar vista Team Líneas';
      toggleForce.addEventListener('click', toggleTeamLineasView);
    } else {
      // Para otros usuarios, ocultar
      toggleForce.style.display = 'none';
      toggleForce.disabled = true;
    }
  }
}

// --- LÓGICA DE DATOS Y API ---

/**
 * Carga los datos de los clientes desde el endpoint /api/customers.
 * Maneja la autenticación y los errores de red.
 */
async function cargarDatosDesdeServidor() {
  console.log('[API] Solicitando datos de clientes...');
  const tbody = document.getElementById('costumer-tbody');
  if (tbody) {
      tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;padding:2em;">Cargando datos...</td></tr>`;
  }

  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');

    // Configurar headers con el token de autenticación
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // Siempre enviar el token en el header
    };

    // Evitar caché y diagnosticar respuestas
    // Backend principal (Mongo) corre en 10000; evitar usar location.origin si apunta a otro server (p.ej. 3000)
    const API_BASE = (window.API_BASE || 'http://localhost:10000').replace(/\/$/, '');
    // Obtener la fecha actual en la zona horaria de Honduras (UTC-6)
    // 1. Crear fecha actual en la zona local
    const hoy = new Date();
    
    // 2. Obtener la fecha en formato YYYY-MM-DD en la zona horaria local
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    const fechaFormateada = `${year}-${month}-${day}`;
    
    // 3. Crear objeto Date para Honduras (UTC-6)
    const hoyHonduras = new Date(fechaFormateada + 'T00:00:00-06:00');
    
    // 4. Para depuración
    console.log('[DEBUG] Fechas generadas:', {
      fechaLocal: hoy.toString(),
      fechaHonduras: hoyHonduras.toString(),
      fechaUTC: hoy.toISOString(),
      fechaFormateada: fechaFormateada,
      zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    
    console.log(`[DEBUG] Fecha formateada para la consulta: ${fechaFormateada}`);
    
    // Filtrar por la fecha de hoy en Honduras
    let url = `${API_BASE}/api/leads?fecha=${fechaFormateada}&limit=1000`;
    console.log('[INFO] Fetching leads from:', url);
    let response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers,
      cache: 'no-store'
    });
    
    // Si el servidor responde 304 (caché), reintentar con cache-busting
    if (response.status === 304) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}_=${Date.now()}`;
      response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers,
        cache: 'no-store'
      });
    }
    
    // Verificar si la respuesta es exitosa
    if (!response.ok) {
      if (response.status === 401) {
        console.error('Error 401: No autorizado. Redirigiendo al login.');
        window.location.href = '/login.html';
      } else {
        const errorText = await response.text();
        console.error('Error en la respuesta del servidor:', response.status, errorText);
        throw new Error(`Error del servidor: ${response.status} - ${errorText}`);
      }
    }
    
    // Parsear la respuesta JSON
    const responseData = await response.json();
    console.log('Datos recibidos de la API:', responseData);
    
    let leads = [];
    
    // Verificar el formato de la respuesta y extraer los datos
    if (responseData.success && Array.isArray(responseData.data)) {
      // Formato: {success: true, data: [...]}
      console.log('[DEBUG] Formato de respuesta: {success, data}');
      leads = responseData.data;
    } else if (Array.isArray(responseData)) {
      // Formato: [...] (array directo)
      console.warn('[DEBUG] La API devolvió un array directamente');
      leads = responseData;
    } else if (responseData && Array.isArray(responseData.data)) {
      // Formato: {data: [...]}
      console.log('[DEBUG] Formato de respuesta: {data: [...]}');
      leads = responseData.data;
    } else {
      console.error('Formato de respuesta inesperado:', responseData);
      throw new Error('Formato de respuesta inesperado de la API');
    }
    
    console.log(`[DEBUG] Se encontraron ${leads.length} leads`);
    
    // Normalizar los datos antes de mostrarlos
    const normalizedLeads = leads.map(lead => {
      try {
        return normalizeLeadData(lead);
      } catch (e) {
        console.error('Error normalizando lead:', lead, e);
        return lead;
      }
    });
    
    // Guardar en variables globales para uso posterior
    window.leadsData = normalizedLeads;
    window.allLeads = normalizedLeads;
    
    // Actualizar la interfaz de usuario
    renderCostumerTable(normalizedLeads);
    updateSummaryCards(normalizedLeads);
    generateTeamFilters(normalizedLeads);
    
    console.log(`[DEBUG] Leads extraídos: ${leads.length} registros`);
    if (leads.length > 0) {
      console.log('[DEBUG] Primer lead extraído:', JSON.stringify(leads[0], null, 2));
      console.log('[DEBUG] Primer lead normalizado:', normalizedLeads[0]);
    }
    
    console.log(`[API] Datos recibidos: ${leads.length} clientes.`);

  } catch (error) {
    console.error('Error fatal al cargar datos:', error);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;padding:2em;color:red;">Error al cargar los datos. Verifique la consola.</td></tr>`;
    }
  }
}

// --- FILTROS POR EQUIPOS ---

/**
 * Genera los filtros por equipos basados en los datos cargados
 */
function generateTeamFilters(leads) {
  const container = document.getElementById('team-filters');
  if (!container) return;

  // Contar leads por equipo
  const teamCounts = {};
  teamCounts['todos'] = leads.length;

  leads.forEach(lead => {
    const teamName = getTeamName(lead);
    teamCounts[teamName] = (teamCounts[teamName] || 0) + 1;
  });

  // Generar HTML de filtros
  const filtersHtml = Object.entries(teamCounts)
    .map(([team, count]) => {
      const isActive = team === window.currentTeamFilter;
      const displayName = team === 'todos' ? 'Todos' : team.toUpperCase();
      return `
        <button class="team-filter-btn ${isActive ? 'active' : ''}" 
                data-team="${team}">
          ${displayName} (${count})
        </button>
      `;
    })
    .join('');

  container.innerHTML = filtersHtml;

  // Agregar event listeners
  container.querySelectorAll('.team-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTeam = e.target.dataset.team;
      
      // Actualizar filtro activo
      window.currentTeamFilter = selectedTeam;
      
      // Actualizar UI de botones
      container.querySelectorAll('.team-filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Aplicar filtro
      applyCurrentView();
    });
  });
}

/**
 * Obtiene el nombre del equipo de un lead
 */
function getTeamName(lead) {
  const supervisor = (lead.supervisor || lead.team || lead.equipo || '').toString().trim();
  const agente = (lead.agente || lead.agenteNombre || '').toString().trim();
  
  // Mapeo de supervisores a nombres de equipos
  const supervisorMap = {
    'IRANA': 'TEAM IRANA',
    'BRYAN FLETEZ': 'TEAM BRYAN FLETEZ', 
    'MARISOL BELTRAN': 'TEAM MARISOL BELTRAN',
    'ROBERTO VELASQUEZ': 'TEAM ROBERTO VELASQUEZ',
    'RANDAL MARTINEZ': 'TEAM RANDAL MARTINEZ'
  };
  
  // Buscar por supervisor
  for (const [key, teamName] of Object.entries(supervisorMap)) {
    if (supervisor.toUpperCase().includes(key)) {
      return teamName;
    }
  }
  
  // Team Líneas (casos especiales)
  if (supervisor.toUpperCase().includes('LINEAS') || 
      agente.toLowerCase().includes('lineas') ||
      supervisor.toUpperCase().includes('FIGUEROA')) {
    if (supervisor.includes('1')) return 'TEAM LINEAS 1';
    if (supervisor.includes('2')) return 'TEAM LINEAS 2';
    return 'TEAM LINEAS';
  }
  
  // Fallback: usar supervisor tal como viene
  return supervisor || 'SIN EQUIPO';
}

// --- DETECCIÓN DE PERFIL DE USUARIO ---

/**
 * Detecta el perfil del usuario actual para determinar qué vista mostrar
 */
async function detectUserProfile() {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token || token === 'temp-token-dev') {
      return { isTeamLineas: false, role: 'guest' };
    }

    // Decodificar token para obtener información del usuario
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userRole = (payload.role || '').toLowerCase();
    const userName = (payload.username || payload.name || '').toLowerCase();
    const userTeam = (payload.team || payload.equipo || '').toLowerCase();

    // Determinar si es usuario de Team Líneas
    const isTeamLineas = 
      userRole === 'team_lineas' ||
      userRole === 'lineas' ||
      userName.includes('lineas') ||
      userTeam.includes('lineas') ||
      userTeam.includes('figueroa');

    console.log(`[DEBUG] Perfil detectado - Role: ${userRole}, Team: ${userTeam}, IsTeamLineas: ${isTeamLineas}`);

    return {
      isTeamLineas,
      role: userRole,
      username: userName,
      team: userTeam
    };
  } catch (error) {
    console.warn('[DEBUG] Error detectando perfil de usuario:', error);
    return { isTeamLineas: false, role: 'unknown' };
  }
}

/**
 * Alterna la vista para usuarios de Team Líneas
 */
function toggleTeamLineasView() {
  const isCurrentlyTeamLineas = window.costumerViewMode === 'teamlineas';
  
  if (isCurrentlyTeamLineas) {
    // Cambiar a vista normal pero mantener filtro Team Líneas
    window.costumerViewMode = 'normal';
    window.currentTeamFilter = 'TEAM LINEAS';
    console.log('[DEBUG] Cambiando a vista normal (sin columnas sensibles)');
  } else {
    // Cambiar a vista Team Líneas completa
    window.costumerViewMode = 'teamlineas';
    window.currentTeamFilter = 'TEAM LINEAS';
    console.log('[DEBUG] Cambiando a vista Team Líneas (con columnas sensibles)');
  }
  
  // Actualizar icono del botón
  const toggleBtn = document.getElementById('toggle-forceall');
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    if (icon) {
      icon.className = window.costumerViewMode === 'teamlineas' 
        ? 'fas fa-eye-slash' 
        : 'fas fa-eye';
    }
    toggleBtn.title = window.costumerViewMode === 'teamlineas'
      ? 'Ocultar campos sensibles'
      : 'Mostrar campos sensibles';
  }
  
  // Re-renderizar con la nueva vista
  applyCurrentView();
}

// --- RENDERIZADO Y ACTUALIZACIÓN DE UI ---

/**
 * Actualiza las tarjetas de resumen con estadísticas de los leads.
 * @param {Array} leads - El array de clientes.
 */
function updateSummaryCards(leads = []) {
    // Obtener fecha actual en formato YYYY-MM-DD (zona horaria local)
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthStr = todayStr.substring(0, 7); // YYYY-MM
    
    console.log('[DEBUG] Fecha de hoy (local):', todayStr);
    console.log('[DEBUG] Mes actual (local):', monthStr);

    const getStatus = (lead) => String(lead.status || '').toLowerCase();

    // Normalizador de fecha robusto -> YYYY-MM-DD
    const toYMD = (value) => {
        try {
            if (!value) return '';
            
            // Si ya está en formato YYYY-MM-DD, retornar directamente
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
            
            // Manejar diferentes formatos de fecha
            let date;
            
            // Formato DD/MM/YYYY o D/M/YYYY
            if (value.includes('/')) {
                const [day, month, year] = value.split('/').map(Number);
                date = new Date(year, month - 1, day);
            } 
            // Formato MM/DD/YYYY (común en inglés)
            else if (value.includes('-')) {
                const parts = value.split('-');
                if (parts[0].length === 4) { // YYYY-MM-DD
                    date = new Date(value);
                } else { // MM-DD-YYYY
                    date = new Date(parts[2], parts[0] - 1, parts[1]);
                }
            }
            // Otros formatos (incluyendo timestamps)
            else {
                date = new Date(value);
            }
            
            // Validar que la fecha sea válida
            if (isNaN(date.getTime())) return '';
            
            // Formatear a YYYY-MM-DD
            const pad = n => n.toString().padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        } catch (e) {
            console.warn('Error al formatear fecha:', value, e);
            return '';
        }
    };

    // Función para normalizar fecha a YYYY-MM-DD
    const normalizeDate = (dateStr) => {
        if (!dateStr) return '';
        try {
            // Si ya es un objeto Date, convertirlo a string
            if (dateStr instanceof Date) {
                if (isNaN(dateStr.getTime())) return '';
                const pad = n => n.toString().padStart(2, '0');
                return `${dateStr.getFullYear()}-${pad(dateStr.getMonth() + 1)}-${pad(dateStr.getDate())}`;
            }
            
            // Si ya está en formato YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                // Validar que sea una fecha válida
                const [year, month, day] = dateStr.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                if (date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day) {
                    return dateStr;
                }
            }
            
            // Si es una fecha ISO (ej: 2023-09-12T12:00:00.000Z)
            if (dateStr.includes('T')) {
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    const pad = n => n.toString().padStart(2, '0');
                    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
                }
                return '';
            }
            
            // Intentar con el constructor de Date
            let date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const pad = n => n.toString().padStart(2, '0');
                return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
            }
            
            // Intentar con formato DD/MM/YYYY o MM/DD/YYYY
            const parts = dateStr.split(/[\/\s-]+/);
            if (parts.length === 3) {
                let day, month, year;
                
                // Si el primer número es mayor a 12, asumir DD/MM/YYYY
                if (parseInt(parts[0]) > 12) {
                    [day, month, year] = parts.map(Number);
                } else {
                    // Si no, asumir MM/DD/YYYY
                    [month, day, year] = parts.map(Number);
                }
                
                // Asegurar año de 4 dígitos
                if (year < 100) {
                    year = 2000 + year; // Asumir siglo 21 para años de 2 dígitos
                }
                
                // Validar y formatear
                date = new Date(Date.UTC(year, month - 1, day));
                if (!isNaN(date.getTime())) {
                    const pad = n => n.toString().padStart(2, '0');
                    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
                }
            }
            
            console.warn('No se pudo normalizar la fecha:', dateStr);
            return '';
            
        } catch (e) {
            console.warn('Error normalizando fecha:', dateStr, e);
            return '';
        }
    };

    // Función para verificar si una fecha es hoy
    const esFechaHoy = (fecha) => {
        if (!fecha) return false;
        
        try {
            const fechaObj = new Date(fecha);
            if (isNaN(fechaObj.getTime())) return false;
            
            const hoy = new Date();
            return fechaObj.getFullYear() === hoy.getFullYear() &&
                   fechaObj.getMonth() === hoy.getMonth() &&
                   fechaObj.getDate() === hoy.getDate();
        } catch (e) {
            console.warn('Error comparando fechas:', e);
            return false;
        }
    };

    // Contar ventas de hoy
    const ventasHoy = leads.filter(lead => {
        // Intentar con múltiples campos de fecha
        const camposFecha = [
            { campo: 'dia_venta', valor: lead.dia_venta },
            { campo: 'fecha_venta', valor: lead.fecha_venta },
            { campo: 'fecha_contratacion', valor: lead.fecha_contratacion },
            { campo: 'creadoEn', valor: lead.creadoEn },
            { campo: 'fecha_creacion', valor: lead.fecha_creacion },
            { campo: 'fecha', valor: lead.fecha }
        ];
        
        // Verificar cada campo de fecha
        for (const {campo, valor} of camposFecha) {
            if (!valor) continue;
            
            try {
                // Intentar convertir el valor a fecha
                const fecha = new Date(valor);
                if (isNaN(fecha.getTime())) continue;
                
                // Verificar si es hoy
                if (esFechaHoy(fecha)) {
                    console.log(`[VENTA HOY] ${lead.nombre_cliente} - Campo: ${campo}, Valor: ${valor}`);
                    return true;
                } else {
                    console.log(`[FECHA NO HOY] ${lead.nombre_cliente} - Campo: ${campo}, Valor: ${valor} (Hoy: ${todayStr})`);
                }
            } catch (e) {
                console.warn(`Error procesando fecha en campo ${campo}:`, valor, e);
            }
        }
        
        return false;
    }).length;
    
    // Contar ventas del mes actual
    const ventasMes = leads.filter(lead => {
        const fechaVenta = lead.dia_venta || lead.fecha_venta || lead.fecha_contratacion || lead.creadoEn || lead.fecha_creacion;
        if (!fechaVenta) return false;
        
        const fechaNormalizada = normalizeDate(fechaVenta);
        if (!fechaNormalizada) return false;
        
        // Para depuración
        if (fechaNormalizada.startsWith(monthStr)) {
            console.log(`[VENTA MES] ${lead.nombre_cliente} - Fecha: ${fechaVenta} (${fechaNormalizada})`);
        }
        
        return fechaNormalizada.startsWith(monthStr);
    }).length;
    const pendientes = leads.filter(l => getStatus(l) === 'pendiente' || getStatus(l) === 'pending').length;
    const cancelados = leads.filter(l => getStatus(l) === 'cancelado' || getStatus(l) === 'cancelled').length;

    document.getElementById('costumer-ventas-hoy').textContent = ventasHoy;
    document.getElementById('costumer-ventas-mes').textContent = ventasMes;
    document.getElementById('costumer-pendientes').textContent = pendientes;
    document.getElementById('costumer-cancelados').textContent = cancelados;
    console.log("[UI] Tarjetas de resumen actualizadas.");
}

/**
 * Renderiza la tabla de clientes con los datos proporcionados.
 * @param {Array} leads - El array de clientes a renderizar.
 */
/**
 * Parsea una fecha desde diferentes formatos y ajusta la zona horaria
 * @param {string|Date} dateStr - La fecha a parsear (puede ser string o objeto Date)
 * @returns {Date} - Objeto Date ajustado a la zona horaria local
 */
function parseDate(dateStr) {
    if (!dateStr) return new Date(0); // Fecha muy antigua si no hay fecha
    
    let date;
    
    // Si ya es un objeto Date, usarlo directamente
    if (dateStr instanceof Date) {
        date = new Date(dateStr);
    } 
    // Si es string con formato DD/MM/YYYY
    else if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/').map(Number);
        date = new Date(year, month - 1, day);
    }
    // Para otros formatos (ISO, etc.)
    else {
        date = new Date(dateStr);
    }
    
    // Si la fecha no es válida, devolver fecha antigua
    if (isNaN(date.getTime())) {
        console.warn('[ADVERTENCIA] No se pudo parsear la fecha:', dateStr);
        return new Date(0);
    }
    
    // Ajustar por zona horaria (UTC-6 para Honduras)
    const offset = date.getTimezoneOffset() + 360; // 6 horas * 60 minutos
    date = new Date(date.getTime() + (offset * 60 * 1000));
    
    return date;
}

function renderCostumerTable(leads = []) {
    console.log(`[UI] Renderizando tabla con ${leads.length} clientes.`);
    const table = document.querySelector('table.costumer-table');
    const thead = table ? table.querySelector('thead') : null;
    const tbody = document.getElementById('costumer-tbody');
    if (!table || !thead || !tbody) {
        console.error("Error crítico: No se encontró la tabla o sus secciones (thead/tbody)");
        return;
    }
    
    // Función mejorada para obtener la fecha de un lead con soporte para zona horaria de Honduras (UTC-6)
    const getLeadDate = (lead) => {
        try {
            // Priorizar siempre el campo dia_venta
            if (lead.dia_venta) {
                // Si es una fecha ISO (viene del servidor)
                if (lead.dia_venta instanceof Date) {
                    return new Date(lead.dia_venta);
                }
                
                // Si es un string con formato YYYY-MM-DD
                if (typeof lead.dia_venta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lead.dia_venta)) {
                    const [year, month, day] = lead.dia_venta.split('-').map(Number);
                    // Crear fecha en UTC-6 (Honduras)
                    return new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
                }
                
                // Si es un string con formato DD/MM/YYYY
                if (typeof lead.dia_venta === 'string' && lead.dia_venta.includes('/')) {
                    const [day, month, year] = lead.dia_venta.split('/').map(Number);
                    // Asegurar año de 4 dígitos
                    const fullYear = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
                    // Crear fecha en UTC-6 (Honduras)
                    return new Date(Date.UTC(fullYear, month - 1, day, 6, 0, 0));
                }
                
                // Si es una fecha ISO
                if (typeof lead.dia_venta === 'string' && lead.dia_venta.includes('T')) {
                    return new Date(lead.dia_venta);
                }
            }
            
            // Si no hay dia_venta o hubo un error, intentar con otros campos
            const dateStr = lead.fecha_venta || lead.fecha_contratacion || 
                           lead.creadoEn || lead.fecha_creacion || lead.createdAt || lead.fecha;
            
            if (!dateStr) {
                console.log('[DEBUG] Lead sin fecha:', { id: lead._id, nombre: lead.nombre_cliente });
                return new Date(0); // Fecha antigua para ordenar al final
            }
            
            // Si es una fecha ISO (viene del servidor)
            if (dateStr instanceof Date) {
                return new Date(dateStr);
            }
            
            if (typeof dateStr === 'string') {
                // Intentar con formato ISO
                if (dateStr.includes('T')) {
                    return new Date(dateStr);
                }
                
                // Intentar con formato DD/MM/YYYY o MM/DD/YYYY
                const dateParts = dateStr.split(/[\/\s-]+/);
                if (dateParts.length === 3) {
                    // Asumir formato DD/MM/YYYY
                    const day = parseInt(dateParts[0], 10);
                    const month = parseInt(dateParts[1], 10) - 1; // Los meses en JS van de 0-11
                    const year = parseInt(dateParts[2], 10);
                    
                    // Ajustar para años de dos dígitos
                    const fullYear = year < 100 ? (year < 80 ? 2000 + year : 1900 + year) : year;
                    
                    // Crear fecha en UTC-6 (Honduras)
                    return new Date(Date.UTC(fullYear, month, day, 6, 0, 0));
                }
            }
            
            // Si no se pudo parsear, devolver fecha actual en Honduras
            const ahora = new Date();
            const ahoraHonduras = new Date(ahora.getTime() + (ahora.getTimezoneOffset() * 60000) + (-6 * 60 * 60000));
            return ahoraHonduras;
            
        } catch (e) {
            console.error('Error al procesar fecha del lead:', e, lead);
            // En caso de error, devolver fecha actual en Honduras
            const ahora = new Date();
            const ahoraHonduras = new Date(ahora.getTime() + (ahora.getTimezoneOffset() * 60000) + (-6 * 60 * 60000));
            return ahoraHonduras;
        }
    };
    
    // Ordenar los leads por fecha (más recientes primero)
    const sortedLeads = [...leads].sort((a, b) => {
        const dateA = getLeadDate(a);
        const dateB = getLeadDate(b);
        return dateB - dateA; // Orden descendente (más recientes primero)
    });
    
    // Log detallado de fechas para depuración
    console.log('=== RESUMEN DE FECHAS DE LEADS ===');
    console.log(`Total de leads: ${leads.length}`);
    
    // Contar leads por fecha
    const leadsPorFecha = {};
    sortedLeads.forEach(lead => {
        const fecha = getLeadDate(lead);
        const fechaStr = fecha.toISOString().split('T')[0];
        if (!leadsPorFecha[fechaStr]) {
            leadsPorFecha[fechaStr] = 0;
        }
        leadsPorFecha[fechaStr]++;
    });
    
    console.log('Leads por fecha:', leadsPorFecha);
    
    // Mostrar los primeros 10 leads para depuración
    console.log('=== PRIMEROS 10 LEADS ===');
    sortedLeads.slice(0, 10).forEach((lead, index) => {
        console.log(`[${index + 1}]`, {
            id: lead._id,
            nombre: lead.nombre_cliente,
            telefono: lead.telefono_principal,
            fecha_cruda: lead.dia_venta || lead.fecha_venta || lead.fecha_contratacion || lead.creadoEn || lead.fecha_creacion || lead.createdAt,
            fecha_parseada: getLeadDate(lead).toISOString(),
            estado: lead.status || 'sin_estado'
        });
    });

    // 1) Definir columnas según el modo
    const mode = (window.costumerViewMode || 'normal');
    const columns = getColumnsForMode(mode);

    // 2) Renderizar encabezados
    const headHtml = `<tr>${columns.map(c => `<th>${c.title}</th>`).join('')}</tr>`;
    thead.innerHTML = headHtml;

    // 3) Renderizar filas
    tbody.innerHTML = '';
    if (sortedLeads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;padding:2em;">No hay clientes para mostrar.</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    sortedLeads.forEach((lead, index) => {
        try {
            const row = document.createElement('tr');
            // Asegurarse de que el lead esté normalizado
            const cleanLead = lead._normalized ? lead : normalizeLeadData(lead);
            
            // Función para formatear fechas en formato DD/MM/YYYY
            const formatDate = (date) => {
                if (!date) return '';
                
                // Función para verificar si una fecha es hoy en Honduras (UTC-6)
                const esHoy = (fecha) => {
                    const hoy = new Date();
                    const ahoraHonduras = new Date(hoy.getTime() + (hoy.getTimezoneOffset() * 60000) + (-6 * 60 * 60000));
                    
                    return fecha.getUTCDate() === ahoraHonduras.getUTCDate() &&
                           fecha.getUTCMonth() === ahoraHonduras.getUTCMonth() &&
                           fecha.getUTCFullYear() === ahoraHonduras.getUTCFullYear();
                };
                
                // Si es un string con formato YYYY-MM-DD
                if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    const [year, month, day] = date.split('-').map(Number);
                    // Crear fecha en UTC-6 (Honduras)
                    const fecha = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
                    
                    if (esHoy(fecha)) {
                        return 'Hoy';
                    }
                    
                    // Devolver en formato DD/MM/YYYY
                    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                }
                
                // Si es un string con formato DD/MM/YYYY
                if (typeof date === 'string' && date.includes('/')) {
                    const parts = date.split('/');
                    if (parts.length === 3) {
                        let [day, month, year] = parts.map(Number);
                        // Ajustar año de 2 a 4 dígitos
                        year = year < 100 ? (year < 50 ? 2000 + year : 1900 + year) : year;
                        // Crear fecha en UTC-6 (Honduras)
                        const fecha = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
                        
                        if (esHoy(fecha)) {
                            return 'Hoy';
                        }
                        
                        // Devolver en formato DD/MM/YYYY
                        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                    }
                }
                
                // Para fechas ISO o timestamps
                try {
                    let d;
                    
                    // Si es un string, crear la fecha
                    if (typeof date === 'string') {
                        if (date.includes('T') || date.includes('-')) {
                            // Es una fecha ISO o YYYY-MM-DD, convertir a fecha de Honduras (UTC-6)
                            const fechaUTC = new Date(date);
                            d = new Date(fechaUTC.getTime() + (fechaUTC.getTimezoneOffset() * 60000) + (-6 * 60 * 60000));
                        } else {
                            // Intentar parsear como timestamp
                            d = new Date(parseInt(date, 10));
                        }
                    } else {
                        // Si ya es un objeto Date
                        d = new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + (-6 * 60 * 60000));
                    }
                    
                    if (isNaN(d.getTime())) return date || '';
                    
                    // Verificar si es hoy
                    if (esHoy(d)) {
                        return 'Hoy';
                    }
                    
                    // Obtener componentes de fecha en la zona horaria de Honduras (UTC-6)
                    const day = d.getUTCDate();
                    const month = d.getUTCMonth() + 1;
                    const year = d.getUTCFullYear();
                    
                    // Formatear fecha en DD/MM/YYYY
                    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                } catch (e) {
                    console.error('Error al formatear fecha:', e, 'Valor:', date);
                    return date || '';
                }
            };
            
            // Mapear cada columna a su celda correspondiente
            const cells = columns.map(col => {
                try {
                    // Si hay una función render personalizada, usarla
                    if (typeof col.render === 'function') {
                        return `<td>${col.render(cleanLead, lead)}</td>`;
                    }
                    
                    // Obtener el valor de la columna
                    const key = col.key;
                    let val = '';
                    
                    // Buscar el valor en el lead normalizado o en el original
                    if (key in cleanLead) {
                        val = cleanLead[key];
                    } else if (key in lead) {
                        val = lead[key];
                    }
                    
                    // Verificar si es un campo de fecha (termina en _fecha, _venta, _creacion, etc.)
                    const isDateField = /(fecha|venta|creacion|registro|actualizacion|contratacion|instalacion|nacimiento|inicio|fin|hasta|desde)$/i.test(key);
                    
                    // Formatear el valor
                    let displayValue = val;
                    if (val !== undefined && val !== null && val !== '') {
                        if (isDateField) {
                            // Formatear fechas
                            displayValue = formatDate(val);
                        } else {
                            // Para otros valores, convertir a string
                            displayValue = String(val);
                        }
                    } else {
                        displayValue = '';
                    }
                    
                    // Escapar HTML y devolver la celda
                    const escapedValue = escapeHTML(displayValue);
                    return `<td title="${escapedValue}">${escapedValue}</td>`;
                } catch (e) {
                    console.error(`Error renderizando celda ${col.key} del lead ${index}:`, e);
                    return '<td></td>';
                }
            }).join('');
            
            row.innerHTML = cells;
            fragment.appendChild(row);
        } catch (e) {
            console.error(`Error renderizando fila ${index}:`, e, lead);
        }
    });
    
    tbody.appendChild(fragment);
    console.log("[UI] Tabla de clientes renderizada.");
}

/**
 * Aplica la vista actual (normal | teamlineas) sobre los datos cargados y re-renderiza
 */
function applyCurrentView() {
  const src = Array.isArray(window.allLeads) ? window.allLeads : [];
  const mode = window.costumerViewMode || 'normal';
  let filtered = filterLeadsForView(src, mode);
  
  // Aplicar filtro por equipo si no es "todos"
  if (window.currentTeamFilter && window.currentTeamFilter !== 'todos') {
    filtered = filtered.filter(lead => {
      const teamName = getTeamName(lead);
      return teamName === window.currentTeamFilter;
    });
  }
  
  updateSummaryCards(filtered);
  renderCostumerTable(filtered);
}

/**
 * Determina si un lead pertenece a Team Líneas (heurística compatible con utils/teams.js)
 */
function isTeamLineasLead(lead) {
  const norm = (s) => (s || '').toString().normalize('NFD').replace(/\p{Diacritic}+/gu,'').trim().toLowerCase();
  const agente = norm(lead?.agente || lead?.agent || '');
  const team = norm(lead?.team || lead?.equipo || '');
  const supervisor = norm(lead?.supervisor || '');
  if (agente.startsWith('lineas-')) return true;
  if (team.startsWith('team lineas')) return true;
  if (supervisor.includes('figueroa') && team.includes('lineas')) return true;
  return false;
}

/**
 * Devuelve la lista filtrada según el modo de vista
 */
function filterLeadsForView(leads, mode) {
  if (mode === 'teamlineas') {
    return leads.filter(isTeamLineasLead);
  }
  // Vista normal: excluir Team Líneas
  return leads.filter(l => !isTeamLineasLead(l));
}

/**
 * Filtra la tabla de clientes en la UI según un término de búsqueda.
 * @param {string} searchTerm - El texto a buscar.
 */
function filterTable(searchTerm) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const allRows = document.querySelectorAll('#costumer-tbody tr');

    allRows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes(lowerCaseSearchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// --- HELPERS Y UTILIDADES ---

/**
 * Normaliza los datos de un lead para asegurar consistencia.
 * @param {object} lead - El objeto de cliente original.
 * @returns {object} - El objeto de cliente normalizado.
 */
function normalizeLeadData(lead) {
  console.log('[DEBUG] Normalizando lead:', lead);
  const N_A = ''; // Usar string vacío en lugar de 'N/A'
  
  // Si el lead ya está normalizado, no hacer nada
  if (lead._normalized) {
    console.log('[DEBUG] Lead ya normalizado, omitiendo');
    return lead;
  }
  
  // Primero, crear un objeto con todos los campos del lead original
  const normalized = { ...lead };
    // Función para normalizar fechas
  const normalizeDate = (dateStr) => {
    if (!dateStr) return '';
    
    // Si ya es un objeto Date, formatear
    if (dateStr instanceof Date) {
      return dateStr.toISOString().split('T')[0];
    }
    
    // Si es un string de fecha ISO
    if (typeof dateStr === 'string' && dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    
    // Intentar con formato DD/MM/YYYY o MM/DD/YYYY
    const dateParts = dateStr.split(/[\/\s-]+/);
    if (dateParts.length === 3) {
      let day, month, year;
      
      // Asumir formato DD/MM/YYYY o MM/DD/YYYY
      if (dateParts[0].length > 2) { // Año primero (YYYY-MM-DD)
        year = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        day = parseInt(dateParts[2], 10);
      } else if (dateParts[2].length > 2) { // Año al final (DD/MM/YYYY o MM/DD/YYYY)
        day = parseInt(dateParts[0], 10);
        month = parseInt(dateParts[1], 10) - 1;
        year = parseInt(dateParts[2], 10);
      }
      
      // Ajustar año de dos dígitos
      if (year < 100) {
        year = year < 80 ? 2000 + year : 1900 + year;
      }
      
      try {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Error al normalizar fecha:', dateStr, e);
      }
    }
    
    return dateStr; // Devolver el valor original si no se pudo normalizar
  };
    
    // Procesar campos especiales
    normalized.autopago = (normalized.autopago === true || normalized.autopago === 'true') ? 'Sí' : 'No';
    
    // Función mejorada para formatear fechas
    const formatDate = (dateStr) => {
        if (!dateStr || dateStr === 'Invalid Date') return N_A;
        
        try {
            // Intentar parsear la fecha de diferentes formatos
            let date;
            
            // Si es un string de fecha ISO o similar
            if (typeof dateStr === 'string' && dateStr.includes('-')) {
                date = new Date(dateStr);
            } 
            // Si está en formato MM/DD/YYYY o similar
            else if (typeof dateStr === 'string' && dateStr.includes('/')) {
                const parts = dateStr.split('/');
                // Si el primer número es mayor que 12, asumimos formato DD/MM/YYYY
                if (parts[0] > 12) {
                    const [day, month, year] = parts.map(Number);
                    date = new Date(year, month - 1, day);
                } 
                // Si no, asumimos formato MM/DD/YYYY
                else {
                    const [month, day, year] = parts.map(Number);
                    date = new Date(year, month - 1, day);
                }
            }
            // Si ya es un objeto Date
            else if (dateStr instanceof Date) {
                date = dateStr;
            } 
            // Si no se reconoce el formato
            else {
                return N_A;
            }
            
            // Verificar si la fecha es válida
            if (isNaN(date.getTime())) {
                return N_A;
            }
            
            // Formatear como DD/MM/YYYY
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            
            return `${day}/${month}/${year}`;
            
        } catch (e) {
            console.warn('Error formateando fecha:', dateStr, e);
            return N_A;
        }
    };
    
    // Aplicar formato a las fechas
    normalized.dia_venta = formatDate(normalized.dia_venta);
    normalized.dia_instalacion = formatDate(normalized.dia_instalacion);
    
    // Asegurar que los campos requeridos tengan un valor por defecto
    const requiredFields = [
        'nombre_cliente', 'telefono_principal', 'telefono_alterno', 
        'cantidad_lineas', 'pin_seguridad', 'numero_cuenta',
        'direccion', 'tipo_servicios', 'sistema', 'riesgo',
        'servicios', 'mercado', 'supervisor', 'comentario',
        'motivo_llamada', 'zip_code', 'puntaje', 'dia_venta', 'dia_instalacion'
    ];
    
    requiredFields.forEach(field => {
        if (normalized[field] === undefined || normalized[field] === null) {
            normalized[field] = N_A;
        } else if (typeof normalized[field] === 'boolean') {
            normalized[field] = normalized[field] ? 'Sí' : 'No';
        } else if (typeof normalized[field] === 'object') {
            // Si el campo es un objeto, convertirlo a string
            try {
                normalized[field] = JSON.stringify(normalized[field]);
            } catch (e) {
                normalized[field] = N_A;
            }
        }
    });
    
    // Asegurar que el campo status tenga un valor
    normalized.status = getStatusBadge(normalized.status || 'pendiente');
    
    console.log('[DEBUG] Lead normalizado:', normalized);
    return normalized;
}

/**
 * Genera un badge de HTML para el estado del cliente con mejor formato visual.
 * @param {string} status - El estado del cliente.
 * @returns {string} - El HTML del badge con formato mejorado.
 */
function getStatusBadge(status) {
    const s = String(status || '').toLowerCase().trim();
    let badgeClass = 'badge-secondary';
    let displayText = status || 'Desconocido';
    
    // Mapeo de estados a clases y textos personalizados
    const statusMap = {
        'pendiente': { class: 'badge-warning', text: 'Pendiente' },
        'pending': { class: 'badge-warning', text: 'Pendiente' },
        'completado': { class: 'badge-success', text: 'Completado' },
        'completed': { class: 'badge-success', text: 'Completado' },
        'cancelado': { class: 'badge-danger', text: 'Cancelado' },
        'cancelled': { class: 'badge-danger', text: 'Cancelado' },
        'en proceso': { class: 'badge-info', text: 'En Proceso' },
        'in progress': { class: 'badge-info', text: 'En Proceso' },
        'aprobado': { class: 'badge-primary', text: 'Aprobado' },
        'approved': { class: 'badge-primary', text: 'Aprobado' },
        'rechazado': { class: 'badge-dark', text: 'Rechazado' },
        'rejected': { class: 'badge-dark', text: 'Rechazado' }
    };
    
    // Buscar coincidencia exacta o parcial
    const matchedStatus = statusMap[s] || statusMap[Object.keys(statusMap).find(key => s.includes(key))];
    
    if (matchedStatus) {
        badgeClass = matchedStatus.class;
        displayText = matchedStatus.text;
    } else if (s) {
        // Si no hay coincidencia exacta pero hay texto, usar un color neutro
        displayText = status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    // Retornar el badge con estilo mejorado
    return `
        <span class="badge ${badgeClass} status-badge" 
              style="min-width: 100px; 
                     padding: 8px 12px; 
                     font-size: 0.85rem; 
                     font-weight: 600; 
                     border-radius: 4px;
                     text-transform: capitalize;
                     box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                     transition: all 0.2s ease;">
            ${escapeHTML(displayText)}
        </span>`;
}

/**
 * Escapa caracteres HTML para prevenir ataques XSS.
 * @param {string} str - El string a escapar.
 * @returns {string} - El string escapado.
 */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"/]/g, (tag) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
        '/': '&#x2F;'
    }[tag]));
}

// --- LÓGICA DE MODALES (Comentarios, Acciones, etc.) ---

function gestionarComentarios(leadId) {
    console.log(`Gestionando comentarios para el lead: ${leadId}`);
    // Lógica para abrir el modal de comentarios y cargar los existentes
    alert(`Funcionalidad de comentarios para ${leadId} no implementada.`);
}

function verAcciones(leadId) {
    console.log(`Viendo acciones para el lead: ${leadId}`);
    // Lógica para mostrar un menú de acciones
    alert(`Funcionalidad de acciones para ${leadId} no implementada.`);
}

function cerrarComentarios() {
    const modal = document.getElementById('comentariosModal');
    if(modal) modal.style.display = 'none';
}

function agregarComentario() {
    alert('Funcionalidad de agregar comentario no implementada.');
}

function toggleEmojiPicker() {
    alert('Funcionalidad de emoji picker no implementada.');
}
