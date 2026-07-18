// Génération de miniatures, rendu de la grille galerie, visionneuse et export/partage.
const Gallery = (() => {
  async function createPhotoThumbnail(blob, maxDim = 400) {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  }

  function createVideoThumbnail(blob, maxDim = 400) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto'; // iOS Safari : sans preload, onloadedmetadata/onseeked peuvent ne jamais arriver

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.3, (video.duration || 1) / 2);
      };
      video.onseeked = () => {
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round(video.videoWidth * scale) || maxDim;
        const h = Math.round(video.videoHeight * scale) || maxDim;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((thumbBlob) => resolve(thumbBlob), 'image/jpeg', 0.8);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('video thumbnail failed'));
      };
    });
  }

  const LONG_PRESS_MS = 450;

  function attachTapAndLongPress(el, id, onOpen, onLongPress) {
    let timer = null;
    let longPressFired = false;

    el.addEventListener('pointerdown', () => {
      longPressFired = false;
      timer = setTimeout(() => {
        longPressFired = true;
        onLongPress(id);
      }, LONG_PRESS_MS);
    });
    const cancelTimer = () => clearTimeout(timer);
    el.addEventListener('pointerup', cancelTimer);
    el.addEventListener('pointercancel', cancelTimer);
    el.addEventListener('pointermove', cancelTimer);
    el.addEventListener('click', (e) => {
      if (longPressFired) {
        e.preventDefault();
        return;
      }
      onOpen(id);
    });
  }

  async function renderGrid(gridEl, emptyEl, onOpen, onLongPress) {
    const items = await MediaDB.getAllMedia();
    // Révoque les object URLs du rendu précédent avant de vider la grille,
    // sinon chaque ouverture de la galerie laisse fuir la mémoire des miniatures.
    for (const oldImg of gridEl.querySelectorAll('img')) {
      if (oldImg.src.startsWith('blob:')) URL.revokeObjectURL(oldImg.src);
    }
    gridEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'gallery-cell';
      btn.type = 'button';
      btn.dataset.id = item.id;
      const labels = { photo: 'Photo', video: 'Vidéo', timelapse: 'Timelapse' };
      btn.setAttribute('aria-label', labels[item.type] || 'Média');

      const img = document.createElement('img');
      img.src = URL.createObjectURL(item.thumbnail || item.blob);
      img.loading = 'lazy';
      img.alt = '';
      btn.appendChild(img);

      if (item.type === 'video' || item.type === 'timelapse') {
        const badge = document.createElement('span');
        badge.className = 'cell-badge';
        badge.innerHTML = item.type === 'timelapse' ? '&#9193;' : '&#9654;';
        btn.appendChild(badge);
      }

      const selectBadge = document.createElement('span');
      selectBadge.className = 'cell-select-badge';
      selectBadge.innerHTML = '&#10003;';
      btn.appendChild(selectBadge);

      attachTapAndLongPress(btn, item.id, onOpen, onLongPress);
      gridEl.appendChild(btn);
    }
  }

  function setSelectionState(gridEl, selectedIds) {
    for (const cell of gridEl.children) {
      cell.classList.toggle('is-selected', selectedIds.has(Number(cell.dataset.id)));
    }
  }

  function renderViewer(containerEl, media) {
    containerEl.innerHTML = '';
    const url = URL.createObjectURL(media.blob);

    if (media.type === 'photo') {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      containerEl.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      video.loop = true;
      containerEl.appendChild(video);
    }
    return url;
  }

  function mediaToFile(media) {
    const ext = media.type === 'photo'
      ? (media.mimeType && media.mimeType.includes('png') ? 'png' : 'jpg')
      : (media.mimeType && media.mimeType.includes('mp4') ? 'mp4' : 'webm');
    const filename = `lightpainting-${media.createdAt}.${ext}`;
    return new File([media.blob], filename, { type: media.blob.type || media.mimeType });
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportMedia(media) {
    const file = mediaToFile(media);

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // tombe en fallback téléchargement ci-dessous
      }
    }

    downloadFile(file);
  }

  async function exportMultiple(mediaList) {
    if (!mediaList || mediaList.length === 0) return;
    const files = mediaList.map(mediaToFile);

    // Une seule feuille de partage pour tous les fichiers quand le navigateur
    // le permet, sinon repli en téléchargements séquentiels (léger délai
    // entre chaque pour éviter le blocage de popups multiples).
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    for (const file of files) {
      downloadFile(file);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return {
    createPhotoThumbnail,
    createVideoThumbnail,
    renderGrid,
    setSelectionState,
    renderViewer,
    exportMedia,
    exportMultiple,
  };
})();
