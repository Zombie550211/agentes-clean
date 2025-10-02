/**
 * Sistema de Gestión de Inactividad
 * Cierra la sesión automáticamente después de un período de inactividad
 */

class InactivityManager {
    constructor(options = {}) {
        // Configuración por defecto: 5 minutos de inactividad
        this.timeout = options.timeout || 5 * 60 * 1000; // 5 minutos en milisegundos
        this.warningTime = options.warningTime || 1 * 60 * 1000; // 1 minuto antes de cerrar
        this.checkInterval = options.checkInterval || 30 * 1000; // Verificar cada 30 segundos
        
        this.timer = null;
        this.warningTimer = null;
        this.lastActivity = Date.now();
        this.isWarningShown = false;
        this.isActive = true;
        
        // Eventos que consideramos como actividad del usuario
        this.activityEvents = [
            'mousedown', 'mousemove', 'keypress', 'scroll', 
            'touchstart', 'click', 'keydown', 'resize'
        ];
        
        this.init();
    }
    
    init() {
        console.log('[INACTIVITY] Sistema de inactividad iniciado');
        this.bindEvents();
        this.startTimer();
        this.startPeriodicCheck();
    }
    
    bindEvents() {
        // Agregar listeners para detectar actividad
        this.activityEvents.forEach(event => {
            document.addEventListener(event, () => this.resetTimer(), true);
        });
        
        // Detectar cambios de visibilidad de la página
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.resetTimer();
            }
        });
        
        // Detectar cambios de foco en la ventana
        window.addEventListener('focus', () => this.resetTimer());
        window.addEventListener('blur', () => this.onWindowBlur());
    }
    
    resetTimer() {
        if (!this.isActive) return;
        
        this.lastActivity = Date.now();
        
        // Limpiar timers existentes
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (this.warningTimer) {
            clearTimeout(this.warningTimer);
        }
        
        // Ocultar advertencia si está visible
        if (this.isWarningShown) {
            this.hideWarning();
        }
        
        // Configurar nuevo timer
        this.startTimer();
    }
    
    startTimer() {
        // Timer para mostrar advertencia
        this.warningTimer = setTimeout(() => {
            this.showWarning();
        }, this.timeout - this.warningTime);
        
        // Timer para cerrar sesión
        this.timer = setTimeout(() => {
            this.logout();
        }, this.timeout);
    }
    
    startPeriodicCheck() {
        // Verificación periódica adicional
        setInterval(() => {
            const timeSinceLastActivity = Date.now() - this.lastActivity;
            
            if (timeSinceLastActivity >= this.timeout && this.isActive) {
                console.log('[INACTIVITY] Tiempo de inactividad excedido en verificación periódica');
                this.logout();
            }
        }, this.checkInterval);
    }
    
    showWarning() {
        if (this.isWarningShown || !this.isActive) return;
        
        this.isWarningShown = true;
        console.log('[INACTIVITY] Mostrando advertencia de inactividad');
        
        // Crear modal de advertencia
        const modal = document.createElement('div');
        modal.id = 'inactivity-warning-modal';
        modal.innerHTML = `
            <div class="inactivity-modal-overlay">
                <div class="inactivity-modal-content">
                    <div class="inactivity-modal-header">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Sesión por Expirar</h3>
                    </div>
                    <div class="inactivity-modal-body">
                        <p>Tu sesión expirará en <span id="countdown">60</span> segundos debido a inactividad.</p>
                        <p>¿Deseas continuar trabajando?</p>
                    </div>
                    <div class="inactivity-modal-actions">
                        <button id="continue-session" class="btn-continue">
                            <i class="fas fa-check"></i>
                            Continuar Sesión
                        </button>
                        <button id="logout-now" class="btn-logout">
                            <i class="fas fa-sign-out-alt"></i>
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar estilos al modal
        const styles = document.createElement('style');
        styles.textContent = `
            .inactivity-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                backdrop-filter: blur(5px);
            }
            
            .inactivity-modal-content {
                background: white;
                border-radius: 12px;
                padding: 2rem;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                text-align: center;
                animation: modalSlideIn 0.3s ease-out;
            }
            
            @keyframes modalSlideIn {
                from { transform: translateY(-50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            .inactivity-modal-header {
                margin-bottom: 1.5rem;
            }
            
            .inactivity-modal-header i {
                font-size: 3rem;
                color: #f59e0b;
                margin-bottom: 0.5rem;
            }
            
            .inactivity-modal-header h3 {
                margin: 0;
                color: #374151;
                font-size: 1.5rem;
                font-weight: 600;
            }
            
            .inactivity-modal-body {
                margin-bottom: 2rem;
                color: #6b7280;
                line-height: 1.6;
            }
            
            #countdown {
                font-weight: bold;
                color: #ef4444;
                font-size: 1.1em;
            }
            
            .inactivity-modal-actions {
                display: flex;
                gap: 1rem;
                justify-content: center;
            }
            
            .inactivity-modal-actions button {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .btn-continue {
                background: #10b981;
                color: white;
            }
            
            .btn-continue:hover {
                background: #059669;
                transform: translateY(-1px);
            }
            
            .btn-logout {
                background: #ef4444;
                color: white;
            }
            
            .btn-logout:hover {
                background: #dc2626;
                transform: translateY(-1px);
            }
        `;
        
        document.head.appendChild(styles);
        document.body.appendChild(modal);
        
        // Configurar eventos del modal
        document.getElementById('continue-session').addEventListener('click', () => {
            this.resetTimer();
        });
        
        document.getElementById('logout-now').addEventListener('click', () => {
            this.logout();
        });
        
        // Iniciar countdown
        this.startCountdown();
    }
    
    startCountdown() {
        let seconds = 60;
        const countdownElement = document.getElementById('countdown');
        
        const countdownInterval = setInterval(() => {
            seconds--;
            if (countdownElement) {
                countdownElement.textContent = seconds;
            }
            
            if (seconds <= 0 || !this.isWarningShown) {
                clearInterval(countdownInterval);
            }
        }, 1000);
    }
    
    hideWarning() {
        const modal = document.getElementById('inactivity-warning-modal');
        if (modal) {
            modal.remove();
        }
        this.isWarningShown = false;
    }
    
    onWindowBlur() {
        // Cuando la ventana pierde el foco, consideramos que el usuario podría estar inactivo
        console.log('[INACTIVITY] Ventana perdió el foco');
    }
    
    logout() {
        if (!this.isActive) return;
        
        console.log('[INACTIVITY] Cerrando sesión por inactividad');
        this.isActive = false;
        
        // Ocultar advertencia si está visible
        this.hideWarning();
        
        // Limpiar timers
        if (this.timer) clearTimeout(this.timer);
        if (this.warningTimer) clearTimeout(this.warningTimer);
        
        // Mostrar mensaje de cierre de sesión
        this.showLogoutMessage();
        
        // Limpiar datos de sesión
        this.clearSession();
        
        // Redirigir al login después de un breve delay
        setTimeout(() => {
            window.location.replace('/login.html?message=Sesión cerrada por inactividad');
        }, 2000);
    }
    
    showLogoutMessage() {
        const message = document.createElement('div');
        message.innerHTML = `
            <div class="logout-message-overlay">
                <div class="logout-message-content">
                    <i class="fas fa-clock"></i>
                    <h3>Sesión Cerrada</h3>
                    <p>Tu sesión ha sido cerrada por inactividad.</p>
                    <p>Redirigiendo al login...</p>
                    <div class="spinner"></div>
                </div>
            </div>
        `;
        
        const styles = document.createElement('style');
        styles.textContent = `
            .logout-message-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }
            
            .logout-message-content {
                background: white;
                border-radius: 12px;
                padding: 2rem;
                text-align: center;
                max-width: 350px;
                width: 90%;
            }
            
            .logout-message-content i {
                font-size: 3rem;
                color: #ef4444;
                margin-bottom: 1rem;
            }
            
            .logout-message-content h3 {
                margin: 0 0 1rem 0;
                color: #374151;
            }
            
            .logout-message-content p {
                color: #6b7280;
                margin: 0.5rem 0;
            }
            
            .spinner {
                border: 3px solid #f3f4f6;
                border-top: 3px solid #3b82f6;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 1rem auto 0;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        document.head.appendChild(styles);
        document.body.appendChild(message);
    }
    
    clearSession() {
        // Limpiar localStorage y sessionStorage
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        
        console.log('[INACTIVITY] Datos de sesión limpiados');
    }
    
    // Método para pausar el sistema (útil para modales importantes)
    pause() {
        this.isActive = false;
        if (this.timer) clearTimeout(this.timer);
        if (this.warningTimer) clearTimeout(this.warningTimer);
        console.log('[INACTIVITY] Sistema pausado');
    }
    
    // Método para reanudar el sistema
    resume() {
        this.isActive = true;
        this.resetTimer();
        console.log('[INACTIVITY] Sistema reanudado');
    }
    
    // Método para destruir el sistema
    destroy() {
        this.isActive = false;
        if (this.timer) clearTimeout(this.timer);
        if (this.warningTimer) clearTimeout(this.warningTimer);
        
        // Remover event listeners
        this.activityEvents.forEach(event => {
            document.removeEventListener(event, this.resetTimer, true);
        });
        
        console.log('[INACTIVITY] Sistema destruido');
    }
}

// Inicializar automáticamente si estamos en una página protegida
document.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar si no estamos en la página de login
    if (!window.location.pathname.includes('login.html')) {
        // Verificar si hay una sesión activa
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        
        if (token) {
            // Configuración personalizable
            const config = {
                timeout: 5 * 60 * 1000,      // 5 minutos
                warningTime: 1 * 60 * 1000,   // 1 minuto de advertencia
                checkInterval: 30 * 1000      // Verificar cada 30 segundos
            };
            
            window.inactivityManager = new InactivityManager(config);
            console.log('[INACTIVITY] Sistema iniciado automáticamente');
        }
    }
});

// Exportar para uso global
window.InactivityManager = InactivityManager;
