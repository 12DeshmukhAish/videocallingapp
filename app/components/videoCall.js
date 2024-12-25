'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AgoraRTC from 'agora-rtc-sdk-ng';

const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

export default function VideoCall() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [client, setClient] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [users, setUsers] = useState([]);
  const [userName, setUserName] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenTrack, setScreenTrack] = useState(null);
  const [joinState, setJoinState] = useState('init');
  const [roomId, setRoomId] = useState('');
  const [shareableLink, setShareableLink] = useState('');
  const [userMap, setUserMap] = useState(new Map());

  useEffect(() => {
    const roomFromUrl = searchParams.get('room');
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (roomId && typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      setShareableLink(`${baseUrl}/video-call?room=${roomId}`);
    }
  }, [roomId]);

  const createNewMeeting = () => {
    const newRoomId = Math.random().toString(36).substring(7);
    router.push(`/video-call?room=${newRoomId}`);
  };

  const copyLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      alert('Meeting link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy link:', err);
      const tempInput = document.createElement('input');
      tempInput.value = shareableLink;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      alert('Meeting link copied to clipboard!');
    }
  };

  const toggleMute = () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleScreenSharing = async () => {
    if (!client) return;

    if (isScreenSharing) {
      try {
        if (screenTrack) {
          await client.unpublish(screenTrack);
          screenTrack.stop();
          screenTrack.close();
          setScreenTrack(null);
          setIsScreenSharing(false);

          // Republish and play local video track
          if (localVideoTrack) {
            await client.publish(localVideoTrack);
            localVideoTrack.play('local-video');
          }
        }
      } catch (error) {
        console.error('Error stopping screen share:', error);
      }
    } else {
      try {
        // Stop publishing local video track
        if (localVideoTrack) {
          await client.unpublish(localVideoTrack);
        }

        const screenTrackTemp = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: "1080p_1",
          optimizationMode: "detail"
        });

        // Publish screen track
        await client.publish(screenTrackTemp);
        screenTrackTemp.play('local-video');
        setScreenTrack(screenTrackTemp);
        setIsScreenSharing(true);

        // Handle screen sharing stopped from browser control
        screenTrackTemp.on('track-ended', async () => {
          await client.unpublish(screenTrackTemp);
          screenTrackTemp.stop();
          screenTrackTemp.close();
          setScreenTrack(null);
          setIsScreenSharing(false);

          // Republish and play local video track
          if (localVideoTrack) {
            await client.publish(localVideoTrack);
            localVideoTrack.play('local-video');
          }
        });
      } catch (error) {
        console.error('Error sharing screen:', error);
        // Republish local video track if screen sharing fails
        if (localVideoTrack) {
          await client.publish(localVideoTrack);
          localVideoTrack.play('local-video');
        }
      }
    }
  };

  const endCall = async () => {
    try {
      if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
      }
      if (localVideoTrack) {
        localVideoTrack.stop();
        localVideoTrack.close();
      }
      if (screenTrack) {
        screenTrack.stop();
        screenTrack.close();
      }
      if (client) {
        await client.leave();
      }

      setClient(null);
      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setScreenTrack(null);
      setUsers([]);
      setUserMap(new Map());
      setJoinState('init');

      const newRoomId = Math.random().toString(36).substring(7);
      router.push(`/video-call?room=${newRoomId}`);
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  const initializeCall = async (name) => {
    if (joinState !== 'init' || !roomId) return;

    setJoinState('joining');
    setUserName(name);

    try {
      const agoraClient = AgoraRTC.createClient({ 
        mode: 'rtc', 
        codec: 'vp8'
      });
      
      setClient(agoraClient);

      // Join the channel
      const uid = await agoraClient.join(APP_ID, roomId, null, null);
      
      // Create and store channel attributes for user name
      agoraClient.addInjectStreamUrl = name;
      
      // Store the local user's name
      setUserMap(new Map([[uid, name]]));

      // Create tracks with specific configurations
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        {
          encoderConfig: "high_quality",
          stereo: true,
          AEC: true,
          ANS: true,
        },
        {
          encoderConfig: "1080p_2",
          facingMode: "user",
          optimizationMode: "detail",
        }
      );

      // Publish local tracks
      await agoraClient.publish([audioTrack, videoTrack]);

      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);

      // Play local video
      videoTrack.play('local-video');

      // Handle remote users
      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);

        if (mediaType === 'video') {
          // Get user name from channel attributes
          const remoteName = user.addInjectStreamUrl || `User ${user.uid}`;
          
          setUsers(prevUsers => {
            if (!prevUsers.find(u => u.uid === user.uid)) {
              setUserMap(prevMap => new Map(prevMap).set(user.uid, remoteName));
              return [...prevUsers, user];
            }
            return prevUsers;
          });

          // Play remote video with specific configurations
          if (user.videoTrack) {
            user.videoTrack.play(`remote-video-${user.uid}`, {
              fit: 'contain',
              mirror: false
            });
          }
        }

        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      agoraClient.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video') {
          const playerElement = document.getElementById(`remote-video-${user.uid}`);
          if (playerElement) {
            playerElement.innerHTML = '';
          }
        }
      });

      agoraClient.on('user-left', (user) => {
        setUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
        setUserMap(prevMap => {
          const newMap = new Map(prevMap);
          newMap.delete(user.uid);
          return newMap;
        });
      });

      setJoinState('joined');
    } catch (error) {
      console.error('Error initializing Agora:', error);
      setJoinState('init');
      alert('Failed to join the call. Please try again.');
    }
  };

  if (!roomId) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Video Call</h2>
          <button
            onClick={createNewMeeting}
            className="w-full bg-blue-500 text-white rounded p-2 mb-4 hover:bg-blue-600"
          >
            Create New Meeting
          </button>
        </div>
      </div>
    );
  }

  if (joinState === 'init') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4">Join Video Call</h2>
          <input
            type="text"
            placeholder="Enter your name"
            className="w-full p-2 border rounded mb-4"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && e.target.value.trim()) {
                initializeCall(e.target.value.trim());
              }
            }}
          />
          <button
            onClick={() => {
              const nameInput = document.querySelector('input').value.trim();
              if (nameInput) {
                initializeCall(nameInput);
              }
            }}
            className="w-full bg-blue-500 text-white rounded p-2 mb-4 hover:bg-blue-600"
          >
            Join Call
          </button>
          <button
            onClick={copyLinkToClipboard}
            className="w-full bg-green-500 text-white rounded p-2 hover:bg-green-600"
          >
            Copy Meeting Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Room: {roomId}</h2>
          <div className="flex items-center space-x-4">
            <span className="text-gray-600">
              {users.length + 1} participant{users.length !== 0 ? 's' : ''} in call
            </span>
            <button
              onClick={copyLinkToClipboard}
              className="bg-green-500 text-white rounded px-4 py-2 hover:bg-green-600"
            >
              Share Meeting Link
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <div id="local-video" className="w-full h-64 md:h-96">
              {!isCameraOn && !isScreenSharing && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <span className="text-white text-lg">Camera Off</span>
                </div>
              )}
            </div>
            <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
              {userName} (You)
            </div>
          </div>

          {users.map(user => (
            <div key={user.uid} className="relative bg-black rounded-lg overflow-hidden">
              <div id={`remote-video-${user.uid}`} className="w-full h-64 md:h-96"></div>
              <div className="absolute bottom-4 left-4 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                {userMap.get(user.uid) || `User ${user.uid}`}
              </div>
            </div>
          ))}
        </div>

        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-full shadow-lg px-6 py-3 space-x-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-200'} text-black`}
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>

          <button
            onClick={toggleCamera}
            className={`p-3 rounded-full ${!isCameraOn ? 'bg-red-500' : 'bg-gray-200'} text-black`}
          >
            {isCameraOn ? 'Stop Camera' : 'Start Camera'}
          </button>

          <button
            onClick={toggleScreenSharing}
            className={`p-3 rounded-full ${isScreenSharing ? 'bg-green-500' : 'bg-gray-200'} text-black`}
          >
            {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
          </button>

          <button
            onClick={endCall}
            className="p-3 rounded-full bg-red-500 text-white"
          >
            End Call
          </button>
        </div>
      </div>
    </div>
  );
}