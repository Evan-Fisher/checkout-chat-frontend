"use client";
import React, { useState, useRef, useEffect } from "react";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import axios from "axios";
import ReactDOM from "react-dom";
import { animated, useSpring } from "@react-spring/web";

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
  const [customerSupport, setCustomerSupport] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callId, setCallId] = useState("");
  const [inCall, setInCall] = useState(false);
  const [usedByCount, setUsedByCount] = useState(0);
  const [callStatus, setCallStatus] = useState("idle"); // "idle", "calling", "inCall", "ended"
  const pc = useRef<any>();

  async function microphoneClick(e: any) {
    console.log(e);
    e.stopPropagation();
    console.log("WHATWHAT");
    setCallStatus("calling");

    // setInCall(true);
    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        // video: true,
        audio: true,
      });
      setLocalStream(localStream);
      const remoteStream = new MediaStream();
      setRemoteStream(remoteStream);
      console.log("GOT HERE 1");
      // const { data } = await axios.get("https://sellme.onrender.com/ice");
      const {
        data: { iceServers },
      } = await axios.get("https://sellme.onrender.com/ice");
      console.log("GOT HERE 1.5");
      // const {
      //   data: { iceServers },
      // } = await axios.get("http://localhost:3001/ice");
      // //
      // const {
      //   data: { iceServers },
      // } = await axios.get("https://1d8f-70-113-41-166.ngrok-free.app/");
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
      const localAudio = document.getElementById(
        "webcamAudio"
      ) as HTMLAudioElement;
      localAudio.srcObject = localStream;
      // localAudio.srcObject = localStream;
      const remoteAudio = document.getElementById(
        "remoteAudio"
      ) as HTMLAudioElement;
      remoteAudio.srcObject = remoteStream;
      console.log("GOT HERE 2");
      await callClick();
    } catch (error) {
      console.log(error);
      setCallStatus("idle");
      // setInCall(false);
    }
  }

  async function callClick() {
    try {
      console.log("SETTING CALL STATUS");
      // Reference Firestore collections for signaling
      const callDoc = firestore.collection("calls").doc();
      const offerCandidates = callDoc.collection("offerCandidates");
      const answerCandidates = callDoc.collection("answerCandidates");
      console.log({ callId: callDoc.id });
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
            setCallStatus("inCall");
          }
        });
      });
    } catch (error) {
      console.log(error);
      setCallStatus("idle");
      // setInCall(false);
    }
  }
  console.log({ callStatus });

  async function answerClick(e: any) {
    await microphoneClick(e);
    try {
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
    } catch (error) {
      console.log(error);
    }
  }

  function closePeerConnection() {
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
  }

  function stopMediaTracks(stream: any) {
    if (stream) {
      stream.getTracks().forEach((track: any) => track?.stop());
    }
  }

  async function removeCallDocument(callId: any) {
    if (callId) {
      const callDoc = firestore.collection("calls").doc(callId);
      await callDoc.delete();
    }
  }

  async function endCall(e: any) {
    e.stopPropagation();
    setCallStatus("idle");
    // Stop media tracks
    stopMediaTracks(localStream);
    stopMediaTracks(remoteStream);

    const localAudio = document.getElementById(
      "webcamAudio"
    ) as HTMLAudioElement;
    const remoteAudio = document.getElementById(
      "remoteAudio"
    ) as HTMLAudioElement;

    if (localAudio) {
      localAudio.srcObject = null; // Clear the media source
    }

    if (remoteAudio) {
      remoteAudio.srcObject = null; // Clear the media source
    }
    // Close peer connection
    closePeerConnection();

    // Remove call document from Firestore (optional)
    await removeCallDocument(callId);
  }

  useEffect(() => {
    async function getUsedByCount() {
      // const {
      //   data: { usedByCount },
      // } = await axios.get("https://sellme.onrender.com/usedByCount");
      const {
        data: { usedByCount },
      } = await axios.get("http://localhost:3001/usedByCount");
      console.log("CALLING", usedByCount);

      setUsedByCount(usedByCount);
    }
    getUsedByCount();
    console.log(usedByCount);
  }, []);

  console.log(usedByCount);

  return (
    <main style={{ width: "100%", height: "100%" }}>
      {!customerSupport ? (
        <>
          <iframe
            title="what"
            // ref={iframeRef}
            src="https://www.mill.com"
            style={{ width: "100%", height: "100%", border: 0 }}
          />
          <button
            className="absolute top-0 left-0"
            onClick={() => setCustomerSupport(true)}
            style={{ color: "#fefcf5", fontSize: "12px" }}
          >
            CLALSL
          </button>
          <ChatComponent
            setCustomerSupport={setCustomerSupport}
            answerClick={answerClick}
            microphoneClick={microphoneClick}
            usedByCount={usedByCount}
            inCall={inCall}
            callStatus={callStatus}
            endCall={endCall}
          />
        </>
      ) : (
        <div>
          <p>Hello! CUstomer support</p>
          <input value={callId} onChange={(e) => setCallId(e.target.value)} />
          <button onClick={answerClick}>PICK UP PHONE</button>
          <audio id="webcamAudio" autoPlay playsInline muted />
          <audio id="remoteAudio" autoPlay playsInline />
        </div>
      )}
    </main>
  );
}

