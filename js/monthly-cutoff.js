/**
 * Sistema de Corte Mensual para Costumer.html
 * Maneja navegación entre meses y KPIs mensuales
 */

// Variables globales para el corte mensual
let currentMonth = new Date().getMonth() + 1; // 1-12
let currentYear = new Date().getFullYear();
let monthlyData = new Map(); // Cache de datos por mes

// Nombres de meses en español
const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

/**
 * Inicializa el sistema de corte mensual
 */
function initMonthlyCutoff() {
  console.log('[Monthly Cutoff] Inicializando sistema de corte mensual');

  // Crear navegación de meses
  createMonthNavigation();

  // Modificar KPIs existentes
  modifyExistingKPIs();

  // Configurar eventos
  setupMonthNavigation();

  // Cargar datos del mes actual
  loadMonthData(currentYear, currentMonth);
}

/**
 * Crea la navegación de meses
 */
function createMonthNavigation() {
  console.log('[createMonthNavigation] 🔧 Iniciando creación de navegación de meses...');

  const mainContent = document.querySelector('.main-content');
  const summaryContainer = document.querySelector('.summary-cards-container');

  console.log('[createMonthNavigation] Elementos encontrados:', {
    mainContent: !!mainContent,
    summaryContainer: !!summaryContainer
  });

  if (!mainContent || !summaryContainer) {
    console.error('[Monthly Cutoff] No se encontraron contenedores necesarios');
    return;
  }

  // Crear HTML de navegación
  const monthNavHTML = `
    <div class="month-navigation" style="background: white; padding: 20px; margin-bottom: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
      <button id="prev-month" class="month-nav-btn" style="background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-chevron-left"></i> Anterior
      </button>

      <div class="current-month-display" style="text-align: center;">
        <h2 id="current-month-title" style="margin: 0; color: #333; font-size: 24px; font-weight: 600;">${MONTH_NAMES[currentMonth - 1]} ${currentYear}</h2>
        <p id="month-status" style="margin: 5px 0 0; color: #666; font-size: 14px;">Mes actual - En progreso</p>
      </div>

      <button id="next-month" class="month-nav-btn" style="background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        Siguiente <i class="fas fa-chevron-right"></i>
      </button>
    </div>
  `;

  // Insertar antes del contenedor de tarjetas
  summaryContainer.insertAdjacentHTML('beforebegin', monthNavHTML);
  console.log('[createMonthNavigation] ✅ Navegación de meses creada e insertada');
}

/**
 * Modifica los KPIs existentes para el sistema mensual
 */
function modifyExistingKPIs() {
  const summaryContainer = document.querySelector('.summary-cards-container');
  if (!summaryContainer) return;

  // Limpiar contenedor para evitar duplicados
  summaryContainer.innerHTML = '';

  // Crear todos los KPIs desde cero en el orden correcto
  const kpisHTML = `
    <!-- Ventas Hoy -->
    <div class="summary-card sales-today">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
            <i class="fas fa-shopping-cart"></i>
          </div>
          <h3 class="card-title">Ventas Hoy</h3>
        </div>
        <div class="card-value" id="costumer-ventas-hoy">0</div>
        <div class="card-footer">
          <i class="fas fa-calendar-day"></i> <span id="ventas-hoy-footer-text">Actualizado ahora</span>
        </div>
      </div>
    </div>

    <!-- Ventas del Mes -->
    <div class="summary-card sales-month">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
            <i class="fas fa-chart-line"></i>
          </div>
          <h3 class="card-title">Ventas del Mes</h3>
        </div>
        <div class="card-value" id="costumer-ventas-mes">0</div>
        <div class="card-footer">
          <i class="fas fa-calendar-alt"></i> <span id="ventas-mes-footer-text">Mes actual</span>
        </div>
      </div>
    </div>

    <!-- Ventas Totales -->
    <div class="summary-card sales-total">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
            <i class="fas fa-chart-bar"></i>
          </div>
          <h3 class="card-title">Ventas Totales</h3>
        </div>
        <div class="card-value" id="costumer-ventas-totales">0</div>
        <div class="card-footer">
          <i class="fas fa-calculator"></i> <span id="ventas-totales-footer-text">Total acumulado</span>
        </div>
      </div>
    </div>

    <!-- Pendientes -->
    <div class="summary-card pending">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            <i class="fas fa-clock"></i>
          </div>
          <h3 class="card-title">Pendientes</h3>
        </div>
        <div class="card-value" id="costumer-pendientes">0</div>
        <div class="card-footer">
          <i class="fas fa-info-circle"></i> <span id="pendientes-footer-text">Por atender</span>
        </div>
      </div>
    </div>

    <!-- Cancelados -->
    <div class="summary-card cancelled">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
            <i class="fas fa-times-circle"></i>
          </div>
          <h3 class="card-title">Cancelados</h3>
        </div>
        <div class="card-value" id="costumer-cancelados">0</div>
        <div class="card-footer">
          <i class="fas fa-exclamation-triangle"></i> <span id="cancelados-footer-text">Este mes</span>
        </div>
      </div>
    </div>

    <!-- Activos -->
    <div class="summary-card active">
      <div class="card-content">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            <i class="fas fa-check-circle"></i>
          </div>
          <h3 class="card-title">Activos</h3>
        </div>
        <div class="card-value" id="costumer-activos">0</div>
        <div class="card-footer">
          <i class="fas fa-user-check"></i> <span id="activos-footer-text">Clientes activos</span>
        </div>
      </div>
    </div>
  `;

  summaryContainer.innerHTML = kpisHTML;

  // Actualizar textos de footer para que sean dinámicos
  updateFooterTexts();
}

