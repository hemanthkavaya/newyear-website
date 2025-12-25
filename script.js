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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ------------------------------
// 2. WebRTC Setup
// ------------------------------
let localStream;
let remoteStream = new MediaStream();
let peerConnection;

const servers = {
    iceServers: [
        { urls: ["stun:stun.l.google.com:19302"] }
    ]
};

// Get video elements
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

// ------------------------------
// 3. Get Camera Stream
// ------------------------------
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        console.log("Camera started");
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert("Cannot access camera. Please check permissions.");
    }
}
startCamera();

// ------------------------------
// Helper: Generate 4-digit unique Call ID
// ------------------------------
async function generateUniqueCallId() {
    let callId;
    let exists = true;

    while (exists) {
        callId = Math.floor(1000 + Math.random() * 9000).toString();
        const snapshot = await db.ref("calls/" + callId).get();
        exists = snapshot.exists();
    }

    return callId;
}

// ------------------------------
// 4. Start a Call (You)
// ------------------------------
document.getElementById("startCall").onclick = async () => {
    console.log("Start Call clicked");

    if (!localStream) {
        alert("Camera not ready yet!");
        return;
    }

    peerConnection = new RTCPeerConnection(servers);

    // Add local tracks
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Show remote stream
    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        remoteVideo.srcObject = remoteStream;
    };

    try {
        // Generate 4-digit unique Call ID
        const callId = await generateUniqueCallId();
        console.log("Generated Call ID:", callId);

        const callRef = db.ref("calls/" + callId);

        // Show alert with Call ID
        alert("Share this Call ID with your GF:\n\n" + callId);

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Save offer to Firebase
        await callRef.child("offer").set(JSON.stringify(offer));

        // Listen for answer
        callRef.child("answer").on("value", async snapshot => {
            const data = snapshot.val();
            if (!data) return;
            const answer = JSON.parse(data);
            if (!peerConnection.currentRemoteDescription)
                await peerConnection.setRemoteDescription(answer);
        });

        // ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                callRef.child("offerCandidates").push(JSON.stringify(event.candidate));
            }
        };

        // Listen for remote ICE
        callRef.child("answerCandidates").on("child_added", snapshot => {
            const candidate = JSON.parse(snapshot.val());
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });

    } catch (err) {
        console.error("Error starting call:", err);
        alert("Failed to start call. Check console for details.");
    }
};

// ------------------------------
// 5. Join a Call (Your GF)
// ------------------------------
document.getElementById("joinCall").onclick = async () => {
    const callId = prompt("Enter 4-digit Call ID:");

    if (!callId) return alert("Call ID is required!");

    const callRef = db.ref("calls/" + callId);

    if (!localStream) {
        alert("Camera not ready yet!");
        return;
    }

    peerConnection = new RTCPeerConnection(servers);

    // Add local stream
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
        remoteVideo.srcObject = remoteStream;
    };

    try {
        // Get offer
        const snapshot = await callRef.child("offer").get();
        if (!snapshot.exists()) return alert("Invalid Call ID!");
        const offer = JSON.parse(snapshot.val());

        await peerConnection.setRemoteDescription(offer);

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send answer to Firebase
        await callRef.child("answer").set(JSON.stringify(answer));

        // ICE candidates
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                callRef.child("answerCandidates").push(JSON.stringify(event.candidate));
            }
        };

        // Listen for remote ICE
        callRef.child("offerCandidates").on("child_added", snapshot => {
            const candidate = JSON.parse(snapshot.val());
            peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        });

    } catch (err) {
        console.error("Error joining call:", err);
        alert("Failed to join call. Check console for details.");
    }
};

// ------------------------------
// 6. Screen Sharing (You)
// ------------------------------
document.getElementById("shareScreen").onclick = async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === "video");

        sender.replaceTrack(screenTrack);

        screenTrack.onended = () => {
            sender.replaceTrack(localStream.getVideoTracks()[0]);
        };

    } catch (err) {
        console.error("Error sharing screen:", err);
        alert("Failed to share screen.");
    }
};
