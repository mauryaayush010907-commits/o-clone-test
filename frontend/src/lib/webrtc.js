/** Native WebRTC helpers shared by the video chat page. */

export function mediaError(err) {
  if (!err) return { code: "unknown", title: "Media unavailable", hint: "Could not access your camera or microphone." };
  switch (err.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return {
        code: "denied",
        title: "Camera or microphone blocked",
        hint: "Permission was denied. Allow camera and microphone access in your browser's site settings, then retry.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { code: "no-device", title: "No camera or microphone found", hint: "Connect a camera and microphone, then retry." };
    case "NotReadableError":
    case "TrackStartError":
      return { code: "busy", title: "Device is in use", hint: "Another app is using your camera or microphone. Close it and retry." };
    case "SecurityError":
      return { code: "insecure", title: "Insecure context", hint: "Camera access requires HTTPS (or localhost)." };
    default:
      return { code: "unknown", title: "Media error", hint: err.message || "Could not start your media devices." };
  }
}

export async function getMedia() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
  });
}

export function makePeerConnection({
  iceServers,
  onIce,
  onTrack,
  onState,
  onIceState,
  onIceError,
  onSignaling,
  onGathering,
}) {
  const pc = new RTCPeerConnection({ iceServers });
  pc.onicecandidate = (e) => {
    onIce(e.candidate ? e.candidate.toJSON() : null);
  };
  pc.ontrack = onTrack;
  pc.onconnectionstatechange = () => onState(pc.connectionState);
  pc.oniceconnectionstatechange = () => onIceState && onIceState(pc.iceConnectionState);
  pc.onicecandidateerror = (event) => onIceError && onIceError({
    errorCode: Number.isInteger(event.errorCode) ? event.errorCode : null,
    isTurnServer: typeof event.url === "string" && /^turns?:/i.test(event.url),
  });
  pc.onsignalingstatechange = () => onSignaling && onSignaling(pc.signalingState);
  pc.onicegatheringstatechange = () => onGathering && onGathering(pc.iceGatheringState);
  return pc;
}

export async function selectedCandidatePairTypes(pc) {
  if (!pc || typeof pc.getStats !== "function") return null;
  const stats = await pc.getStats();
  let pair = [...stats.values()].find((report) =>
    report.type === "candidate-pair" && report.selected === true
  );
  if (!pair) {
    const transport = [...stats.values()].find((report) =>
      report.type === "transport" && report.selectedCandidatePairId
    );
    if (transport) pair = stats.get(transport.selectedCandidatePairId);
  }
  if (!pair) {
    pair = [...stats.values()].find((report) =>
      report.type === "candidate-pair" && report.nominated && report.state === "succeeded"
    );
  }
  if (!pair) return null;

  const local = stats.get(pair.localCandidateId);
  const remote = stats.get(pair.remoteCandidateId);
  return {
    state: pair.state,
    localCandidateType: local?.candidateType || null,
    remoteCandidateType: remote?.candidateType || null,
    protocol: pair.protocol || local?.protocol || null,
  };
}

export async function createOffer(pc) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return pc.localDescription;
}

export async function createAnswer(pc) {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return pc.localDescription;
}

export async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  } catch {
    return [];
  }
}

/** Replace the outgoing video track (camera switching). */
export async function switchCamera(pc, localStream, deviceId) {
  const track = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
  const sender = pc ? pc.getSenders().find((s) => s.track && s.track.kind === "video") : null;
  const newTrack = track.getVideoTracks()[0];
  if (sender) await sender.replaceTrack(newTrack);
  const old = localStream.getVideoTracks()[0];
  if (old) localStream.removeTrack(old);
  localStream.addTrack(newTrack);
  if (old && old.deviceId && old.deviceId === newTrack.deviceId) old.stop();
  return newTrack;
}
