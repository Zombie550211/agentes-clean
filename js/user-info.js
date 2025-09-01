/**
 * user-info.js - Carga y muestra la información del usuario en el sidebar
 * Este script debe incluirse en todas las páginas que muestren el sidebar
 */

document.addEventListener('DOMContentLoaded', function() {
  // Función para normalizar y mostrar la información del usuario en el sidebar
  function cargarInfoUsuario() {
    // Obtener datos del usuario del localStorage o sessionStorage
    let userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
    let user = {};

    try {
      if (userStr) {
        user = JSON.parse(userStr) || {};
      } else {
        // Fallback: intentar obtener desde el token JWT como en inicio.html
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token && token.split('.').length === 3) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1])) || {};
            user = {
              name: payload.username || payload.name || 'Usuario',
              role: payload.role || payload.rol || 'usuario'
            };
          } catch (e) {
            console.warn('No se pudo decodificar el token para cargar usuario');
          }
        } else {
          console.warn('No se encontró información del usuario en el almacenamiento local ni token');
        }
      }

      // Resolver nombre visible con múltiples posibles campos
      const displayName = (
        user.name ||
        user.fullName ||
        user.username ||
        (user.usuario && (user.usuario.name || user.usuario.fullName || user.usuario.username)) ||
        user.email ||
        'Usuario'
      ).toString();

      // Resolver rol soportando estructuras anidadas y variantes
      const rawRole = (
        user.role ||
        (user.usuario && user.usuario.role) ||
        ''
      ).toString().toLowerCase().trim();

      const roleMap = {
        admin: 'Administrador',
        supervisor: 'Supervisor',
        agent: 'Agente',
        backoffice: 'Backoffice',
        'b:o': 'Backoffice',
        'b.o': 'Backoffice',
        'b-o': 'Backoffice',
        bo: 'Backoffice'
      };
      const displayRole = roleMap[rawRole] || (rawRole ? rawRole.charAt(0).toUpperCase() + rawRole.slice(1) : 'Usuario');

      // Pintar nombre
      const userNameElement = document.getElementById('user-name');
      if (userNameElement) {
        userNameElement.textContent = displayName;
      }

      // Pintar rol
      const userRoleElement = document.getElementById('user-role');
      if (userRoleElement) {
        userRoleElement.textContent = displayRole;
      }

      // Avatar por rol
      const userAvatar = document.querySelector('.user-info .user-avatar i') || document.querySelector('.user-info .avatar i');
      if (userAvatar) {
        const roleIcons = {
          admin: 'user-shield',
          supervisor: 'user-tie',
          agent: 'user',
          backoffice: 'user-shield'
        };
        const iconClass = roleIcons[rawRole] || 'user-circle';
        userAvatar.className = `fas fa-${iconClass}`;
      }
    } catch (error) {
      console.error('Error al procesar la información del usuario:', error);
    }
  }

  // Cargar la información del usuario cuando el DOM esté listo
  cargarInfoUsuario();

  // Exponer globalmente
  window.cargarInfoUsuario = cargarInfoUsuario;
  // Volver a pintar cuando el sidebar compartido termine de inyectarse
  document.addEventListener('sidebar:loaded', cargarInfoUsuario);
});
