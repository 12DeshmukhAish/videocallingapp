'use client';

import dynamic from 'next/dynamic';

// Create a client-side only component
const VideoCall = dynamic(() => import('../app/components/videoCall'), {
  ssr: false
});

export default function Home() {
  return (
    <div>
      <VideoCall />
    </div>
  );
}
