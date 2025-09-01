document.addEventListener("DOMContentLoaded", () => {
  console.log('DOM completamente cargado, iniciando script...');
  // Permitir desactivar la carga automática desde páginas que requieran filtro previo (e.g., team.html)
  if (!window.SKIP_AUTO_LOAD_CUSTOMERS) {
    cargarDatosDesdeServidor();
  } else {
    console.log('Carga automática de clientes omitida por SKIP_AUTO_LOAD_CUSTOMERS');
  }

  const form = document.getElementById("crmForm");
  console.log('Formulario encontrado:', form ? 'Sí' : 'No');
  
  // Verificar si el formulario tiene el manejador de eventos
  if (form) {
    console.log('Agregando manejador de eventos al formulario');
  }
  
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Mostrar mensaje al usuario
      alert('Procesando el formulario...');

      // Obtener datos del formulario
      const formData = new FormData(form);
      
      // Mapeo de campos del formulario a los nombres esperados por el backend
      const lead = {
        nombre_cliente: formData.get('nombre-cliente') || '',
        telefono_principal: formData.get('telefono-principal') || '',
        telefono_alterno: formData.get('telefono-alterno') || '',
        numero_cuenta: formData.get('numero-cuenta') || '',
        autopago: formData.get('autopago') || '',
        direccion: formData.get('direccion') || '',
        tipo_servicios: formData.get('tipo-servicio') || '',
        sistema: formData.get('sistema') || '',
        riesgo: formData.get('riesgo') || '',
        dia_venta: formData.get('dia-venta') || '',
        dia_instalacion: formData.get('dia-instalacion') || '',
        status: formData.get('status') || '',
        servicios: formData.get('servicio') || '',
        mercado: formData.get('mercado') || '',
        supervisor: formData.get('supervisor') || '',
        comentario: formData.get('comentario') || '',
        motivo_llamada: formData.get('motivo-llamada') || '',
        zip_code: formData.get('zip-code') || ''
      };

      // Asignar automáticamente el TEAM según SUPERVISOR
      const supervisor = lead.supervisor ? lead.supervisor.trim().toUpperCase() : '';
      let team = '';
      switch (supervisor) {
        case 'PLEITEZ': team = 'Team Pleitez'; break;
        case 'ROBERTO': team = 'Team Roberto'; break;
        case 'IRANIA': team = 'Team Irania'; break;
        case 'MARISOL': team = 'Team Marisol'; break;
        case 'RANDAL': team = 'Team Randal'; break;
        case 'JONATHAN': team = 'Team Lineas'; break;
        default: team = '';
      }
      lead.team = team;



      // Validar que todos los campos requeridos del formulario estén presentes
      const camposRequeridos = [
        'nombre_cliente', 'telefono_principal', 'telefono_alterno', 'numero_cuenta',
        'autopago', 'direccion', 'tipo_servicios', 'sistema', 'riesgo',
        'dia_venta', 'dia_instalacion', 'status', 'servicios', 'mercado',
        'supervisor', 'comentario', 'motivo_llamada', 'zip_code'
      ];
      let camposFaltantes = [];
      camposRequeridos.forEach(campo => {
        if (!lead[campo] || lead[campo].toString().trim() === '') {
          camposFaltantes.push(campo.replace(/_/g, ' '));
        }
      });
      if (camposFaltantes.length > 0) {
        alert('Faltan campos obligatorios: ' + camposFaltantes.join(', '));
        return;
      }

      // Validar puntaje antes de enviar
      if (team === 'Team Lineas') {
        lead.puntaje = 'Sin Puntaje';
      } else {
        let puntaje = formData.get('puntaje');
        if (!puntaje || isNaN(puntaje)) {
          alert('El campo Puntaje es obligatorio y debe ser un número válido.');
          return;
        }
        lead.puntaje = parseFloat(puntaje);
      }

      // Enviar los datos a crm_agente
      try {
        console.log('Preparando para enviar datos a crm_agente:', lead);
        // Enviar a crm_agente
        console.log('Realizando petición POST a /api/crm_agente');
        const responseAgente = await fetch("/api/crm_agente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...lead,
            tipo: 'agente',
            fecha_creacion: new Date().toISOString()
          })
        });
        
        const resultAgente = await responseAgente.json();
        console.log('Respuesta de crm_agente:', { status: responseAgente.status, resultAgente });
        
        if (!responseAgente.ok) {
          console.error('Error en la respuesta de crm_agente:', resultAgente);
          throw new Error(resultAgente.error || 'Error al guardar en crm_agente');
        }
        
        // Enviar a costumers
        console.log('Preparando para enviar datos a customers');
        const token = localStorage.getItem('token');
        console.log('Token de autenticación:', token ? 'Presente' : 'Ausente');
        const headersCustomer = { "Content-Type": "application/json" };
        if (token) headersCustomer["Authorization"] = `Bearer ${token}`;
        const responseCustomer = await fetch("/api/customers", {
          method: "POST",
          credentials: 'include',
          headers: headersCustomer,
          body: JSON.stringify({
            ...lead,
            fecha_creacion: new Date().toISOString(),
            status: 'activo'
          })
        });
        
        const resultCustomer = await responseCustomer.json();
        console.log('Respuesta de customers:', { status: responseCustomer.status, resultCustomer });
        
        if (!responseCustomer.ok) {
          console.error('Error en la respuesta de customers:', resultCustomer);
          throw new Error(resultCustomer.error || 'Error al guardar en costumers');
        }
        
        // Si todo salió bien
        alert("Datos guardados con éxito en crm_agente y costumers");
        cargarDatosDesdeServidor();
        form.reset();
        
      } catch (error) {
        console.error('Error al guardar los datos:', error);
        const errorMessage = `Error: ${error.message || 'Error desconocido al procesar el formulario'}. Por favor, intente de nuevo.`;
        console.error('Mensaje de error completo:', errorMessage);
        alert(errorMessage);
      } finally {
        console.log('Proceso de envío del formulario finalizado');
      }
    });
  }
});


