// Gère le flux caméra : ouverture, bascule avant/arrière, résolution native max.
const Camera = (() => {
  let videoEl = null;
  let stream = null;
  let facingMode = 'environment';

  function buildConstraints(mode) {
    return {
      audio: false,
      video: {
        facingMode: { ideal: mode },
        width: { ideal: 4096 },
        height: { ideal: 2160 },
      },
    };
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  async function start(mode) {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia(buildConstraints(mode));
    } catch (err) {
      // Fallback si la contrainte facingMode idéale échoue sur ce device.
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
    facingMode = mode;
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    return stream;
  }

  async function init(el) {
    videoEl = el;
    return start(facingMode);
  }

  async function switchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    return start(next);
  }

  function getStream() {
    return stream;
  }

  function getVideoTrack() {
    return stream ? stream.getVideoTracks()[0] : null;
  }

  function getSettings() {
    const track = getVideoTrack();
    return track ? track.getSettings() : null;
  }

  function getFacingMode() {
    return facingMode;
  }

  return { init, switchCamera, getStream, getVideoTrack, getSettings, getFacingMode };
})();
