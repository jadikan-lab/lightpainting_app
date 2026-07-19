// Empile les frames de la vidéo sur un canvas d'accumulation (blend "lighten")
// pour simuler une pose longue lightpainting, à la résolution native du flux.
// Le canvas reste transparent tant qu'aucune lumière n'y a été vue : combiné
// à mix-blend-mode:lighten en CSS (voir style.css), la vidéo live reste
// visible en direct sous la trainée qui s'accumule dessus (voir index.html).
//
// Trois styles de capture :
// - 'longexposure' (pose longue) : accumulation brute, aucun traitement,
//   décor et trainée se mélangent comme une vraie pose longue argentique.
// - 'olympus' (trainées nettes façon Olympus Live Composite) : le décor est
//   figé sur une image de référence capturée au début, seule la trainée
//   lumineuse forte s'accumule par-dessus (tout le reste, y compris le
//   photographe en mouvement, est écarté par le masque).
// - 'videotrace' (vidéo + trace) : le décor reste la vidéo courante (pas
//   figée), et TOUT ce qui a été accumulé (trainée ET mouvement du
//   photographe) est superposé dessus sans masque — pensé pour qu'on se
//   voie bouger en même temps que la trainée se forme.
//
// Le nettoyage (masque) ne coûte rien à chaque frame : la boucle live reste
// une simple accumulation. Pour 'olympus'/'videotrace', un aperçu du rendu
// nettoyé est recalculé périodiquement (2-3x/seconde, pas à chaque frame)
// sur un canvas de preview séparé — assez pour voir l'effet en direct sans
// jamais saccader la vidéo elle-même.
//
// Mode Pro : un seuil de luminosité (curseur de sensibilité) peut être
// appliqué à CHAQUE frame avant qu'elle n'entre dans l'accumulation, via un
// filtre canvas natif (gratuit, pas de lecture pixel par pixel). Utile
// quand l'auto-exposition du téléphone pompe brièvement au passage de la
// lumière : sans seuil, ce sursaut reste gravé pour toujours dans le fond
// (« lighten » garde le maximum vu à vie), même s'il n'a duré qu'une frame.
const CaptureEngine = (() => {
  const RESIZE_TIMEOUT_MS = 4000;
  const BACKGROUND_SETTLE_MS = 300;
  const PREVIEW_INTERVAL_MS = 250;
  const MASK_WORK_WIDTH = 192;
  const MASK_NOISE_FLOOR = 10;
  const MASK_SENSITIVITY_GAIN = { low: 2.2, medium: 3.5, high: 5.5 };

  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let previewCanvasEl = null;
  let previewCtx = null;
  let rafId = null;
  let running = false;
  let starting = false;
  let mirror = false;
  let outputFormat = 'image/jpeg';
  let frameCount = 0;
  let captureStyle = 'longexposure';
  let maskSensitivity = 'medium';
  let backgroundCanvas = null;
  let bgSettleTimeoutId = null;
  let previewIntervalId = null;

  function init(video, canvas, previewCanvas) {
    videoEl = video;
    canvasEl = canvas;
    ctx = canvasEl.getContext('2d');
    previewCanvasEl = previewCanvas;
    previewCtx = previewCanvasEl.getContext('2d');
  }

  function resizeToVideoResolution() {
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (!w || !h) return false;
    canvasEl.width = w;
    canvasEl.height = h;
    previewCanvasEl.width = w;
    previewCanvasEl.height = h;
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

  // Mode Pro (maskSensitivity numérique) : écrase les luminosités faibles/
  // moyennes vers le noir *avant* l'accumulation, via un filtre canvas natif
  // (GPU, gratuit — pas de lecture pixel par pixel). Sans ça, un sursaut
  // d'une seule frame (auto-exposition qui pompe quand la lumière passe près
  // de la caméra, lumière parasite qui rebondit sur le décor) reste gravé à
  // jamais dans le fond via "lighten", qui garde le maximum vu à vie.
  function cssThresholdFilterFor(sensitivity) {
    const clamped = Math.min(8, Math.max(0.5, sensitivity));
    const brightness = 62 - clamped * 3; // ~60% à 0.5, ~38% à 8
    const contrast = 110 + clamped * 35; // ~128% à 0.5, ~390% à 8
    return `brightness(${brightness}%) contrast(${contrast}%)`;
  }

  // Mode Pro : maskSensitivity peut être un nombre (curseur continu) en plus
  // des 3 préréglages faible/moyenne/élevée.
  function resolveGain(sensitivity) {
    return typeof sensitivity === 'number'
      ? sensitivity
      : (MASK_SENSITIVITY_GAIN[sensitivity] || MASK_SENSITIVITY_GAIN.medium);
  }

  function drawFrame() {
    ctx.globalCompositeOperation = 'lighten';
    // Sans seuil, le bruit capteur (fort en basse lumière) finit par toucher
    // TOUTE l'image au bout d'assez de frames : "lighten" garde le maximum
    // vu à vie, et sur assez d'images, le bruit dépasse le seuil de bruit
    // presque partout, même sans aucun vrai mouvement. Actif par défaut sur
    // 'olympus'/'videotrace' (dont le principe même est un rendu propre) ;
    // 'pose longue' reste volontairement brute, sans aucun traitement.
    const applyThreshold = captureStyle !== 'longexposure';
    if (applyThreshold) ctx.filter = cssThresholdFilterFor(resolveGain(maskSensitivity));
    withMirror(() => ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height));
    if (applyThreshold) ctx.filter = 'none';
    frameCount++;
    rafId = requestAnimationFrame(drawFrame);
  }

  // Capture ponctuelle de la frame vidéo courante, en pleine résolution et
  // dans la même orientation que l'accumulateur (miroir appliqué le cas
  // échéant). Réutilisé pour le fond de référence "olympus" (une fois, au
  // début) et pour le fond "live" de "videotrace" (à chaque preview + à
  // l'arrêt).
  function captureFreshFrame() {
    const w = canvasEl.width;
    const h = canvasEl.height;
    if (!w || !h) return null;
    const snap = document.createElement('canvas');
    snap.width = w;
    snap.height = h;
    const snapCtx = snap.getContext('2d');
    snapCtx.save();
    if (mirror) {
      snapCtx.translate(w, 0);
      snapCtx.scale(-1, 1);
    }
    snapCtx.drawImage(videoEl, 0, 0, w, h);
    snapCtx.restore();
    return snap;
  }

  // Calcule un masque de différence basse résolution entre l'accumulé
  // courant et un fond donné, puis compose fond + trainée isolée dans un
  // nouveau canvas (ne modifie ni l'accumulateur ni rien d'autre — appelé
  // aussi bien pour la preview périodique que pour l'export final).
  function buildMaskedComposite(bgCanvas) {
    const w = canvasEl.width;
    const h = canvasEl.height;
    const smallW = MASK_WORK_WIDTH;
    const smallH = Math.max(1, Math.round(smallW * (h / w)));

    const smallAccumCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    smallAccumCtx.canvas.width = smallW;
    smallAccumCtx.canvas.height = smallH;
    smallAccumCtx.drawImage(canvasEl, 0, 0, smallW, smallH);

    const smallBgCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    smallBgCtx.canvas.width = smallW;
    smallBgCtx.canvas.height = smallH;
    smallBgCtx.drawImage(bgCanvas, 0, 0, smallW, smallH);

    const accumData = smallAccumCtx.getImageData(0, 0, smallW, smallH);
    const bgData = smallBgCtx.getImageData(0, 0, smallW, smallH);
    const maskData = smallAccumCtx.createImageData(smallW, smallH);
    const gain = resolveGain(maskSensitivity);

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
    trailCtx.drawImage(smallAccumCtx.canvas, 0, 0, w, h);

    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    const resultCtx = result.getContext('2d');
    resultCtx.drawImage(bgCanvas, 0, 0);
    resultCtx.drawImage(trailLayer, 0, 0);
    return result;
  }

  // 'videotrace' : pas de masque — le fond frais reçoit l'accumulé complet
  // (trainée + tout mouvement capté) via un simple blend "lighten", pour que
  // le photographe reste visible en train de bouger, pas seulement la trainée.
  function buildBlendedComposite(bgCanvas) {
    const w = canvasEl.width;
    const h = canvasEl.height;
    const result = document.createElement('canvas');
    result.width = w;
    result.height = h;
    const resultCtx = result.getContext('2d');
    resultCtx.drawImage(bgCanvas, 0, 0);
    resultCtx.globalCompositeOperation = 'lighten';
    resultCtx.drawImage(canvasEl, 0, 0);
    return result;
  }

  function updateLivePreview() {
    if (!running || captureStyle === 'longexposure') return;
    const bg = captureStyle === 'olympus' ? backgroundCanvas : captureFreshFrame();
    if (!bg) return;
    const composite = captureStyle === 'olympus' ? buildMaskedComposite(bg) : buildBlendedComposite(bg);
    previewCtx.clearRect(0, 0, previewCanvasEl.width, previewCanvasEl.height);
    previewCtx.drawImage(composite, 0, 0);
  }

  function start({ mirror: mirrorFlip = false, format = 'jpeg', captureStyle: style = 'longexposure', sensitivity = 'medium', onError } = {}) {
    if (running || starting) return;
    starting = true;
    mirror = mirrorFlip;
    outputFormat = format === 'png' ? 'image/png' : 'image/jpeg';
    frameCount = 0;
    captureStyle = style;
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

      if (captureStyle === 'olympus') {
        bgSettleTimeoutId = setTimeout(() => {
          bgSettleTimeoutId = null;
          backgroundCanvas = captureFreshFrame();
        }, BACKGROUND_SETTLE_MS);
      }
      if (captureStyle !== 'longexposure') {
        previewIntervalId = setInterval(updateLivePreview, PREVIEW_INTERVAL_MS);
      }
    };
    tryStart();
  }

  function stop() {
    if (bgSettleTimeoutId) {
      clearTimeout(bgSettleTimeoutId);
      bgSettleTimeoutId = null;
    }
    if (previewIntervalId) {
      clearInterval(previewIntervalId);
      previewIntervalId = null;
    }
    starting = false;
    if (!running) return Promise.resolve(null);
    running = false;
    cancelAnimationFrame(rafId);

    if (captureStyle === 'olympus' && backgroundCanvas) {
      const composite = buildMaskedComposite(backgroundCanvas);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      ctx.drawImage(composite, 0, 0);
    } else if (captureStyle === 'videotrace') {
      const freshBg = captureFreshFrame();
      if (freshBg) {
        const composite = buildBlendedComposite(freshBg);
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(composite, 0, 0);
      }
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
    // ultérieurs) : on peut donc vider les canvas juste après sans risque,
    // pour que l'écran caméra reparte sur une vidéo live propre.
    const blobPromise = new Promise((resolve) => {
      canvasEl.toBlob((blob) => resolve(blob), outputFormat, 1.0);
    });
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    previewCtx.clearRect(0, 0, previewCanvasEl.width, previewCanvasEl.height);
    return blobPromise;
  }

  function isRunning() {
    return running;
  }

  function getFrameCount() {
    return frameCount;
  }

  // Mode Pro : ajuste la sensibilité pendant une capture en cours — prise en
  // compte dès le prochain rafraîchissement de l'aperçu live (et à l'export
  // si la capture s'arrête avant le prochain tick).
  function setSensitivity(value) {
    maskSensitivity = value;
  }

  // Exposé pour que l'écran caméra applique exactement le même filtre sur la
  // vidéo live (voir app.js) — le réglage doit se voir avant même de
  // déclencher la capture, pas seulement une fois l'accumulation démarrée.
  // Accepte aussi bien un préréglage ('low'/'medium'/'high') que la valeur
  // numérique du curseur Mode Pro.
  function getThresholdFilterCss(sensitivity) {
    return cssThresholdFilterFor(resolveGain(sensitivity));
  }

  return { init, start, stop, isRunning, getFrameCount, setSensitivity, getThresholdFilterCss };
})();
