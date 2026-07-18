// Empile les frames de la vidéo sur un canvas d'accumulation (blend "lighten")
// pour simuler une pose longue lightpainting, à la résolution native du flux.
// Le canvas reste transparent tant qu'aucune lumière n'y a été vue : combiné
// à mix-blend-mode:lighten en CSS (voir style.css), la vidéo live reste
// visible en direct sous la trainée qui s'accumule dessus (voir index.html).
//
// Masque de mouvement (optionnel) : contrairement à une v1 qui diffait chaque
// frame en temps réel (coûteux, causait des saccades), le nettoyage du fond
// ne se fait qu'UNE FOIS à l'arrêt de la capture — la boucle live n'a donc
// aucun coût supplémentaire, quel que soit le mode.
const CaptureEngine = (() => {
  const RESIZE_TIMEOUT_MS = 4000;
  const BACKGROUND_SETTLE_MS = 300;
  const MASK_WORK_WIDTH = 192;
  const MASK_NOISE_FLOOR = 10;
  const MASK_SENSITIVITY_GAIN = { low: 2.2, medium: 3.5, high: 5.5 };

  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let rafId = null;
  let running = false;
  let starting = false;
  let mirror = false;
  let outputFormat = 'image/jpeg';
  let frameCount = 0;
  let useMotionMask = false;
  let maskSensitivity = 'medium';
  let backgroundCanvas = null;
  let bgSettleTimeoutId = null;

  function init(video, canvas) {
    videoEl = video;
    canvasEl = canvas;
    ctx = canvasEl.getContext('2d');
  }

  function resizeToVideoResolution() {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return false;
    canvasEl.width = w;
    canvasEl.height = h;
    return true;
  }

  function withMirror(drawFn) {
    ctx.save();
    if (mirror) {
      ctx.translate(canvasEl.width, 0);
      ctx.scale(-1, 1);
    }
    drawFn();
    ctx.restore();
  }

  function drawFrame() {
    ctx.globalCompositeOperation = 'lighten';
    withMirror(() => ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height));
    frameCount++;
    rafId = requestAnimationFrame(drawFrame);
  }

  function captureBackgroundReference() {
    if (!running) return; // capture déjà arrêtée entre-temps
    const bg = document.createElement('canvas');
    bg.width = canvasEl.width;
    bg.height = canvasEl.height;
    const bgCtx = bg.getContext('2d');
    // Même orientation que le canvas d'accumulation (qui applique withMirror
    // à chaque frame), pour que fond et trainée se superposent correctement.
    bgCtx.save();
    if (mirror) {
      bgCtx.translate(bg.width, 0);
      bgCtx.scale(-1, 1);
    }
    bgCtx.drawImage(videoEl, 0, 0, bg.width, bg.height);
    bgCtx.restore();
    backgroundCanvas = bg;
  }

  function start({ mirror: mirrorFlip = false, format = 'jpeg', motionMask = false, sensitivity = 'medium', onError } = {}) {
    if (running || starting) return;
    starting = true;
    mirror = mirrorFlip;
    outputFormat = format === 'png' ? 'image/png' : 'image/jpeg';
    frameCount = 0;
    useMotionMask = motionMask;
    maskSensitivity = sensitivity;
    backgroundCanvas = null;

    const deadline = performance.now() + RESIZE_TIMEOUT_MS;

    const tryStart = () => {
      if (!starting) return; // stop() a annulé pendant l'attente
      if (!resizeToVideoResolution()) {
        if (performance.now() > deadline) {
          starting = false;
          if (onError) onError(new Error('camera-video-not-ready'));
          return;
        }
        requestAnimationFrame(tryStart);
        return;
      }
      running = true;
      starting = false;
      rafId = requestAnimationFrame(drawFrame);

      if (useMotionMask) {
        bgSettleTimeoutId = setTimeout(() => {
          bgSettleTimeoutId = null;
          captureBackgroundReference();
        }, BACKGROUND_SETTLE_MS);
      }
    };
    tryStart();
  }

  // Nettoyage du fond, calculé une seule fois : diff basse résolution entre
  // l'accumulé courant et le fond de référence, agrandi puis utilisé pour ne
  // garder que les zones de vraie trainée par-dessus un fond net et stable.
  function applyMotionMaskCleanup() {
    const w = canvasEl.width;
    const h = canvasEl.height;
    const smallW = MASK_WORK_WIDTH;
    const smallH = Math.max(1, Math.round(smallW * (h / w)));

    const smallAccum = document.createElement('canvas');
    smallAccum.width = smallW;
    smallAccum.height = smallH;
    const smallAccumCtx = smallAccum.getContext('2d', { willReadFrequently: true });
    smallAccumCtx.drawImage(canvasEl, 0, 0, smallW, smallH);

    const smallBgCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    smallBgCtx.canvas.width = smallW;
    smallBgCtx.canvas.height = smallH;
    smallBgCtx.drawImage(backgroundCanvas, 0, 0, smallW, smallH);

    const accumData = smallAccumCtx.getImageData(0, 0, smallW, smallH);
    const bgData = smallBgCtx.getImageData(0, 0, smallW, smallH);
    const maskData = smallAccumCtx.createImageData(smallW, smallH);
    const gain = MASK_SENSITIVITY_GAIN[maskSensitivity] || MASK_SENSITIVITY_GAIN.medium;

    const a = accumData.data;
    const b = bgData.data;
    const m = maskData.data;
    for (let i = 0; i < a.length; i += 4) {
      let alpha = 0;
      if (a[i + 3] > 0) {
        const dr = Math.abs(a[i] - b[i]);
        const dg = Math.abs(a[i + 1] - b[i + 1]);
        const db = Math.abs(a[i + 2] - b[i + 2]);
        const diff = Math.max(dr, dg, db);
        alpha = Math.min(255, Math.max(0, diff - MASK_NOISE_FLOOR) * gain);
      }
      m[i] = 255;
      m[i + 1] = 255;
      m[i + 2] = 255;
      m[i + 3] = alpha;
    }
    smallAccumCtx.putImageData(maskData, 0, 0); // réutilisé comme masque agrandissable

    const trailLayer = document.createElement('canvas');
    trailLayer.width = w;
    trailLayer.height = h;
    const trailCtx = trailLayer.getContext('2d');
    trailCtx.drawImage(canvasEl, 0, 0);
    trailCtx.globalCompositeOperation = 'destination-in';
    trailCtx.drawImage(smallAccum, 0, 0, w, h);

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(backgroundCanvas, 0, 0);
    ctx.drawImage(trailLayer, 0, 0);
  }

  function stop() {
    if (bgSettleTimeoutId) {
      clearTimeout(bgSettleTimeoutId);
      bgSettleTimeoutId = null;
    }
    starting = false;
    if (!running) return Promise.resolve(null);
    running = false;
    cancelAnimationFrame(rafId);

    if (useMotionMask && backgroundCanvas) {
      applyMotionMaskCleanup();
    }

    // Fond noir derrière ce qui resterait transparent (aucune lumière vue à
    // un pixel donné, ou fallback si le masquage n'a pas pu s'appliquer) —
    // uniquement pour l'export, la vue live n'est jamais touchée par cette
    // étape ni par le clearRect qui suit.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

    // toBlob() capture une copie du bitmap de façon synchrone au moment de
    // l'appel (l'encodage async qui suit ne voit plus les changements
    // ultérieurs) : on peut donc vider le canvas juste après sans risque,
    // pour que l'écran caméra reparte sur une vidéo live propre.
    const blobPromise = new Promise((resolve) => {
      canvasEl.toBlob((blob) => resolve(blob), outputFormat, 1.0);
    });
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    return blobPromise;
  }

  function isRunning() {
    return running;
  }

  function getFrameCount() {
    return frameCount;
  }

  return { init, start, stop, isRunning, getFrameCount };
})();
