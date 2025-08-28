(function(){
  // Normalizador seguro de nombres (quita acentos, espacios extra y pasa a lower)
  const norm = (s) => {
    try {
      return String(s || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}+/gu, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    } catch { return ''; }
  };

  // Definición inicial de equipos (seed). Expandir aquí según crezcan los equipos.
  // Nota: guardar nombres en formato canónico: todo minúsculas, sin acentos
  const TEAMS = {
    'team irania': {
      displayName: 'TEAM IRANIA',
      supervisor: 'irania serrano',
      agents: [
        'josue renderos',
        'tatiana ayala',
        'giselle diaz',
        'miguel nunez',
        'roxana martinez',
        'irania serrano'
      ]
    },
    // TEAM BRYAN PLEITEZ
    'team bryan pleitez': {
      displayName: 'TEAM BRYAN PLEITEZ',
      supervisor: 'bryan pleitez',
      agents: [
        'abigail galdamez',
        'alexander rivera',
        'diego mejia',
        'evelin garcia',
        'fabricio panameno',
        'luis chavarria',
        'steven varela'
      ]
    },
    // TEAM MARISOL BELTRAN
    'team marisol beltran': {
      displayName: 'TEAM MARISOL BELTRAN',
      supervisor: 'marisol beltran',
      agents: [
        'fernanda castillo',
        'jonathan morales',
        'katerine gomez',
        'kimberly iglesias',
        'stefani martinez'
      ]
    },
    // TEAM ROBERTO VELASQUEZ
    'team roberto velasquez': {
      displayName: 'TEAM ROBERTO VELASQUEZ',
      supervisor: 'roberto velasquez',
      agents: [
        'cindy flores',
        'daniela bonilla',
        'francisco aguilar',
        'levy ceren',
        'lisbeth cortez',
        'lucia ferman',
        'nelson ceren'
      ]
    },
    // TEAM RANDAL MARTINEZ
    'team randal martinez': {
      displayName: 'TEAM RANDAL MARTINEZ',
      supervisor: 'randal martinez',
      agents: [
        'anderson guzman',
        'carlos grande',
        'guadalupe santana',
        'julio chavez',
        'priscila hernandez',
        'riquelmi torres'
      ]
    }
  };

  // Índices derivados para búsquedas rápidas
  const agentToTeam = new Map();
  const supervisorToTeam = new Map();
  const canonicalNames = new Set();

  const registerTeam = (teamKey, def) => {
    const key = norm(teamKey);
    if (!key || !def) return;
    const sup = norm(def.supervisor);
    const agents = (def.agents || []).map(norm).filter(Boolean);
    TEAMS[key] = {
      displayName: def.displayName || teamKey,
      supervisor: sup,
      agents
    };
  };

  // Construir índices
  Object.entries(TEAMS).forEach(([k, def]) => {
    const key = norm(k);
    const sup = norm(def.supervisor);
    supervisorToTeam.set(sup, key);
    (def.agents || []).forEach(a => {
      const ca = norm(a);
      if (ca) {
        agentToTeam.set(ca, key);
        canonicalNames.add(ca);
      }
    });
    if (sup) canonicalNames.add(sup);
  });

  // Canoniza un nombre a uno de los canónicos conocidos (por tokens incluidos)
  const canonicalFromName = (name) => {
    const n = norm(name);
    if (!n) return '';
    if (canonicalNames.has(n)) return n;
    // Match por tokens: todos los tokens del canónico existen en n
    for (const c of canonicalNames) {
      const toks = c.split(' ');
      if (toks.every(t => n.includes(t))) return c;
    }
    return '';
  };

  const getAllTeams = () => Object.keys(TEAMS);
  const getTeamDef = (teamKey) => TEAMS[norm(teamKey)] || null;
  const getTeamByAgent = (agentName) => agentToTeam.get(canonicalFromName(agentName)) || '';
  const getTeamBySupervisor = (supName) => supervisorToTeam.get(canonicalFromName(supName)) || '';
  const isSupervisor = (name) => !!supervisorToTeam.get(canonicalFromName(name));
  const getAgentsByTeam = (teamKey) => (getTeamDef(teamKey)?.agents || []).slice();
  const getAgentsBySupervisor = (supName) => {
    const team = getTeamBySupervisor(supName);
    return team ? getAgentsByTeam(team) : [];
  };
  const getSupervisorByAgent = (agentName) => {
    const team = getTeamByAgent(agentName);
    return team ? (getTeamDef(team)?.supervisor || '') : '';
  };

  // Deducción de team por usuario actual (si hay objeto usuario)
  const getTeamForUser = (user) => {
    try {
      const name = user?.name || user?.nombre || user?.username || user?.email || '';
      const cn = canonicalFromName(name);
      // Si es supervisor
      const tSup = getTeamBySupervisor(cn);
      if (tSup) return tSup;
      // Si es agente
      const tAg = getTeamByAgent(cn);
      if (tAg) return tAg;
      return '';
    } catch { return ''; }
  };

  // Exponer API pública en window
  window.Teams = {
    norm,
    TEAMS, // referencia (no congelada) por si se quiere extender dinámicamente
    registerTeam,
    canonicalFromName,
    getAllTeams,
    getTeamDef,
    getTeamByAgent,
    getTeamBySupervisor,
    isSupervisor,
    getAgentsByTeam,
    getAgentsBySupervisor,
    getSupervisorByAgent,
    getTeamForUser
  };
})();
