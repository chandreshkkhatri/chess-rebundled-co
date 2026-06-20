# Chess Rebundled - Feature Documentation & Architecture

This document provides a comprehensive overview of the pedagogical, interactive, and gamified features added to **Chess Rebundled** to improve user experience, learning speed, and player retention.

---

## 🎙️ 1. Voice & Waveform UX

To make voice-controlled chess inputs feel responsive and premium, we introduced real-time visual feedback.

### [Audio Waveform Component](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/AudioWaveform.tsx)
*   **Purpose**: Renders microphone activity when the system is actively listening.
*   **Implementation**: 
    *   Constructed of 7 dynamic, animated bars that change height smoothly using `requestAnimationFrame` interpolation.
    *   Exposes a pulsing red dot during active voice recording chunks.
    *   Changes color themes based on listening states (e.g., active vs. standby).
    *   Includes a mathematical fallback (time-based sine wave animation) to keep the waveform alive when the browser Web Speech API is used, providing a reassurance that the app is listening even when raw volume levels are unavailable.

### [Clickable "Did you mean?" Alternative Suggestions](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/UniversalInputPanel.tsx)
*   **Purpose**: Prevents speech-to-text mismatch frustration.
*   **Implementation**:
    *   Triggers when the AI speech parser returns a move with confidence below `85%`.
    *   Renders alternative parses as clickable text buttons.
    *   Tapping an alternative automatically selects or submits the move (if `autoSubmitEnabled` is active and the move is legal).

---

## 🏁 2. Notation Helpers & Board Highlights

Mastering algebraic notation can be difficult for beginners. The board now helps players visualize their moves.

### Coordinate Highlighter
*   **Implementation**: Built into [ChessBoard.tsx](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/ChessBoard.tsx) and wired in [UniversalInputPanel.tsx](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/UniversalInputPanel.tsx).
*   **Behavior**: When a user selects a piece (via click, touch, or voice stage), the panel queries legal chess moves for that piece. It immediately highlights all legal destination coordinates on the board using a semi-transparent purple radial gradient dot.

---

## 📚 3. Pedagogical & Educational Value

Errors are converted into direct learning moments, and games are enriched with historical context.

### [Live Stockfish Blunder Classification](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/practice/%5BsessionId%5D/page.tsx)
*   **Purpose**: Grades incorrect moves in Practice Mode to explain *why* they were wrong.
*   **Implementation**:
    *   Runs the browser-based Stockfish worker in the background on FEN transitions.
    *   When the user submits an incorrect move, Stockfish evaluates both the historic expected move and the user's submitted move.
    *   Computes the centipawn loss from the player's perspective:
        *   *White's turn*: `loss = expectedScore - submittedScore`
        *   *Black's turn*: `loss = submittedScore - expectedScore`
    *   **Move Grade Classification**:
        *   `loss >= 1.50`: **Blunder (-X.XX)** (Material or tactical loss)
        *   `loss >= 0.50`: **Mistake (-X.XX)** (Positional concession)
        *   `loss >= 0.20`: **Inaccuracy (-X.XX)** (Sub-optimal choice)
        *   `loss < 0.20`: **Playable alternative** (Slight deviation from history)
    *   Displays a pulsing `(Analyzing...)` indicator in the feedback zone during background evaluation, followed by the grade (e.g., `❌ Mistake (-0.75): MISSED E4`).

