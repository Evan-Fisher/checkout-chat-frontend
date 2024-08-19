import { useEffect, useState, useRef } from "react";
import { firestore } from "./App";
import axios from "axios";
import firebase from "firebase/compat/app";

export default function Dashboard() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callingCalls, setCallingCalls] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);
  const [callStatus, setCallStatus] = useState("idle"); // "idle", "calling", "inCall", "ended"
  const [callId, setCallId] = useState("");
  const callIdRef = useRef<string | null>(null);
  const pc = useRef<any>();
  const callJoinedSoundRef = useRef<HTMLAudioElement>(null);
  const callEndedSoundRef = useRef<HTMLAudioElement>(null);

  async function microphoneClick(e: any) {
    e.stopPropagation();

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setLocalStream(localStream);
      const remoteStream = new MediaStream();
      setRemoteStream(remoteStream);
      const {
        data: { iceServers },
      } = await axios.get(
        process.env.NODE_ENV === "development"
          ? "http://localhost:3001/ice"
          : "https://sellme.onrender.com/ice"
      );

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
          endCall();
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
      //   if (callSoundRef.current) {
      //     callSoundRef.current.pause();
      //     callSoundRef.current.currentTime = 0;
      //   }
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
      await pc.current.setRemoteDescription(
        new RTCSessionDescription(offerDescription)
      );

      const answerDescription = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      };

      console.log("ADDING TO DB");
      await callDoc.set(
        {
          answer,
          data: {
            answeringTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );

      const unsubFromOfferCandidates = offerCandidates.onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            console.log(change);
            if (change.type === "added") {
              let data = change.doc.data();
              pc.current.addIceCandidate(new RTCIceCandidate(data));
            }
          });
        }
      );
      setCallStatus("inCall");
      console.log("SETTING CALL ID", callId);
      setCallId(callId);
    } catch (error) {
      console.log(error);
    }
  }

  async function callClick() {
    try {
      // Reference Firestore collections for signaling
      const callDoc = firestore.collection("calls").doc();
      const offerCandidates = callDoc.collection("offerCandidates");
      const answerCandidates = callDoc.collection("answerCandidates");
      //   setCallId(callDoc.id);

      // Get candidates for caller, save to db
      pc.current.onicecandidate = (event: any) => {
        event.candidate && offerCandidates.add(event.candidate.toJSON());
      };

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
            // setCallStatus("inCall");
            // Play the audio when the call is answered
            // if (callSoundRef.current) {.set
            //   callSoundRef.current.pause();
            //   callSoundRef.current.currentTime = 0;
            // }
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
      //   if (callSoundRef.current) {
      //     callSoundRef.current.pause();
      //     callSoundRef.current.currentTime = 0;
      //   }
    }
  }

  async function endCall() {
    console.log("--------ENDING CALL--------");
    // e.stopPropagation();

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
    closePeerConnection(pc);

    // Remove call document from Firestore (optional)
    await removeCallDocument(callIdRef.current);
  }

  useEffect(() => {
    let activeCalls: any = [];
    let callingCalls: any = [];

    firestore.collection("calls").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const doc = change.doc;
        const docData = doc.data();
        if (change.type === "added" || change.type === "modified") {
          if (docData.offer && !docData.answer) {
            // Update or add to callingCalls
            callingCalls = [
              ...callingCalls.filter((call: any) => call.id !== doc.id),
              { ...docData, id: doc.id },
            ];
          }
          //   if (docData.offer && docData.answer) {
          //     // Update or add to activeCalls
          //     activeCalls = [
          //       ...activeCalls.filter((call: any) => call.id !== doc.id),
          //       { ...docData, id: doc.id },
          //     ];
          //   } else

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

  useEffect(() => {
    // Need ref for closure in listener
    callIdRef.current = callId;
  }, [callId]);

  return (
    <div className="py-12 px-10 bg-offWhite h-full">
      <h1 className="text-brownText font-bold text-3xl mb-6">
        Active Mill Checkout Calls
      </h1>
      <h2 className="text-brownText font-semibold text-xl mb-2">Calls</h2>
      <div className="flex mb-3">
        <div className="flex flex-col gap-4 w-[60%] mr-4">
          {callingCalls.map((call: any) => {
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
      </div>
      {/* <h2 className="text-brownText font-semibold text-xl mb-2">
        Conversating Calls
      </h2>
      <div className="flex mb-3">
        <div className="flex flex-col gap-4 w-[60%] mr-2">
          {activeCalls.map((call: any) => {
            console.log(call);
            return (
              <div className="flex bg-white px-10 py-2 rounded-md shadow-md justify-between items-center">
                <h4 className="text-brownText font-semibold text-l">
                  Time in call:{" "}
                   {timeSince(call.data?.callingTimestamp?.seconds)} 

                </h4>
              </div>
            );
          })}
        </div>
      </div> */}
      <audio id="webcamAudio" autoPlay playsInline muted />
      <audio id="remoteAudio" autoPlay playsInline />
      <audio
        ref={callJoinedSoundRef}
        src="/audio/answered.mp3"
        preload="auto"
      />
      <audio ref={callEndedSoundRef} src="/audio/ended.mp3" preload="auto" />
    </div>
  );
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

function stopMediaTracks(stream: any) {
  if (stream) {
    stream.getTracks().forEach((track: any) => track?.stop());
  }
}

function closePeerConnection(pc: any) {
  if (pc.current) {
    pc.current.close();
    pc.current = null;
  }
}

async function removeCallDocument(callId: any) {
  console.log("REMOVING CALL DOCUMENT", { callId });
  if (callId) {
    const callDoc = firestore.collection("calls").doc(callId);
    await callDoc.delete();
  }
}
