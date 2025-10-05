/**
 * Script de Inicialización Universal del CRM
 * Incluye automáticamente el sistema de inactividad y otras funcionalidades globales
 */

(function() {
    'use strict';
    
    // Usar configuración global si está disponible, sino usar configuración por defecto
    const CRM_CONFIG = window.CRM_GLOBAL_CONFIG || {
        // Configuración del sistema de inactividad (fallback)
        inactivity: {
            timeout: 5 * 60 * 1000,      // 5 minutos de inactividad
            warningTime: 1 * 60 * 1000,   // Advertir 1 minuto antes
            checkInterval: 30 * 1000,     // Verificar cada 30 segundos
            enabled: true                 // Habilitar sistema
        },
        
        // Páginas que NO requieren el sistema de inactividad
        excludedPages: [
            'login.html',
            'register.html',
            'reset-password.html',
            '404.html'
        ],
        
        // Configuración de sesión
        session: {
            tokenKey: 'token',
            userKey: 'user'
        },
        
        // Método para obtener configuración de inactividad
        getInactivityConfig: function() {
            return this.inactivity;
        }
    };
    
    /**
     * Verifica si la página actual debe tener el sistema de inactividad
     */
    function shouldEnableInactivity() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        // Verificar si la página está en la lista de exclusiones
        const isExcluded = CRM_CONFIG.inactivity.excludedPages.some(page => 
            currentPage.includes(page)
        );
        
        if (isExcluded) {
            console.log('[CRM-INIT] Página excluida del sistema de inactividad:', currentPage);
            return false;
        }
        
        // Verificar si hay una sesión activa
        const token = localStorage.getItem(CRM_CONFIG.session.tokenKey) || 
                     sessionStorage.getItem(CRM_CONFIG.session.tokenKey);
        
        if (!token) {
            console.log('[CRM-INIT] No hay sesión activa, sistema de inactividad no iniciado');
            return false;
        }
        
        return CRM_CONFIG.inactivity.enabled;
    }
    
    /**
     * Inicializa el sistema de inactividad
     */
    function initInactivitySystem() {
        if (!shouldEnableInactivity()) {
            return;
        }
        
        // Verificar si InactivityManager está disponible
        if (typeof window.InactivityManager === 'undefined') {
            console.error('[CRM-INIT] InactivityManager no está disponible. Asegúrate de incluir inactivity-manager.js');
            return;
        }
        
        try {
            // Obtener configuración de inactividad
            const inactivityConfig = CRM_CONFIG.getInactivityConfig ? 
                CRM_CONFIG.getInactivityConfig() : 
                CRM_CONFIG.inactivity;
            
            // Crear instancia del gestor de inactividad
            window.crmInactivityManager = new window.InactivityManager(inactivityConfig);
            
            console.log('[CRM-INIT] Sistema de inactividad iniciado correctamente');
            console.log('[CRM-INIT] Configuración:', {
                timeout: `${inactivityConfig.timeout / 1000 / 60} minutos`,
                warning: `${inactivityConfig.warningTime / 1000 / 60} minuto(s) antes`,
                checkInterval: `${inactivityConfig.checkInterval / 1000} segundos`
            });
            
        } catch (error) {
            console.error('[CRM-INIT] Error al inicializar sistema de inactividad:', error);
        }
    }
    
    /**
     * Funciones de utilidad para el CRM
     */
    window.CRM = {
        // Pausar sistema de inactividad (útil para modales importantes)
        pauseInactivity: function() {
            if (window.crmInactivityManager) {
                window.crmInactivityManager.pause();
            }
        },
        
        // Reanudar sistema de inactividad
        resumeInactivity: function() {
            if (window.crmInactivityManager) {
                window.crmInactivityManager.resume();
            }
        },
        
        // Reiniciar timer de inactividad manualmente
        resetInactivityTimer: function() {
            if (window.crmInactivityManager) {
                window.crmInactivityManager.resetTimer();
            }
        },
        
        // Obtener información de la sesión actual
        getSessionInfo: function() {
            const token = localStorage.getItem(CRM_CONFIG.session.tokenKey) || 
                         sessionStorage.getItem(CRM_CONFIG.session.tokenKey);
            const userStr = localStorage.getItem(CRM_CONFIG.session.userKey) || 
                           sessionStorage.getItem(CRM_CONFIG.session.userKey);
            
            let user = null;
            try {
                user = userStr ? JSON.parse(userStr) : null;
            } catch (e) {
                console.warn('[CRM-INIT] Error al parsear información del usuario');
            }
            
            return { token, user };
        },
        
        // Verificar si hay una sesión válida
        hasValidSession: function() {
            const { token, user } = this.getSessionInfo();
            return !!(token && user);
        },
        
        // Configuración del CRM
        config: CRM_CONFIG
    };
    
    /**
     * Inicialización cuando el DOM esté listo
     */
    function init() {
        console.log('[CRM-INIT] Inicializando sistema CRM...');
        
        // Inicializar sistema de inactividad
        initInactivitySystem();
        
        // Agregar listener para detectar cambios de visibilidad
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && window.crmInactivityManager) {
                // Cuando la página vuelve a ser visible, resetear el timer
                window.crmInactivityManager.resetTimer();
                console.log('[CRM-INIT] Página visible, timer de inactividad reseteado');
            }
        });
        
        // Agregar listener para beforeunload (cuando el usuario cierra la página)
        window.addEventListener('beforeunload', function() {
            if (window.crmInactivityManager) {
                window.crmInactivityManager.destroy();
            }
        });
        
        console.log('[CRM-INIT] Sistema CRM inicializado correctamente');
    }
    
    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
