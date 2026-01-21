## Chess Rebundled

A chess practice application where you identify moves from famous historical games using voice commands.

### Features

- **Solo Practice Mode**: Practice identifying moves from famous chess games
- **Voice Input**: Speak your moves using natural language or phonetic alphabet
- **AI-Powered Move Parsing**: Claude AI interprets your spoken moves with high accuracy
- **Historical Games**: Play through famous games like The Opera Game, The Immortal Game, and more
- **Progress Tracking**: See your accuracy and timing statistics

### Getting Started

1. Install dependencies:
   ```bash
   cd backend && pnpm install
   cd ../frontend && pnpm install
   ```

2. Set environment variables:
   ```bash
   # backend/.env
   MONGODB_URI=your_mongodb_connection_string
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

3. Start the servers:
   ```bash
   # Terminal 1
   cd backend && pnpm dev

   # Terminal 2
   cd frontend && pnpm dev
   ```

4. Open http://localhost:3000 and start practicing!

### Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Socket.io, TypeScript
- **Database**: MongoDB
- **AI**: Anthropic Claude (for voice-to-move parsing)
- **Voice**: Web Speech API

---

## Roadmap

### Planned Features

#### Two-Player Competitive Mode
A real-time multiplayer mode where two players compete to identify chess moves:

- **Lobby System**: Create and accept challenges from other players
- **Real-Time Matching**: Get matched with opponents instantly
- **Timed Games**: Race against the clock with per-player timers
- **Live Scoring**: Points based on accuracy and speed
- **Ready System**: Both players confirm before game starts
- **Reconnection Support**: Rejoin games if disconnected

This feature was previously prototyped but removed to focus on polishing the solo practice experience first.
