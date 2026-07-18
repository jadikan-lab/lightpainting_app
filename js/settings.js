// Préférences utilisateur, persistées en localStorage.
const Settings = (() => {
  const KEY = 'lightpainting-settings';
  // v3 : suppression des vibrations (jugées inutiles) et du masque de
  // mouvement (resté noir/saccadé en conditions réelles, remplacé par la
  // vue combinée vidéo+trainées) — clés obsolètes purgées au chargement.
  const SETTINGS_VERSION = 3;
  const OBSOLETE_KEYS = ['haptics', 'motionMask', 'motionSensitivity'];

  const DEFAULTS = {
    photoFormat: 'jpeg', // 'jpeg' | 'png'
    gridOverlay: false,
    mirrorFrontFinal: false,
    // Enregistrer la vidéo brute du processus en même temps que la capture
    // fait concourir l'encodeur avec la boucle de composition du canvas pour
    // les mêmes ressources — désactivé par défaut pour garantir des trainées
    // nettes, activable pour les appareils qui encaissent les deux à la fois.
    videoRecordingEnabled: false,
    timelapseEnabled: true,
    countdownSeconds: 0, // 0 = désactivé
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if ((parsed._version || 1) < SETTINGS_VERSION) {
        for (const key of OBSOLETE_KEYS) delete parsed[key];
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