/**
 * Actualiza los textos de footer de los KPIs
 */
function updateFooterTexts() {
  const now = new Date();
  const isCurrentMonth = (currentYear === now.getFullYear() && currentMonth === (now.getMonth() + 1));

  const footerTexts = {
    'ventas-footer-text': isCurrentMonth ? 'Mes actual' : 'Mes cerrado',
    'pendientes-footer-text': isCurrentMonth ? 'Por atender' : 'Histórico',
    'cancelados-footer-text': isCurrentMonth ? 'Este mes' : 'Mes cerrado',
    'activos-footer-text': isCurrentMonth ? 'Clientes activos' : 'Histórico'
  };

  Object.entries(footerTexts).forEach(([id, text]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  });

  // Actualizar estado del mes
  const monthStatus = document.getElementById('month-status');
  if (monthStatus) {
    monthStatus.textContent = isCurrentMonth ? 'Mes actual - En progreso' : 'Mes cerrado';
  }
}

/**
 * Configura los eventos de navegación
 */
function setupMonthNavigation() {
  console.log('[setupMonthNavigation] 🔧 Configurando eventos de navegación...');

  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');

  console.log('[setupMonthNavigation] Botones encontrados:', {
    prevBtn: !!prevBtn,
    nextBtn: !!nextBtn
  });

  if (prevBtn) {
    console.log('[setupMonthNavigation] ✅ Configurando evento click para botón Anterior');
    prevBtn.addEventListener('click', () => {
      console.log('[setupMonthNavigation] 🖱️ Click en botón Anterior');
      navigateMonth(-1);
    });
  }

  if (nextBtn) {
    console.log('[setupMonthNavigation] ✅ Configurando evento click para botón Siguiente');
    nextBtn.addEventListener('click', () => {
      console.log('[setupMonthNavigation] 🖱️ Click en botón Siguiente');
      navigateMonth(1);
    });
  }

  console.log('[setupMonthNavigation] ✅ Eventos de navegación configurados');
}

/**
 * Navega entre meses
 */
function navigateMonth(direction) {
  console.log(`[navigateMonth] 🔄 Iniciando navegación con dirección: ${direction}`);
  console.log(`[navigateMonth] Mes actual antes: ${currentMonth}/${currentYear}`);

  const newMonth = currentMonth + direction;

  if (newMonth < 1) {
    currentMonth = 12;
    currentYear--;
  } else if (newMonth > 12) {
    currentMonth = 1;
    currentYear++;
  } else {
    currentMonth = newMonth;
  }

  console.log(`[navigateMonth] Nuevo mes después: ${currentMonth}/${currentYear}`);

  // Actualizar título
  const monthTitle = document.getElementById('current-month-title');
  if (monthTitle) {
    const newTitle = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
    console.log(`[navigateMonth] Actualizando título a: ${newTitle}`);
    monthTitle.textContent = newTitle;
  }

  // Actualizar textos de footer
  updateFooterTexts();

  // Cargar datos del nuevo mes
  console.log(`[navigateMonth] 🔄 Cargando datos del nuevo mes...`);
  loadMonthData(currentYear, currentMonth);
}

