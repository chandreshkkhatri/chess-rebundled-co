'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chess } from 'chess.js';
import { ChessBoard } from '@/components/ChessBoard';
import { PageLayout } from '@/components/PageLayout';
import { useStockfish, BotDifficulty, DIFFICULTY_MAP } from '@/hooks/useStockfish';
import { UniversalInputPanel } from '@/components/UniversalInputPanel';
import { AICasterPanel } from '@/components/AICasterPanel';

type MoveState = 'idle' | 'human-thinking' | 'bot-thinking';

function BotPlayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const difficulty = (searchParams.get('difficulty') || 'easy') as BotDifficulty;
  const playerColor = (searchParams.get('color') || 'white') as 'white' | 'black';

  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [moveState, setMoveState] = useState<MoveState>('idle');
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  
  const { isReady, findBestMove } = useStockfish();

  const checkGameOver = useCallback(() => {
    if (chess.isGameOver()) {
      setIsGameOver(true);
      if (chess.isCheckmate()) {
        const winner = chess.turn() === 'w' ? 'Black' : 'White';
        setGameOverMessage(`Checkmate! ${winner} wins.`);
      } else if (chess.isDraw()) {
        setGameOverMessage('Draw!');
      } else if (chess.isStalemate()) {
        setGameOverMessage('Stalemate!');
      } else if (chess.isThreefoldRepetition()) {
        setGameOverMessage('Draw by repetition!');
      } else if (chess.isInsufficientMaterial()) {
        setGameOverMessage('Draw due to insufficient material!');
      }
      setMoveState('idle');
      return true;
    }
    return false;
  }, [chess]);

  const makeHumanMove = useCallback((moveSanOrLan: string) => {
    if (isGameOver || moveState === 'bot-thinking') return false;
    
    try {
      const moveResult = chess.move(moveSanOrLan, { strict: false });
      if (moveResult) {
        setFen(chess.fen());
        setMoves(prev => [...prev, moveResult.san]);
        if (!checkGameOver()) {
          setMoveState('bot-thinking');
        }
        return true;
      }
    } catch (e) {
      console.warn("Invalid human move:", moveSanOrLan);
    }
    return false;
  }, [chess, isGameOver, moveState, checkGameOver]);

  const makeBotMove = useCallback(async () => {
    try {
      setMoveState('bot-thinking');
      const bestMoveSanOrLan = await findBestMove(chess.fen(), difficulty);
      
      const moveResult = chess.move(bestMoveSanOrLan, { strict: false });
      if (moveResult) {
        setFen(chess.fen());
        setMoves(prev => [...prev, moveResult.san]);
        if (!checkGameOver()) {
          setMoveState('human-thinking');
        }
      }
    } catch (error) {
      console.error("Bot failed to generate move:", error);
      setMoveState('idle');
    }
  }, [chess, difficulty, findBestMove, checkGameOver]);

  // Handle bot's turn
  useEffect(() => {
    if (!isReady || isGameOver) return;
    
    const isBotTurn = (chess.turn() === 'w' && playerColor === 'black') || 
                      (chess.turn() === 'b' && playerColor === 'white');
                      
    if (isBotTurn && moveState !== 'bot-thinking') {
      makeBotMove();
    }
  }, [isReady, fen, playerColor, isGameOver, moveState, makeBotMove, chess]);

  // Handle piece drop (manual drag)
  const onPieceDrop = (sourceSquare: string, targetSquare: string, piece: string) => {
    let promotion = piece[1]?.toLowerCase();
    const isPawn = piece[1]?.toLowerCase() === 'p';
    const isEndRank = targetSquare[1] === '1' || targetSquare[1] === '8';
    
    if (isPawn && isEndRank && !promotion) {
       promotion = 'q';
    }

    const moveString = `${sourceSquare}${targetSquare}${promotion ? promotion : ''}`;
    return makeHumanMove(moveString);
  };

  const renderMoveLog = () => (
    <div className="flex-1 bg-slate-900/40 lg:rounded-2xl border border-slate-800/50 flex flex-col min-h-0 overflow-hidden shadow-2xl rounded-t-2xl lg:rounded-t-2xl bg-[#0f172a]">
      <div className="px-4 py-2 border-b border-slate-800/50 flex justify-between items-center bg-slate-800/30">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <svg className="w-3 h-3 text-purple-400 lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          Log
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-400">
            {Math.ceil(moves.length / 2)} PND
          </span>
          <button 
            onClick={() => setShowLogModal(false)} 
            className="lg:hidden w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full transition-colors text-lg"
          >
            &times;
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 lg:p-3 space-y-1 custom-scrollbar">
        {moves.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-10 pt-4 lg:pt-10">
            <span className="text-2xl lg:text-4xl mb-2">♟️</span>
            <p className="text-[9px] uppercase font-bold tracking-widest">No moves</p>
          </div>
        ) : (
          Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
            <div key={i} className="grid grid-cols-4 items-center text-[10px] bg-slate-800/20 rounded p-1.5 border border-white/5 hover:bg-slate-700/20 transition-colors">
              <span className="col-span-1 text-slate-600 font-mono text-center">{i + 1}</span>
              <div className="col-span-1 flex items-center justify-center font-mono font-bold text-slate-300">
                {moves[i * 2]}
              </div>
              <div className="col-span-2 flex items-center justify-center font-mono font-bold text-purple-400">
                {moves[i * 2 + 1] || "—"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Engine Status Tip */}
      <div className="p-2 bg-slate-950/40 border-t border-slate-800/50 flex justify-center">
         <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">
              ENGINE: {isReady ? 'ONLINE' : 'BOOTING'}
            </span>
         </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-[56px])] w-full p-2 lg:p-4 overflow-hidden bg-slate-950/20 relative">
      {/* Header - Compact */}
      <div className="flex justify-between items-center mb-2 shrink-0 px-2 font-mono">
        <button 
          onClick={() => router.push('/play')} 
          className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-500 hover:text-white transition-colors"
        >
          <span>&larr;</span> Leave Game
        </button>
        
        <div className="flex items-center gap-2">
          {/* Mobile Log Button */}
          <button 
            onClick={() => setShowLogModal(true)}
            className="lg:hidden flex items-center gap-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[10px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
            LOG
          </button>
          
          <span className="text-[10px] text-slate-600 uppercase font-black hidden sm:inline">Lvl {DIFFICULTY_MAP[difficulty].skillLevel}</span>
          <span className="px-2 py-0.5 bg-purple-900/40 text-purple-400 border border-purple-800/30 rounded text-[10px] font-bold uppercase tracking-tighter">
            {difficulty}
          </span>
        </div>
      </div>

      {/* Game Layout - 3 columns on large screens, stacked on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 lg:gap-3 xl:gap-4 lg:justify-center min-h-0 lg:max-h-[calc(100vh-140px)] overflow-hidden">
        
        {/* 1. Main Game Section (Left / Top) */}
        {/* Reduced max widths to absolutely guarantee no scrolling on any desktop viewport */}
        <div className="flex justify-center flex-shrink-0 lg:flex-none lg:w-[calc(100vh-280px)] xl:w-[calc(100vh-200px)] min-h-0 min-w-0">
          <div className="w-full max-w-[min(100%,calc(100vh-320px))] lg:max-w-full flex flex-col justify-center gap-1">
            
            {/* Top Plate - Stockfish */}
            <div className="flex items-center justify-between px-1 text-white">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 lg:w-8 lg:h-8 rounded flex items-center justify-center text-sm lg:text-xl ${playerColor === 'white' ? 'bg-slate-700' : 'bg-slate-200 text-slate-800'}`}>
                  {playerColor === 'white' ? '♚' : '♔'}
                </div>
                <div className="font-semibold text-sm lg:text-base truncate flex items-center gap-2">
                  Stockfish <span className="text-[9px] text-slate-500 font-mono tracking-tighter hidden sm:inline">CPU</span>
                </div>
              </div>
              {moveState === 'bot-thinking' && (
                <div className="flex items-center gap-2 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded">
                   <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                   <span className="text-[9px] text-purple-400 font-black uppercase tracking-widest hidden sm:inline">Processing</span>
                </div>
              )}
            </div>

            {/* Board Container */}
            <div className="w-full aspect-square relative shadow-2xl shadow-black/80 ring-4 lg:ring-8 ring-slate-800/20 rounded-sm bg-slate-800">
              {/* Thinking animation overlay */}
              {moveState === 'bot-thinking' && (
                 <div className="absolute inset-x-0 top-0 pointer-events-none z-10">
                    <div className="h-1 bg-purple-400 animate-tubelight-top w-full rounded-t-[4px]" />
                 </div>
              )}
              {moveState === 'human-thinking' && !isGameOver && (
                 <div className="absolute inset-x-0 bottom-0 pointer-events-none z-10">
                    <div className="h-1 bg-emerald-400 animate-tubelight-bottom w-full rounded-b-[4px]" />
                 </div>
              )}
              
              <ChessBoard
                fen={fen}
                orientation={playerColor}
                onPieceDrop={onPieceDrop}
                draggable={moveState !== 'bot-thinking' && !isGameOver}
              />

              {/* Game Over Screen */}
              {isGameOver && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all">
                  <div className="bg-slate-800 p-6 lg:p-8 rounded-2xl shadow-2xl border border-slate-700 text-center max-w-[90%] lg:max-w-sm w-full mx-auto transform animate-in zoom-in-95 duration-300">
                    <h2 className="text-xl lg:text-2xl font-black text-white mb-2 uppercase tracking-tighter underline decoration-purple-500 decoration-4 underline-offset-4">Game Over</h2>
                    <p className="text-sm lg:text-base text-slate-300 mt-4 lg:mt-6 mb-6 lg:mb-8 font-medium italic">{gameOverMessage}</p>
                    <button
                      onClick={() => router.push('/play')}
                      className="w-full py-2 lg:py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-900/20 active:scale-95"
                    >
                      Lobby
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Plate - Human */}
            <div className="flex items-center justify-between px-1 text-white">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 lg:w-8 lg:h-8 rounded flex items-center justify-center text-sm lg:text-xl font-bold ${playerColor === 'white' ? 'bg-slate-200 text-slate-800' : 'bg-slate-700'}`}>
                  {playerColor === 'white' ? '♔' : '♚'}
                </div>
                <div className="font-semibold text-sm lg:text-base truncate flex items-center gap-2">
                  You <span className="text-[9px] text-slate-500 font-mono tracking-tighter hidden sm:inline">HUMAN</span>
                </div>
              </div>
              {moveState === 'human-thinking' && !isGameOver && (
                <span className="text-[9px] text-purple-400 font-black uppercase tracking-[0.2em] animate-pulse">Your Turn</span>
              )}
            </div>
          </div>
        </div>

        {/* 2. Input Panel Section (Middle on Desktop, Bottom on Mobile) */}
        <div className="h-[145px] w-full lg:h-auto lg:w-[240px] xl:w-[280px] shrink-0 lg:border-none lg:bg-transparent rounded-2xl p-1 lg:p-0">
           {/* Pulled tight to the board horizontally and vertically */}
           <div className="h-full flex flex-col justify-start lg:pt-8 xl:pt-10">
             <div className="h-full lg:h-auto lg:max-h-[220px] shadow-2xl lg:shadow-none bg-slate-900/40 lg:bg-transparent border lg:border-none border-slate-800/50 rounded-2xl">
               <UniversalInputPanel 
                fen={fen}
                isActive={moveState === 'human-thinking' || (moveState === 'idle' && !isGameOver)}
                isSubmitting={moveState === 'bot-thinking' || isGameOver || !isReady}
                inputMode="tap-only"
                voiceParsingMode="webspeech-haiku"
                autoSubmitEnabled={true}
                aiParseResult={null}
                aiParseError={null}
                isAIParsing={false}
                onMoveSubmit={(move) => makeHumanMove(move)}
                onParseMoveWithText={() => {}}
                onParseMoveWithAudio={() => {}}
                clearAIParseState={() => {}}
              />
            </div>
           </div>
        </div>

        {/* 3. Sidebar Section (Right on Desktop, Hidden on Mobile) */}
        <div className="hidden lg:flex flex-1 lg:max-w-[280px] xl:max-w-[320px] flex-col gap-3 min-h-[100px] lg:min-h-0 lg:max-h-full shrink-0">
           <div className="flex-1 min-h-0 flex flex-col">
             {renderMoveLog()}
           </div>
           <AICasterPanel moves={moves} fen={fen} />
        </div>

      </div>

      {/* Mobile Log Overlay (Drawer) */}
      {showLogModal && (
        <div 
          className="lg:hidden absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowLogModal(false)}
        >
          <div 
            className="w-full flex flex-col gap-2 p-3 bg-[#0f172a] justify-end h-[75vh] rounded-t-3xl translate-y-0 transform animate-in slide-in-from-bottom-[100%] duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 min-h-0 flex flex-col">
              {renderMoveLog()}
            </div>
            <AICasterPanel moves={moves} fen={fen} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotPlayPage() {
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <PageLayout showFooter={false}>
        <div className="flex items-center justify-center h-full p-4">
          <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full opacity-20"></div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout showFooter={false}>
      <Suspense fallback={
        <div className="flex items-center justify-center h-full p-4">
          <div className="animate-spin h-10 w-10 border-4 border-purple-500 border-t-transparent rounded-full shadow-lg shadow-purple-500/20"></div>
        </div>
      }>
        <BotPlayContent />
      </Suspense>
    </PageLayout>
  );
}