### [Progress-Unlocked Historical Insights](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/practice/%5BsessionId%5D/page.tsx)
*   **Purpose**: Incentivizes players to complete practice games by connecting moves to historical trivia.
*   **Behavior**: 
    *   Trivia facts unlock at milestone achievements (`25%`, `50%`, and `75%` completion of the game's moves).
    *   Locked slots show mystery placeholders: `🔒 Locked (50% progress)`.
    *   Unlocking triggers a sleek CSS purple fade pulse (`unlock-pulse` keyframes in `globals.css`).
    *   Features a desktop sidebar card and a mobile tooltip dropdown listing unlocked facts.

---

## 🎯 4. Coordinate & Notation Vision Trainer

To build notation speed, we created a dedicated gamified warmup page.

### [Trainer Page](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/trainer/page.tsx)
*   **Route**: `/trainer` (linked on dashboard and quick links).
*   **Game Modes**:
    1.  **Find Square**: Shows a target coordinate (e.g., "e4"); user must click it on the board.
    2.  **Name Square**: Highlights a square on the board; user must enter its coordinate.
*   **Features**:
    *   **30-Second Time Attack**: Challenges players to guess as many coordinates as possible. Includes an animated SVG circle timer that shifts colors (green ➔ yellow ➔ pulsing red).
    *   **Streak Flame Multiplier**: Tracks streaks and displays a flame badge (`🔥 5 STREAK`) for consecutive correct guesses.
    *   **NATO Phonetics Voice Recognition**: Users can shout out answers in Name Square mode using direct coordinate codes ("e4") or NATO phonetics ("delta four", "alpha two", "bravo six", "hotel eight").
    *   **Skins & Setup Configs**: Fully customizable orientation (White/Black/Random), board layouts (Standard Pieces vs. Empty Board), and input options.

---

## 🎨 5. Cosmetics Shop & Sound Packs

Players can spend their hard-earned XP to unlock premium board visuals and sound effects.

### [Aesthetic Shop Widget](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/AestheticShop.tsx)
*   **Persistence**: Handled fully client-side via `localStorage` (deducts from Firestore `totalXp` balance locally, preserving offline support and database stability).
*   **Unlocks**:
    *   **Board Skins**:
        *   *Classic Forest*: standard green and cream (Free).
        *   *Cyberpunk Neon*: deep indigo and glowing purple (500 XP).
        *   *Royal Amber*: gold and amber mahogany (1000 XP).
        *   *Glassmorphic*: frosted slate and translucent black (1500 XP).
    *   **Sound Packs**:
        *   *Classic Wood*: traditional wooden chess clocks (Free).
        *   *Mechanical Switch*: clicky mechanical keyboard keys (400 XP).
        *   *Retro Arcade*: 8-bit synth blips and beeps (800 XP).

### [Audio & Theme Integration](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/ChessBoard.tsx)
*   **Board Skins**: Listens to custom global event `active_cosmetics_changed`. When equipped, the light and dark squares instantly recolor across all board screens in the app without page reloads.
*   **Move Audio**: Tracks FEN updates in the board component. By comparing piece counts before and after FEN updates, the board detects moves vs. captures and synthesizes matching sound effects in real-time using browser-native oscillators and filters (Web Audio API), avoiding large static asset downloads.

---

## 🎙️ 6. AI Streamer & Caster Commentary

Brings bot matches and practice mode to life with live commentary.

### [AI Caster Panel](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/AICasterPanel.tsx)
*   **Casters**:
    *   **Hikaru** (`👑`): Fast, repeating speedrun phrases (e.g., *"Takes takes takes. Yeah, that is literally completely winning, guys."*).
    *   **GothamChess (Levy)** (`🎙️`): High drama, tactical shouting (e.g., *"HE SACRIFICED THE ROOOOOOK!"*).
    *   **Andrea Botez** (`💅`): Chat drama, energy, fears of the "Botez Gambit" (e.g., *"OMG guys, did he blunder his queen?!"*).
    *   **Magnus Carlsen** (`🏆`): Elite, calm, confident, dry dismissals (e.g., *"e4 is fine. Not challenging, but playable."*).
*   **Text-to-Speech (TTS)**: Built-in Read Aloud button that uses the browser's native `speechSynthesis` API. Assigns distinct voices, pitches, and speeds to match each personality.
*   **Integration**:
    *   *Bot Matches* ([page.tsx](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/bot/page.tsx)): Desktop sidebar slot and mobile drawer overlay next to the move log.
    *   *Practice Mode* ([page.tsx](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/practice/%5BsessionId%5D/page.tsx)): Desktop sidebar card below unlocked insights.

---

## 🏆 7. Duolingo-Style Weekly Leagues & Leaderboards

Provides a competitive framework for daily practice using simulated divisions.

### [League Leaderboard Component](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/LeagueLeaderboard.tsx)
*   **6-Division Progression**:
    *   *Pawn League*: Entry level, 0 - 999 XP.
    *   *Knight League*: 1000 - 2499 XP.
    *   *Bishop League*: 2500 - 4999 XP.
    *   *Rook League*: 5000 - 7999 XP.
    *   *Queen League*: 8000 - 11999 XP.
    *   *King League*: >= 12000 XP.
*   **XP Standing Tracker**:
    *   Simulates 9 competitor chess-themed players with randomized base scores.
    *   Determines current position in the division based on user's live profile XP.
    *   **Standings Zones**:
        *   Ranks 1-3: **Promotion Zone** (Highlighted in green, triggers promotion to higher league on cycle end).
        *   Ranks 4-7: **Safe Zone** (Safe from demotion).
        *   Ranks 8-10: **Demotion Zone** (Highlighted in red, triggers regression on cycle end).
    *   **Active Simulator**: Listens to changes in the user's XP. When the user gains XP, competitors randomly gain +10 to +40 XP in the background to simulate dynamic competition.
    *   **League Timer**: Countdown clock (e.g. `2d 12h remaining`) resetting every 3 days.
*   **Integration**:
    *   *Profile Page* ([page.tsx](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/profile/page.tsx)): Rendered as a core dashboard widget above the Aesthetic Customization Shop.

---

## 🎖️ 8. Profile Badges & League Achievements

To celebrate milestones and reward users, players can now unlock and equip unique Profile Badges, which are showcased dynamically across the application's competitive and social elements.

### [Aesthetic Shop Integration](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/AestheticShop.tsx)
*   Introduced a **"Profile Badges"** tab in the shop.
*   **Available Badges**:
    *   👑 **Pawn Maestro** (0 XP / Free): Master of the opening moves.
    *   ⚡ **Speed Demon** (300 XP): Scored 15+ in Coordinate Trainer.
    *   🧠 **Tactical Genius** (600 XP): Completed a practice session with zero blunders.
    *   🎙️ **Caster Fanatic** (500 XP): Fan of the AI streamer commentary.
    *   💎 **High Spender** (1000 XP): Unlocked premium board styles.
*   Unlocks and selections are fully persisted to `localStorage` under `unlocked_badges` and `active_badge`, and propagate globally via the `active_cosmetics_changed` custom window event.

### Standings & Social Showcases
*   **[Weekly League Leaderboard](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/LeagueLeaderboard.tsx)**: Displays the player's equipped badge emoji right next to their name. Additionally, simulated competitors also equip randomized badges, making the leaderboard feel highly personalized and alive.
*   **[User Menu Dropdown](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/auth/UserMenu.tsx)**: Renders the active badge emoji next to the user's name at the top of the dropdown.
*   **[Profile Card](file:///home/ubuntu/code/chess-rebundled/frontend/src/app/profile/page.tsx)**: Displays the equipped badge name and emoji in a sleek, glassmorphic pill next to their profile avatar and username.

---

## 💬 9. Twitch-Style Commentary Chat

Brings bot play and practice mode sidebar commentary to life with an active simulated Twitch chat scroll.

### [Simulated Chat Log](file:///home/ubuntu/code/chess-rebundled/frontend/src/components/AICasterPanel.tsx)
*   **Move Reactions**: When a move is played (categorized into checks, captures, promotions, castling, checkmates, etc.), the panel fires a staggered delay (stretching from 100ms to 1500ms) to print 3-4 reaction messages from random simulated chatters (e.g. `BlunderGod`, `SackTheQueen`).
*   **Streamer Personalities**: The chat templates are customized to match the active commentator:
    *   *Hikaru*: Repeat takes, speedrun references, Juicer slang, and GG spam.
    *   *GothamChess*: Levy content hyping, ROOOOOOK sacrifices, and tactical shouting.
    *   *Andrea Botez*: Hype chat, panic checks, and Botez Gambit spams.
    *   *Magnus Carlsen*: GIGACHAD Norway memes, calm dry analysis, and GOAT spams.
*   **Twitch-style Formatting**: Chatters are color-coded with Twitch username colors and equip custom badges (Mod `🛡️`, Sub `⭐`, VIP `💎`).
*   **Interactive Input Box**: The user can type and submit their own messages into the chat, which triggers automated replies from the simulated chatters.

