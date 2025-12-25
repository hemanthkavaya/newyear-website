// ------------------------------
// 1. Firebase Configuration
// ------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB86zcSMsbtHruh1sd-TMvwgqRcpheEVbw",
  authDomain: "theatre-app-dec45.firebaseapp.com",
  projectId: "theatre-app-dec45",
  storageBucket: "theatre-app-dec45.firebasestorage.app",
  messagingSenderId: "778737393788",
  appId: "1:778737393788:web:6afffb1a82435d93c429f9",
  measurementId: "G-JD795788HH"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ------------------------------
// 2. WebRTC Setup
// ------------------------------
let localStream;
let remoteStream = new MediaStream();
let peerConnection;

const servers = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] };

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ------------------------------
// 3. Start Camera
// ------------------------------
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    console.log("Camera started");
  } catch (err) {
    console.error("Camera error:", err);
    alert("Cannot access camera. Please allow permissions.");
  }
}
startCamera();

// ------------------------------
// 4. Start Call with STATIC ID
// ------------------------------
document.getElementById("startCall").onclick = async () => {
  if (!localStream) return alert("Camera not ready!");

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = event => {
    remoteStream.addTrack(event.track);
    remoteVideo.srcObject = remoteStream;
  };

  // STATIC call ID
  const callId = "1234";
  alert("Share this Call ID with your GF:\n\n" + callId);

  const callRef = db.ref("calls/" + callId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await callRef.child("offer").set(JSON.stringify(offer));

  peerConnection.onicecandidate = event => {
    if (event.candidate) callRef.child("offerCandidates").push(JSON.stringify(event.candidate));
  };

  callRef.child("answer").on("value", async snapshot => {
    const data = snapshot.val();
    if (!data) return;
    await peerConnection.setRemoteDescription(JSON.parse(data));
  });
};

// ------------------------------
// 5. Join Call
// ------------------------------
document.getElementById("joinCall").onclick = async () => {
  const callId = prompt("Enter Call ID (use 1234):");
  if (!callId) return alert("Call ID required!");

  if (!localStream) return alert("Camera not ready!");

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = event => {
    remoteStream.addTrack(event.track);
    remoteVideo.srcObject = remoteStream;
  };

  const callRef = db.ref("calls/" + callId);
  const snapshot = await callRef.child("offer").get();
  if (!snapshot.exists()) return alert("Invalid Call ID!");

  const offer = JSON.parse(snapshot.val());
  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await callRef.child("answer").set(JSON.stringify(answer));

  peerConnection.onicecandidate = event => {
    if (event.candidate) callRef.child("answerCandidates").push(JSON.stringify(event.candidate));
  };

  callRef.child("offerCandidates").on("child_added", snapshot => {
    const candidate = JSON.parse(snapshot.val());
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
};

// ------------------------------
// 6. Screen Sharing
// ------------------------------
document.getElementById("shareScreen").onclick = async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
    sender.replaceTrack(screenTrack);

    screenTrack.onended = () => {
      sender.replaceTrack(localStream.getVideoTracks()[0]);
    };
  } catch (err) {
    console.error("Screen share error:", err);
    alert("Failed to share screen.");
  }
};
