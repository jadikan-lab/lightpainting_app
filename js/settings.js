// Préférences utilisateur, persistées en localStorage.
const Settings = (() => {
  const KEY = 'lightpainting-settings';
  // v4 : les modes façon Huawei (graffiti/phares/étoiles, sensibilité fixe)
  // sont remplacés par 3 styles de capture plus clairs, avec preview live du
  // rendu nettoyé — anciennes valeurs remappées au chargement.
  const SETTINGS_VERSION = 4;
  const OBSOLETE_KEYS = ['haptics', 'motionMask', 'motionSensitivity'];
  const SHOOTING_MODE_MIGRATION = {
    freeform: 'longexposure',
    graffiti: 'olympus',
    lighttrails: 'olympus',
    startrails: 'longexposure',
  };

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
    countdownManuallySet: false, // évite qu'une suggestion de mode n'écrase un choix déjà fait
    // 'longexposure' (pose longue, sans masque) | 'olympus' (fond figé,
    // façon Live Composite) | 'videotrace' (fond live + trainée isolée)
    shootingMode: 'longexposure',
    proMode: false, // affiche le curseur de sensibilité réglable pendant la capture
    maskSensitivityValue: 3.5, // équivalent au préréglage "moyenne"
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if ((parsed._version || 1) < SETTINGS_VERSION) {
        for (const key of OBSOLETE_KEYS) delete parsed[key];
        if (parsed.shootingMode && SHOOTING_MODE_MIGRATION[parsed.shootingMode]) {
          parsed.shootingMode = SHOOTING_MODE_MIGRATION[parsed.shootingMode];
        }
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
