// Bootstrap : relie caméra, moteur de capture, enregistreur, galerie, paramètres et navigation d'écrans.
(() => {
  const viewfinder = document.getElementById('viewfinder');
  const accumulator = document.getElementById('accumulator');
  const previewOverlay = document.getElementById('preview-overlay');
  const cameraStatus = document.getElementById('camera-status');
  const resBadge = document.getElementById('res-badge');
  const recIndicator = document.getElementById('rec-indicator');
  const recTimer = document.getElementById('rec-timer');
  const recFrameCount = document.getElementById('rec-frame-count');
  const gridOverlay = document.getElementById('grid-overlay');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownNumber = document.getElementById('countdown-number');
  const zoomSlider = document.getElementById('zoom-slider');
  const modeSwitcher = document.getElementById('mode-switcher');
  const sensitivitySlider = document.getElementById('sensitivity-slider');

  const btnSwitchCamera = document.getElementById('btn-switch-camera');
  const btnTorch = document.getElementById('btn-torch');
  const btnShutter = document.getElementById('btn-shutter');
  const btnGallery = document.getElementById('btn-gallery');
  const thumbLatest = document.getElementById('thumb-latest');
  const btnSettings = document.getElementById('btn-settings');

  const screenCamera = document.getElementById('screen-camera');
  const screenGallery = document.getElementById('screen-gallery');
  const screenViewer = document.getElementById('screen-viewer');
  const screenReview = document.getElementById('screen-review');
  const screenSettings = document.getElementById('screen-settings');
  const btnGalleryClose = document.getElementById('btn-gallery-close');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const galleryHeader = document.getElementById('gallery-header');
  const gallerySelectionBar = document.getElementById('gallery-selection-bar');
  const selectionCount = document.getElementById('selection-count');
  const btnSelectionCancel = document.getElementById('btn-selection-cancel');
  const btnSelectionAll = document.getElementById('btn-selection-all');
  const btnSelectionExport = document.getElementById('btn-selection-export');
  const btnSelectionDelete = document.getElementById('btn-selection-delete');

  const btnViewerClose = document.getElementById('btn-viewer-close');
  const btnViewerDelete = document.getElementById('btn-viewer-delete');
  const btnViewerExport = document.getElementById('btn-viewer-export');
  const viewerMedia = document.getElementById('viewer-media');

  const reviewMedia = document.getElementById('review-media');
  const reviewBadges = document.getElementById('review-badges');
  const btnReviewDiscard = document.getElementById('btn-review-discard');
  const btnReviewKeep = document.getElementById('btn-review-keep');

  const btnSettingsClose = document.getElementById('btn-settings-close');
  const toggleVideoRecording = document.getElementById('toggle-video-recording');
  const segmentShootingMode = document.getElementById('segment-shooting-mode');
  const shootingModeHint = document.getElementById('shooting-mode-hint');
  const segmentPhotoFormat = document.getElementById('segment-photo-format');
  const segmentCountdown = document.getElementById('segment-countdown');
  const toggleGrid = document.getElementById('toggle-grid');
  const toggleMirror = document.getElementById('toggle-mirror');
  const toggleTimelapse = document.getElementById('toggle-timelapse');
  const toggleProMode = document.getElementById('toggle-pro-mode');
  const storageSummary = document.getElementById('storage-summary');
  const btnClearGallery = document.getElementById('btn-clear-gallery');

  const ALL_SCREENS = [screenCamera, screenGallery, screenViewer, screenReview, screenSettings];

  const SHOOTING_MODE_HINTS = {
    longexposure: 'Décor et trainée se mélangent, comme une vraie pose longue',
    olympus: 'Fond figé et net, seule la trainée s\'accumule par-dessus',
    videotrace: 'Fond vidéo en direct, la trainée forte est isolée par-dessus',
  };

  let isCapturing = false;
  let recTimerInterval = null;
  let recStartedAt = 0;
  let currentViewerMedia = null;
  let currentViewerUrl = null;
  let selectionMode = false;
  let selectedIds = new Set();
  let torchOn = false;
  let countdownActive = false;
  let countdownIntervalId = null;
  let pendingPhoto = null; // { blob, url }
  let pendingVideoResult = null;
  let pendingTimelapseResult = null;

  function showScreen(name) {
    for (const el of ALL_SCREENS) {
      el.hidden = el.dataset.screen !== name;
    }
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function updateResBadge() {
    const settings = Camera.getSettings();
    resBadge.textContent = settings && settings.width && settings.height
      ? `${settings.width}×${settings.height}`
      : '';
  }

  function updateMirrorPreview() {
    const isFrontCamera = Camera.getFacingMode() === 'user';
    viewfinder.classList.toggle('mirror-preview', isFrontCamera);
    // Le rendu miroir du canvas ne s'applique que si la photo finale n'est PAS
    // elle-même retournée : sinon les deux inversions s'annuleraient à l'écran.
    const shouldMirrorCanvasCss = isFrontCamera && !Settings.get('mirrorFrontFinal');
    accumulator.classList.toggle('mirror-preview', shouldMirrorCanvasCss);
  }

  function updateTorchUI() {
    torchOn = false;
    btnTorch.classList.remove('is-active');
    btnTorch.hidden = !Camera.hasTorch();
  }

  function updateZoomUI() {
    const zoomCaps = Camera.getZoomCapabilities();
    if (zoomCaps && zoomCaps.max > zoomCaps.min) {
      zoomSlider.min = zoomCaps.min;
      zoomSlider.max = zoomCaps.max;
      zoomSlider.step = zoomCaps.step || 0.1;
      const settings = Camera.getSettings();
      zoomSlider.value = (settings && settings.zoom) || zoomCaps.min;
      zoomSlider.hidden = false;
    } else {
      zoomSlider.hidden = true;
    }
  }

  async function initCamera() {
    cameraStatus.hidden = false;
    cameraStatus.textContent = 'Chargement de la caméra…';
    try {
      await Camera.init(viewfinder);
      cameraStatus.hidden = true;
      updateResBadge();
      updateMirrorPreview();
      updateTorchUI();
      updateZoomUI();
      CaptureEngine.init(viewfinder, accumulator, previewOverlay);
    } catch (err) {
      cameraStatus.hidden = false;
      cameraStatus.textContent = "Impossible d'accéder à la caméra. Vérifiez les autorisations.";
    }
  }

  let latestThumbUrl = null;
  async function refreshLatestThumb() {
    const items = await MediaDB.getAllMedia();
    if (items.length > 0) {
      if (latestThumbUrl) URL.revokeObjectURL(latestThumbUrl);
      latestThumbUrl = URL.createObjectURL(items[0].thumbnail || items[0].blob);
      thumbLatest.src = latestThumbUrl;
      thumbLatest.hidden = false;
    }
  }

  function setCapturingUI(active) {
    isCapturing = active;
    btnShutter.classList.toggle('is-recording', active);
    btnShutter.setAttribute('aria-label', active ? 'Arrêter la capture' : 'Démarrer la capture');
    btnSwitchCamera.disabled = active;
    btnGallery.disabled = active;
    btnSettings.disabled = active;
    recIndicator.hidden = !active;
    for (const btn of modeSwitcher.children) btn.disabled = active;

    if (active) {
      recStartedAt = Date.now();
      recTimer.textContent = '00:00';
      recFrameCount.textContent = '· 0 frame';
      recTimerInterval = setInterval(() => {
        recTimer.textContent = formatTimer(Date.now() - recStartedAt);
        const frames = CaptureEngine.getFrameCount();
        recFrameCount.textContent = `· ${frames} frame${frames > 1 ? 's' : ''}`;
      }, 500);
    } else {
      clearInterval(recTimerInterval);
      recTimerInterval = null;
      previewOverlay.hidden = true;
    }
  }

  function handleCaptureStartError() {
    if (!isCapturing) return;
    setCapturingUI(false);
    releaseWakeLock();
    Camera.unlockAutoAdjustments();
    if (Recorder.isRecording()) Recorder.stop();
    Timelapse.stopCollecting();
    cameraStatus.hidden = false;
    cameraStatus.textContent = "La caméra n'a pas pu démarrer la capture. Réessaie.";
    setTimeout(() => { cameraStatus.hidden = true; }, 4000);
  }

  function cancelCountdown() {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
    countdownActive = false;
    countdownOverlay.hidden = true;
  }

  function startCountdown(seconds) {
    countdownActive = true;
    let remaining = seconds;
    countdownNumber.textContent = String(remaining);
    countdownOverlay.hidden = false;
    countdownIntervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        cancelCountdown();
        startCapture();
        return;
      }
      countdownNumber.textContent = String(remaining);
    }, 1000);
  }

  function requestCapture() {
    if (isCapturing || countdownActive) return;
    const seconds = Number(Settings.get('countdownSeconds')) || 0;
    if (seconds > 0) startCountdown(seconds);
    else startCapture();
  }

  // Empêche le verrouillage de l'écran pendant une capture : sur une pose
  // longue de plusieurs minutes, l'extinction auto de l'écran couperait le
  // flux caméra et ruinerait la prise. Repli silencieux si non supporté.
  let wakeLock = null;
  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  // Le wake lock est perdu quand l'app passe en arrière-plan : on le
  // re-demande au retour si une capture est toujours en cours.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isCapturing) acquireWakeLock();
  });

  async function startCapture() {
    if (isCapturing) return;
    // Sur Safari/iOS, la prévisualisation peut s'afficher sans que la lecture
    // du flux ait réellement démarré (politique anti-autoplay) — on retente
    // ici, dans le geste utilisateur, ce qui lève ce blocage le cas échéant.
    if (viewfinder.paused) await viewfinder.play().catch(() => {});
    acquireWakeLock();
    await Camera.lockAutoAdjustments();
    setCapturingUI(true);
    const mirror = Camera.getFacingMode() === 'user' && Settings.get('mirrorFrontFinal');
    const captureStyle = Settings.get('shootingMode');
    previewOverlay.hidden = captureStyle === 'longexposure';
    const sensitivity = Settings.get('proMode') ? Settings.get('maskSensitivityValue') : 'medium';
    CaptureEngine.start({
      mirror,
      format: Settings.get('photoFormat'),
      captureStyle,
      sensitivity,
      onError: handleCaptureStartError,
    });
    if (Settings.get('videoRecordingEnabled')) Recorder.start(Camera.getStream());
    if (Settings.get('timelapseEnabled')) Timelapse.startCollecting(accumulator);
  }

  async function stopCapture() {
    if (!isCapturing) return;
    setCapturingUI(false);
    releaseWakeLock();
    Camera.unlockAutoAdjustments();

    try {
      await finishCapture();
    } catch (err) {
      console.error('stopCapture failed', err);
    }
  }

  function makeBadge(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  async function finishCapture() {
    const timelapseFrames = Settings.get('timelapseEnabled') ? Timelapse.stopCollecting() : null;

    const [photoBlob, videoResult, timelapseResult] = await Promise.all([
      CaptureEngine.stop(),
      Recorder.stop(),
      timelapseFrames ? Timelapse.build(timelapseFrames) : Promise.resolve(null),
    ]);

    if (!photoBlob) return; // rien à relire (capture jamais réellement démarrée)

    pendingVideoResult = videoResult && videoResult.blob ? videoResult : null;
    pendingTimelapseResult = timelapseResult && timelapseResult.blob ? timelapseResult : null;

    const url = URL.createObjectURL(photoBlob);
    pendingPhoto = { blob: photoBlob, url };

    reviewMedia.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    reviewMedia.appendChild(img);

    reviewBadges.innerHTML = '';
    if (pendingVideoResult) reviewBadges.appendChild(makeBadge('+ Vidéo'));
    if (pendingTimelapseResult) reviewBadges.appendChild(makeBadge('+ Timelapse'));

    showScreen('review');
  }

  function discardPending() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    pendingPhoto = null;
    pendingVideoResult = null;
    pendingTimelapseResult = null;
    reviewMedia.innerHTML = '';
    reviewBadges.innerHTML = '';
  }

  async function keepCapture() {
    if (!pendingPhoto) return;
    const thumb = await Gallery.createPhotoThumbnail(pendingPhoto.blob);
    await MediaDB.addMedia({ type: 'photo', blob: pendingPhoto.blob, thumbnail: thumb, mimeType: pendingPhoto.blob.type });

    if (pendingVideoResult) {
      const vThumb = await Gallery.createVideoThumbnail(pendingVideoResult.blob).catch(() => null);
      await MediaDB.addMedia({
        type: 'video',
        blob: pendingVideoResult.blob,
        thumbnail: vThumb,
        mimeType: pendingVideoResult.mimeType,
      });
    }
    if (pendingTimelapseResult) {
      const tThumb = await Gallery.createVideoThumbnail(pendingTimelapseResult.blob).catch(() => null);
      await MediaDB.addMedia({
        type: 'timelapse',
        blob: pendingTimelapseResult.blob,
        thumbnail: tThumb,
        mimeType: pendingTimelapseResult.mimeType,
      });
    }
    discardPending();
    await refreshLatestThumb();
    showScreen('camera');
  }

  function updateSelectionUI() {
    galleryHeader.hidden = selectionMode;
    gallerySelectionBar.hidden = !selectionMode;
    selectionCount.textContent = `${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''}`;
    btnSelectionDelete.disabled = selectedIds.size === 0;
    btnSelectionExport.disabled = selectedIds.size === 0;
    Gallery.setSelectionState(galleryGrid, selectedIds);
  }

  function enterSelectionMode(id) {
    selectionMode = true;
    selectedIds = new Set([id]);
    updateSelectionUI();
  }

  function exitSelectionMode() {
    selectionMode = false;
    selectedIds = new Set();
    updateSelectionUI();
  }

  function toggleSelection(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    if (selectedIds.size === 0) {
      exitSelectionMode();
    } else {
      updateSelectionUI();
    }
  }

  function handleCellTap(id) {
    if (selectionMode) toggleSelection(id);
    else openViewer(id);
  }

  // Pinch pour zoomer + glisser pour déplacer (photos uniquement) dans la
  // visionneuse plein écran, plus un double-tap pour zoomer/dézoomer vite.
  function attachPinchZoom(container) {
    const MIN_SCALE = 1;
    const MAX_SCALE = 4;
    let scale = 1;
    let panX = 0;
    let panY = 0;
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartScale = 1;
    let panStart = null;
    let panOrigin = { x: 0, y: 0 };
    let lastTapAt = 0;

    const getImg = () => container.querySelector('img');
    const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

    function applyTransform() {
      const img = getImg();
      if (img) img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    function setGesturing(active) {
      const img = getImg();
      if (img) img.classList.toggle('is-gesturing', active);
    }

    function reset() {
      scale = 1;
      panX = 0;
      panY = 0;
      setGesturing(false);
      applyTransform();
    }

    function endPointer(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStartDist = 0;
      if (pointers.size === 1 && scale > 1) {
        // Transition pincement -> glisser : un doigt reste posé, on
        // réamorce le pan depuis sa position actuelle plutôt que d'attendre
        // un nouveau pointerdown (qui n'arrive pas dans ce cas).
        const [remaining] = [...pointers.values()];
        panStart = { x: remaining.x, y: remaining.y };
        panOrigin = { x: panX, y: panY };
      } else if (pointers.size === 0) {
        setGesturing(false);
        panStart = null;
        if (scale <= 1) reset();
      }
    }

    container.addEventListener('pointerdown', (e) => {
      if (!getImg()) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setGesturing(true);
      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        pinchStartDist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        pinchStartScale = scale;
        panStart = null;
      } else if (pointers.size === 1 && scale > 1) {
        panStart = { x: e.clientX, y: e.clientY };
        panOrigin = { x: panX, y: panY };
      }
    });

    container.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2) {
        const [p1, p2] = [...pointers.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        scale = clampScale(pinchStartScale * (dist / pinchStartDist));
        applyTransform();
      } else if (pointers.size === 1 && panStart) {
        panX = panOrigin.x + (e.clientX - panStart.x);
        panY = panOrigin.y + (e.clientY - panStart.y);
        applyTransform();
      }
    });

    container.addEventListener('pointerup', endPointer);
    container.addEventListener('pointercancel', endPointer);
    container.addEventListener('pointerleave', endPointer);

    container.addEventListener('pointerup', (e) => {
      if (pointers.size > 0) return;
      const now = Date.now();
      if (now - lastTapAt < 300) {
        scale = scale > 1 ? 1 : 2.5;
        panX = 0;
        panY = 0;
        applyTransform();
      }
      lastTapAt = now;
    });

    return { reset };
  }

  const viewerZoom = attachPinchZoom(viewerMedia);

  async function openViewer(id) {
    const media = await MediaDB.getMedia(id);
    if (!media) return;
    currentViewerMedia = media;
    currentViewerUrl = Gallery.renderViewer(viewerMedia, media);
    viewerZoom.reset();
    showScreen('viewer');
  }

  function closeViewer() {
    if (currentViewerUrl) URL.revokeObjectURL(currentViewerUrl);
    currentViewerUrl = null;
    currentViewerMedia = null;
    viewerMedia.innerHTML = '';
    showScreen('gallery');
    Gallery.renderGrid(galleryGrid, galleryEmpty, handleCellTap, enterSelectionMode);
  }

  async function refreshStorageSummary() {
    const { count, bytes } = await MediaDB.getStorageStats();
    storageSummary.textContent = count === 0
      ? 'Aucun média stocké.'
      : `${count} média${count > 1 ? 's' : ''} · ${formatBytes(bytes)} utilisés sur cet appareil.`;
  }

  // Synchronise le mode de capture (et le curseur de sensibilité en mode
  // Pro) sur les deux sélecteurs qui existent maintenant — celui des
  // Paramètres et celui, plus rapide d'accès, de l'écran caméra.
  function updateModeUI() {
    const values = Settings.getAll();
    for (const btn of segmentShootingMode.children) {
      btn.classList.toggle('is-active', btn.dataset.value === values.shootingMode);
    }
    for (const btn of modeSwitcher.children) {
      btn.classList.toggle('is-active', btn.dataset.value === values.shootingMode);
    }
    shootingModeHint.textContent = SHOOTING_MODE_HINTS[values.shootingMode] || SHOOTING_MODE_HINTS.longexposure;
    toggleProMode.checked = values.proMode;

    const maskingModeActive = values.shootingMode === 'olympus' || values.shootingMode === 'videotrace';
    sensitivitySlider.hidden = !(values.proMode && maskingModeActive);
    sensitivitySlider.value = values.maskSensitivityValue;
  }

  function applySettingsToUI() {
    const values = Settings.getAll();
    toggleVideoRecording.checked = values.videoRecordingEnabled;
    updateModeUI();
    for (const btn of segmentPhotoFormat.children) {
      btn.classList.toggle('is-active', btn.dataset.value === values.photoFormat);
    }
    for (const btn of segmentCountdown.children) {
      btn.classList.toggle('is-active', Number(btn.dataset.value) === values.countdownSeconds);
    }
    toggleGrid.checked = values.gridOverlay;
    toggleMirror.checked = values.mirrorFrontFinal;
    gridOverlay.hidden = !values.gridOverlay;
    toggleTimelapse.checked = values.timelapseEnabled;
  }

  btnSwitchCamera.addEventListener('click', async () => {
    await Camera.switchCamera();
    updateResBadge();
    updateMirrorPreview();
    updateTorchUI();
    updateZoomUI();
  });

  btnTorch.addEventListener('click', async () => {
    const next = !torchOn;
    const ok = await Camera.setTorch(next);
    torchOn = ok ? next : false;
    btnTorch.classList.toggle('is-active', torchOn);
  });

  zoomSlider.addEventListener('input', () => {
    Camera.setZoom(Number(zoomSlider.value));
  });

  btnShutter.addEventListener('click', () => {
    if (countdownActive) {
      cancelCountdown();
    } else if (isCapturing) {
      stopCapture();
    } else {
      requestCapture();
    }
  });

  btnGallery.addEventListener('click', () => {
    exitSelectionMode();
    showScreen('gallery');
    Gallery.renderGrid(galleryGrid, galleryEmpty, handleCellTap, enterSelectionMode);
  });

  btnGalleryClose.addEventListener('click', () => {
    exitSelectionMode();
    showScreen('camera');
  });

  btnSelectionCancel.addEventListener('click', exitSelectionMode);

  btnSelectionAll.addEventListener('click', () => {
    selectedIds = new Set([...galleryGrid.children].map((cell) => Number(cell.dataset.id)));
    updateSelectionUI();
  });

  btnSelectionExport.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const items = await Promise.all([...selectedIds].map((id) => MediaDB.getMedia(id)));
    await Gallery.exportMultiple(items.filter(Boolean));
  });

  btnSelectionDelete.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Supprimer ${count} média${count > 1 ? 's' : ''} ? Cette action est irréversible.`)) return;
    await Promise.all([...selectedIds].map((id) => MediaDB.deleteMedia(id)));
    exitSelectionMode();
    await refreshLatestThumb();
    Gallery.renderGrid(galleryGrid, galleryEmpty, handleCellTap, enterSelectionMode);
  });

  btnViewerClose.addEventListener('click', closeViewer);

  btnViewerDelete.addEventListener('click', async () => {
    if (!currentViewerMedia) return;
    if (!window.confirm('Supprimer ce média ?')) return;
    await MediaDB.deleteMedia(currentViewerMedia.id);
    await refreshLatestThumb();
    closeViewer();
  });

  btnViewerExport.addEventListener('click', () => {
    if (currentViewerMedia) Gallery.exportMedia(currentViewerMedia);
  });

  btnReviewDiscard.addEventListener('click', () => {
    discardPending();
    showScreen('camera');
  });

  btnReviewKeep.addEventListener('click', keepCapture);

  btnSettings.addEventListener('click', () => {
    applySettingsToUI();
    refreshStorageSummary();
    showScreen('settings');
  });

  btnSettingsClose.addEventListener('click', () => showScreen('camera'));

  toggleVideoRecording.addEventListener('change', () => {
    Settings.set('videoRecordingEnabled', toggleVideoRecording.checked);
  });

  segmentShootingMode.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    Settings.set('shootingMode', btn.dataset.value);
    applySettingsToUI();
  });

  modeSwitcher.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-switcher-btn');
    if (!btn || isCapturing) return;
    Settings.set('shootingMode', btn.dataset.value);
    updateModeUI();
  });

  toggleProMode.addEventListener('change', () => {
    Settings.set('proMode', toggleProMode.checked);
    updateModeUI();
  });

  sensitivitySlider.addEventListener('input', () => {
    const value = Number(sensitivitySlider.value);
    Settings.set('maskSensitivityValue', value);
    CaptureEngine.setSensitivity(value);
  });

  segmentPhotoFormat.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    Settings.set('photoFormat', btn.dataset.value);
    applySettingsToUI();
  });

  segmentCountdown.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    Settings.set('countdownSeconds', Number(btn.dataset.value));
    Settings.set('countdownManuallySet', true);
    applySettingsToUI();
  });

  toggleGrid.addEventListener('change', () => {
    Settings.set('gridOverlay', toggleGrid.checked);
    gridOverlay.hidden = !toggleGrid.checked;
  });

  toggleMirror.addEventListener('change', () => {
    Settings.set('mirrorFrontFinal', toggleMirror.checked);
    updateMirrorPreview();
  });

  toggleTimelapse.addEventListener('change', () => {
    Settings.set('timelapseEnabled', toggleTimelapse.checked);
  });

  btnClearGallery.addEventListener('click', async () => {
    if (!window.confirm('Supprimer toutes les photos et vidéos de la galerie ? Cette action est irréversible.')) return;
    await MediaDB.clearAll();
    thumbLatest.hidden = true;
    await refreshStorageSummary();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  gridOverlay.hidden = !Settings.get('gridOverlay');
  updateModeUI();
  initCamera();
  refreshLatestThumb();
})();
