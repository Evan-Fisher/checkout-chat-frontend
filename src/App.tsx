"use client";
import React, { useState, useRef } from "react";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import axios from "axios";

const firebaseConfig = {
  apiKey: "AIzaSyDa_EdXNH16nn2NJx3Cf8V8RJNnFyPqfxM",
  authDomain: "cheddar-checkout.firebaseapp.com",
  projectId: "cheddar-checkout",
  storageBucket: "cheddar-checkout.appspot.com",
  messagingSenderId: "848784850084",
  appId: "1:848784850084:web:8f447c30de899798e8fa31",
  measurementId: "G-Q6JDSF0952",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

function App() {
  const [callId, setCallId] = useState("");
  const pc = useRef<any>();

  async function microphoneClick() {
    const localStream = await navigator.mediaDevices.getUserMedia({
      // video: true,
      audio: true,
    });
    const remoteStream = new MediaStream();

    // const { data } = await axios.get("https://sellme.onrender.com/ice");
    const {
      data: { iceServers },
    } = await axios.get("https://sellme.onrender.com/ice");
    // const {
    //   data: { iceServers },
    // } = await axios.get("http://localhost:3001/ice");
    // console.log(data);
    pc.current = new RTCPeerConnection({ iceServers });

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.current.ontrack = (event: any) => {
      event.streams[0].getTracks().forEach((track: any) => {
        remoteStream.addTrack(track);
      });
    };
    console.log(localStream);
    const localAudio = document.getElementById(
      "webcamAudio"
    ) as HTMLAudioElement;
    localAudio.srcObject = localStream;
    localAudio.srcObject = localStream;
    const remoteAudio = document.getElementById(
      "remoteAudio"
    ) as HTMLAudioElement;
    remoteAudio.srcObject = remoteStream;
  }

  async function callClick() {
    // Reference Firestore collections for signaling
    const callDoc = firestore.collection("calls").doc();
    const offerCandidates = callDoc.collection("offerCandidates");
    const answerCandidates = callDoc.collection("answerCandidates");
    console.log(callDoc.id);
    setCallId(callDoc.id);

    // Get candidates for caller, save to db
    pc.current.onicecandidate = (event: any) => {
      event.candidate && offerCandidates.add(event.candidate.toJSON());
    };

    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await callDoc.set({ offer });

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        console.log(answerDescription, "SETTING REMOTE DESCRIPTION");
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          console.log("ADDING CANDIDATE TO CONNECTION");
          pc.current.addIceCandidate(candidate);
        }
      });
    });
  }

  async function answerClick() {
    const callDoc = firestore.collection("calls").doc(callId);
    const answerCandidates = callDoc.collection("answerCandidates");
    const offerCandidates = callDoc.collection("offerCandidates");

    pc.current.onicecandidate = (event: any) => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    };

    const callData = (await callDoc.get()).data();

    const offerDescription = callData?.offer;
    await pc.current.setRemoteDescription(
      new RTCSessionDescription(offerDescription)
    );

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await callDoc.update({ answer });

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        console.log(change);
        if (change.type === "added") {
          let data = change.doc.data();
          pc.current.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h2>1. Start your Microphone</h2>
      <div className="videos">
        <span>
          <h3>Local Stream</h3>
          <audio id="webcamAudio" autoPlay playsInline muted />
        </span>
        <span>
          <h3>Remote Stream</h3>
          <audio id="remoteAudio" autoPlay playsInline />
        </span>
      </div>
      <button id="webcamButton" onClick={microphoneClick}>
        Start microphone
      </button>
      <h2>2. Create a new Call</h2>
      <button onClick={callClick} id="callButton">
        Create Call (offer)
      </button>
      <h2>3. Join a Call</h2>
      <p>Answer the call from a different browser window or device</p>
      <input
        id="callInput"
        value={callId}
        onChange={(e) => setCallId(e.target.value)}
      />
      <button onClick={answerClick} id="answerButton">
        Answer
      </button>
      <h2>4. Hangup</h2>
      <button id="hangupButton">Hangup</button>
    </main>
  );
}

export default App;
