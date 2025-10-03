/**
 * Interceptor global para fetch que incluye automáticamente el token de autenticación
 */
(function() {
    'use strict';
    
    // Guardar la función fetch original
    const originalFetch = window.fetch;
    
    // Función para obtener el token
    function getToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    }
    
    // Función para limpiar el token
    function cleanToken(token) {
        return token ? token.replace(/^['"]|['"]$/g, '').trim() : null;
    }
    
    // Interceptor de fetch
    window.fetch = function(url, options = {}) {
        // Obtener el token
        const token = getToken();
        
        // Si hay token y la URL es una petición a la API
        if (token && (url.startsWith('/api/') || url.includes('/api/'))) {
            const cleanedToken = cleanToken(token);
            
            // Asegurar que options.headers existe
            options.headers = options.headers || {};
            
            // Agregar el token al header Authorization si no existe
            if (!options.headers['Authorization'] && !options.headers['authorization']) {
                options.headers['Authorization'] = `Bearer ${cleanedToken}`;
            }
            
            // Asegurar que credentials está configurado
            if (!options.credentials) {
                options.credentials = 'include';
            }
            
            console.log('[FETCH-INTERCEPTOR] Token agregado a petición:', url);
        }
        
        // Llamar a la función fetch original
        return originalFetch.call(this, url, options)
            .then(response => {
                // Si la respuesta es 401 (no autorizado), limpiar tokens y redirigir
                if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
                    console.warn('[FETCH-INTERCEPTOR] Token expirado o inválido, limpiando sesión...');
                    
                    // Limpiar tokens
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    sessionStorage.removeItem('token');
                    sessionStorage.removeItem('user');
                    
                    // Redirigir al login si no estamos ya ahí
                    if (!window.location.pathname.includes('login.html')) {
                        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
                        window.location.href = `/login.html?redirect=${currentPath}`;
                    }
                }
                
                return response;
            })
            .catch(error => {
                console.error('[FETCH-INTERCEPTOR] Error en petición:', error);
                throw error;
            });
    };
    
    console.log('[FETCH-INTERCEPTOR] Interceptor de fetch inicializado');
})();
