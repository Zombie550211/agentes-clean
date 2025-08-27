/**
 * Manejador de cierre de sesión unificado
 * Este script debe ser incluido en todas las páginas que requieran funcionalidad de cierre de sesión
 */

document.addEventListener('DOMContentLoaded', function() {
    // Función para cerrar sesión
    function cerrarSesion(e) {
        if (e) e.preventDefault();
        
        console.log('Cerrando sesión...');
        
        // 1. Eliminar datos de autenticación
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        localStorage.removeItem('userData');
        
        // 2. Redirigir a la página de inicio
        window.location.href = 'inicio.html';
    }

    // Configurar todos los botones de cierre de sesión
    const logoutButtons = document.querySelectorAll('#logoutBtn, [id^=logout-], [id$=-logout], .logout-button');
    
    if (logoutButtons.length > 0) {
        logoutButtons.forEach(button => {
            button.addEventListener('click', cerrarSesion);
        });
        console.log('Botones de cierre de sesión configurados:', logoutButtons.length);
    } else {
        console.warn('No se encontraron botones de cierre de sesión en esta página');
    }

    // También exponer la función globalmente por si se necesita llamar desde otros scripts
    window.cerrarSesion = cerrarSesion;
});