/**
 * Carga los datos de un mes específico
 */
async function loadMonthData(year, month) {
  console.log(`[Monthly Cutoff] 🔄 Cargando datos para ${MONTH_NAMES[month - 1]} ${year}`);
  console.log(`[Monthly Cutoff] Valores recibidos - Año: ${year}, Mes: ${month}`);

  try {
    // Mostrar loading en KPIs
    showKPILoading();

    // Hacer petición al backend (cargar todos los datos para filtrar correctamente)
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch('/api/leads', { headers });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const leads = data.data || [];
    console.log(`[Monthly Cutoff] Datos recibidos del servidor: ${leads.length} leads`);

    // Mostrar algunos ejemplos de fechas para debugging
    if (leads.length > 0) {
      console.log(`[Monthly Cutoff] Ejemplos de fechas en los datos:`);
      leads.slice(0, 5).forEach((lead, index) => {
        const fecha = lead.dia_venta || lead.fecha_contratacion || lead.fecha || '';
        console.log(`[Monthly Cutoff] Lead ${index + 1}: ${lead.nombre_cliente} | Fecha: "${fecha}"`);
      });
    }

    // Filtrar leads del mes específico usando dia_venta
    const monthLeads = filterLeadsByMonth(leads, year, month);

    // Calcular KPIs del mes específico + totales históricos
    const kpis = calculateMonthlyKPIs(monthLeads, leads);

    // Actualizar UI
    updateKPIs(kpis);

    // Actualizar tabla para mostrar SOLO el mes seleccionado
    updateTableWithMonthSeparation(monthLeads, year, month);

    // Crear toolbar de supervisor DESPUÉS de renderizar la tabla
    if (typeof window.createSupervisorToolbar === 'function') {
      console.log('[Monthly Cutoff] 🔧 Llamando a createSupervisorToolbar...');
      window.createSupervisorToolbar(monthLeads);
      console.log('[Monthly Cutoff] ✅ Toolbar de supervisor creada');
    } else {
      console.warn('[Monthly Cutoff] ⚠️ createSupervisorToolbar no está disponible');
    }

    // Guardar en cache
    monthlyData.set(`${year}-${month}`, { leads, kpis });

  } catch (error) {
    console.error('[Monthly Cutoff] Error cargando datos del mes:', error);
    showKPIError();
  }
}

/**
 * Normaliza una cadena de fecha (YYYY-MM-DD o DD/MM/YYYY) a un objeto Date en zona horaria local.
 */
function normalizeDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  console.log(`[normalizeDate] Procesando fecha: "${dateString}"`);

  // Intentar formato YYYY-MM-DD
  let match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [_, year, month, day] = match;
    console.log(`[normalizeDate] Formato YYYY-MM-DD detectado: ${year}-${month}-${day}`);
    return new Date(year, month - 1, day); // Meses son 0-indexed en JavaScript
  }

  // Intentar formato DD/MM/YYYY
  match = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [_, day, month, year] = match;
    console.log(`[normalizeDate] Formato DD/MM/YYYY detectado: ${day}/${month}/${year}`);
    return new Date(year, month - 1, day); // Meses son 0-indexed en JavaScript
  }

  console.log(`[normalizeDate] Formato no reconocido, retornando null`);
  return null;
}

/**
 * Filtra leads que pertenecen específicamente a un mes
 */
