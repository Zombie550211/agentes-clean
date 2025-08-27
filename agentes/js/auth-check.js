// Verifica si existe token en localStorage o sessionStorage antes de cargar el dashboard
(function () {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) {
    window.location.href = "/login.html";
  }
})();