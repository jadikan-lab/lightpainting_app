// Préférences utilisateur, persistées en localStorage.
const Settings = (() => {
  const KEY = 'lightpainting-settings';
  // v2 : le masque de mouvement s'est révélé peu fiable en conditions réelles
  // (trainées non accumulées sur certains appareils) — repassé à false par
  // défaut, et forcé une fois pour les utilisateurs ayant déjà la v1 stockée.
  const SETTINGS_VERSION = 2;

  const DEFAULTS = {
    photoFormat: 'jpeg', // 'jpeg' | 'png'
    gridOverlay: false,
    mirrorFrontFinal: false,
    haptics: true,
    motionMask: false,
    motionSensitivity: 'medium', // 'low' | 'medium' | 'high'
    timelapseEnabled: true,
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if ((parsed._version || 1) < SETTINGS_VERSION) {
        delete parsed.motionMask;
      }
      return { ...DEFAULTS, ...parsed, _version: SETTINGS_VERSION };
    } catch {
      return { ...DEFAULTS, _version: SETTINGS_VERSION };
    }
  }

  let current = load();

  function get(key) {
    return current[key];
  }

  function set(key, value) {
    current = { ...current, [key]: value };
    localStorage.setItem(KEY, JSON.stringify(current));
  }

  function getAll() {
    return { ...current };
  }

  return { get, set, getAll, DEFAULTS };
})();
