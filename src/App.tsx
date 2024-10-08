"use client";
import { useState, useRef, useEffect } from "react";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import axios from "axios";
import Dashboard from "./Dashboard";

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
export const firestore = firebase.firestore();

function App() {
  const [customerSupport, setCustomerSupport] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callId, setCallId] = useState("");
  const [usedByCount, setUsedByCount] = useState(0);
  const [callStatus, setCallStatus] = useState("idle"); // "idle", "calling", "inCall", "ended"
  const pc = useRef<any>();
  const callSoundRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef<string | null>(null);
  const callJoinedSoundRef = useRef<HTMLAudioElement>(null);
  const callEndedSoundRef = useRef<HTMLAudioElement>(null);

  async function microphoneClick(e: any) {
    e.stopPropagation();
    setCallStatus("calling");
    // Play the audio when the call is answered
    if (callSoundRef.current) {
      callSoundRef.current.play();
    }

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        // video: true,
        audio: true,
      });
      setLocalStream(localStream);
      const remoteStream = new MediaStream();
      setRemoteStream(remoteStream);
      // const { data } = await axios.get("https://sellme.onrender.com/ice");
      const {
        data: { iceServers },
      } = await axios.get(
        process.env.NODE_ENV === "development"
          ? "http://localhost:3001/ice"
          : "https://sellme.onrender.com/ice"
      );
      // const {
      //   data: { iceServers },
      // } = await axios.get("http://localhost:3001/ice");
      // //
      // const {
      //   data: { iceServers },
      // } = await axios.get("https://1d8f-70-113-41-166.ngrok-free.app/");
      pc.current = new RTCPeerConnection({ iceServers });

      pc.current.addEventListener("connectionstatechange", (event: any) => {
        console.log(event);
        const eventStatus = event.target.connectionState;
        console.log({ eventStatus });
        if (eventStatus === "disconnected") {
          // 1. Play the audio when the call is ended
          if (callEndedSoundRef.current) {
            callEndedSoundRef.current.play();
          }
          endCall(null);
        }
      });

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
      await callClick();
    } catch (error) {
      console.log(error);
      setCallStatus("idle");
      if (callSoundRef.current) {
        callSoundRef.current.pause();
        callSoundRef.current.currentTime = 0;
      }
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

      await callDoc.set({
        offer,
        data: {
          callingTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
        },
      });
      // await callDoc.set(
      //   {
      //     data: { timestamp: firebase.firestore.FieldValue.serverTimestamp()} }
      //   },
      //   { merge: true }
      // );

      // Listen for remote answer
      callDoc.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.current?.currentRemoteDescription && data?.answer) {
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
            // Play the audio when the call is answered
            if (callSoundRef.current) {
              callSoundRef.current.pause();
              callSoundRef.current.currentTime = 0;
            }
            // Play the audio when the call is answered
            if (callJoinedSoundRef.current) {
              callJoinedSoundRef.current.play();
            }
          }
        });
      });
    } catch (error) {
      console.log(error);
      setCallStatus("idle");
      if (callSoundRef.current) {
        callSoundRef.current.pause();
        callSoundRef.current.currentTime = 0;
      }
    }
  }

  // async function answerClick(e: any) {
  //   await microphoneClick(e);
  //   try {
  //     const callDoc = firestore.collection("calls").doc(callId);
  //     const answerCandidates = callDoc.collection("answerCandidates");
  //     const offerCandidates = callDoc.collection("offerCandidates");

  //     pc.current.onicecandidate = (event: any) => {
  //       event.candidate && answerCandidates.add(event.candidate.toJSON());
  //     };

  //     const callData = (await callDoc.get()).data();

  //     const offerDescription = callData?.offer;
  //     console.log({ offerDescription });
  //     await pc.current.setRemoteDescription(
  //       new RTCSessionDescription(offerDescription)
  //     );

  //     const answerDescription = await pc.current.createAnswer();
  //     await pc.current.setLocalDescription(answerDescription);

  //     const answer = {
  //       type: answerDescription.type,
  //       sdp: answerDescription.sdp,
  //     };

  //     await callDoc.update({ answer });

  //     offerCandidates.onSnapshot((snapshot) => {
  //       snapshot.docChanges().forEach((change) => {
  //         console.log(change);
  //         if (change.type === "added") {
  //           let data = change.doc.data();
  //           pc.current.addIceCandidate(new RTCIceCandidate(data));
  //         }
  //       });
  //     });
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

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
    console.log("REMOVING CALL DOCUMENT", { callId });
    if (callId) {
      const callDoc = firestore.collection("calls").doc(callId);
      await callDoc.delete();
    }
  }

  async function endCall(e: any) {
    console.log("--------ENDING CALL--------");
    e?.stopPropagation();
    if (callSoundRef.current) {
      callSoundRef.current.pause();
      callSoundRef.current.currentTime = 0;
    }
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
    if (callEndedSoundRef.current) {
      callEndedSoundRef.current.play();
    }
    // Close peer connection
    closePeerConnection();

    // Remove call document from Firestore (optional)
    await removeCallDocument(callIdRef.current);
  }

  useEffect(() => {
    async function getUsedByCount() {
      console.log(process.env.NODE_ENV, "ENV");
      const {
        data: { usedByCount },
      } = await axios.get(
        process.env.NODE_ENV === "development"
          ? "http://localhost:3001/usedByCount"
          : "https://sellme.onrender.com/usedByCount"
      );
      // const {
      //   data: { usedByCount },
      // } = await axios.get("http://localhost:3001/usedByCount");

      setUsedByCount(usedByCount);
    }
    getUsedByCount();

    // return () => {
    //   // delete the call doc from the db
    //   removeCallDocument(callId);
    //   closePeerConnection();
    //   stopMediaTracks(localStream);
    //   stopMediaTracks(remoteStream);
    // };
  }, []);

  useEffect(() => {
    // Need ref for closure in listener
    callIdRef.current = callId;
  }, [callId]);

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
            // answerClick={answerClick}
            microphoneClick={microphoneClick}
            usedByCount={usedByCount}
            callStatus={callStatus}
            endCall={endCall}
            callSoundRef={callSoundRef}
            callJoinedSoundRef={callJoinedSoundRef}
            callEndedSoundRef={callEndedSoundRef}
          />
        </>
      ) : (
        <Dashboard />
      )}
    </main>
  );
}

