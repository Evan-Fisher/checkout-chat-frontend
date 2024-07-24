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
  const [callId, setCallId] = useState("");
  const pc = useRef<any>();

  async function microphoneClick() {
    try {
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

      await callClick();
    } catch (error) {
      console.log(error);
    }
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
          <ChatComponent
            setCustomerSupport={setCustomerSupport}
            answerClick={answerClick}
            microphoneClick={microphoneClick}
          />
        </>
      ) : (
        <div>
          <p>Hello! CUstomer support</p>
          <button onClick={answerClick}>PICK UP PHONE</button>
        </div>
      )}
    </main>
  );
}

function ChatComponent({
  setCustomerSupport,
  microphoneClick,
  answerClick,
}: any) {
  // const [callId, setCallId] = useState("");
  // const pc = useRef<any>();

  // async function microphoneClick() {
  //   try {
  //     const localStream = await navigator.mediaDevices.getUserMedia({
  //       // video: true,
  //       audio: true,
  //     });
  //     const remoteStream = new MediaStream();

  //     // const { data } = await axios.get("https://sellme.onrender.com/ice");
  //     // const {
  //     //   data: { iceServers },
  //     // } = await axios.get("https://sellme.onrender.com/ice");
  //     const {
  //       data: { iceServers },
  //     } = await axios.get("http://localhost:3001/ice");
  //     pc.current = new RTCPeerConnection({ iceServers });

  //     // Push tracks from local stream to peer connection
  //     localStream.getTracks().forEach((track) => {
  //       pc.current.addTrack(track, localStream);
  //     });

  //     // Pull tracks from remote stream, add to video stream
  //     pc.current.ontrack = (event: any) => {
  //       event.streams[0].getTracks().forEach((track: any) => {
  //         remoteStream.addTrack(track);
  //       });
  //     };
  //     const localAudio = document.getElementById(
  //       "webcamAudio"
  //     ) as HTMLAudioElement;
  //     localAudio.srcObject = localStream;
  //     // localAudio.srcObject = localStream;
  //     const remoteAudio = document.getElementById(
  //       "remoteAudio"
  //     ) as HTMLAudioElement;
  //     remoteAudio.srcObject = remoteStream;

  //     await callClick();
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }

  // async function callClick() {
  //   // Reference Firestore collections for signaling
  //   const callDoc = firestore.collection("calls").doc();
  //   const offerCandidates = callDoc.collection("offerCandidates");
  //   const answerCandidates = callDoc.collection("answerCandidates");
  //   console.log(callDoc.id);
  //   setCallId(callDoc.id);

  //   // Get candidates for caller, save to db
  //   pc.current.onicecandidate = (event: any) => {
  //     event.candidate && offerCandidates.add(event.candidate.toJSON());
  //   };

  //   const offerDescription = await pc.current.createOffer();
  //   await pc.current.setLocalDescription(offerDescription);

  //   const offer = {
  //     sdp: offerDescription.sdp,
  //     type: offerDescription.type,
  //   };

  //   await callDoc.set({ offer });

  //   // Listen for remote answer
  //   callDoc.onSnapshot((snapshot) => {
  //     const data = snapshot.data();
  //     if (!pc.current.currentRemoteDescription && data?.answer) {
  //       const answerDescription = new RTCSessionDescription(data.answer);
  //       console.log(answerDescription, "SETTING REMOTE DESCRIPTION");
  //       pc.current.setRemoteDescription(answerDescription);
  //     }
  //   });

  //   // When answered, add candidate to peer connection
  //   answerCandidates.onSnapshot((snapshot) => {
  //     snapshot.docChanges().forEach((change) => {
  //       if (change.type === "added") {
  //         const candidate = new RTCIceCandidate(change.doc.data());
  //         console.log("ADDING CANDIDATE TO CONNECTION");
  //         pc.current.addIceCandidate(candidate);
  //       }
  //     });
  //   });
  // }

  // async function answerClick() {
  //   const callDoc = firestore.collection("calls").doc(callId);
  //   const answerCandidates = callDoc.collection("answerCandidates");
  //   const offerCandidates = callDoc.collection("offerCandidates");

  //   pc.current.onicecandidate = (event: any) => {
  //     event.candidate && answerCandidates.add(event.candidate.toJSON());
  //   };

  //   const callData = (await callDoc.get()).data();

  //   const offerDescription = callData?.offer;
  //   await pc.current.setRemoteDescription(
  //     new RTCSessionDescription(offerDescription)
  //   );

  //   const answerDescription = await pc.current.createAnswer();
  //   await pc.current.setLocalDescription(answerDescription);

  //   const answer = {
  //     type: answerDescription.type,
  //     sdp: answerDescription.sdp,
  //   };

  //   await callDoc.update({ answer });

  //   offerCandidates.onSnapshot((snapshot) => {
  //     snapshot.docChanges().forEach((change) => {
  //       console.log(change);
  //       if (change.type === "added") {
  //         let data = change.doc.data();
  //         pc.current.addIceCandidate(new RTCIceCandidate(data));
  //       }
  //     });
  //   });
  // }

  return (
    <div className="fixed bottom-6 right-6">
      <div className="bg-green w-14 h-14 rounded-lg flex justify-center items-center slide-in relative shadow-3xl">
        <img className="w-11" alt="" src="./images/mill-logo-white.png" />
        {/* <div className="sound-square absolute border-2 border-brightGreen w-[58px] h-[58px] rounded-lg opacity-50" />
        <div className="sound-square-2 absolute border-2 border-brightGreen w-[58px] h-[58px] rounded-lg opacity-50" /> */}
        <Popup microphoneClick={microphoneClick} />
        <button onClick={() => setCustomerSupport(true)}>
          CHANGE TO CUSTOMER SUPPORT
        </button>
      </div>
      {/* <text className="text-red-400 font-size-20">Hello</text> */}
    </div>
    // <div className="border-2 border-red-300 w-32 bg-green-100 fixed bottom-2 right-2">
    //   <h2 className="text-pink-300 font-bold">1. Start your Microphone</h2>
    //   <div className="videos" style={{ border: "1px solid" }}>
    //     <span>
    //       <h3 className="color-red">Local Stream</h3>
    //       <audio id="webcamAudio" autoPlay playsInline muted />
    //     </span>
    //     <span>
    //       <h3 className="color-green">Remote Stream</h3>
    //       <audio id="remoteAudio" autoPlay playsInline />
    //     </span>
    //   </div>
    //   <button id="webcamButton" onClick={microphoneClick}>
    //     Start microphone
    //   </button>
    //   <h2>2. Create a new Call</h2>
    //   <button onClick={callClick} id="callButton">
    //     Create Call (offer)
    //   </button>
    //   <h2 className="font-bold underline">3. Join a Call</h2>
    //   <p>Answer the call from a different browser window or device</p>
    //   <input
    //     id="callInput"
    //     value={callId}
    //     onChange={(e) => setCallId(e.target.value)}
    //   />
    //   <button onClick={answerClick} id="answerButton">
    //     Answer
    //   </button>
    //   <h2>4. Hangup</h2>
    //   <button id="hangupButton">Hangup</button>
    // </div>
  );
}

function Popup({ microphoneClick }: any) {
  return (
    <div className="w-[220px] absolute left-[-230px] bottom-0 bg-offWhite flex flex-col shadow-3xl rounded-lg p-4 z-10">
      <text className="text-brownText font-semibold text-sm text-center mb-4">
        Have questions? We're happy to help!
      </text>
      <button
        className="bg-green rounded-full p-1"
        id="webcamButton"
        onClick={microphoneClick}
      >
        <text className="text-white font-bold">Start audio call</text>
      </button>
      <audio id="webcamAudio" autoPlay playsInline muted />
      <audio id="remoteAudio" autoPlay playsInline />
    </div>
  );
}

export default App;
