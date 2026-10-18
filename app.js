let role, stream, peer, channel;
const $ = (id) => document.getElementById(id);
const status = (text) => $("connectionStatus").textContent = text;

document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => chooseRole(button.dataset.role)));

function chooseRole(nextRole) {
  role = nextRole;
  $("home").classList.remove("active");
  $(role).classList.add("active");
  status(role === "camera" ? "카메라 폰" : "모니터 폰");
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    $("localVideo").srcObject = stream;
    $("cameraHint").textContent = "준비되었습니다. 사진은 이 폰에 저장됩니다.";
    $("startCamera").textContent = "카메라 켜짐";
    $("startCamera").disabled = true;
  } catch (error) {
    $("cameraHint").textContent = "카메라를 허용해 주세요. 이 앱은 HTTPS 주소에서 열어야 합니다.";
    console.error(error);
  }
}

function takePhoto() {
  if (!stream) return;
  const video = $("localVideo"), canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `DirectCam-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/jpeg", 0.95);
}

function makePeer() {
  peer = new RTCPeerConnection({ iceServers: [] });
  peer.onconnectionstatechange = () => {
    const connected = peer.connectionState === "connected";
    status(connected ? "직접 연결됨" : peer.connectionState);
    if (role === "monitor") $("remoteShutter").disabled = !connected;
  };
  peer.ontrack = (event) => { $("remoteVideo").srcObject = event.streams[0]; $("monitorHint").textContent = "카메라 폰의 실시간 화면입니다."; };
  peer.ondatachannel = (event) => { channel = event.channel; listenForShutter(); };
  return peer;
}

function listenForShutter() { channel.onmessage = (event) => { if (event.data === "SHUTTER") takePhoto(); }; }
function waitForIceComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timeout = setTimeout(resolve, 5000);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
    };
  });
}
function encode(desc) { return btoa(unescape(encodeURIComponent(JSON.stringify(desc)))); }
function decode(text) { return JSON.parse(decodeURIComponent(escape(atob(text.trim())))); }

$("startCamera").addEventListener("click", startCamera);
$("takePhoto").addEventListener("click", takePhoto);
$("createOffer").addEventListener("click", async () => {
  if (!stream) return $("cameraHint").textContent = "먼저 카메라 시작을 눌러 주세요.";
  try {
    $("cameraHint").textContent = "카메라 코드를 만드는 중…";
    makePeer(); stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    channel = peer.createDataChannel("directcam"); listenForShutter();
    await peer.setLocalDescription(await peer.createOffer()); await waitForIceComplete(peer);
    $("offerOut").value = encode(peer.localDescription); $("cameraHint").textContent = "코드를 모니터 폰에 전달해 주세요.";
  } catch (error) {
    console.error(error); $("cameraHint").textContent = "코드를 만들지 못했습니다. 새로고침 후 다시 시도해 주세요.";
  }
});
$("acceptAnswer").addEventListener("click", async () => { try { await peer.setRemoteDescription(decode($("answerIn").value)); $("cameraHint").textContent = "연결하는 중…"; } catch { $("cameraHint").textContent = "답장 코드가 올바르지 않습니다."; } });
$("createAnswer").addEventListener("click", async () => { try { makePeer(); await peer.setRemoteDescription(decode($("offerIn").value)); await peer.setLocalDescription(await peer.createAnswer()); await waitForIceComplete(peer); $("answerOut").value = encode(peer.localDescription); $("monitorHint").textContent = "답장 코드를 카메라 폰에 전달해 주세요."; } catch { $("monitorHint").textContent = "카메라 코드가 올바르지 않습니다."; } });
$("remoteShutter").addEventListener("click", () => channel?.readyState === "open" && channel.send("SHUTTER"));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
