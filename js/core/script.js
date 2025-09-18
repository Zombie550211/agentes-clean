// ===== FUNCIONES PRINCIPALES =====

/**
 * Renderiza la tabla de clientes de manera simplificada
 */
function renderCostumerTable(leads = []) {
    console.log(`[UI] ✅ Renderizando tabla con ${leads.length} clientes.`);
    
    // Buscar el tbody de manera más robusta
    const tbody = document.getElementById('costumer-tbody');
    if (!tbody) {
        console.error("❌ Error crítico: No se encontró el tbody con ID 'costumer-tbody'");
        return;
    }
    
    // Limpiar la tabla
    tbody.innerHTML = '';
    
    if (leads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="20" style="text-align: center; padding: 40px; color: #666;">
                    No hay clientes para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    console.log(`[UI] ✅ Procesando ${leads.length} registros...`);
    
    // Función simple para formatear fechas
    const formatearFecha = (fecha) => {
        if (!fecha) return 'N/A';
        if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            const [year, month, day] = fecha.split('-');
            return `${day}/${month}/${year}`;
        }
        return fecha;
    };
    
    // Función simple para obtener status badge
    const obtenerStatusBadge = (status) => {
        if (!status) return '<span class="badge badge-secondary">Sin estado</span>';
        const statusLower = status.toLowerCase();
        let badgeClass = 'badge-secondary';
        
        if (statusLower.includes('pendiente') || statusLower.includes('pending')) {
            badgeClass = 'badge-warning';
        } else if (statusLower.includes('completado') || statusLower.includes('completed')) {
            badgeClass = 'badge-success';
        } else if (statusLower.includes('cancelado') || statusLower.includes('cancelled')) {
            badgeClass = 'badge-danger';
        }
        
        return `<span class="badge ${badgeClass}">${status}</span>`;
    };
    
    // Renderizar cada fila
    leads.forEach((lead, index) => {
        try {
            const row = document.createElement('tr');
            
            // Datos seguros con valores por defecto
            const nombre = lead.nombre_cliente || 'N/A';
            const telefono = lead.telefono_principal || 'N/A';
            const telefonoAlt = lead.telefono_alterno || 'N/A';
            const numeroCuenta = lead.numero_cuenta || 'N/A';
            const autopago = lead.autopago ? 'Sí' : 'No';
            const direccion = lead.direccion || 'N/A';
            const tipoServicios = lead.tipo_servicios || 'N/A';
            const sistema = lead.sistema || 'N/A';
            const riesgo = lead.riesgo || 'N/A';
            const diaVenta = formatearFecha(lead.dia_venta);
            const diaInstalacion = formatearFecha(lead.dia_instalacion);
            const status = obtenerStatusBadge(lead.status);
            const servicios = lead.servicios || 'N/A';
            const mercado = lead.mercado || 'N/A';
            const supervisor = lead.supervisor || 'N/A';
            const comentario = lead.comentario || 'N/A';
            const motivoLlamada = lead.motivo_llamada || 'N/A';
            const zipCode = lead.zip_code || 'N/A';
            const puntaje = lead.puntaje || 'N/A';
            
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
                <td>
                    <button class="action-btn" onclick="gestionarComentarios('${lead._id || ''}')">
                        <i class="fas fa-comment"></i> Ver
                    </button>
                </td>
                <td>
                    <button class="action-btn" onclick="verAcciones('${lead._id || ''}')">
                        <i class="fas fa-ellipsis-h"></i>
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
            
        } catch (error) {
            console.error(`❌ Error al renderizar fila ${index}:`, error, lead);
        }
    });
    
    console.log(`[UI] ✅ Tabla renderizada exitosamente con ${leads.length} filas.`);
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

function gestionarComentarios(leadId) {
    console.log('Gestionar comentarios para lead:', leadId);
}

function verAcciones(leadId) {
    console.log('Ver acciones para lead:', leadId);
}
