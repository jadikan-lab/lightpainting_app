// Empile les frames de la vidéo sur un canvas d'accumulation (blend "lighten")
// pour simuler une pose longue lightpainting, à la résolution native du flux.
const CaptureEngine = (() => {
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let rafId = null;
  let running = false;
  let starting = false;

  function init(video, canvas) {
    videoEl = video;
    canvasEl = canvas;
    ctx = canvasEl.getContext('2d', { alpha: false });
  }

  function resizeToVideoResolution() {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return false;
    canvasEl.width = w;
    canvasEl.height = h;
    return true;
  }

  function drawFrame() {
    ctx.globalCompositeOperation = 'lighten';
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
    rafId = requestAnimationFrame(drawFrame);
  }

  function start() {
    if (running || starting) return;
    starting = true;

    const tryStart = () => {
      if (!resizeToVideoResolution()) {
        requestAnimationFrame(tryStart);
        return;
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
      running = true;
      starting = false;
      rafId = requestAnimationFrame(drawFrame);
    };
    tryStart();
  }

  function stop() {
    if (!running) return Promise.resolve(null);
    running = false;
    starting = false;
    cancelAnimationFrame(rafId);
    return new Promise((resolve) => {
      canvasEl.toBlob((blob) => resolve(blob), 'image/jpeg', 1.0);
    });
  }

  function isRunning() {
    return running;
  }

  return { init, start, stop, isRunning };
})();
