// ===== FUNCIONES PRINCIPALES =====

/**
 * Renderiza la tabla de clientes de manera simplificada
 */
function renderCostumerTable(leads = []) {
    // Estado global de paginación
    window.COSTUMER_PAG = window.COSTUMER_PAG || { allLeads: [], currentPage: 1, pageSize: Number(localStorage.getItem('costumerPageSize') || 25), totalPages: 1 };
    const PAG = window.COSTUMER_PAG;
    // Dataset
    if (Array.isArray(leads)) {
        PAG.allLeads = leads.slice();
        PAG.currentPage = 1;
    }
    // Asegurar barra de paginación y renderizar
    ensureCostumerPaginationUI();
    renderCostumerTablePage();
}

/**
 * Aplica la vista actual (normal | teamlineas) sobre los datos cargados y re-renderiza
 */
function applyCurrentView() {
    console.log('[DEBUG] Aplicando vista actual');
    if (window.allLeads && window.allLeads.length > 0) {
        const mode = window.costumerViewMode || 'normal';
        const filtered = filterLeadsForView(window.allLeads, mode);
        updateSummaryCards(filtered);
        renderCostumerTable(filtered);
    }
}

/**
 * Determina si un lead pertenece a Team Líneas
 */
function isTeamLineasLead(lead) {
    if (!lead) return false;
    const team = (lead.team || '').toLowerCase();
    const supervisor = (lead.supervisor || '').toLowerCase();
    return team.includes('lineas') || supervisor.includes('lineas');
}

/**
 * Devuelve la lista filtrada según el modo de vista
 */
function filterLeadsForView(leads, mode) {
    if (mode === 'teamlineas') {
        return leads.filter(lead => isTeamLineasLead(lead));
    }
    return leads;
}

// ===== Helpers de paginación y render =====

function costumerFormatDate(fecha) {
    if (!fecha) return 'N/A';
    if (typeof fecha === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(fecha)) {
        const [year, month, day] = fecha.split('-');
        return `${day}/${month}/${year}`;
    }
    return fecha;
}

function costumerStatusBadge(status) {
    if (!status) return '<span class="badge badge-secondary">Sin estado</span>';
    const s = String(status).toLowerCase();
    let cls = 'badge-secondary';
    if (s.includes('pend') ) cls = 'badge-warning';
    else if (s.includes('compl')) cls = 'badge-success';
    else if (s.includes('cancel')) cls = 'badge-danger';
    return `<span class="badge ${cls}">${status}</span>`;
}

function ensureCostumerPaginationUI() {
    const container = document.querySelector('.costumer-table-container');
    if (!container) return;
    const scrollArea = container.querySelector('.table-responsive') || container;

    // Inyectar estilos (una sola vez)
    if (!document.getElementById('costumer-pagination-styles')) {
        const style = document.createElement('style');
        style.id = 'costumer-pagination-styles';
        style.textContent = `
          #costumer-pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid #e2e8f0;background:linear-gradient(180deg,#ffffff 0%,#fafbff 100%);position:sticky;bottom:0;z-index:5;}
          #costumer-pagination .pg-left{display:flex;align-items:center;gap:8px;}
          #costumer-pagination .pg-right{display:flex;align-items:center;gap:8px;}
          #costumer-pagination .pg-info{color:#475569;font-size:13px;}
          #costumer-pagination .pg-btn{border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:6px 10px;color:#334155;cursor:pointer;transition:all .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.04);} 
          #costumer-pagination .pg-btn:hover{background:#f1f5f9}
          #costumer-pagination .pg-btn:disabled{opacity:.5;cursor:not-allowed}
          #costumer-pagination .pg-size{border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px;color:#334155;background:#fff}
        `;
        document.head.appendChild(style);
    }

    // Crear barra si no existe
    let bar = document.getElementById('costumer-pagination');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'costumer-pagination';
        // Estructura
        bar.innerHTML = `
          <div class="pg-left">
            <button id="pgFirst" class="pg-btn" title="Primera">«</button>
            <button id="pgPrev" class="pg-btn" title="Anterior">‹</button>
            <span id="pgInfo" class="pg-info">Página 1 de 1</span>
            <button id="pgNext" class="pg-btn" title="Siguiente">›</button>
            <button id="pgLast" class="pg-btn" title="Última">»</button>
          </div>
          <div class="pg-right">
            <label for="pgSize" class="pg-info">Filas por página:</label>
            <select id="pgSize" class="pg-size">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>`;

        // Insertar dentro del área desplazable para que quede en "esa parte" de la tabla y se alinee con el ancho
        const table = container.querySelector('.costumer-table');
        if (table) {
            // Hacer que la barra tenga al menos el mismo ancho que la tabla, así acompaña al scroll horizontal
            bar.style.minWidth = Math.max(table.scrollWidth, table.offsetWidth || 0) + 'px';
        }
        scrollArea.appendChild(bar);

        // Ajustar minWidth de la barra en resize
        window.addEventListener('resize', () => {
            const t = container.querySelector('.costumer-table');
            if (t) bar.style.minWidth = Math.max(t.scrollWidth, t.offsetWidth || 0) + 'px';
        });

        const $ = (id) => document.getElementById(id);
        const PAG = window.COSTUMER_PAG || { currentPage: 1, pageSize: 25, totalPages: 1 };
        $('pgSize').value = String(PAG.pageSize || 25);
        $('pgFirst').addEventListener('click', () => { PAG.currentPage = 1; renderCostumerTablePage(); });
        $('pgPrev').addEventListener('click', () => { PAG.currentPage = Math.max(1, (PAG.currentPage||1) - 1); renderCostumerTablePage(); });
        $('pgNext').addEventListener('click', () => { PAG.currentPage = Math.min(PAG.totalPages||1, (PAG.currentPage||1) + 1); renderCostumerTablePage(); });
        $('pgLast').addEventListener('click', () => { PAG.currentPage = PAG.totalPages || 1; renderCostumerTablePage(); });
        $('pgSize').addEventListener('change', (e) => { 
            const v = Number(e.target.value || 25) || 25; 
            PAG.pageSize = v; 
            localStorage.setItem('costumerPageSize', String(v)); 
            PAG.currentPage = 1; 
            renderCostumerTablePage(); 
        });
    }

    updateCostumerPaginationBar();
}

