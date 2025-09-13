const API_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3002"
    : "https://connecting-klf7.onrender.com";


// --- Cargar y mostrar clientes ---
async function cargarClientes() {
  try {
    // Crear token temporal para desarrollo
    const token = localStorage.getItem('token') || 'temp-token-dev';
    
    // Obtener la fecha de hoy en formato YYYY-MM-DD
    const hoy = new Date().toISOString().split('T')[0];
    
    // Modificar la URL para incluir el filtro por fecha
    const url = new URL(`${API_URL}/api/leads`);
    url.searchParams.append('fecha', hoy);
    
    console.log('Solicitando datos a:', url.toString());
    
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      console.error('Error en la respuesta:', errorData);
      throw new Error(`Error HTTP: ${resp.status} - ${errorData.message || 'Error desconocido'}`);
    }
    
    const responseData = await resp.json();
    console.log('Datos recibidos de la API:', responseData);
    
    if (responseData.success && Array.isArray(responseData.data)) {
      mostrarClientes(responseData.data);
    } else {
      console.error('Formato de respuesta inesperado:', responseData);
      mostrarClientes([]);
    }
  } catch (error) {
    console.error('Error al cargar clientes:', error);
    // Mostrar mensaje de error en la interfaz
    const tbody = document.querySelector('#tablaClientes tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="100%">Error al cargar los datos. Verifique que el servidor esté ejecutándose.</td></tr>';
    }
  }
}