// Utilidades de rol
function getCurrentUserRole() {
  try {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const roleFromUser = (parsed?.role || parsed?.usuario?.role || '').toString();
      if (roleFromUser) {
        console.log('[Roles] getCurrentUserRole -> role desde user storage:', roleFromUser);
        return roleFromUser;
      }
    }
    // Fallback: decodificar rol desde el token JWT
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return '';
    const parts = token.split('.');
    if (parts.length !== 3) return '';
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      const roleFromToken = (payload?.role || '').toString();
      console.log('[Roles] getCurrentUserRole -> role desde token JWT:', roleFromToken);
      return roleFromToken;
    } catch {
      return '';
    }
  } catch {
    return '';
  }
}

function canEditStatus() {
  const role = (getCurrentUserRole() || '').toLowerCase().trim();
  // Aceptar variantes de backoffice
  const editable = role === 'admin' || role === 'backoffice' || role === 'b:o' || role === 'b.o' || role === 'b-o' || role === 'bo';
  console.log('[Roles] canEditStatus -> role:', role, '| editable:', editable);
  return editable;
}

async function updateLeadStatus(leadId, newStatus) {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || 'No se pudo actualizar el estado');
    }
    // Refrescar datos
    cargarDatosDesdeServidor();
  } catch (err) {
    console.error('Error actualizando status:', err);
    alert(`Error actualizando status: ${err.message || err}`);
  }
}