function ChatComponent({
  microphoneClick,
  inCall,
  usedByCount,
  callStatus,
  endCall,
}: any) {
  return (
    <div className="fixed bottom-0 right-4">
      <Popup
        microphoneClick={microphoneClick}
        inCall={inCall}
        usedByCount={usedByCount}
        callStatus={callStatus}
        endCall={endCall}
      />
    </div>
  );
}

function Popup({ microphoneClick, usedByCount, callStatus, endCall }: any) {
  const [show, setShow] = useState(true);
  let InnerModal;

  if (callStatus === "idle") {
    InnerModal = show ? (
      <>
        <text className="text-offWhite font-bold text-l text-center mb-2">
          Looking to buy?
        </text>
        <text className="text-offWhite font-semibold text-xs mb-4 text-center">
          Talk immediately <span>-</span> we're here to help.
        </text>
        <button
          className="bg-brightGreen rounded-full py-2 px-6 mb-4"
          id="webcamButton"
          onClick={(e) => microphoneClick(e)}
        >
          <text className="text-darkGreen font-bold">Start audio call</text>
        </button>
        {usedByCount && (
          <text className="text-brightGreen text-xs mb-2">
            <span className="opacity-80">Used by </span>
            <span className="font-bold text-xs">
              {usedByCount.toLocaleString("en-US")}
            </span>
            <span className="opacity-80"> customers today</span>
          </text>
        )}
      </>
    ) : (
      <text className="text-offWhite font-semibold text-xs">
        <span className="text-brightGreen font-bold text-xs">
          Have a question?
        </span>{" "}
        Call us live
      </text>
    );
  } else if (callStatus === "calling") {
    InnerModal = show ? (
      <>
        <text className="text-offWhite font-bold text-l text-center mb-2">
          Calling...
        </text>
        <text className="text-offWhite font-semibold text-xs mb-4 text-center">
          Just a moment please
        </text>
        <img src="/images/mill-logo.png" className="w-14 spin-slowly mb-4" />
        <button
          className="bg-brightGreen rounded-full py-2 px-6 mb-4"
          id="webcamButton"
          onClick={(e) => endCall(e)}
          // onClick={(e) => microphoneClick(e)}
        >
          <text className="text-darkGreen font-bold">Cancel call</text>
        </button>
      </>
    ) : (
      <text className="text-offWhite font-semibold text-xs">
        <span className="text-brightGreen font-bold text-xs">Calling...</span>{" "}
        {/* Call us live */}
      </text>
    );
  }
  return (
    <button
      // slide-in
      className={`w-[220px] bottom-0 bg-darkGreen flex flex-col shadow-3xl rounded-t-2xl z-10 relative${
        show ? " pt-6 px-4 items-center" : " pb-2.5 pt-2.5 pl-4"
      }`}
      onClick={() => setShow(!show)}
    >
      <img
        src="/images/arrow.png"
        className={`w-3 absolute top-3 right-3${show ? "" : " rotate-180"}`}
      />
      {InnerModal}
      <audio id="webcamAudio" autoPlay playsInline muted />
      <audio id="remoteAudio" autoPlay playsInline />
    </button>
  );
}

export default App;
