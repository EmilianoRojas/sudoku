# Sudoku

A dependency-free browser Sudoku game. Open `index.html` in a modern browser to play.

## Features

- Unique-solution puzzles, with Easy / Medium / Hard / Evil **clue targets** (42 / 34 / 28 / 22). The displayed logic label separately distinguishes puzzles solvable with naked singles, hidden singles, or requiring more advanced techniques; it is **not** a full difficulty certification.
- Keyboard or on-screen numpad input; arrow keys to navigate; N for notes; Ctrl/Cmd+Z for undo and Ctrl/Cmd+Y for redo.
- Notes automatically clear from peers after a correct placement. Mistake highlighting is optional; toggle with **Mistakes: On/Off**. Errors are still counted when a wrong number is entered.
- Game state persists in browser localStorage; the timer resumes when reopening the page.

## Stylus handwriting

Turn on **Handwriting** and write a large digit inside an editable square with a pen. A short pause after lifting the pen allows multiple strokes. Clearly recognized digits are entered automatically; ambiguous strokes show a 1–9 correction strip so they are not counted as player mistakes. Tap a cell and use the on-screen numpad if recognition is inaccurate. The recognizer is a lightweight offline template matcher, not a trained handwriting model; handwriting varies, so it is important to test with actual tablet pens. Touch and mouse retain ordinary selection behavior.

## Development

No dependencies or build step. Run `node --test tests/*.test.cjs` (Node.js 18+). A GitHub Actions workflow runs tests on pushes and pull requests.

## Limitations

Puzzle generation is synchronous and may pause the UI briefly for complex puzzles. The clue target is best-effort, and the logic label intentionally does not separate Hard from Evil by human solving techniques. A complete logical difficulty grader and background worker can be introduced later.
