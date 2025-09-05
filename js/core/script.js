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
      // Helpers para selects: priorizar el texto visible del option seleccionado
      const getSelectText = (name) => {
        try {
          const el = form.elements[name];
          if (!el) return '';
          if (el.tagName && el.tagName.toUpperCase() === 'SELECT') {
            const opt = el.selectedOptions && el.selectedOptions[0];
            return (opt && typeof opt.text === 'string') ? opt.text.trim() : '';
          }
          return '';
        } catch { return ''; }
      };
      const normUpper = (v) => (v == null ? '' : String(v).trim().toUpperCase());
      const withDefault = (v, def = 'N/A') => {
        const s = (v == null ? '' : String(v).trim());
        return s.length ? s : def;
      };
      // Helpers visuales de error por campo
      const showFieldError = (name, message) => {
        const el = form.elements[name];
        if (!el) return;
        const group = el.closest && el.closest('.form-group');
        if (group) group.classList.add('has-error');
        try { el.setAttribute('aria-invalid', 'true'); } catch {}
        let hint = group ? group.querySelector(`.error-text[data-error-for="${name}"]`) : null;
        if (!hint && group) {
          hint = document.createElement('small');
          hint.className = 'error-text';
          hint.setAttribute('data-error-for', name);
          group.appendChild(hint);
        }
        if (hint) {
          hint.textContent = message || 'Este campo es obligatorio';
          hint.style.display = 'block';
        }
      };
      const clearFieldError = (name) => {
        const el = form.elements[name];
        if (!el) return;
        const group = el.closest && el.closest('.form-group');
        if (group) group.classList.remove('has-error');
        try { el.removeAttribute('aria-invalid'); } catch {}
        const hint = group ? group.querySelector(`.error-text[data-error-for="${name}"]`) : null;
        if (hint) hint.style.display = 'none';
      };
      // Requerir inputs/fechas obligatorios con validación dura
      const requireInput = (name, label) => {
        const el = form.elements[name];
        const val = el && el.value ? String(el.value).trim() : '';
        if (!val) {
          showFieldError(name, `Este campo es obligatorio: ${label}`);
          alert(`Completa ${label} antes de guardar.`);
          if (el && el.focus) el.focus();
          throw new Error(`Campo requerido vacío: ${name}`);
        }
        clearFieldError(name);
        return val;
      };
      // Requerir selects obligatorios con validación dura
      const requireSelect = (name, label) => {
        const el = form.elements[name];
        const val = el && el.value ? String(el.value).trim() : '';
        if (!val) {
          showFieldError(name, `Debes seleccionar ${label}.`);
          alert(`Selecciona ${label} antes de guardar.`);
          if (el && el.focus) el.focus();
          throw new Error(`Campo requerido vacío: ${name}`);
        }
        const txt = getSelectText(name) || val;
        clearFieldError(name);
        return normUpper(txt);
      };
      // Requerir radios obligatorios (uno seleccionado)
      const requireRadio = (name, label) => {
        const nodes = form.querySelectorAll(`input[type=radio][name="${name}"]`);
        let checked = '';
        nodes.forEach(n => { if (n.checked) checked = n.value; });
        if (!checked) {
          // Mensaje visual en el grupo del primer radio
          const first = nodes && nodes[0];
          if (first) {
            const group = first.closest && first.closest('.form-group');
            if (group) {
              let hint = group.querySelector(`.error-text[data-error-for="${name}"]`);
              if (!hint) {
                hint = document.createElement('small');
                hint.className = 'error-text';
                hint.setAttribute('data-error-for', name);
                group.appendChild(hint);
              }
              group.classList.add('has-error');
              hint.textContent = `Debes seleccionar ${label}.`;
              hint.style.display = 'block';
            }
          }
          alert(`Selecciona ${label} antes de guardar.`);
          if (first && first.focus) first.focus();
          throw new Error(`Campo radio requerido vacío: ${name}`);
        }
        // limpiar error si estaba
        const first = nodes && nodes[0];
        if (first) {
          const group = first.closest && first.closest('.form-group');
          if (group) {
            const hint = group.querySelector(`.error-text[data-error-for="${name}"]`);
            group.classList.remove('has-error');
            if (hint) hint.style.display = 'none';
          }
        }
        return normUpper(checked);
      };

       // Limpiar mensajes de error al cambiar/tipear
      try {
        Array.from(form.elements).forEach(el => {
          const name = el && el.name;
          if (!name) return;
          const ev = (el.tagName && el.tagName.toUpperCase() === 'SELECT') || el.type === 'radio' ? 'change' : 'input';
          el.addEventListener(ev, () => clearFieldError(name));
        });
      } catch {}
      
      // Mapeo de campos del formulario a los nombres esperados por el backend
      let lead;
      try {
        // Validación dura: TODOS los campos de opciones deben estar seleccionados
        const autopagoReq = requireSelect('autopago', 'Autopago');
        const tipoServicioReq = requireSelect('tipo-servicio', 'Tipo de servicios');
        const sistemaReq = requireSelect('sistema', 'un Sistema');
        const riesgoReq = requireSelect('riesgo', 'un Riesgo');
        const serviciosReq = requireSelect('servicios', 'Servicios');
        const mercadoReq = requireSelect('mercado', 'Mercado');
        const supervisorReq = requireSelect('supervisor', 'Supervisor');
        const comentarioReq = requireSelect('comentario', 'Comentario');
        const statusReq = requireRadio('status', 'un Status');
        const motivoReq = requireRadio('motivo-llamada', 'un Motivo de llamada');

        lead = {
        nombre_cliente: requireInput('nombre-cliente','Nombre del cliente'),
        telefono_principal: requireInput('telefono-principal','Teléfono principal'),
        telefono_alterno: requireInput('telefono-alterno','Teléfono alterno'),
        numero_cuenta: requireInput('numero-cuenta','Número de cuenta'),
        autopago: autopagoReq,
        direccion: requireInput('direccion','Dirección'),
        tipo_servicios: tipoServicioReq,
        // Sistema y Riesgo obligatorios, normalizados en mayúsculas
        sistema: sistemaReq,
        riesgo: riesgoReq,
        dia_venta: requireInput('dia-venta','Día de venta'),
        dia_instalacion: requireInput('dia-instalacion','Día de instalación'),
        status: statusReq,
        servicios: serviciosReq,
        mercado: mercadoReq,
        supervisor: supervisorReq,
        comentario: comentarioReq,
        motivo_llamada: motivoReq,
        zip_code: requireInput('zip-code','ZIP Code')
        };
      } catch (hardErr) {
        console.warn('Validación dura falló:', hardErr?.message || hardErr);
        return; // no continuar con envío
      }

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



      // (Se reemplaza por validación dura por campo más abajo)

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
    // Solo aplicar bypass local si NO hay token disponible. Si existe token, enviarlo siempre.
    const isLocalUserBypass = isLocal && (role === 'user' || role === 'supervisor') && !token;
    
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
    // Actualizar KPIs si la función está disponible en la página (Costumer.html)
    try {
      if (typeof updateSummaryCards === 'function') {
        updateSummaryCards(combinedLeads);
      }
    } catch (e) {
      console.warn('updateSummaryCards no disponible o falló:', e);
    }
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

// (Eliminada la definición duplicada de renderCostumerTable; se usa la de Costumer.html)
// prueba-protegido: no commitear