function filterLeadsByMonth(leads, targetYear, targetMonth) {
  console.log(`[Filter Month] Iniciando filtrado para ${targetYear}-${targetMonth}`);
  console.log(`[Filter Month] Total leads recibidos: ${leads.length}`);

  const filtered = leads.filter((lead, index) => {
    const diaVenta = lead.dia_venta || lead.fecha_contratacion || lead.fecha || '';

    if (!diaVenta) {
      if (index < 3) console.log(`[Filter Month] Lead ${index + 1} sin fecha:`, lead.nombre_cliente);
      return false;
    }

    try {
      const leadDate = normalizeDate(diaVenta);
      if (isNaN(leadDate.getTime())) {
        if (index < 3) console.log(`[Filter Month] Lead ${index + 1} fecha inválida "${diaVenta}":`, lead.nombre_cliente);
        return false;
      }

      const leadYear = leadDate.getFullYear();
      const leadMonth = leadDate.getMonth() + 1;

      if (index < 3) {
        console.log(`[Filter Month] Lead ${index + 1}: ${lead.nombre_cliente} | Fecha: ${diaVenta} | Año: ${leadYear} | Mes: ${leadMonth} | Target: ${targetYear}-${targetMonth}`);
      }

      return (leadYear === targetYear && leadMonth === targetMonth);
    } catch (error) {
      if (index < 3) console.log(`[Filter Month] Lead ${index + 1} error procesando fecha "${diaVenta}":`, error);
      return false;
    }
  });

  console.log(`[Filter Month] ✅ Leads filtrados para ${targetYear}-${targetMonth}: ${filtered.length}`);
  return filtered;
}

/**
 * Función auxiliar para matching de agentes (simplificada)
 */
function matchAgentForFilter(lead, selectedAgent) {
  if (!selectedAgent || selectedAgent === 'null' || selectedAgent === null) return true;

  // Campos donde buscar el agente
  const agentFields = [
    lead.agenteNombre,
    lead.nombreAgente,
    lead.agente,
    lead.agent,
    lead.vendedor,
    lead.seller,
    lead.usuario,
    lead.owner,
    lead.createdBy,
    lead.registeredBy,
    lead.asignadoA,
    lead.assignedTo
  ];

  console.log(`[matchAgentForFilter] Buscando agente: "${selectedAgent}" en lead:`, lead.nombre_cliente);
  console.log(`[matchAgentForFilter] Campos disponibles:`, agentFields.filter(field => field));

  // Buscar coincidencia exacta o parcial
  const selectedLower = selectedAgent.toLowerCase();
  const matches = agentFields.filter(field => {
    if (!field) return false;
    const fieldLower = String(field).toLowerCase();
    const isMatch = fieldLower === selectedLower || fieldLower.includes(selectedLower);
    if (isMatch) {
      console.log(`[matchAgentForFilter] ✅ Coincidencia encontrada: "${field}" contiene "${selectedAgent}"`);
    }
    return isMatch;
  });

  const result = matches.length > 0;
  console.log(`[matchAgentForFilter] Resultado: ${result} (${matches.length} coincidencias)`);

  return result;
}

/**
 * Calcula los KPIs mensuales basados en los leads
 */
function calculateMonthlyKPIs(leads, allLeads = []) {
  const kpis = {
    ventasHoy: 0,
    ventasMes: 0,
    ventasTotales: 0,
    pendientes: 0,
    cancelados: 0,
    activos: 0
  };

  console.log(`[Monthly KPIs] Calculando KPIs para ${leads.length} leads del mes`);

  const formatterToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' });
  const todayStr = formatterToday.format(new Date());

  kpis.ventasMes = leads.length;
  kpis.ventasTotales = (allLeads && allLeads.length) ? allLeads.length : leads.length;

  leads.forEach((lead, index) => {
    const status = (lead.status || '').toString().toLowerCase().trim();
    const diaVenta = lead.dia_venta || lead.fecha_contratacion || lead.fecha || '';

    if (index < 5) {
      console.log(`[Monthly KPIs] Lead ${index + 1}: status="${status}", dia_venta="${diaVenta}"`);
    }

    const leadDateStr = typeof diaVenta === 'string' ? diaVenta.slice(0,10) : formatterToday.format(new Date(diaVenta));
    if (leadDateStr === todayStr) {
      kpis.ventasHoy++;
    }

    if (['cancelado', 'cancelled', 'canceled', 'cancel', 'rechazado', 'declined'].includes(status)) {
      kpis.cancelados++;
    } else if (['activo', 'active', 'activado', 'habilitado'].includes(status)) {
      kpis.activos++;
    } else if (['rescheduled', 'reprogramado', 'reagendado'].includes(status)) {
      kpis.pendientes++;
    } else if (['pendiente', 'pending', 'hold', 'en proceso', 'proceso', 'waiting', 'new', 'nuevo', 'espera', 'revision', ''].includes(status)) {
      kpis.pendientes++;
    } else {
      kpis.pendientes++;
    }
  });

  return kpis;
}

