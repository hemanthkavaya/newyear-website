// ------------------------------
// 1. Firebase Config
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
// 2. WebRTC Setup
// ------------------------------
let localStream;
let remoteStream;
let peerConnection;

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
// 3. Start Camera
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
// 4. Start Call
// ------------------------------
document.getElementById("startCall").onclick = async () => {
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track =>
      remoteStream.addTrack(track)
    );
  };

  const callId = Math.floor(100000 + Math.random() * 900000).toString();
  alert("Share this Call ID:\n\n" + callId);

  const callRef = db.ref("calls/" + callId);

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      callRef.child("offerCandidates").push(JSON.stringify(event.candidate));
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await callRef.set({
    offer: JSON.stringify(offer)
  });

  callRef.child("answer").on("value", async snapshot => {
    if (!snapshot.exists()) return;
    const answer = JSON.parse(snapshot.val());
    if (!peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(answer);
    }
  });

  callRef.child("answerCandidates").on("child_added", snapshot => {
    const candidate = JSON.parse(snapshot.val());
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
};

// ------------------------------
// 5. Join Call
// ------------------------------
document.getElementById("joinCall").onclick = async () => {
  const callId = prompt("Enter Call ID:");
  if (!callId) return;

  const callRef = db.ref("calls/" + callId);

  // Wait until offer exists (max 5 seconds)
  let offerSnapshot;
  for (let i = 0; i < 5; i++) {
    offerSnapshot = await callRef.child("offer").get();
    if (offerSnapshot.exists()) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!offerSnapshot.exists()) {
    alert("Invalid Call ID or host not ready");
    return;
  }

  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track =>
    peerConnection.addTrack(track, localStream)
  );

  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track =>
      remoteStream.addTrack(track)
    );
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      callRef.child("answerCandidates").push(JSON.stringify(event.candidate));
    }
  };

  const offer = JSON.parse(offerSnapshot.val());
  await peerConnection.setRemoteDescription(offer);

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  await callRef.child("answer").set(JSON.stringify(answer));

  callRef.child("offerCandidates").on("child_added", snapshot => {
    const candidate = JSON.parse(snapshot.val());
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
};

// ------------------------------
// 6. Screen Sharing
// ------------------------------
document.getElementById("shareScreen").onclick = async () => {
  if (!peerConnection) return alert("Start or Join a call first");

  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getVideoTracks()[0];

  const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
  sender.replaceTrack(screenTrack);

  screenTrack.onended = () => {
    sender.replaceTrack(localStream.getVideoTracks()[0]);
  };
};
