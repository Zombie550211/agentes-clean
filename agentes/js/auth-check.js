// Verifica autenticación antes de cargar el dashboard.
// Soporta tanto token en Storage como cookie HttpOnly (credentials: 'include').
(async function () {
  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    // Primero intentar validar sesión usando cookie (si existe)
    const res = await fetch('/api/protected', { method: 'GET', credentials: 'include' });
    if (res.ok) return; // autenticado por cookie
    // Si cookie no válida, probar con token en header (compatibilidad)
    if (token) {
      const res2 = await fetch('/api/protected', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res2.ok) return;
    }
  } catch (_) {}
  // Si ninguna opción autentica, redirigir a login
  window.location.href = '/login.html';
})();