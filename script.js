// ------------------------------
// Firebase Config
// ------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB86zcSMsbtHruh1sd-TMvwgqRcpheEVbw",
  authDomain: "theatre-app-dec45.firebaseapp.com",
  databaseURL: "https://theatre-app-dec45-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "theatre-app-dec45",
  storageBucket: "theatre-app-dec45.appspot.com",
  messagingSenderId: "778737393788",
  appId: "1:778737393788:web:6afffb1a82435d93c429f9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ------------------------------
// WebRTC
// ------------------------------
let localStream;
let peerConnection;
let remoteStream;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ------------------------------
// Camera
// ------------------------------
async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
  localVideo.srcObject = localStream;
}
startCamera();

// ------------------------------
// Create Peer
// ------------------------------
function createPeer(callRef, isCaller) {
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = e => {
    e.streams[0].getTracks().forEach(track =>
      remoteStream.addTrack(track)
    );
  };

  peerConnection.onicecandidate = e => {
    if (!e.candidate) return;
    callRef
      .child(isCaller ? "offerCandidates" : "answerCandidates")
      .push(JSON.stringify(e.candidate));
  };
}

// ------------------------------
// START CALL
// ------------------------------
document.getElementById("startCall").onclick = async () => {
  const callId = Math.floor(100000 + Math.random() * 900000).toString();
  alert("Share this Call ID:\n\n" + callId);

  const callRef = db.ref("calls/" + callId);
  await callRef.set({ created: Date.now() });

  createPeer(callRef, true);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await callRef.child("offer").set(JSON.stringify(offer));

  callRef.child("answer").on("value", async snap => {
    if (!snap.exists()) return;
    await peerConnection.setRemoteDescription(JSON.parse(snap.val()));
  });

  callRef.child("answerCandidates").on("child_added", snap => {
    peerConnection.addIceCandidate(
      new RTCIceCandidate(JSON.parse(snap.val()))
    );
  });
};

// ------------------------------
// JOIN CALL (NO INVALID ID)
// ------------------------------
document.getElementById("joinCall").onclick = async () => {
  const callId = prompt("Enter Call ID:");
  if (!callId) return;

  const callRef = db.ref("calls/" + callId);

  callRef.child("offer").on("value", async snap => {
    if (!snap.exists()) {
      alert("Waiting for host...");
      return;
    }

    callRef.child("offer").off(); // stop listening again

    createPeer(callRef, false);

    const offer = JSON.parse(snap.val());
    await peerConnection.setRemoteDescription(offer);

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await callRef.child("answer").set(JSON.stringify(answer));

    callRef.child("offerCandidates").on("child_added", s => {
      peerConnection.addIceCandidate(
        new RTCIceCandidate(JSON.parse(s.val()))
      );
    });
  });
};

// ------------------------------
// Screen Share
// ------------------------------
document.getElementById("shareScreen").onclick = async () => {
  const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screen.getVideoTracks()[0];

  const sender = peerConnection
    .getSenders()
    .find(s => s.track.kind === "video");

  sender.replaceTrack(screenTrack);

  screenTrack.onended = () => {
    sender.replaceTrack(localStream.getVideoTracks()[0]);
  };
};
