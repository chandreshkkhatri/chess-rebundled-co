# Chess Rebundled

**Master chess notation by speaking moves from the greatest games ever played.**

Chess Rebundled is a voice-powered training app that helps you internalize chess notation and famous game patterns. Instead of passively watching game replays, you actively participate by speaking each move aloud—training both your pattern recognition and your ability to read and communicate chess positions.

## Why Chess Rebundled?

Learning chess notation is essential for studying games, analyzing positions, and communicating with other players. But traditional methods—staring at notation sheets or clicking through databases—can feel passive and tedious.

Chess Rebundled flips the script: you're shown a position and must **speak the next move** from a famous historical game. An AI interprets your voice input (handling accents, mumbles, and creative pronunciations), and you get instant feedback. It's like having a patient coach who quizzes you on the classics.

**Perfect for:**
- Players learning algebraic notation
- Intermediate players wanting to study master games actively
- Anyone who learns better by speaking than clicking
- Chess enthusiasts who want to internalize famous patterns

## Features

- **Solo Practice Mode**: Practice identifying moves from famous chess games
- **Voice Input**: Speak your moves using natural language or phonetic alphabet
- **AI-Powered Move Parsing**: Claude AI interprets your spoken moves with high accuracy
- **Historical Games**: Play through famous games like The Opera Game, The Immortal Game, and more
- **Move Visualization**: See moves with arrows showing piece movement from source to destination
- **Progress Tracking**: See your accuracy and timing statistics
- **Flexible Practice**: Play as both sides or focus on just White or Black moves

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- MongoDB instance
- Anthropic API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chess-rebundled.git
   cd chess-rebundled
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set environment variables:
   ```bash
   # backend/.env
   MONGODB_URI=your_mongodb_connection_string
   ANTHROPIC_API_KEY=your_anthropic_api_key

   # frontend/.env
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   ```

4. Start the development servers:
   ```bash
   # Start both frontend and backend
   pnpm dev
   ```

5. Open http://localhost:3000 and start practicing!

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand
- **Backend**: Node.js, Fastify, Socket.io, TypeScript
- **Database**: MongoDB
- **AI**: Anthropic Claude (Haiku for voice-to-move parsing)
- **Voice**: Web Speech API
- **Chess**: chess.js, react-chessboard

## Project Structure

```
chess-rebundled/
├── frontend/          # Next.js frontend application
│   ├── src/
│   │   ├── app/       # Next.js App Router pages
│   │   ├── components/# React components
│   │   ├── hooks/     # Custom React hooks
│   │   ├── stores/    # Zustand state stores
│   │   └── lib/       # Utility functions
│   └── ...
├── backend/           # Node.js backend server
│   ├── src/
│   │   ├── services/  # Business logic
│   │   ├── socket/    # Socket.io handlers
│   │   └── types/     # TypeScript types
│   └── ...
└── ...
```

## How It Works

1. **Select a Mode**: Choose to identify all moves (both sides) or just one color
2. **Listen and Respond**: A famous historical game is loaded; speak the expected move
3. **AI Interpretation**: Your voice input is parsed by Claude AI to determine the chess move
4. **Get Feedback**: See if your move was correct with visual feedback
5. **Track Progress**: View your accuracy percentage at the end

## Voice Input Tips

- Use standard algebraic notation: "e4", "Knight f3", "Castle kingside"
- Phonetic alphabet works well: "Echo 4", "Knight Foxtrot 3"
- Captures: "Bishop takes d5" or "Bxd5"
- Castling: "Castle kingside" or "O-O"

## Featured Games

Practice with some of the most celebrated games in chess history:

- **The Immortal Game (1851)** - Anderssen's brilliant sacrifices against Kieseritzky
- **The Opera Game (1858)** - Morphy's elegant attack played during an opera performance
- **The Evergreen Game (1852)** - Another Anderssen masterpiece with a stunning queen sacrifice
- **The Game of the Century (1956)** - 13-year-old Bobby Fischer's legendary victory
- **Kasparov vs Topalov (1999)** - "Kasparov's Immortal" with breathtaking tactics

Each game includes historical trivia and context to enrich your learning experience.

## Roadmap

### Planned Features

#### Two-Player Competitive Mode
A real-time multiplayer mode where two players compete to identify chess moves:

- **Lobby System**: Create and accept challenges from other players
- **Real-Time Matching**: Get matched with opponents instantly
- **Timed Games**: Race against the clock with per-player timers
- **Live Scoring**: Points based on accuracy and speed

This feature was previously prototyped but removed to focus on polishing the solo practice experience first.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