/**
 * Actualiza los valores de los KPIs en la UI
 */
function updateKPIs(kpis) {
  const kpiElements = {
    'costumer-ventas-hoy': kpis.ventasHoy,
    'costumer-ventas-mes': kpis.ventasMes,
    'costumer-ventas-totales': kpis.ventasTotales,
    'costumer-pendientes': kpis.pendientes,
    'costumer-cancelados': kpis.cancelados,
    'costumer-activos': kpis.activos
  };

  Object.entries(kpiElements).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      animateCounter(element, value);
    }
  });
}

/**
 * Anima el contador de un KPI
 */
function animateCounter(element, targetValue) {
  const startValue = parseInt(element.textContent) || 0;
  const duration = 800;
  const startTime = performance.now();

  function animate(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (targetValue - startValue) * easeOut);

    element.textContent = currentValue.toLocaleString();

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

/**
 * Muestra estado de loading en los KPIs
 */
function showKPILoading() {
  const kpiIds = ['costumer-ventas-hoy', 'costumer-ventas-mes', 'costumer-ventas-totales', 'costumer-pendientes', 'costumer-cancelados', 'costumer-activos'];

  kpiIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
  });
}

/**
 * Muestra error en los KPIs
 */
function showKPIError() {
  const kpiIds = ['costumer-ventas-hoy', 'costumer-ventas-mes', 'costumer-ventas-totales', 'costumer-pendientes', 'costumer-cancelados', 'costumer-activos'];

  kpiIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = 'Error';
    }
  });
}
/**
 * Actualiza la tabla con separación mensual
 */
function updateTableWithMonthSeparation(leads, year, month) {
  console.log(`[updateTableWithMonthSeparation] 🔄 Procesando ${leads.length} leads para ${year}-${month}`);

  const leadsByMonth = new Map();

  leads.forEach((lead, index) => {
    const diaVenta = lead.dia_venta || lead.fecha_contratacion || lead.fecha || '';
    if (diaVenta) {
      const leadDate = normalizeDate(diaVenta);
      if (leadDate && !isNaN(leadDate.getTime())) {
        const leadMonth = leadDate.getMonth() + 1;
        const leadYear = leadDate.getFullYear();
        const monthKey = `${leadYear}-${leadMonth}`;

        if (!leadsByMonth.has(monthKey)) {
          leadsByMonth.set(monthKey, []);
        }
        leadsByMonth.get(monthKey).push(lead);

        if (index < 3) {
          console.log(`[updateTableWithMonthSeparation] Lead ${index + 1}: ${lead.nombre_cliente} | Fecha: ${diaVenta} | Procesado como: ${monthKey}`);
        }
      } else {
        if (index < 3) {
          console.log(`[updateTableWithMonthSeparation] Lead ${index + 1} fecha inválida: ${diaVenta}`);
        }
      }
    } else {
      if (index < 3) {
        console.log(`[updateTableWithMonthSeparation] Lead ${index + 1} sin fecha: ${lead.nombre_cliente}`);
      }
    }
  });

  console.log(`[updateTableWithMonthSeparation] ✅ Leads organizados por meses:`, Array.from(leadsByMonth.entries()).map(([key, leads]) => `${key}: ${leads.length}`).join(', '));

  renderTableWithSeparators(leadsByMonth, year, month);
}

/**
 * Renderiza la tabla con separadores mensuales
 */
