/*
  FormConfig y utilidades para formularios dinámicos por equipo.
  - Define configuración por defecto y overrides por equipo (p.ej. 'team lineas').
  - Exponer globales: window.FormConfig, window.applyTeamFormConfig
  Uso esperado en lead.html:
    <script src="/js/form-config.js"></script>
    <script>
      // obtener teamKey del usuario actual, p.ej. 'team lineas'
      applyTeamFormConfig(teamKey);
    </script>
*/

(function () {
  const DEFAULTS = {
    fields: {
      nombre_cliente: { visible: true, required: true, label: 'Nombre del Cliente', type: 'text' },
      telefono_principal: { visible: true, required: true, label: 'Teléfono Principal', type: 'tel' },
      numero_cuenta: { visible: true, required: true, label: 'Número de Cuenta', type: 'text' },
      autopay: { visible: true, required: true, label: 'Autopay', type: 'select', options: ['si', 'no'], placeholder: 'Seleccione' },
      pin_seguridad: { visible: true, required: true, label: 'PIN de Seguridad', type: 'text' },
      direccion: { visible: true, required: true, label: 'Dirección', type: 'text' },
      servicios: { visible: true, required: true, label: 'Servicios', type: 'checkboxes', options: ['INTERNET', 'TV', 'TELEFONIA'] },
      dia_venta: { visible: true, required: true, label: 'Día de venta', type: 'date' },
      dia_instalacion: { visible: true, required: true, label: 'Día de instalación', type: 'date' },
      status: { visible: true, required: true, label: 'Status', type: 'select', options: ['PENDING', 'REPRO'] },
      cantidad_lineas: { visible: true, required: true, label: 'Cantidad de Líneas', type: 'select', options: ['1','2','3','4','5'] },
      telefonos: { visible: true, required: true, label: 'Teléfonos', type: 'tel[]', max: 5 },
      ID: { visible: true, required: true, label: 'ID', type: 'text' },
      mercado: { visible: true, required: true, label: 'Mercado', type: 'select', options: ['BAMO', 'ICON'] },
      supervisor: { visible: true, required: true, label: 'Supervisor', type: 'select', options: ['JONATHAN', 'DIEGO'] }
    }
  };

  const TEAM_LINEAS = {
    key: 'team lineas',
    fields: {
      // Overrides específicos si aplica, si no hereda de DEFAULTS
      servicios: { visible: true, required: true, label: 'Servicios (múltiple)', type: 'checkboxes', options: ['INTERNET', 'TV', 'TELEFONIA'] },
      status: { visible: true, required: true, label: 'Status', type: 'select', options: ['PENDING', 'REPRO'] },
      supervisor: { visible: true, required: true, label: 'Supervisor', type: 'select', options: ['JONATHAN', 'DIEGO'] },
      mercado: { visible: true, required: true, label: 'Mercado', type: 'select', options: ['BAMO', 'ICON'] },
      cantidad_lineas: { visible: true, required: true, label: 'Cantidad de Líneas', type: 'select', options: ['1','2','3','4','5'] },
      telefonos: { visible: true, required: true, label: 'Teléfonos (según cantidad)', type: 'tel[]', max: 5 },
      ID: { visible: true, required: true, label: 'ID', type: 'text' }
    }
  };

  function deepMerge(base, override) {
    const out = Array.isArray(base) ? base.slice() : { ...(base || {}) };
    for (const k of Object.keys(override || {})) {
      const bv = base ? base[k] : undefined;
      const ov = override[k];
      if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
        out[k] = deepMerge(bv, ov);
      } else {
        out[k] = Array.isArray(ov) ? ov.slice() : ov;
      }
    }
    return out;
  }

  const FormConfig = {
    defaults: DEFAULTS,
    teams: {
      'team lineas': deepMerge(DEFAULTS, TEAM_LINEAS)
    }
  };

  function setVisibility(el, show) {
    if (!el) return;
    const container = el.closest('[data-field]') || el;
    container.style.display = show ? '' : 'none';
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      if (!show) {
        el.setAttribute('data-prev-required', el.required ? '1' : '0');
        el.required = false;
      } else {
        if (el.getAttribute('data-prev-required') === '1') el.required = true;
      }
    }
  }

  function applyFieldConfig(key, cfg) {
    // Busca por data-field="key"; si no, intenta por id/name
    let el = document.querySelector(`[data-field="${key}"] input, [data-field="${key}"] select, [data-field="${key}"] textarea`);
    if (!el) el = document.getElementById(key);
    if (!el) el = document.querySelector(`[name="${key}"]`);
    if (!el) return; // tolerante a faltantes

    // Label
    const container = el.closest('[data-field]') || el.closest('.form-group') || el.parentElement;
    const label = container ? container.querySelector('label') : null;
    if (label && cfg.label) label.textContent = cfg.label;

    // Visibilidad
    setVisibility(el, cfg.visible !== false);

    // Required
    if (typeof cfg.required === 'boolean') el.required = cfg.required;

    // Tipo y opciones (select/checkboxes)
    if (cfg.type === 'select' && Array.isArray(cfg.options)) {
      if (el.tagName === 'SELECT') {
        // Conservar placeholder si existe
        const placeholderOpt = el.querySelector('option[value=""]');
        el.innerHTML = '';
        if (cfg.placeholder || placeholderOpt) {
          const opt0 = document.createElement('option');
          opt0.value = '';
          opt0.textContent = cfg.placeholder || (placeholderOpt ? placeholderOpt.textContent : 'Seleccione');
          el.appendChild(opt0);
        }
        for (const opt of cfg.options) {
          const o = document.createElement('option');
          o.value = String(opt).toLowerCase();
          o.textContent = String(opt);
          el.appendChild(o);
        }
      }
    }
    if (cfg.type === 'checkboxes' && Array.isArray(cfg.options)) {
      // Contenedor de checkboxes dentro del data-field
      const group = container ? container.querySelector('.checkbox-group') || container : null;
      if (group) {
        group.innerHTML = '';
        for (const opt of cfg.options) {
          const id = `${key}_${String(opt).toLowerCase()}`;
          const w = document.createElement('div');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.id = id;
          input.name = key;
          input.value = String(opt);
          const lbl = document.createElement('label');
          lbl.setAttribute('for', id);
          lbl.textContent = String(opt);
          w.appendChild(input);
          w.appendChild(lbl);
          group.appendChild(w);
        }
      }
    }
  }

  function applyTeamFormConfig(teamKey) {
    try {
      const key = String(teamKey || '').toLowerCase();
      const cfg = FormConfig.teams[key] || FormConfig.defaults;
      const fields = (cfg && cfg.fields) || {};
      Object.keys(fields).forEach(f => applyFieldConfig(f, fields[f] || {}));

      // Reglas: cantidad_lineas controla número de inputs de teléfono visibles
      const cantidadSelect = document.querySelector('[data-field="cantidad_lineas"] select') || document.getElementById('cantidad_lineas') || document.querySelector('[name="cantidad_lineas"]');
      const telefonoContainers = [1,2,3,4,5].map(i =>
        document.querySelector(`[data-field="telefono_${i}"]`) || document.getElementById(`telefono_${i}`)?.closest('[data-field]') || null
      );
      const updateTelefonos = () => {
        const n = Number((cantidadSelect && cantidadSelect.value) || 0) || 0;
        telefonoContainers.forEach((cont, idx) => {
          if (!cont) return;
          const input = cont.querySelector('input');
          const show = idx < n;
          cont.style.display = show ? '' : 'none';
          if (input) input.required = show; // requeridos solo los visibles
        });
      };
      if (cantidadSelect) {
        cantidadSelect.addEventListener('change', updateTelefonos);
        updateTelefonos();
      }
    } catch (e) {
      console.warn('applyTeamFormConfig error:', e);
    }
  }

  // Exponer globals
  window.FormConfig = FormConfig;
  window.applyTeamFormConfig = applyTeamFormConfig;
})();
