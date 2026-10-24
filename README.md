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
- **AI-Powered Move Parsing**: Google Gemini interprets spoken moves and recorded audio
- **Historical Games**: Play through famous games like The Opera Game, The Immortal Game, and more
- **Move Visualization**: See moves with arrows showing piece movement from source to destination
- **Progress Tracking**: See your accuracy and timing statistics
- **Flexible Practice**: Play as both sides or focus on just White or Black moves
- **Multiplayer**: Play other users through matchmaking or private challenges, with optional clocks
- **AI Opponents**: Play a conversational Gemini opponent and review completed games

## Getting Started

### Prerequisites

- Node.js 22+ (the MongoDB 7 driver requires a recent Node.js runtime)
- pnpm
- MongoDB instance
- Firebase project with Authentication and Firestore enabled, plus an Admin service account
- Google Gemini API key, or Vertex AI credentials
- Redis (optional; sessions use an in-memory fallback when it is unavailable)

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd chess-rebundled-co
   ```

2. Install dependencies:
   ```bash
   pnpm install --frozen-lockfile
   ```

3. Set environment variables:
   ```bash
   # backend/.env
   MONGODB_URI=mongodb://localhost:27017/chess-rebundled
   GOOGLE_API_KEY=your_gemini_api_key
   FIREBASE_PROJECT_ID=your_firebase_project_id
   FIREBASE_CLIENT_EMAIL=your_service_account_email
   FIREBASE_PRIVATE_KEY="your_private_key_with_escaped_newlines"
   CLIENT_URL=http://localhost:3000
   # Optional: REDIS_URL=redis://localhost:6379

   # frontend/.env.local
   NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
   NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
   # Optional: NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_analytics_measurement_id
   ```

4. Start the development servers:
   ```bash
   # Start both frontend and backend
   pnpm dev
   ```

5. Open http://localhost:3000 and start practicing!

For Vertex AI, set `GOOGLE_GENAI_USE_VERTEXAI=true`. With an API key, use a Vertex
express-mode key. Without a key, set `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_CLOUD_LOCATION` and grant the Firebase service account Vertex AI access.
The shared client also supports Application Default Credentials; the AI opponent
availability check currently requires a key or the Firebase service-account variables.
Override the default model with `GEMINI_MODEL` when needed.

### Verification

Run these from the repository root:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Regression tests use local fixtures and mocked AI responses; they do not contact
MongoDB, Redis, Firebase, or Gemini. Live integration testing requires the services
and credentials above. Production also needs the frontend running with
`pnpm --filter frontend start`; the root `pnpm start` command starts the backend.

See [Gameplay reliability](docs/RELIABILITY.md) for the request limits, engine
cancellation behavior, and manual checks. Multiplayer uses one backend process
for its game queues, clocks, and Socket.io rooms; Redis persistence alone does
not support multiple backend workers. Stop the development server before running
a production build because both use the same `.next` directory.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand
- **Backend**: Node.js, Fastify, Socket.io, TypeScript
- **Database**: MongoDB
- **AI**: Google Gemini through the Developer API or Vertex AI
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
3. **AI Interpretation**: Your voice input is parsed by Gemini to determine the chess move
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

## Session Access and Reconnection

Solo practice supports guests. Signed-in sessions require the same Firebase user
to resume or submit moves. Guest sessions use a random reconnect credential held
in the browser tab's session storage; only its hash is stored on the backend.
Existing guest sessions created without that credential can continue on their
original socket, but must be restarted after disconnecting.

Multiplayer and AI opponent games require sign-in. AI games rejoin their room and
reload the authoritative state whenever the connection is restored. Both game
services retain move history when checking threefold repetition.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
