'use strict';
(function(){
  // Decodificador base64url -> JSON string
  function base64UrlDecode(seg){
    try {
      if (!seg) return '';
      // Reemplazar caracteres url-safe y agregar padding
      seg = seg.replace(/-/g, '+').replace(/_/g, '/');
      const pad = seg.length % 4;
      if (pad) seg += '='.repeat(4 - pad);
      return atob(seg);
    } catch { return ''; }
  }

  function decodeTokenRole() {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token || token.split('.').length !== 3) return '';
      const payloadStr = base64UrlDecode(token.split('.')[1]);
      const payload = JSON.parse(payloadStr || '{}');
      return (payload.role || payload.rol || payload.userRole || '').toString().toLowerCase();
    } catch {
      try {
        const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
        return (user.role || user?.usuario?.role || '').toString().toLowerCase();
      } catch { return ''; }
    }
  }

  function setActive(nav, preferKey){
    try {
      // Mapa de claves soportadas
      const map = [
        { key: 'inicio', href: 'inicio.html' },
        { key: 'lead', href: 'lead.html' },
        { key: 'costumer', href: 'Costumer.html' },
        { key: 'register', href: 'register.html' }
      ];
      // 1) Prioridad: atributo data-active si viene de la página
      let target = null;
      const keyAttr = (preferKey || nav.getAttribute('data-active') || '').toLowerCase();
      if (keyAttr) target = map.find(m => m.key === keyAttr);
      // 2) Fallback por URL
      if (!target) {
        const path = (location.pathname || '').toLowerCase();
        const urlTarget = [
          { key: 'inicio', match: 'inicio.html' },
          { key: 'lead', match: 'lead.html' },
          { key: 'costumer', match: 'costumer.html' },
          { key: 'register', match: 'register.html' }
        ].find(m => path.endsWith(m.match));
        if (urlTarget) target = map.find(m => m.key === urlTarget.key);
      }
      const links = nav.querySelectorAll('a.btn.btn-sidebar');
      links.forEach(a => a.classList.remove('is-active'));
      if (!target) return;
      for (const a of links) {
        const ahref = (a.getAttribute('href') || '').toLowerCase();
        if (ahref.endsWith(target.href.toLowerCase())) { a.classList.add('is-active'); break; }
      }
    } catch (e) { console.warn('sidebar active state error', e); }
  }

  function applyAdminVisibility(nav){
    try {
      const role = decodeTokenRole();
      const ids = ['#menu-create-account'];
      ids.forEach(sel => {
        const li = nav.querySelector(sel);
        if (li) li.style.display = role === 'admin' ? 'block' : 'none';
      });
    } catch(e){ console.warn('sidebar admin visibility error', e); }
  }

  function wireLogout(nav){
    const btn = nav.querySelector('[data-logout-button]');
    if (!btn) return;
    btn.addEventListener('click', function(e){
      e.preventDefault();
      try {
        if (typeof window.logout === 'function') {
          return window.logout();
        }
      } catch {}
      try { localStorage.removeItem('token'); } catch{}
      try { sessionStorage.removeItem('token'); } catch{}
      try { localStorage.removeItem('user'); } catch{}
      try { sessionStorage.removeItem('user'); } catch{}
      location.href = 'login.html';
    });
  }

  async function loadSidebar(){
    const nav = document.querySelector('nav.sidebar.sidebar-inicio');
    if (!nav) return;
    try {
      // Ocultar temporalmente para evitar flicker hasta aplicar activo
      const prevVisibility = nav.style.visibility;
      nav.style.visibility = 'hidden';
      const desiredKey = nav.getAttribute('data-active');
      // Usar caché del navegador para acelerar navegación entre páginas
      const resp = await fetch('components/sidebar.html', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('No se pudo cargar sidebar.html');
      const html = await resp.text();
      nav.innerHTML = html;
      // post-setup
      setActive(nav, desiredKey);
      applyAdminVisibility(nav);
      wireLogout(nav);
      // Rellenar la info de usuario si el script está disponible
      try { if (typeof window.cargarInfoUsuario === 'function') window.cargarInfoUsuario(); } catch {}
      // let other scripts (user-info.js) populate name/role after injection
      document.dispatchEvent(new CustomEvent('sidebar:loaded'));
      // Mostrar el nav ya configurado
      nav.style.visibility = prevVisibility || '';
    } catch (e) {
      console.error('Error cargando el sidebar compartido:', e);
      // Asegurar que no quede oculto en caso de error
      try { nav.style.visibility = ''; } catch {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSidebar);
  } else {
    loadSidebar();
  }
})();
