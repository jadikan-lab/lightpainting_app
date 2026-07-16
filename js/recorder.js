// Enregistre le flux caméra brut pendant la capture (vidéo du "making-of" des trainées).
const Recorder = (() => {
  const CANDIDATE_TYPES = [
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  let mediaRecorder = null;
  let chunks = [];
  let mimeType = '';

  function pickMimeType() {
    return CANDIDATE_TYPES.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
  }

  function start(stream) {
    chunks = [];
    mimeType = pickMimeType();
    const options = mimeType ? { mimeType } : undefined;
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start();
  }

  function stop() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return Promise.resolve(null);
    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        resolve({ blob, mimeType: mimeType || 'video/webm' });
      };
      mediaRecorder.stop();
    });
  }

  function isRecording() {
    return !!mediaRecorder && mediaRecorder.state === 'recording';
  }

  return { start, stop, isRecording };
})();
