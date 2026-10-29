import { useState } from "react";

function Square({ value, position, onClick, disabled, isWinning }) {
  const row = Math.floor(position / 3) + 1;
  const column = (position % 3) + 1;

  return (
    <button
      type="button"
      className={`square${isWinning ? " square-winning" : ""}`}
      aria-label={`Row ${row}, column ${column}: ${value ?? "empty"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {value}
    </button>
  );
}

function Board({ squares, winner, onClick }) {
  return (
    <div className="board" role="group" aria-label="Tic-tac-toe board">
      {squares.map((value, position) => (
        <Square
          key={position}
          value={value}
          position={position}
          disabled={Boolean(value || winner)}
          isWinning={winner?.line.includes(position)}
          onClick={() => onClick(position)}
        />
      ))}
    </div>
  );
}

function createGame() {
  return { history: [Array(9).fill(null)], currentMove: 0 };
}

export default function Game() {
  const [{ history, currentMove }, setGame] = useState(createGame);
  const currentSquares = history[currentMove];
  const winner = calculateWinner(currentSquares);
  const isDraw = currentSquares.every((square) => square !== null);
  const status = winner
    ? `Winner: ${winner.player}`
    : isDraw
      ? "Draw!"
      : `Next player: ${currentMove % 2 === 0 ? "X" : "O"}`;

  function handleClick(position) {
    setGame((game) => {
      const squares = game.history[game.currentMove];
      if (calculateWinner(squares) || squares[position]) {
        return game;
      }

      const nextSquares = squares.slice();
      nextSquares[position] = game.currentMove % 2 === 0 ? "X" : "O";
      return {
        history: game.history.slice(0, game.currentMove + 1).concat([nextSquares]),
        currentMove: game.currentMove + 1,
      };
    });
  }

  function jumpTo(move) {
    setGame((game) => ({ ...game, currentMove: move }));
  }

  return (
    <section className="tic-tac-toe" aria-label="井字棋小游戏">
      <header className="game-header">
        <p className="eyebrow">小游戏 · 无需登录</p>
        <h1>Tic-tac-toe</h1>
        <p className="intro">Take turns as X and O. Get three in a row to win.</p>
      </header>
      <div className="game">
        <section className="board-panel" aria-label="Game board">
          <p className="status" role="status">
            {status}
          </p>
          <Board squares={currentSquares} winner={winner} onClick={handleClick} />
          <button
            type="button"
            className="restart"
            onClick={() => setGame(createGame())}
          >
            New game
          </button>
        </section>
        <aside className="game-info" aria-labelledby="history-heading">
          <h2 id="history-heading">Move history</h2>
          <ol>
            {history.map((_, move) => (
              <li key={move}>
                <button
                  type="button"
                  aria-current={move === currentMove ? "step" : undefined}
                  onClick={() => jumpTo(move)}
                >
                  {move ? `Go to move #${move}` : "Go to game start"}
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}

function calculateWinner(squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { player: squares[a], line };
    }
  }

  return null;
}
