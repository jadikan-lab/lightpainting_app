// Empile les frames de la vidéo sur un canvas d'accumulation (blend "lighten")
// pour simuler une pose longue lightpainting, à la résolution native du flux.
// Le canvas reste transparent tant qu'aucune lumière n'y a été vue : combiné
// à mix-blend-mode:lighten en CSS (voir style.css), la vidéo live reste
// visible en direct sous la trainée qui s'accumule dessus (voir index.html).
// Un fond noir n'est composité qu'à l'export final (voir stop()).
const CaptureEngine = (() => {
  const RESIZE_TIMEOUT_MS = 4000;

  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let rafId = null;
  let running = false;
  let starting = false;
  let mirror = false;
  let outputFormat = 'image/jpeg';
  let frameCount = 0;

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

  function start({ mirror: mirrorFlip = false, format = 'jpeg', onError } = {}) {
    if (running || starting) return;
    starting = true;
    mirror = mirrorFlip;
    outputFormat = format === 'png' ? 'image/png' : 'image/jpeg';
    frameCount = 0;

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
    };
    tryStart();
  }

  function stop() {
    starting = false;
    if (!running) return Promise.resolve(null);
    running = false;
    cancelAnimationFrame(rafId);
    // Fond noir derrière le contenu déjà accumulé (transparent tant que rien
    // n'a été vu à un pixel donné) — uniquement pour l'export, la vue live
    // pendant la capture n'est jamais touchée par cette étape.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
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
