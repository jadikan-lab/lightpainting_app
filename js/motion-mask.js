// Détecte les zones de mouvement/lumière par rapport à un fond de référence,
// à basse résolution (coût CPU négligeable), pour ne réaccumuler que ces zones
// en pleine résolution plutôt que tout le cadre à chaque frame.
const MotionMask = (() => {
  const SMALL_WIDTH = 192;
  const NOISE_FLOOR = 10;
  const SENSITIVITY_GAIN = { low: 2.2, medium: 3.5, high: 5.5 };

  let videoEl = null;
  let smallCanvas = null;
  let smallCtx = null;
  let maskCanvas = null;
  let maskCtx = null;
  let bgData = null;
  let w = 0;
  let h = 0;

  function init(video) {
    videoEl = video;
    const aspect = (video.videoWidth && video.videoHeight)
      ? video.videoHeight / video.videoWidth
      : 9 / 16;
    w = SMALL_WIDTH;
    h = Math.max(1, Math.round(SMALL_WIDTH * aspect));

    smallCanvas = document.createElement('canvas');
    smallCanvas.width = w;
    smallCanvas.height = h;
    smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });

    maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    maskCtx = maskCanvas.getContext('2d');

    bgData = null;
  }

  function captureBackground() {
    smallCtx.drawImage(videoEl, 0, 0, w, h);
    bgData = smallCtx.getImageData(0, 0, w, h).data.slice();
  }

  function hasBackground() {
    return !!bgData;
  }

  // Retourne un canvas basse résolution : alpha élevé = mouvement détecté,
  // alpha nul = zone identique au fond. Destiné à être agrandi (drawImage)
  // et utilisé comme masque "destination-in" en pleine résolution.
  function computeMask(sensitivity) {
    smallCtx.drawImage(videoEl, 0, 0, w, h);
    const frame = smallCtx.getImageData(0, 0, w, h);
    const src = frame.data;
    const out = maskCtx.createImageData(w, h);
    const gain = SENSITIVITY_GAIN[sensitivity] || SENSITIVITY_GAIN.medium;

    for (let i = 0; i < src.length; i += 4) {
      const dr = Math.abs(src[i] - bgData[i]);
      const dg = Math.abs(src[i + 1] - bgData[i + 1]);
      const db = Math.abs(src[i + 2] - bgData[i + 2]);
      const diff = Math.max(dr, dg, db);
      const alpha = Math.min(255, Math.max(0, diff - NOISE_FLOOR) * gain);
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = alpha;
    }

    maskCtx.putImageData(out, 0, 0);
    return maskCanvas;
  }

  return { init, captureBackground, hasBackground, computeMask };
})();