async function cargarDatosDesdeServidor() {
  try {
    console.log('Solicitando datos de clientes...');
    
    // Obtener el token de autenticación del localStorage o sessionStorage
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const role = (getCurrentUserRole() || '').toLowerCase();
    const isLocalUserBypass = isLocal && (role === 'user' || role === 'supervisor');
    
    // Configurar los headers. En local con rol user, no enviamos Authorization
    const headers = { 'Content-Type': 'application/json' };
    if (!isLocalUserBypass && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (headers.Authorization) {
      console.log('Realizando petición a /api/customers con token:', token.substring(0, 10) + '...');
    } else {
      console.log('Realizando petición a /api/customers en modo local sin token (bypass dev para rol user/supervisor)');
    }
    // Construir URL con parámetros de la ubicación actual, respetando filtros
    let base = "/api/customers";
    const current = new URL(window.location.href);
    const fromSearch = new URLSearchParams(current.search);
    const params = new URLSearchParams();

    // Pasar parámetros relevantes al backend
    const passKeys = ['forceAll','agenteId','agente','fechaInicio','fechaFin','page','limit'];
    passKeys.forEach(k => {
      const v = fromSearch.get(k);
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        params.set(k, String(v));
      }
    });

    // Defaults para maximizar resultados visibles si no vienen en la URL
    if (!params.has('page')) params.set('page', '1');
    if (!params.has('limit')) params.set('limit', '200'); // máximo permitido por backend

    // Si el usuario es Irania, pedir más registros para evitar que la paginación oculte clientes de su team
    try {
      const isIraniaUser = (typeof esIrania === 'function') && esIrania();
      if (isIraniaUser) {
        // Aumentar el límite solo si no está definido o es menor que 1000
        const existingLimit = parseInt(params.get('limit') || '0', 10);
        if (!existingLimit || existingLimit < 1000) params.set('limit', '1000');
      }
    } catch(_) {}

    // Cache buster para evitar respuestas en caché durante depuración
    params.set('_t', String(Date.now()));

    const url = params.toString() ? `${base}?${params.toString()}` : base;

    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: headers
    });
    
    if (!res.ok) {
      if (res.status === 401) {
        // Token inválido o expirado, redirigir al login
        console.error('Error 401: Token inválido o expirado');
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        window.location.href = '/login.html';
        return;
      }
      
      const errorText = await res.text();
      console.error('Error en la respuesta del servidor:', res.status, errorText);
      throw new Error(`Error al cargar los clientes: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('Datos recibidos del servidor:', data);

    // Consolidar todas las páginas si existen
    let combinedLeads = Array.isArray(data.leads) ? data.leads.slice() : (Array.isArray(data) ? data.slice() : []);
    const total = parseInt(data.total || 0, 10);
    const pages = parseInt(data.pages || 1, 10);
    const currentPage = parseInt(data.page || 1, 10);
    const usedLimit = parseInt((new URL(url, window.location.origin)).searchParams.get('limit') || '200', 10);

    // Solo consolidar en roles restringidos (agent/supervisor) o cuando no haya forceAll
    const roleForPages = (getCurrentUserRole() || '').toLowerCase();
    const qp = new URL(url, window.location.origin).searchParams;
    const forceAllActive = (qp.get('forceAll') === '1' || qp.get('forceAll') === 'true');
    const shouldMergeAllPages = pages > 1 && (!forceAllActive) && (roleForPages === 'agent' || roleForPages === 'supervisor');

    if (shouldMergeAllPages) {
      console.log(`[Paginación] Detectadas ${pages} páginas. Consolidando todas las páginas (rol: ${roleForPages}).`);
      try {
        const baseUrl = new URL(url, window.location.origin);
        for (let p = currentPage + 1; p <= pages; p++) {
          baseUrl.searchParams.set('page', String(p));
          // Mantener limit actual
          baseUrl.searchParams.set('limit', String(usedLimit || 200));
          // Cache buster distinto por página
          baseUrl.searchParams.set('_t', String(Date.now() + p));
          console.log('[Paginación] Fetch página:', p, baseUrl.toString());
          const rp = await fetch(baseUrl.toString(), { method: 'GET', credentials: 'include', headers });
          if (!rp.ok) {
            console.warn('[Paginación] Respuesta no OK en página', p, rp.status);
            continue;
          }
          const jd = await rp.json();
          const arr = Array.isArray(jd.leads) ? jd.leads : (Array.isArray(jd) ? jd : []);
          combinedLeads = combinedLeads.concat(arr);
        }
        console.log(`[Paginación] Consolidación completa. Total combinados: ${combinedLeads.length} (backend total: ${total}).`);
      } catch (e) {
        console.warn('[Paginación] Error al consolidar páginas:', e);
      }
    }

    console.log('Leads a renderizar (combinados si aplica):', combinedLeads);
    renderCostumerTable(combinedLeads);
  } catch (error) {
    console.error('Error al cargar los datos:', error);
    // Mostrar un mensaje más detallado en la consola
    console.error('Detalles del error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Mostrar un mensaje de error más amigable al usuario
    const errorMessage = 'No se pudieron cargar los clientes. Por favor, verifica la consola para más detalles.';
    console.error(errorMessage);
    
    // Mostrar el error en la interfaz si existe el contenedor
    const tbody = document.getElementById('costumer-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="21" style="text-align:center;padding:2em;color:red;">
            ${errorMessage}<br>
            <small>${error.message || 'Error desconocido'}</small>
          </td>
        </tr>`;
    } else {
      alert(errorMessage + ' ' + (error.message || ''));
    }
  }
}