function ChatComponent({
  microphoneClick,
  usedByCount,
  callStatus,
  endCall,
  callSoundRef,
  callJoinedSoundRef,
  callEndedSoundRef,
}: any) {
  return (
    <div className="fixed bottom-0 right-4">
      <Popup
        microphoneClick={microphoneClick}
        usedByCount={usedByCount}
        callStatus={callStatus}
        endCall={endCall}
        callSoundRef={callSoundRef}
        callJoinedSoundRef={callJoinedSoundRef}
        callEndedSoundRef={callEndedSoundRef}
      />
    </div>
  );
}

function Popup({
  microphoneClick,
  usedByCount,
  callStatus,
  endCall,
  callSoundRef,
  callJoinedSoundRef,
  callEndedSoundRef,
}: any) {
  const [show, setShow] = useState(true);
  let InnerModal;

  if (callStatus === "idle") {
    InnerModal = show ? (
      <>
        <p className="text-offWhite font-bold text-xl text-center mb-2">
          Looking to buy?
        </p>
        <p className="text-offWhite font-semibold mb-4 text-center">
          Talk immediately <span>-</span> we're here to help.
        </p>
        <button
          className="bg-brightGreen rounded-full py-2 px-6 mb-4"
          id="webcamButton"
          onClick={(e) => microphoneClick(e)}
        >
          <p className="text-darkGreen text-xl font-bold">Start audio call</p>
        </button>
        {usedByCount && (
          <p className="text-brightGreen text-sm mb-2">
            <span className="opacity-80">Used by </span>
            <span className="font-bold">
              {usedByCount.toLocaleString("en-US")}
            </span>
            <span className="opacity-80"> customers today</span>
          </p>
        )}
      </>
    ) : (
      <p className="text-offWhite font-semibold">
        <span className="text-brightGreen font-bold">Looking to buy?</span> Call
        us live
      </p>
    );
  } else if (callStatus === "calling") {
    InnerModal = show ? (
      <>
        <p className="text-offWhite font-bold text-xl text-center mb-2">
          Calling...
        </p>
        <p className="text-offWhite font-semibold mb-4 text-center">
          Just a moment please
        </p>
        <img src="/images/mill-logo.png" className="w-14 spin-slowly mb-4" />
        <button
          className="bg-brightGreen rounded-full py-2 px-6 mb-4"
          id="webcamButton"
          onClick={(e) => endCall(e)}
          // onClick={(e) => microphoneClick(e)}
        >
          <p className="text-darkGreen font-bold text-xl">Cancel call</p>
        </button>
      </>
    ) : (
      <p className="text-offWhite font-semibold">
        <span className="text-brightGreen font-bold">Calling...</span>{" "}
        {/* Call us live */}
      </p>
    );
  } else if (callStatus === "inCall") {
    InnerModal = show ? (
      <>
        <p className="text-offWhite font-bold text-xl text-center mb-2">
          You're on a call with Ari
        </p>
        <p className="text-offWhite font-semibold mb-4 text-center">
          Can't hear anything? Check that your audio is turned up.
        </p>
        <img src="/images/in-call.gif" className="w-14 mb-4" />
        <button
          className="bg-brightGreen rounded-full py-2 px-6 mb-4"
          id="webcamButton"
          onClick={(e) => endCall(e)}
        >
          <p className="text-darkGreen font-bold text-xl">End call</p>
        </button>
      </>
    ) : (
      <p className="text-offWhite font-semibold">
        <span className="text-brightGreen font-bold">In call</span>{" "}
      </p>
    );
  }
  return (
    <button
      className={`slide-in w-[260px] bottom-0 bg-darkGreen flex flex-col shadow-3xl rounded-t-2xl z-10 relative${
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
      <audio ref={callSoundRef} src="/audio/ringing.mp3" preload="auto" loop />
      <audio
        ref={callJoinedSoundRef}
        src="/audio/answered.mp3"
        preload="auto"
      />
      <audio ref={callEndedSoundRef} src="/audio/ended.mp3" preload="auto" />
    </button>
  );
}

export default App;
