import { useState } from 'react';
import type { SessionData } from './types';
import { Home } from './pages/Home';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const [session, setSession] = useState<SessionData | null>(null);

  const handleJoinSuccess = (newSession: SessionData) => {
    setSession(newSession);
  };

  const handleLeaveRoom = () => {
    setSession(null);
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  return (
    <div className="app-container">
      {session ? (
        <RoomPage session={session} onLeave={handleLeaveRoom} />
      ) : (
        <Home onJoinSuccess={handleJoinSuccess} />
      )}
    </div>
  );
}

export default App;
