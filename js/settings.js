// Préférences utilisateur, persistées en localStorage.
const Settings = (() => {
  const KEY = 'lightpainting-settings';

  const DEFAULTS = {
    photoFormat: 'jpeg', // 'jpeg' | 'png'
    gridOverlay: false,
    mirrorFrontFinal: false,
    haptics: true,
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
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
