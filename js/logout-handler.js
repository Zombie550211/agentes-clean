/**
 * Manejador de cierre de sesión para todas las páginas
 * Este script debe incluirse en todas las páginas que requieran funcionalidad de cierre de sesión
 */

document.addEventListener('DOMContentLoaded', function() {
    // Configurar el manejador de clic para todos los botones de cierre de sesión
    const logoutButtons = document.querySelectorAll('[data-logout-button]');
    
    logoutButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            cerrarSesion();
        });
    });

    // Función para cerrar sesión
    function cerrarSesion() {
        // Eliminar tokens y datos de usuario de todos los almacenamientos
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        
        // Redirigir a la página de login
        window.location.href = '/login.html';
    }

    // Hacer la función disponible globalmente
    window.cerrarSesion = cerrarSesion;
});
