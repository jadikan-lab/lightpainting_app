// Bootstrap : relie caméra, moteur de capture, enregistreur, galerie et navigation d'écrans.
(() => {
  const viewfinder = document.getElementById('viewfinder');
  const accumulator = document.getElementById('accumulator');
  const cameraStatus = document.getElementById('camera-status');
  const resBadge = document.getElementById('res-badge');
  const recIndicator = document.getElementById('rec-indicator');
  const recTimer = document.getElementById('rec-timer');

  const btnSwitchCamera = document.getElementById('btn-switch-camera');
  const btnShutter = document.getElementById('btn-shutter');
  const btnGallery = document.getElementById('btn-gallery');
  const thumbLatest = document.getElementById('thumb-latest');

  const screenCamera = document.getElementById('screen-camera');
  const screenGallery = document.getElementById('screen-gallery');
  const screenViewer = document.getElementById('screen-viewer');
  const btnGalleryClose = document.getElementById('btn-gallery-close');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');

  const btnViewerClose = document.getElementById('btn-viewer-close');
  const btnViewerDelete = document.getElementById('btn-viewer-delete');
  const btnViewerExport = document.getElementById('btn-viewer-export');
  const viewerMedia = document.getElementById('viewer-media');

  let isCapturing = false;
  let recTimerInterval = null;
  let recStartedAt = 0;
  let currentViewerMedia = null;
  let currentViewerUrl = null;

  function showScreen(name) {
    for (const el of [screenCamera, screenGallery, screenViewer]) {
      el.hidden = el.dataset.screen !== name;
    }
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function updateResBadge() {
    const settings = Camera.getSettings();
    resBadge.textContent = settings && settings.width && settings.height
      ? `${settings.width}×${settings.height}`
      : '';
  }

  async function initCamera() {
    cameraStatus.hidden = false;
    cameraStatus.textContent = 'Chargement de la caméra…';
    try {
      await Camera.init(viewfinder);
      cameraStatus.hidden = true;
      updateResBadge();
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
    recIndicator.hidden = !active;
    accumulator.classList.toggle('is-live', active);

    if (active) {
      recStartedAt = Date.now();
      recTimer.textContent = '00:00';
      recTimerInterval = setInterval(() => {
        recTimer.textContent = formatTimer(Date.now() - recStartedAt);
      }, 500);
    } else {
      clearInterval(recTimerInterval);
      recTimerInterval = null;
    }
  }

  async function startCapture() {
    if (isCapturing) return;
    setCapturingUI(true);
    CaptureEngine.start();
    Recorder.start(Camera.getStream());
  }

  async function stopCapture() {
    if (!isCapturing) return;
    setCapturingUI(false);

    const [photoBlob, videoResult] = await Promise.all([
      CaptureEngine.stop(),
      Recorder.stop(),
    ]);

    if (photoBlob) {
      const thumb = await Gallery.createPhotoThumbnail(photoBlob);
      await MediaDB.addMedia({ type: 'photo', blob: photoBlob, thumbnail: thumb, mimeType: 'image/jpeg' });
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
    await refreshLatestThumb();
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
    Gallery.renderGrid(galleryGrid, galleryEmpty, openViewer);
  }

  btnSwitchCamera.addEventListener('click', async () => {
    await Camera.switchCamera();
    updateResBadge();
  });

  btnShutter.addEventListener('click', () => {
    if (isCapturing) stopCapture();
    else startCapture();
  });

  btnGallery.addEventListener('click', () => {
    showScreen('gallery');
    Gallery.renderGrid(galleryGrid, galleryEmpty, openViewer);
  });

  btnGalleryClose.addEventListener('click', () => showScreen('camera'));

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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  initCamera();
  refreshLatestThumb();
})();
