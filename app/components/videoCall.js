'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AgoraRTC from 'agora-rtc-sdk-ng';
const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID;

export default function VideoCall() {
  const searchParams = useSearchParams();
  const [client, setClient] = useState(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [users, setUsers] = useState([]);
  const [userName, setUserName] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenTrack, setScreenTrack] = useState(null);
  const [joinState, setJoinState] = useState('init'); // 'init', 'joining', 'joined'
  const [roomId, setRoomId] = useState('');
  const [shareableLink, setShareableLink] = useState('');

  useEffect(() => {
    // Check if we're joining an existing room
    const roomFromUrl = searchParams.get('room');
    if (roomFromUrl) {
      setRoomId(roomFromUrl);
    } else {
      // Generate a new room ID if none exists
      const newRoomId = Math.random().toString(36).substring(7);
      setRoomId(newRoomId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (roomId && typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      setShareableLink(`${baseUrl}/video-call?room=${roomId}`);
    }
  }, [roomId]);

  const initializeCall = async (name) => {
    if (joinState !== 'init') return;
    
    setJoinState('joining');
    setUserName(name);

    try {
      const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      setClient(agoraClient);
      
      await agoraClient.join(APP_ID, roomId, null, null);
      
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      await agoraClient.publish([audioTrack, videoTrack]);
      
      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);
      
      videoTrack.play('local-video');
      
      agoraClient.on('user-published', async (user, mediaType) => {
        await agoraClient.subscribe(user, mediaType);
        
        if (mediaType === 'video') {
          setUsers(prevUsers => {
            if (!prevUsers.find(u => u.uid === user.uid)) {
              return [...prevUsers, user];
            }
            return prevUsers;
          });
          user.videoTrack.play(`remote-video-${user.uid}`);
        }
        if (mediaType === 'audio') {
          user.audioTrack.play();
        }
      });

      agoraClient.on('user-unpublished', (user) => {
        setUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
      });

      setJoinState('joined');
    } catch (error) {
      console.error('Error initializing Agora:', error);
      setJoinState('init');
      alert('Failed to join the call. Please try again.');
    }
  };

  const cleanup = async () => {
    if (localAudioTrack) {
      localAudioTrack.close();
    }
    if (localVideoTrack) {
      localVideoTrack.close();
    }
    if (screenTrack) {
      screenTrack.close();
    }
    if (client) {
      await client.leave();
    }
    setJoinState('init');
  };

  const toggleMute = async () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = async () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(!isCameraOn);
      setIsCameraOn(!isCameraOn);
    }
  };

  const toggleScreenSharing = async () => {
    if (!isScreenSharing && client) {
      try {
        if (localVideoTrack) {
          await client.unpublish(localVideoTrack);
          localVideoTrack.stop();
        }

        const screenTrack = await AgoraRTC.createScreenVideoTrack({
          encoderConfig: '1080p_1',
          optimizationMode: 'detail',
        });

        await client.publish(screenTrack);
        setScreenTrack(screenTrack);
        screenTrack.play('local-video');
        setIsScreenSharing(true);

        // Handle screen share stopped by user through browser UI
        screenTrack.on('track-ended', async () => {
          await stopScreenSharing();
        });
      } catch (error) {
        console.error('Error sharing screen:', error);
        handleScreenSharingError(error);
        await stopScreenSharing();
      }
    } else {
      await stopScreenSharing();
    }
  };

  const stopScreenSharing = async () => {
    try {
      if (screenTrack) {
        await client.unpublish(screenTrack);
        screenTrack.close();
        setScreenTrack(null);
      }

      if (localVideoTrack) {
        await client.publish(localVideoTrack);
        if (isCameraOn) {
          localVideoTrack.play('local-video');
        }
      }
      
      setIsScreenSharing(false);
    } catch (error) {
      console.error('Error stopping screen share:', error);
      alert('Failed to stop screen sharing. Please try again.');
    }
  };

  const handleScreenSharingError = (error) => {
    if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
      alert('Please allow screen sharing permission to use this feature.');
    } else if (error.message.includes('CAN_NOT_PUBLISH_MULTIPLE_VIDEO_TRACKS')) {
      alert('Cannot share screen while camera is active. Please try again.');
    } else {
      alert('Failed to start screen sharing. Please try again.');
    }
  };

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(shareableLink)
      .then(() => alert('Meeting link copied to clipboard!'))
      .catch(() => alert('Failed to copy link. Please try again.'));
  };

  const endCall = async () => {
    await cleanup();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

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
          {!searchParams.get('room') && (
            <button
              onClick={copyLinkToClipboard}
              className="w-full bg-green-500 text-white rounded p-2 hover:bg-green-600"
            >
              Copy Meeting Link
            </button>
          )}
        </div>
      </div>
    );
  }

  if (joinState === 'joining') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl">Joining call...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Room: {roomId}</h2>
          <button
            onClick={copyLinkToClipboard}
            className="bg-green-500 text-white rounded px-4 py-2 hover:bg-green-600"
          >
            Share Meeting Link
          </button>
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
                Remote User
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