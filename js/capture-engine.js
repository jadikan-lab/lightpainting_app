// Empile les frames de la vidéo sur un canvas d'accumulation (blend "lighten")
// pour simuler une pose longue lightpainting, à la résolution native du flux.
// En mode "masque de mouvement", seules les zones où la lumière change sont
// réaccumulées à chaque frame ; le reste du cadre garde le fond de référence
// capturé au démarrage (fond stable, trainée nette — voir js/motion-mask.js).
const CaptureEngine = (() => {
  const BACKGROUND_SETTLE_MS = 300;
  const RESIZE_TIMEOUT_MS = 4000;

  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let tempCanvas = null;
  let tempCtx = null;
  let rafId = null;
  let running = false;
  let starting = false;
  let mirror = false;
  let outputFormat = 'image/jpeg';
  let useMotionMask = false;
  let maskSensitivity = 'medium';
  let settleTimeoutId = null;
  let frameCount = 0;

  function init(video, canvas) {
    videoEl = video;
    canvasEl = canvas;
    // Pas de { alpha: false } ici : certains moteurs WebKit se comportent
    // différemment avec globalCompositeOperation "lighten" sur un contexte
    // opaque. Le canvas est de toute façon rempli en opaque dès le départ
    // (fond noir ou frame de fond), donc l'alpha réelle n'a pas d'incidence
    // visuelle — seule la garantie de compatibilité change.
    ctx = canvasEl.getContext('2d');
    tempCanvas = document.createElement('canvas');
    tempCtx = tempCanvas.getContext('2d', { alpha: true });
  }

  function resizeToVideoResolution() {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return false;
    canvasEl.width = w;
    canvasEl.height = h;
    tempCanvas.width = w;
    tempCanvas.height = h;
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

  function drawFrameMasked() {
    const mask = MotionMask.computeMask(maskSensitivity);

    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(videoEl, 0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(mask, 0, 0, tempCanvas.width, tempCanvas.height);

    ctx.globalCompositeOperation = 'lighten';
    withMirror(() => ctx.drawImage(tempCanvas, 0, 0));
    frameCount++;
    rafId = requestAnimationFrame(drawFrameMasked);
  }

  function drawBackgroundBase() {
    ctx.globalCompositeOperation = 'source-over';
    withMirror(() => ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height));
  }

  function start({ mirror: mirrorFlip = false, format = 'jpeg', motionMask = false, sensitivity = 'medium', onError } = {}) {
    if (running || starting) return;
    starting = true;
    mirror = mirrorFlip;
    outputFormat = format === 'png' ? 'image/png' : 'image/jpeg';
    useMotionMask = motionMask;
    maskSensitivity = sensitivity;
    frameCount = 0;

    const beginLoop = () => {
      running = true;
      starting = false;
      rafId = requestAnimationFrame(useMotionMask ? drawFrameMasked : drawFrame);
    };

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

      if (useMotionMask) {
        MotionMask.init(videoEl);
        settleTimeoutId = setTimeout(() => {
          settleTimeoutId = null;
          MotionMask.captureBackground();
          drawBackgroundBase();
          beginLoop();
        }, BACKGROUND_SETTLE_MS);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        beginLoop();
      }
    };
    tryStart();
  }

  function stop() {
    if (settleTimeoutId) {
      clearTimeout(settleTimeoutId);
      settleTimeoutId = null;
    }
    starting = false;
    if (!running) return Promise.resolve(null);
    running = false;
    cancelAnimationFrame(rafId);
    return new Promise((resolve) => {
      canvasEl.toBlob((blob) => resolve(blob), outputFormat, 1.0);
    });
  }

  function isRunning() {
    return running;
  }

  function getFrameCount() {
    return frameCount;
  }

  return { init, start, stop, isRunning, getFrameCount };
})();
