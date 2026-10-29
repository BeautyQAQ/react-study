import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import Game from "./Game.jsx";

const drawMoves = [0, 1, 2, 4, 3, 5, 7, 6, 8];
const winningMoves = [0, 3, 1, 4, 2];

function setupGame() {
  const user = userEvent.setup();
  render(
    <StrictMode>
      <Game />
    </StrictMode>,
  );
  const squares = within(
    screen.getByRole("group", { name: "Tic-tac-toe board" }),
  ).getAllByRole("button");
  return { user, squares };
}

async function play(user, squares, moves) {
  for (const position of moves) {
    await user.click(squares[position]);
  }
}

describe("tic-tac-toe", () => {
  test("starts with an empty board and alternates players without overwriting moves", async () => {
    const { user, squares } = setupGame();
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
    expect(squares).toHaveLength(9);
    for (const square of squares) {
      expect(square).toBeEnabled();
      expect(square).toBeEmptyDOMElement();
    }

    await user.click(squares[0]);
    expect(squares[0]).toHaveTextContent("X");
    expect(squares[0]).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Next player: O");

    await user.click(squares[0]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Next player: O");

    await user.click(squares[1]);
    expect(squares[1]).toHaveTextContent("O");
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
  });

  test.each([
    ["top row", [0, 3, 1, 4, 2]],
    ["middle row", [3, 0, 4, 1, 5]],
    ["bottom row", [6, 0, 7, 1, 8]],
    ["left column", [0, 1, 3, 2, 6]],
    ["middle column", [1, 0, 4, 2, 7]],
    ["right column", [2, 0, 5, 1, 8]],
    ["main diagonal", [0, 1, 4, 2, 8]],
    ["other diagonal", [2, 0, 4, 1, 6]],
  ])("recognizes a win on the %s and prevents further moves", async (_, moves) => {
    const { user, squares } = setupGame();
    await play(user, squares, moves);

    expect(screen.getByRole("status")).toHaveTextContent("Winner: X");
    for (const square of squares) {
      expect(square).toBeDisabled();
    }

    const emptySquare = squares.find((square) => square.textContent === "");
    await user.click(emptySquare);
    expect(emptySquare).toBeEmptyDOMElement();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  test("recognizes O as the winner", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, [0, 3, 1, 4, 8, 5]);
    expect(screen.getByRole("status")).toHaveTextContent("Winner: O");
  });

  test("announces a draw when the board is full with no winner", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, drawMoves);
    expect(screen.getByRole("status")).toHaveTextContent("Draw!");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    for (const square of squares) {
      expect(square).toBeDisabled();
    }
  });

  test("announces a win rather than a draw when the ninth move wins", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, [0, 1, 2, 3, 4, 5, 7, 6, 8]);
    expect(screen.getByRole("status")).toHaveTextContent("Winner: X");
  });

  test("restores the board and next player when moving through history", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, [0, 1, 4]);
    await user.click(screen.getByRole("button", { name: "Go to move #1" }));

    expect(squares[0]).toHaveTextContent("X");
    expect(squares[1]).toBeEmptyDOMElement();
    expect(squares[4]).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveTextContent("Next player: O");
    expect(screen.getByRole("button", { name: "Go to move #1" }))
      .toHaveAttribute("aria-current", "step");

    await user.click(screen.getByRole("button", { name: "Go to move #3" }));
    expect(squares[1]).toHaveTextContent("O");
    expect(squares[4]).toHaveTextContent("X");
    expect(screen.getByRole("status")).toHaveTextContent("Next player: O");

    await user.click(screen.getByRole("button", { name: "Go to game start" }));
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    for (const square of squares) {
      expect(square).toBeEmptyDOMElement();
    }
  });

  test("replaces future moves when continuing from an earlier turn", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, [0, 1, 4, 2]);
    await user.click(screen.getByRole("button", { name: "Go to move #1" }));
    await user.click(squares[3]);

    expect(squares[0]).toHaveTextContent("X");
    expect(squares[3]).toHaveTextContent("O");
    expect(squares[1]).toBeEmptyDOMElement();
    expect(squares[2]).toBeEmptyDOMElement();
    expect(squares[4]).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Go to move #3" })).not.toBeInTheDocument();
  });

  test("allows play to resume from history after a completed game", async () => {
    const { user, squares } = setupGame();
    await play(user, squares, winningMoves);
    await user.click(screen.getByRole("button", { name: "Go to move #3" }));
    expect(screen.getByRole("status")).toHaveTextContent("Next player: O");
    expect(squares[8]).toBeEnabled();

    await user.click(squares[8]);
    expect(squares[8]).toHaveTextContent("O");
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  test.each([
    ["an unfinished game", [0, 1]],
    ["a win", winningMoves],
    ["a draw", drawMoves],
  ])("starts a new game after %s", async (_, moves) => {
    const { user, squares } = setupGame();
    await play(user, squares, moves);
    await user.click(screen.getByRole("button", { name: "New game" }));

    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    for (const square of squares) {
      expect(square).toBeEmptyDOMElement();
      expect(square).toBeEnabled();
    }
    await user.click(squares[4]);
    expect(squares[4]).toHaveTextContent("X");
  });

  test("supports playing with the keyboard", async () => {
    const { user, squares } = setupGame();
    await user.tab();
    expect(squares[0]).toHaveFocus();
    expect(squares[0]).toHaveAccessibleName("Row 1, column 1: empty");
    await user.keyboard("{Enter}");
    expect(squares[0]).toHaveTextContent("X");

    await user.tab();
    expect(squares[1]).toHaveFocus();
    await user.keyboard(" ");
    expect(squares[1]).toHaveTextContent("O");
    expect(screen.getByRole("status")).toHaveTextContent("Next player: X");
  });
});
