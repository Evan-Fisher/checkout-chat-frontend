import { useEffect, useState, useRef } from "react";
import { firestore } from "./App";
import axios from "axios";
import firebase from "firebase/compat/app";

export default function Dashboard({}: //   callId,
//   setCallId,
//   answerClick,
{
  //   callId: string;
  //   setCallId: (val: string) => void;
  //   answerClick: (e: any) => void;
}) {
  const [callId, setCallId] = useState("");
  const [callingCalls, setCallingCalls] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [callStatus, setCallStatus] = useState("idle"); // "idle", "calling", "inCall", "ended"
  const pc = useRef<any>();
  const callSoundRef = useRef<HTMLAudioElement>(null);
  const callJoinedSoundRef = useRef<HTMLAudioElement>(null);

  //   async function answerClick() {
  //     const callDoc = firestore.collection("calls").doc(callId);
  //     const callData = (await callDoc.get()).data();
  //     if (callData.offer) {
  //       const answer = {
  //         type: "answer",
  //         sdp: "answer",
  //       };
  //       await callDoc.update({ answer });
  //     }
  //   }

  async function microphoneClick(e: any) {
    e.stopPropagation();
    // setCallStatus("calling");
    // Play the audio when the call is answered
    if (callSoundRef.current) {
      callSoundRef.current.play();
    }

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        // video: true,
        audio: true,
      });
      //   setLocalStream(localStream);
      const remoteStream = new MediaStream();
      //   setRemoteStream(remoteStream);
      // const { data } = await axios.get("https://sellme.onrender.com/ice");
      //   const {
      //     data: { iceServers },
      //   } = await axios.get("https://sellme.onrender.com/ice");
      const {
        data: { iceServers },
      } = await axios.get("http://localhost:3001/ice");
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
      setCallStatus("idle");
      if (callSoundRef.current) {
        callSoundRef.current.pause();
        callSoundRef.current.currentTime = 0;
      }
    }
  }

  async function answerClick(e: any, callId: string) {
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
      console.log({ offerDescription });
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

  async function callClick() {
    try {
      console.log("SETTING CALL STATUS");
      // Reference Firestore collections for signaling
      const callDoc = firestore.collection("calls").doc();
      const offerCandidates = callDoc.collection("offerCandidates");
      const answerCandidates = callDoc.collection("answerCandidates");
      //   console.log({ callId: callDoc.id });
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

  useEffect(() => {
    let activeCalls: any = [];
    let callingCalls: any = [];

    firestore.collection("calls").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const doc = change.doc;
        const docData = doc.data();
        if (change.type === "added" || change.type === "modified") {
          if (docData.offer && docData.answer) {
            // Update or add to activeCalls
            activeCalls = [
              ...activeCalls.filter((call: any) => call.id !== doc.id),
              { ...docData, id: doc.id },
            ];
          } else if (docData.offer) {
            // Update or add to callingCalls
            callingCalls = [
              ...callingCalls.filter((call: any) => call.id !== doc.id),
              { ...docData, id: doc.id },
            ];
          }

          setCallingCalls(callingCalls);
          setActiveCalls(activeCalls);
        } else if (change.type === "removed") {
          // Remove from activeCalls and callingCalls
          activeCalls = activeCalls.filter((call: any) => call.id !== doc.id);
          callingCalls = callingCalls.filter((call: any) => call.id !== doc.id);

          setCallingCalls(callingCalls);
          setActiveCalls(activeCalls);
        }
      });
    });
  }, []);

  return (
    <div className="py-12 px-10 bg-offWhite h-full">
      <h1 className="text-brownText font-bold text-3xl mb-6">
        Active Mill Checkout Calls
      </h1>
      <h2 className="text-brownText font-semibold text-xl mb-2">
        Ringing Calls
      </h2>
      <div className="flex mb-3">
        <div className="flex flex-col gap-4 w-[60%] mr-4">
          {callingCalls.map((call: any) => {
            console.log(call);
            return (
              <div className="flex bg-white px-10 py-2 rounded-md shadow-md justify-between items-center">
                <h4 className="text-brownText font-semibold text-l">
                  Time waiting:{" "}
                  {timeSince(call.data?.callingTimestamp?.seconds)}
                </h4>
                <button
                  onClick={(e) => answerClick(e, call.id)}
                  className="text-white font-bold text-xl bg-green rounded-md px-4 py-1"
                >
                  Answer
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <h4>ANSWERED CALL</h4>
          <p>{callStatus}</p>
        </div>
      </div>
      <h2 className="text-brownText font-semibold text-xl mb-2">
        Conversating Calls
      </h2>
      <div className="flex mb-3">
        <div className="flex flex-col gap-4 w-[60%] mr-2">
          {activeCalls.map((call: any) => {
            console.log(call);
            return (
              <div className="flex bg-white px-10 py-2 rounded-md shadow-md justify-between items-center">
                <h4 className="text-brownText font-semibold text-l">
                  Time in call: {call.data?.callingTimestamp || "N/A"}
                </h4>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

{
  /* <p>Hello! CUstomer support</p>
      <input value={callId} onChange={(e) => setCallId(e.target.value)} />
      <button onClick={answerClick}>PICK UP PHONE</button>
      <audio id="webcamAudio" autoPlay playsInline muted />
      <audio id="remoteAudio" autoPlay playsInline /> */
}

function timeSince(timestampInSeconds: any) {
  if (!timestampInSeconds) {
    return "N/A";
  }
  // Get the current time in seconds
  const currentTimestampInSeconds = Math.floor(Date.now() / 1000);

  // Calculate the difference in seconds
  const elapsedSeconds = currentTimestampInSeconds - timestampInSeconds;

  // Calculate the number of full minutes
  const minutes = Math.floor(elapsedSeconds / 60);

  // Calculate the remaining seconds
  const seconds = elapsedSeconds % 60;

  // Format the time as "minutes:seconds"
  return `${minutes}:${seconds}`;
}