function updateCostumerPaginationBar() {
    const PAG = window.COSTUMER_PAG || { allLeads: [], currentPage: 1, pageSize: 25 };
    const total = (PAG.allLeads || []).length;
    PAG.totalPages = Math.max(1, Math.ceil(total / (PAG.pageSize || 25)));
    const start = total === 0 ? 0 : ((PAG.currentPage - 1) * PAG.pageSize) + 1;
    const end = Math.min(total, (PAG.currentPage * PAG.pageSize));
    const infoEl = document.getElementById('pgInfo');
    const first = document.getElementById('pgFirst');
    const prev = document.getElementById('pgPrev');
    const next = document.getElementById('pgNext');
    const last = document.getElementById('pgLast');
    if (infoEl) infoEl.textContent = `Mostrando ${start}–${end} de ${total} (Página ${PAG.currentPage} de ${PAG.totalPages})`;
    const atFirst = PAG.currentPage <= 1;
    const atLast = PAG.currentPage >= PAG.totalPages;
    [first, prev].forEach(b => b && (b.disabled = atFirst));
    [next, last].forEach(b => b && (b.disabled = atLast));
    const sizeSel = document.getElementById('pgSize');
    if (sizeSel) sizeSel.value = String(PAG.pageSize || 25);
}

function renderCostumerTablePage() {
    const tbody = document.getElementById('costumer-tbody');
    if (!tbody) { console.error("❌ No se encontró #costumer-tbody"); return; }
    const PAG = window.COSTUMER_PAG || { allLeads: [], currentPage: 1, pageSize: 25 };
    const all = Array.isArray(PAG.allLeads) ? PAG.allLeads : [];
    const total = all.length;
    const pageSize = PAG.pageSize || 25;
    PAG.totalPages = Math.max(1, Math.ceil(total / pageSize));
    PAG.currentPage = Math.min(Math.max(1, PAG.currentPage || 1), PAG.totalPages);

    // Limpiar
    tbody.innerHTML = '';
    if (total === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="20" style="text-align: center; padding: 40px; color: #666;">No hay clientes para mostrar</td>
            </tr>`;
        updateCostumerPaginationBar();
        return;
    }

    const startIdx = (PAG.currentPage - 1) * pageSize;
    const slice = all.slice(startIdx, startIdx + pageSize);

    slice.forEach((lead, index) => {
        try {
            const row = document.createElement('tr');
            const nombre = lead.nombre_cliente || 'N/A';
            const telefono = lead.telefono_principal || 'N/A';
            const telefonoAlt = lead.telefono_alterno || 'N/A';
            const numeroCuenta = lead.numero_cuenta || 'N/A';
            const autopago = lead.autopago ? 'Sí' : 'No';
            const direccion = lead.direccion || 'N/A';
            const tipoServicios = lead.tipo_servicios || 'N/A';
            const sistema = lead.sistema || 'N/A';
            const riesgo = lead.riesgo || 'N/A';
            const diaVenta = costumerFormatDate(lead.dia_venta);
            const diaInstalacion = costumerFormatDate(lead.dia_instalacion);
            const status = costumerStatusBadge(lead.status);
            const servicios = lead.servicios || 'N/A';
            const mercado = lead.mercado || 'N/A';
            const supervisor = lead.supervisor || 'N/A';
            const comentario = lead.comentario || 'N/A';
            const motivoLlamada = lead.motivo_llamada || 'N/A';
            const zipCode = lead.zip_code || 'N/A';
            const puntaje = lead.puntaje || 'N/A';

            const leadId = lead._id || lead.id || '';
            const comentariosVenta = lead.comentarios_venta || '';
            const displayComment = comentariosVenta ? (comentariosVenta.length > 40 ? comentariosVenta.substring(0, 40) + '...' : comentariosVenta) : 'Sin comentarios';
            
            // Debug: verificar si tenemos el ID
            if (index === 0) {
                console.log('[renderCostumerTablePage] Primer lead:', { leadId, nombre, comentariosVenta });
            }
            
            row.innerHTML = `
                <td>${nombre}</td>
                <td>${telefono}</td>
                <td>${telefonoAlt}</td>
                <td>${numeroCuenta}</td>
                <td>${autopago}</td>
                <td>${direccion}</td>
                <td>${tipoServicios}</td>
                <td>${sistema}</td>
                <td>${riesgo}</td>
                <td>${diaVenta}</td>
                <td>${diaInstalacion}</td>
                <td>${status}</td>
                <td>${servicios}</td>
                <td>${mercado}</td>
                <td>${supervisor}</td>
                <td>${comentario}</td>
                <td>${motivoLlamada}</td>
                <td>${zipCode}</td>
                <td>${puntaje}</td>
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
                </td>`;

            tbody.appendChild(row);
        } catch (err) {
            console.error('Error renderizando fila:', err);
        }
    });

    updateCostumerPaginationBar();
}

/**
 * Filtra la tabla de clientes en la UI según un término de búsqueda.
 */
function filterTable(searchTerm) {
    const rows = document.querySelectorAll('#costumer-tbody tr');
    const term = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// --- FUNCIONES DE MODAL Y ACCIONES ---
// Estas funciones son placeholders que serán sobrescritas por Costumer.html si está disponible