// Renderizado profesional y alineado de la tabla Costumer
function renderCostumerTable(leads) {
  console.log('RENDER COSTUMER TABLE', leads);
  window.ultimaListaLeads = leads;
  const tbody = document.getElementById('costumer-tbody');
  tbody.innerHTML = '';
  if (!leads || leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="21" style="text-align:center;padding:2em;">No hay registros para mostrar.</td></tr>`;
    return;
  }
  leads.forEach((lead, idx) => {
    const rowClass = idx % 2 === 0 ? 'costumer-row-striped' : '';
    const editable = canEditStatus();
    const statusValue = (lead.status || '').toString();
    const statusLower = statusValue.toLowerCase();
    console.log('[Render] Fila', idx, 'LeadId:', (lead._id || ''), '| role:', (getCurrentUserRole()||'').toString(), '| editable:', editable, '| status:', statusValue);
    const statusCellHtml = editable
      ? `<select class="status-select" onchange="updateLeadStatus('${lead._id || ''}', this.value)">
           <option value="pending" ${statusLower==='pending' ? 'selected' : ''}>Pending</option>
           <option value="hold" ${statusLower==='hold' ? 'selected' : ''}>Hold</option>
           <option value="cancelled" ${statusLower==='cancelled' ? 'selected' : ''}>Cancelled</option>
           <option value="rescheduled" ${statusLower==='rescheduled' ? 'selected' : ''}>Rescheduled</option>
           <option value="completed" ${statusLower==='completed' ? 'selected' : ''}>Completed</option>
         </select>`
      : `<span class="badge-status badge-status-${(statusLower)}">${statusValue}</span>`;
    tbody.innerHTML += `
      <tr class="${rowClass}">
        <td class="td-ellipsis" title="${lead.nombre_cliente || ''}">${lead.nombre_cliente || ''}</td>
        <td class="td-nowrap" title="${lead.telefono_principal || ''}">${lead.telefono_principal || ''}</td>
        <td class="td-nowrap" title="${lead.telefono_alterno || 'N/A'}">${lead.telefono_alterno || 'N/A'}</td>
        <td class="td-nowrap" title="${lead.numero_cuenta || 'N/A'}">${lead.numero_cuenta || 'N/A'}</td>
        <td class="td-nowrap" title="${lead.autopago || ''}">${lead.autopago || ''}</td>
        <td class="td-ellipsis" title="${lead.direccion || ''}">${lead.direccion || ''}</td>
        <td class="td-ellipsis" title="${lead.tipo_servicios || ''}">${lead.tipo_servicios || ''}</td>
        <td class="td-ellipsis" title="${lead.sistema || ''}">${lead.sistema || ''}</td>
        <td class="td-nowrap" title="${lead.riesgo || ''}">${lead.riesgo || ''}</td>
        <td class="td-nowrap" title="${lead.dia_venta || ''}">${lead.dia_venta || ''}</td>
        <td class="td-nowrap" title="${lead.dia_instalacion || ''}">${lead.dia_instalacion || ''}</td>
        <td class="td-nowrap">${statusCellHtml}</td>
        <td class="td-ellipsis" title="${lead.servicios || ''}">${lead.servicios || ''}</td>
        <td class="td-ellipsis" title="${lead.mercado || ''}">${lead.mercado || ''}</td>
        <td class="td-ellipsis" title="${lead.supervisor || ''}">${lead.supervisor || ''}</td>
        <td class="td-ellipsis" title="${lead.comentario || ''}">${lead.comentario || ''}</td>
        <td class="td-ellipsis" title="${lead.motivo_llamada || ''}">${lead.motivo_llamada || ''}</td>
        <td class="td-nowrap" title="${lead.zip_code || ''}">${lead.zip_code || ''}</td>
        <td class="td-nowrap" title="${lead.puntaje !== undefined ? lead.puntaje : 0}">${lead.puntaje !== undefined ? lead.puntaje : 0}</td>
        <td class="td-ellipsis">
          <button class='comentarios-btn' onclick='toggleComentariosPanel(${idx})' title='Ver o añadir comentarios'>
            <i class="fas fa-comment-dots"></i>
          </button>
        </td>
        <td class="td-nowrap">
          <button class="costumer-action-btn edit" title="Editar cliente" onclick="editarClienteModal('${lead._id || ''}')">
            <i class="fas fa-pencil-alt"></i>
          </button>
          <button class="costumer-action-btn delete" title="Eliminar cliente" onclick="confirmarEliminarCliente('${lead._id || ''}')">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
      <tr id="comentarios-panel-${idx}" class="comentarios-panel-row" style="display:none;"><td colspan="21" style="background:#f9fafd;padding:0;">
        <div class="comentarios-panel" id="comentarios-panel-${idx}">
          <div style="font-weight:600;color:#1976d2;margin-bottom:0.5em;">Comentarios</div>
          <div>
            ${(Array.isArray(lead.comentarios_venta) && lead.comentarios_venta.length > 0)
  ? lead.comentarios_venta.map((com, cidx) => `<div class='comentario-item'>
    <div class='comentario-meta'>
      <span class='comentario-autor'>${com.autor}</span>
      <span class='comentario-fecha'>${com.fecha}</span>

    </div>
    <div class='comentario-texto' id='comentario-texto-${idx}-${cidx}'>${com.texto}</div>
    <div class='comentario-edicion' id='comentario-edicion-${idx}-${cidx}' style='display:none;'>
      <textarea id='editar-comentario-textarea-${idx}-${cidx}' maxlength='300'>${com.texto}</textarea>
      <button class='comentario-btn guardar' title='Guardar edición' onclick='guardarEdicionComentario(${idx},${cidx})'><i class="fas fa-check"></i></button>
      <button class='comentario-btn cancelar' title='Cancelar' onclick='cancelarEdicionComentario(${idx},${cidx})'><i class="fas fa-times"></i></button>
    </div>
  </div>`).join('')
  : '<div class="comentario-item" style="color:#888;">Sin comentarios previos.</div>'}
          </div>
          <form class="nuevo-comentario-form" onsubmit="event.preventDefault(); enviarNuevoComentario(${idx}, '${lead._id || ''}')">
            <textarea id="nuevo-comentario-textarea-${idx}" maxlength="300" placeholder="Escribe un nuevo comentario..."></textarea>
            <button type="submit">Añadir</button>
          </form>
        </div>
      </td></tr>
    `;
  });
}