function renderTableWithSeparators(leadsByMonth, currentYear, currentMonth) {
  const tbody = document.getElementById('costumer-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const sortedMonths = Array.from(leadsByMonth.keys()).sort((a, b) => {
    const [yearA, monthA] = a.split('-').map(Number);
    const [yearB, monthB] = b.split('-').map(Number);

    if (yearA !== yearB) return yearB - yearA;
    return monthB - monthA;
  });

  sortedMonths.forEach(monthKey => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthLeads = leadsByMonth.get(monthKey);

    const separatorRow = document.createElement('tr');
    separatorRow.className = 'costumer-month-separator';
    separatorRow.innerHTML = `
      <td colspan="21" style="background-color: #e2e8f0 !important; color: #0f172a !important; font-weight: 700; padding: 12px 18px; border-top: 2px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; border-left: 4px solid #1976d2;">
        📅 ${MONTH_NAMES[month - 1]} ${year} (${monthLeads.length} registros)
      </td>
    `;
    tbody.appendChild(separatorRow);

    monthLeads.forEach(lead => {
      const row = createLeadRow(lead);
      tbody.appendChild(row);
    });
  });
}

/**
 * Crea una fila de la tabla para un lead
 */
function createLeadRow(lead) {
  const row = document.createElement('tr');

  const normalizeLeadData = window.normalizeLeadData || ((l) => l);
  const normalizedLead = normalizeLeadData(lead);

  // Obtener ID del lead
  const leadId = normalizedLead._id || normalizedLead.id || lead._id || lead.id || '';
  
  // Obtener comentarios de venta
  const comentariosVenta = normalizedLead.comentarios_venta || lead.comentarios_venta || '';
  const displayComment = comentariosVenta ? (comentariosVenta.length > 40 ? comentariosVenta.substring(0, 40) + '...' : comentariosVenta) : 'Sin comentarios';

  const cells = [
    normalizedLead.nombre_cliente || '',
    normalizedLead.telefono_principal || '',
    normalizedLead.telefono_alterno || '',
    normalizedLead.numero_cuenta || '',
    normalizedLead.autopago || '',
    normalizedLead.direccion || '',
    normalizedLead.tipo_servicios || '',
    normalizedLead.sistema || '',
    normalizedLead.riesgo || '',
    normalizedLead.dia_venta || '',
    normalizedLead.dia_instalacion || '',
    normalizedLead.status || '',
    normalizedLead.servicios || '',
    normalizedLead.mercado || '',
    normalizedLead.supervisor || '',
    normalizedLead.comentario || '',
    normalizedLead.motivo_llamada || '',
    normalizedLead.zip_code || '',
    normalizedLead.puntaje || ''
  ];

  // Construir HTML de las celdas básicas
  let rowHTML = cells.map(cell => `<td>${cell}</td>`).join('');
  
  // Agregar columna de Comentarios sobre la Venta
  rowHTML += `
    <td style="min-width: 180px;">
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${comentariosVenta 
          ? `<div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #eff6ff; border-radius: 6px; border-left: 3px solid #3b82f6;">
              <i class="fas fa-comment-dots" style="color: #3b82f6; font-size: 12px;"></i>
              <span style="font-size: 12px; color: #1e40af; font-weight: 500;">${displayComment}</span>
             </div>`
          : `<div style="display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: #f3f4f6; border-radius: 6px;">
              <i class="fas fa-comment-slash" style="color: #9ca3af; font-size: 12px;"></i>
              <span style="font-size: 12px; color: #6b7280;">Sin comentarios</span>
             </div>`
        }
        <button onclick="event.stopPropagation(); abrirComentarios('${leadId}')" 
                style="background: ${comentariosVenta ? '#3b82f6' : '#10b981'}; 
                       color: white; 
                       border: none; 
                       padding: 6px 12px; 
                       border-radius: 6px; 
                       font-size: 11px; 
                       font-weight: 600;
                       cursor: pointer;
                       display: flex;
                       align-items: center;
                       gap: 6px;
                       transition: all 0.2s ease;
                       box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
                onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.15)';"
                onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';">
          <i class="fas fa-${comentariosVenta ? 'edit' : 'plus-circle'}"></i>
          ${comentariosVenta ? 'Gestionar' : 'Agregar'}
        </button>
      </div>
    </td>
  `;
  
  // Agregar columna de Acción
  rowHTML += `
    <td style="min-width: 160px;">
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <button onclick="editarLead('${leadId}')" 
                title="Editar registro"
                style="background: #f59e0b; 
                       color: white; 
                       border: none; 
                       padding: 8px 12px; 
                       border-radius: 6px; 
                       cursor: pointer;
                       display: flex;
                       align-items: center;
                       gap: 6px;
                       font-size: 11px;
                       font-weight: 600;
                       transition: all 0.2s ease;
                       box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                       white-space: nowrap;"
                onmouseover="this.style.background='#d97706'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.15)';"
                onmouseout="this.style.background='#f59e0b'; this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';">
          <i class="fas fa-edit"></i>
          <span>Editar</span>
        </button>
        <button onclick="eliminarLead('${leadId}')" 
                title="Eliminar registro"
                style="background: #ef4444; 
                       color: white; 
                       border: none; 
                       padding: 8px 12px; 
                       border-radius: 6px; 
                       cursor: pointer;
                       display: flex;
                       align-items: center;
                       gap: 6px;
                       font-size: 11px;
                       font-weight: 600;
                       transition: all 0.2s ease;
                       box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                       white-space: nowrap;"
                onmouseover="this.style.background='#dc2626'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.15)';"
                onmouseout="this.style.background='#ef4444'; this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.1)';">
          <i class="fas fa-trash-alt"></i>
          <span>Eliminar</span>
        </button>
      </div>
    </td>
  `;

  row.innerHTML = rowHTML;
  return row;
}

