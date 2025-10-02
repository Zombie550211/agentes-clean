/**
 * Configuración Global del CRM
 * Centraliza todas las configuraciones del sistema
 */

window.CRM_GLOBAL_CONFIG = {
    // ===== CONFIGURACIÓN DE INACTIVIDAD =====
    inactivity: {
        // Tiempo de inactividad antes del cierre de sesión (en minutos)
        timeoutMinutes: 5,
        
        // Tiempo de advertencia antes del cierre (en minutos)
        warningMinutes: 1,
        
        // Intervalo de verificación (en segundos)
        checkIntervalSeconds: 30,
        
        // Habilitar/deshabilitar el sistema
        enabled: true,
        
        // Páginas excluidas del sistema de inactividad
        excludedPages: [
            'login.html',
            'register.html', 
            'reset-password.html',
            '404.html',
            'debug.html'
        ],
        
        // Configuración de mensajes
        messages: {
            warningTitle: 'Sesión por Expirar',
            warningText: 'Tu sesión expirará en {seconds} segundos debido a inactividad.',
            warningQuestion: '¿Deseas continuar trabajando?',
            logoutTitle: 'Sesión Cerrada',
            logoutText: 'Tu sesión ha sido cerrada por inactividad.',
            redirectText: 'Redirigiendo al login...'
        }
    },
    
    // ===== CONFIGURACIÓN DE SESIÓN =====
    session: {
        tokenKey: 'token',
        userKey: 'user',
        
        // Verificar sesión cada X minutos
        sessionCheckMinutes: 2,
        
        // URLs de autenticación
        loginUrl: '/login.html',
        logoutUrl: '/api/auth/logout'
    },
    
    // ===== CONFIGURACIÓN DE SEGURIDAD =====
    security: {
        // Máximo número de intentos de login
        maxLoginAttempts: 5,
        
        // Tiempo de bloqueo después de intentos fallidos (minutos)
        lockoutMinutes: 15,
        
        // Forzar HTTPS en producción
        enforceHTTPS: false
    },
    
    // ===== CONFIGURACIÓN DE LOGGING =====
    logging: {
        // Nivel de logging: 'debug', 'info', 'warn', 'error', 'none'
        level: 'info',
        
        // Enviar logs al servidor
        sendToServer: false,
        
        // URL del endpoint de logs
        logEndpoint: '/api/logs'
    },
    
    // ===== CONFIGURACIÓN DE API =====
    api: {
        // URL base de la API
        baseUrl: '/api',
        
        // Timeout para requests (milisegundos)
        timeout: 30000,
        
        // Reintentos automáticos
        retries: 3
    },
    
    // ===== CONFIGURACIÓN DE UI =====
    ui: {
        // Tema por defecto
        defaultTheme: 'light',
        
        // Animaciones habilitadas
        animationsEnabled: true,
        
        // Mostrar tooltips
        showTooltips: true
    },
    
    // ===== MÉTODOS DE UTILIDAD =====
    
    /**
     * Obtiene la configuración de inactividad en milisegundos
     */
    getInactivityConfig: function() {
        return {
            timeout: this.inactivity.timeoutMinutes * 60 * 1000,
            warningTime: this.inactivity.warningMinutes * 60 * 1000,
            checkInterval: this.inactivity.checkIntervalSeconds * 1000,
            enabled: this.inactivity.enabled,
            excludedPages: this.inactivity.excludedPages,
            messages: this.inactivity.messages
        };
    },
    
    /**
     * Actualiza la configuración de inactividad
     */
    updateInactivityConfig: function(newConfig) {
        Object.assign(this.inactivity, newConfig);
        
        // Si hay un gestor de inactividad activo, reiniciarlo
        if (window.crmInactivityManager) {
            window.crmInactivityManager.destroy();
            
            // Crear nueva instancia con la configuración actualizada
            setTimeout(() => {
                window.crmInactivityManager = new window.InactivityManager(this.getInactivityConfig());
                console.log('[CRM-CONFIG] Sistema de inactividad reiniciado con nueva configuración');
            }, 100);
        }
    },
    
    /**
     * Verifica si una página debe tener el sistema de inactividad
     */
    shouldEnableInactivity: function(pageName) {
        if (!this.inactivity.enabled) return false;
        
        const currentPage = pageName || window.location.pathname.split('/').pop() || 'index.html';
        return !this.inactivity.excludedPages.some(page => currentPage.includes(page));
    },
    
    /**
     * Obtiene información de la sesión actual
     */
    getSessionInfo: function() {
        try {
            const token = localStorage.getItem(this.session.tokenKey) || 
                         sessionStorage.getItem(this.session.tokenKey);
            const userStr = localStorage.getItem(this.session.userKey) || 
                           sessionStorage.getItem(this.session.userKey);
            
            const user = userStr ? JSON.parse(userStr) : null;
            
            return { token, user, isValid: !!(token && user) };
        } catch (error) {
            console.error('[CRM-CONFIG] Error al obtener información de sesión:', error);
            return { token: null, user: null, isValid: false };
        }
    },
    
    /**
     * Limpia todos los datos de sesión
     */
    clearSession: function() {
        localStorage.removeItem(this.session.tokenKey);
        localStorage.removeItem(this.session.userKey);
        sessionStorage.removeItem(this.session.tokenKey);
        sessionStorage.removeItem(this.session.userKey);
        
        console.log('[CRM-CONFIG] Datos de sesión limpiados');
    },
    
    /**
     * Logs con nivel configurable
     */
    log: function(level, message, ...args) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logging.level);
        const messageLevelIndex = levels.indexOf(level);
        
        if (messageLevelIndex >= currentLevelIndex && console[level]) {
            console[level](`[CRM-${level.toUpperCase()}]`, message, ...args);
        }
    }
};

// Hacer la configuración disponible globalmente
window.CRM_CONFIG = window.CRM_GLOBAL_CONFIG;

// Log de inicialización
console.log('[CRM-CONFIG] Configuración global cargada:', {
    inactivityTimeout: `${window.CRM_CONFIG.inactivity.timeoutMinutes} minutos`,
    warningTime: `${window.CRM_CONFIG.inactivity.warningMinutes} minuto(s)`,
    checkInterval: `${window.CRM_CONFIG.inactivity.checkIntervalSeconds} segundos`,
    enabled: window.CRM_CONFIG.inactivity.enabled
});