function mostrarClientes(clientes) {
  const tbody = document.querySelector('#tablaClientes tbody');
  if (!tbody) {
    console.error('No se encontró el elemento #tablaClientes tbody');
    return;
  }
  
  tbody.innerHTML = '';
  
  if (!Array.isArray(clientes) || clientes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100%" class="text-center">No se encontraron clientes para la fecha seleccionada.</td>
      </tr>
    `;
    return;
  }
  
  clientes.forEach(cliente => {
    // Extraer valores con valores por defecto para evitar undefined
    const id = cliente._id;
    const nombre = cliente.nombre_cliente || 'Sin nombre';
    const telefono = cliente.telefono_principal || 'Sin teléfono';
    const email = cliente.email || 'Sin email';
    const agente = cliente.agenteNombre || cliente.agente || 'Sin asignar';
    const estado = cliente.status || 'Pendiente';
    const direccion = cliente.direccion || 'Sin dirección';
    const producto = cliente.tipo_servicio || cliente.producto || 'Sin producto';
    
    // Crear botones de acción
    let acciones = `
      <button class="btn btn-sm btn-info mr-1" onclick="mostrarComentarioForm('${id}')">
        <i class="fas fa-comment"></i> Comentar
      </button>
      <button class="btn btn-sm btn-success mr-1" onclick="enviarVentaExistente('${id}')">
        <i class="fas fa-paper-plane"></i> Enviar Venta
      </button>
      <button class="btn btn-sm btn-warning solo-admin" onclick="editarCliente('${id}')">
        <i class="fas fa-edit"></i> Editar
      </button>
      <button class="btn btn-sm btn-danger solo-admin" onclick="eliminarCliente('${id}')">
        <i class="fas fa-trash"></i> Eliminar
      </button>
    `;
    
    // Agregar fila a la tabla
    tbody.innerHTML += `
      <tr>
        <td>${nombre}</td>
        <td>${telefono}</td>
        <td>${email}</td>
        <td>${producto}</td>
        <td>${direccion}</td>
        <td>${agente}</td>
        <td>${estado}</td>
        <td class="text-nowrap">${acciones}</td>
      </tr>
    `;
  });
}

// --- Acciones de botones ---
function mostrarFormularioVenta() {
  document.getElementById('formularioVenta').style.display = '';
}
function mostrarFormularioCliente() {
  document.getElementById('formularioCliente').style.display = '';
}
function ocultarFormularios() {
  document.getElementById('formularioVenta').style.display = 'none';
  document.getElementById('formularioCliente').style.display = 'none';
  document.getElementById('comentarioFormSection').style.display = 'none';
}

// --- Enviar nueva venta (agente o admin) ---
const ventaForm = document.getElementById('ventaForm');
if (ventaForm) {
  ventaForm.onsubmit = async function(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(this).entries());
    const resp = await fetch(`${API_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (resp.ok) {
      alert('Venta guardada');
      this.reset();
      cargarClientes();
    } else {
      alert('No se pudo guardar');
    }
  };
}

// --- Enviar venta para cliente existente ---
async function enviarVentaExistente(id) {
  // Aquí puedes implementar lógica para enviar una venta existente, según tus reglas.
  alert('Función de enviar venta para cliente existente: personaliza según tu flujo.');
}

// --- Agregar/editar cliente (solo admin) ---
const clienteForm = document.getElementById('clienteForm');
if (clienteForm) {
  clienteForm.onsubmit = async function(e) {
    e.preventDefault();
  const data = Object.fromEntries(new FormData(this).entries());
  let url = `${API_URL}/api/leads`;
  let method = 'POST';
  if (data.id) {
    url = `${API_URL}/api/leads/${data.id}`;
    method = 'PUT'; // Debes tener este endpoint en backend
  }
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (resp.ok) {
    alert('Cliente guardado');
    cargarClientes();
    ocultarFormularios();
  } else {
    alert('Error al guardar cliente');
  }
  };
}

// --- Editar cliente (solo admin) ---
async function editarCliente(id) {
  // Puedes hacer un fetch para obtener los datos y rellenar el formulario
  const resp = await fetch(`${API_URL}/api/leads`);
  const clientes = await resp.json();
  const cliente = clientes.find(c => c._id === id);
  if (cliente) {
    const form = document.getElementById('clienteForm');
    form.nombre.value = cliente.nombre;
    form.email.value = cliente.email;
    form.telefono.value = cliente.telefono;
    form.estado.value = cliente.estado || 'nuevo';
    form.id.value = cliente._id;
    mostrarFormularioCliente();
  }
}

// --- Eliminar cliente (solo admin) ---
async function eliminarCliente(id) {
  if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
  const resp = await fetch(`${API_URL}/api/leads/${id}`, {
    method: 'DELETE'
  });
  if (resp.ok) {
    alert('Cliente eliminado');
    cargarClientes();
  } else {
    alert('No se pudo eliminar');
  }
}

// --- Cambiar estado de cliente (solo admin) ---
async function cambiarEstadoCliente(id) {
  const nuevoEstado = prompt('Nuevo estado (nuevo, contactado, vendido):');
  if (!nuevoEstado) return;
  const resp = await fetch(`${API_URL}/api/leads/${id}`, {
    method: 'PATCH', // Asegúrate de tener este endpoint en backend
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: nuevoEstado })
  });
  if (resp.ok) {
    alert('Estado cambiado');
    cargarClientes();
  } else {
    alert('No se pudo cambiar el estado');
  }
}

// --- Comentar cliente (ambos roles) ---
function mostrarComentarioForm(id) {
  const formSection = document.getElementById('comentarioFormSection');
  formSection.style.display = '';
  document.getElementById('comentarioForm').id.value = id;
}

const comentarioForm = document.getElementById('comentarioForm');
if (comentarioForm) {
  comentarioForm.onsubmit = async function(e) {
    e.preventDefault();
    const id = this.id.value;
    const comentario = this.comentario.value;
    const resp = await fetch(`${API_URL}/api/leads/${id}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentario })
    });
    if (resp.ok) {
      alert('Comentario enviado');
      cargarClientes();
      ocultarFormularios();
    } else {
      alert('No se pudo comentar');
    }
  };
}

// --- Cerrar sesión ---
function logout() {
  // Limpiar el localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  // Redirigir al login
  window.location.href = 'login.html';
}

// --- Inicialización ---
window.onload = function() {
  // Configurar el botón de logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      logout();
    });
  }
  
  // Solo cargar clientes si estamos en una página que tiene la tabla
  if (document.querySelector('#tablaClientes tbody')) {
    cargarClientes();
  }
};