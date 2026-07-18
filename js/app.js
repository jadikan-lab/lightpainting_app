// Bootstrap : relie caméra, moteur de capture, enregistreur, galerie, paramètres et navigation d'écrans.
(() => {
  const viewfinder = document.getElementById('viewfinder');
  const accumulator = document.getElementById('accumulator');
  const cameraStatus = document.getElementById('camera-status');
  const resBadge = document.getElementById('res-badge');
  const recIndicator = document.getElementById('rec-indicator');
  const recTimer = document.getElementById('rec-timer');
  const recFrameCount = document.getElementById('rec-frame-count');
  const gridOverlay = document.getElementById('grid-overlay');

  const btnSwitchCamera = document.getElementById('btn-switch-camera');
  const btnShutter = document.getElementById('btn-shutter');
  const btnGallery = document.getElementById('btn-gallery');
  const thumbLatest = document.getElementById('thumb-latest');
  const btnSettings = document.getElementById('btn-settings');

  const screenCamera = document.getElementById('screen-camera');
  const screenGallery = document.getElementById('screen-gallery');
  const screenViewer = document.getElementById('screen-viewer');
  const screenSettings = document.getElementById('screen-settings');
  const btnGalleryClose = document.getElementById('btn-gallery-close');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const galleryHeader = document.getElementById('gallery-header');
  const gallerySelectionBar = document.getElementById('gallery-selection-bar');
  const selectionCount = document.getElementById('selection-count');
  const btnSelectionCancel = document.getElementById('btn-selection-cancel');
  const btnSelectionAll = document.getElementById('btn-selection-all');
  const btnSelectionDelete = document.getElementById('btn-selection-delete');

  const btnViewerClose = document.getElementById('btn-viewer-close');
  const btnViewerDelete = document.getElementById('btn-viewer-delete');
  const btnViewerExport = document.getElementById('btn-viewer-export');
  const viewerMedia = document.getElementById('viewer-media');

  const btnSettingsClose = document.getElementById('btn-settings-close');
  const toggleVideoRecording = document.getElementById('toggle-video-recording');
  const segmentPhotoFormat = document.getElementById('segment-photo-format');
  const toggleGrid = document.getElementById('toggle-grid');
  const toggleMirror = document.getElementById('toggle-mirror');
  const toggleHaptics = document.getElementById('toggle-haptics');
  const toggleMotionMask = document.getElementById('toggle-motion-mask');
  const segmentSensitivity = document.getElementById('segment-sensitivity');
  const toggleTimelapse = document.getElementById('toggle-timelapse');
  const storageSummary = document.getElementById('storage-summary');
  const btnClearGallery = document.getElementById('btn-clear-gallery');

  const ALL_SCREENS = [screenCamera, screenGallery, screenViewer, screenSettings];

  let isCapturing = false;
  let recTimerInterval = null;
  let recStartedAt = 0;
  let currentViewerMedia = null;
  let currentViewerUrl = null;
  let selectionMode = false;
  let selectedIds = new Set();

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

  function vibrate(pattern) {
    if (Settings.get('haptics') && navigator.vibrate) navigator.vibrate(pattern);
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

  async function initCamera() {
    cameraStatus.hidden = false;
    cameraStatus.textContent = 'Chargement de la caméra…';
    try {
      await Camera.init(viewfinder);
      cameraStatus.hidden = true;
      updateResBadge();
      updateMirrorPreview();
      CaptureEngine.init(viewfinder, accumulator);
    } catch (err) {
      cameraStatus.hidden = false;
      cameraStatus.textContent = "Impossible d'accéder à la caméra. Vérifiez les autorisations.";
    }
  }

  async function refreshLatestThumb() {
    const items = await MediaDB.getAllMedia();
    if (items.length > 0) {
      const url = URL.createObjectURL(items[0].thumbnail || items[0].blob);
      thumbLatest.src = url;
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
    accumulator.classList.toggle('is-live', active);

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
    }
  }

  function handleCaptureStartError() {
    if (!isCapturing) return;
    setCapturingUI(false);
    if (Recorder.isRecording()) Recorder.stop();
    Timelapse.stopCollecting();
    cameraStatus.hidden = false;
    cameraStatus.textContent = "La caméra n'a pas pu démarrer la capture. Réessaie.";
    setTimeout(() => { cameraStatus.hidden = true; }, 4000);
  }

  async function startCapture() {
    if (isCapturing) return;
    vibrate(15);
    // Sur Safari/iOS, la prévisualisation peut s'afficher sans que la lecture
    // du flux ait réellement démarré (politique anti-autoplay) — on retente
    // ici, dans le geste utilisateur, ce qui lève ce blocage le cas échéant.
    if (viewfinder.paused) await viewfinder.play().catch(() => {});
    setCapturingUI(true);
    const mirror = Camera.getFacingMode() === 'user' && Settings.get('mirrorFrontFinal');
    CaptureEngine.start({
      mirror,
      format: Settings.get('photoFormat'),
      motionMask: Settings.get('motionMask'),
      sensitivity: Settings.get('motionSensitivity'),
      onError: handleCaptureStartError,
    });
    if (Settings.get('videoRecordingEnabled')) Recorder.start(Camera.getStream());
    if (Settings.get('timelapseEnabled')) Timelapse.startCollecting(accumulator);
  }

  async function stopCapture() {
    if (!isCapturing) return;
    vibrate([12, 40, 12]);
    setCapturingUI(false);

    try {
      await finishCapture();
    } catch (err) {
      console.error('stopCapture failed', err);
    }
  }

  async function finishCapture() {
    const timelapseFrames = Settings.get('timelapseEnabled') ? Timelapse.stopCollecting() : null;

    const [photoBlob, videoResult, timelapseResult] = await Promise.all([
      CaptureEngine.stop(),
      Recorder.stop(),
      timelapseFrames ? Timelapse.build(timelapseFrames) : Promise.resolve(null),
    ]);

    if (photoBlob) {
      const thumb = await Gallery.createPhotoThumbnail(photoBlob);
      await MediaDB.addMedia({ type: 'photo', blob: photoBlob, thumbnail: thumb, mimeType: photoBlob.type });
    }
    if (videoResult && videoResult.blob) {
      const thumb = await Gallery.createVideoThumbnail(videoResult.blob).catch(() => null);
      await MediaDB.addMedia({
        type: 'video',
        blob: videoResult.blob,
        thumbnail: thumb,
        mimeType: videoResult.mimeType,
      });
    }
    if (timelapseResult && timelapseResult.blob) {
      const thumb = await Gallery.createVideoThumbnail(timelapseResult.blob).catch(() => null);
      await MediaDB.addMedia({
        type: 'timelapse',
        blob: timelapseResult.blob,
        thumbnail: thumb,
        mimeType: timelapseResult.mimeType,
      });
    }
    await refreshLatestThumb();
  }

  function updateSelectionUI() {
    galleryHeader.hidden = selectionMode;
    gallerySelectionBar.hidden = !selectionMode;
    selectionCount.textContent = `${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''}`;
    btnSelectionDelete.disabled = selectedIds.size === 0;
    Gallery.setSelectionState(galleryGrid, selectedIds);
  }

  function enterSelectionMode(id) {
    selectionMode = true;
    selectedIds = new Set([id]);
    vibrate(15);
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

  async function openViewer(id) {
    const media = await MediaDB.getMedia(id);
    if (!media) return;
    currentViewerMedia = media;
    currentViewerUrl = Gallery.renderViewer(viewerMedia, media);
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

  function applySettingsToUI() {
    const values = Settings.getAll();
    toggleVideoRecording.checked = values.videoRecordingEnabled;
    for (const btn of segmentPhotoFormat.children) {
      btn.classList.toggle('is-active', btn.dataset.value === values.photoFormat);
    }
    toggleGrid.checked = values.gridOverlay;
    toggleMirror.checked = values.mirrorFrontFinal;
    toggleHaptics.checked = values.haptics;
    gridOverlay.hidden = !values.gridOverlay;

    toggleMotionMask.checked = values.motionMask;
    for (const btn of segmentSensitivity.children) {
      btn.classList.toggle('is-active', btn.dataset.value === values.motionSensitivity);
    }
    toggleTimelapse.checked = values.timelapseEnabled;
  }

  btnSwitchCamera.addEventListener('click', async () => {
    await Camera.switchCamera();
    updateResBadge();
    updateMirrorPreview();
  });

  btnShutter.addEventListener('click', () => {
    if (isCapturing) stopCapture();
    else startCapture();
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

  btnSettings.addEventListener('click', () => {
    applySettingsToUI();
    refreshStorageSummary();
    showScreen('settings');
  });

  btnSettingsClose.addEventListener('click', () => showScreen('camera'));

  toggleVideoRecording.addEventListener('change', () => {
    Settings.set('videoRecordingEnabled', toggleVideoRecording.checked);
  });

  segmentPhotoFormat.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    Settings.set('photoFormat', btn.dataset.value);
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

  toggleHaptics.addEventListener('change', () => {
    Settings.set('haptics', toggleHaptics.checked);
  });

  toggleMotionMask.addEventListener('change', () => {
    Settings.set('motionMask', toggleMotionMask.checked);
  });

  segmentSensitivity.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    Settings.set('motionSensitivity', btn.dataset.value);
    applySettingsToUI();
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
  initCamera();
  refreshLatestThumb();
})();
