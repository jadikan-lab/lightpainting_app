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

  async function renderGrid(gridEl, emptyEl, onOpen) {
    const items = await MediaDB.getAllMedia();
    gridEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;

    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'gallery-cell';
      btn.type = 'button';
      btn.setAttribute('aria-label', item.type === 'photo' ? 'Photo' : 'Vidéo');

      const img = document.createElement('img');
      img.src = URL.createObjectURL(item.thumbnail || item.blob);
      img.loading = 'lazy';
      img.alt = '';
      btn.appendChild(img);

      if (item.type === 'video') {
        const badge = document.createElement('span');
        badge.className = 'cell-badge';
        badge.innerHTML = '&#9654;';
        btn.appendChild(badge);
      }

      btn.addEventListener('click', () => onOpen(item.id));
      gridEl.appendChild(btn);
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

  async function exportMedia(media) {
    const ext = media.type === 'photo'
      ? (media.mimeType && media.mimeType.includes('png') ? 'png' : 'jpg')
      : (media.mimeType && media.mimeType.includes('mp4') ? 'mp4' : 'webm');
    const filename = `lightpainting-${media.createdAt}.${ext}`;
    const file = new File([media.blob], filename, { type: media.blob.type || media.mimeType });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // tombe en fallback téléchargement ci-dessous
      }
    }

    const url = URL.createObjectURL(media.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return { createPhotoThumbnail, createVideoThumbnail, renderGrid, renderViewer, exportMedia };
})();
