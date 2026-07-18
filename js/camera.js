// Gère le flux caméra : ouverture, bascule avant/arrière, résolution native max,
// et les réglages avancés quand le navigateur/l'appareil les expose (torche,
// zoom, verrouillage focus/exposition) — tous avec repli silencieux si absents.
const Camera = (() => {
  let videoEl = null;
  let stream = null;
  let facingMode = 'environment';

  function buildConstraints(mode) {
    return {
      audio: false,
      video: {
        facingMode: { ideal: mode },
        // Le canvas d'accumulation recompose chaque frame en pleine résolution ;
        // au-delà du Full HD, le coût par frame fait chuter le débit d'images
        // en dessous de ce qu'il faut pour une trainée continue (visible sur
        // certains téléphones sous forme de points isolés au lieu d'un trait).
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
    };
  }

  const GET_USER_MEDIA_TIMEOUT_MS = 10000;

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  // getUserMedia() peut rester en attente indéfiniment sur certains
  // appareils/états de permission (jamais résolue ni rejetée) — sans
  // timeout, l'app reste bloquée sur "Chargement de la caméra…" sans
  // aucun message. Ce timeout garantit un retour explicite dans tous les cas.
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('getUserMedia-timeout')), ms);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  async function start(mode) {
    stopStream();
    try {
      stream = await withTimeout(navigator.mediaDevices.getUserMedia(buildConstraints(mode)), GET_USER_MEDIA_TIMEOUT_MS);
    } catch (err) {
      // Fallback si la contrainte facingMode idéale échoue sur ce device.
      stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: false, video: true }), GET_USER_MEDIA_TIMEOUT_MS);
    }
    facingMode = mode;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    return stream;
  }

  async function init(el) {
    videoEl = el;
    return start(facingMode);
  }

  async function switchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    return start(next);
  }

  function getStream() {
    return stream;
  }

  function getVideoTrack() {
    return stream ? stream.getVideoTracks()[0] : null;
  }

  function getSettings() {
    const track = getVideoTrack();
    return track ? track.getSettings() : null;
  }

  function getFacingMode() {
    return facingMode;
  }

  function getCapabilities() {
    const track = getVideoTrack();
    return track && track.getCapabilities ? track.getCapabilities() : {};
  }

  async function applyAdvanced(constraint) {
    const track = getVideoTrack();
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [constraint] });
      return true;
    } catch {
      return false;
    }
  }

  // Fige la mise au point et l'exposition sur leurs valeurs déjà convergées,
  // pour éviter qu'une pose longue ne varie en luminosité/netteté en cours
  // de route. Repli silencieux si le navigateur/l'appareil ne l'expose pas.
  async function lockAutoAdjustments() {
    const caps = getCapabilities();
    if (caps.focusMode && caps.focusMode.includes('manual')) {
      await applyAdvanced({ focusMode: 'manual' });
    }
    if (caps.exposureMode && caps.exposureMode.includes('manual')) {
      await applyAdvanced({ exposureMode: 'manual' });
    }
  }

  async function unlockAutoAdjustments() {
    const caps = getCapabilities();
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      await applyAdvanced({ focusMode: 'continuous' });
    }
    if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
      await applyAdvanced({ exposureMode: 'continuous' });
    }
  }

  function hasTorch() {
    return !!getCapabilities().torch;
  }

  function setTorch(on) {
    return applyAdvanced({ torch: !!on });
  }

  function getZoomCapabilities() {
    const caps = getCapabilities();
    return caps.zoom ? caps.zoom : null;
  }

  function setZoom(value) {
    return applyAdvanced({ zoom: value });
  }

  return {
    init,
    switchCamera,
    getStream,
    getVideoTrack,
    getSettings,
    getFacingMode,
    getCapabilities,
    lockAutoAdjustments,
    unlockAutoAdjustments,
    hasTorch,
    setTorch,
    getZoomCapabilities,
    setZoom,
  };
})();