/**
 * Actualiza visualmente el botón activo
 */
function updateActiveButton(activeValue) {
  const bar = document.getElementById('supervisor-agent-filter');
  if (!bar) return;

  const buttons = bar.querySelectorAll('button');
  buttons.forEach(btn => {
    const isActive = btn.textContent === (activeValue === null ? 'Todos' : activeValue) ||
                     (activeValue === null && btn.textContent === 'Todos');

    if (isActive) {
      btn.style.background = '#1d4ed8';
      btn.style.color = '#ffffff';
      btn.style.borderColor = '#1d4ed8';
    } else {
      btn.style.background = '#ffffff';
      btn.style.color = '#334155';
      btn.style.borderColor = '#e2e8f0';
    }
  });
}

/**
 * Función para crear toolbar de supervisor
 */
window.createSupervisorToolbar = function(leads) {
  console.log('🔧 [Monthly Cutoff] Iniciando creación de toolbar...');

  try {
    const userObj = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
    const rawRole = (userObj.role || userObj?.usuario?.role || '').toString().toLowerCase();
    const roleIsSupervisor = rawRole === 'supervisor';

    console.log('[Monthly Cutoff] Usuario:', userObj.username);
    console.log('[Monthly Cutoff] Rol:', rawRole);
    console.log('[Monthly Cutoff] Es supervisor:', roleIsSupervisor);

    if (!roleIsSupervisor) {
      console.log('[Monthly Cutoff] Usuario no es supervisor, abortando');
      return;
    }

    const teamsApi = window.Teams;
    if (!teamsApi) {
      console.warn('[Monthly Cutoff] Teams API no disponible');
      return;
    }

    const supervisorName = userObj.username || '';
    const teamAgents = teamsApi.getAgentsBySupervisor(supervisorName) || [];

    console.log('[Monthly Cutoff] Supervisor:', supervisorName);
    console.log('[Monthly Cutoff] Agentes del equipo:', teamAgents);

    if (teamAgents.length === 0) {
      console.warn('[Monthly Cutoff] No se encontraron agentes para el supervisor');
      return;
    }

    const tbodyEl = document.getElementById('costumer-tbody');
    if (!tbodyEl) {
      console.error('[Monthly Cutoff] No se encontró costumer-tbody');
      return;
    }

    const tableEl = tbodyEl.closest('table');
    const tableResponsive = tableEl ? tableEl.closest('.table-responsive') : null;

    let bar = document.getElementById('supervisor-agent-filter');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'supervisor-agent-filter';
      bar.style.cssText = `
        margin: 15px 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        position: relative;
        z-index: 10;
        background: #f8fafc;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      `;

      if (tableResponsive) {
        tableResponsive.parentElement.insertBefore(bar, tableResponsive);
      } else if (tableEl) {
        tableEl.parentElement.insertBefore(bar, tableEl);
      }

      console.log('[Monthly Cutoff] ✅ Toolbar creada e insertada');
    }

    bar.innerHTML = '';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'Filtrar por agente:';
    titleSpan.style.cssText = 'font-weight: 600; font-size: 14px; color: #334155; margin-right: 12px;';
    bar.appendChild(titleSpan);

    const createButton = (label, value) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.type = 'button';
      btn.style.cssText = `
        padding: 6px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        background: #ffffff;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      `;

      const isActive = (window.supervisorAgentFilter || null) === value;
      if (isActive) {
        btn.style.background = '#1d4ed8';
        btn.style.color = '#ffffff';
        btn.style.borderColor = '#1d4ed8';
      }

      btn.addEventListener('click', () => {
        window.supervisorAgentFilter = value;
        console.log('[Monthly Cutoff] Filtro seleccionado:', value || 'Todos');

        if (typeof window.renderTableWithSeparators === 'function' && window.monthlyData) {
          const currentData = window.monthlyData.get(`${currentYear}-${currentMonth}`);
          if (currentData && currentData.leads) {
            // Si se seleccionó un agente específico, filtrar directamente
            let monthLeads = currentData.leads;

            if (value && value !== 'null' && value !== null) {
              console.log(`[Monthly Cutoff] Aplicando filtro específico por agente: ${value}`);
              const originalCount = currentData.leads.length;
              monthLeads = currentData.leads.filter(lead => {
                const match = matchAgentForFilter(lead, value);
                if (match) {
                  console.log(`[Monthly Cutoff] ✅ Lead encontrado para ${value}:`, lead.nombre_cliente, 'agente:', lead.agenteNombre || lead.nombreAgente || lead.agente);
                }
                return match;
              });
              console.log(`[Monthly Cutoff] Filtrado aplicado: ${originalCount} -> ${monthLeads.length} leads`);
            } else {
              // Para "Todos", mostrar todos los leads del mes actual
              monthLeads = filterLeadsByMonth(currentData.leads, currentYear, currentMonth);
              console.log(`[Monthly Cutoff] Mostrando todos los leads del mes: ${monthLeads.length}`);
            }

            // Crear mapa de meses con los leads filtrados
            const leadsByMonth = new Map();
            const monthKey = `${currentYear}-${currentMonth}`;
            leadsByMonth.set(monthKey, monthLeads);

            // Renderizar con el filtro aplicado
            window.renderTableWithSeparators(leadsByMonth, currentYear, currentMonth);

            // Actualizar el botón activo visualmente
            updateActiveButton(value);
          }
        }
      });

      btn.addEventListener('mouseenter', () => {
        if (!isActive) {
          btn.style.background = '#f1f5f9';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (!isActive) {
          btn.style.background = '#ffffff';
        }
      });

      return btn;
    };

    bar.appendChild(createButton('Todos', null));

    teamAgents.forEach(agentCanonical => {
      const displayName = teamsApi.getDisplayName(agentCanonical) ||
                         agentCanonical.replace(/\b\w/g, c => c.toUpperCase());
      bar.appendChild(createButton(displayName, agentCanonical));
    });

    // Inicializar el estado del botón activo
    updateActiveButton(window.supervisorAgentFilter);

    console.log('[Monthly Cutoff] ✅ Toolbar completada con', teamAgents.length + 1, 'botones');

  } catch (error) {
    console.error('[Monthly Cutoff] Error creando toolbar:', error);
  }
};

// Función de respaldo para matchSelectedAgent si no está disponible
if (!window.matchSelectedAgent) {
  window.matchSelectedAgent = function(lead, selectedAgent) {
    console.log('[matchSelectedAgent fallback] Llamando a matchAgentForFilter:', selectedAgent);
    return matchAgentForFilter(lead, selectedAgent);
  };
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initMonthlyCutoff();
  }, 1000);
});

// Exportar funciones para uso global
window.MonthlyCutoff = {
  init: initMonthlyCutoff,
  loadMonth: loadMonthData,
  getCurrentMonth: () => ({ year: currentYear, month: currentMonth })
};
