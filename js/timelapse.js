// Construit un clip accéléré montrant la construction de la trainée : capture
// des snapshots du canvas d'accumulation pendant la prise de vue, puis les
// rejoue à cadence fixe via canvas.captureStream() + MediaRecorder à l'arrêt.
const Timelapse = (() => {
  const SNAPSHOT_INTERVAL_MS = 400;
  const MAX_SNAPSHOTS = 100;
  const SNAPSHOT_WIDTH = 960;
  const PLAYBACK_FPS = 10;

  let intervalId = null;
  let snapshots = [];
  let snapCanvas = null;
  let snapCtx = null;

  function startCollecting(sourceCanvas) {
    snapshots = [];
    intervalId = setInterval(() => {
      if (snapshots.length >= MAX_SNAPSHOTS || !sourceCanvas.width) return;

      const scale = Math.min(1, SNAPSHOT_WIDTH / sourceCanvas.width);
      const w = Math.round(sourceCanvas.width * scale);
      const h = Math.round(sourceCanvas.height * scale);
      if (!snapCanvas) {
        snapCanvas = document.createElement('canvas');
        snapCtx = snapCanvas.getContext('2d');
      }
      snapCanvas.width = w;
      snapCanvas.height = h;
      snapCtx.drawImage(sourceCanvas, 0, 0, w, h);
      createImageBitmap(snapCanvas).then((bitmap) => snapshots.push(bitmap));
    }, SNAPSHOT_INTERVAL_MS);
  }

  function stopCollecting() {
    clearInterval(intervalId);
    intervalId = null;
    return snapshots;
  }

  async function build(frames) {
    if (!frames || frames.length < 2) return null;

    const width = frames[0].width;
    const height = frames[0].height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const mimeType = Recorder.pickMimeType();
    const stream = canvas.captureStream(PLAYBACK_FPS);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    });

    recorder.start();
    const frameDuration = 1000 / PLAYBACK_FPS;
    for (const bitmap of frames) {
      ctx.drawImage(bitmap, 0, 0, width, height);
      await new Promise((r) => setTimeout(r, frameDuration));
    }
    recorder.stop();

    const blob = await stopped;
    for (const bitmap of frames) bitmap.close();
    return { blob, mimeType: mimeType || 'video/webm' };
  }

  return { startCollecting, stopCollecting, build };
})();
