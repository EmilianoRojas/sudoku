# Sudoku

A dependency-free browser Sudoku game. Open `index.html` in a modern browser to play.

## Features

- Unique-solution puzzles, with Easy / Medium / Hard / Evil **clue targets** (42 / 34 / 28 / 22). The displayed logic label separately distinguishes puzzles solvable with naked singles, hidden singles, or requiring more advanced techniques; it is **not** a full difficulty certification.
- Keyboard or on-screen numpad input; arrow keys to navigate; N for notes; Ctrl/Cmd+Z for undo and Ctrl/Cmd+Y for redo.
- Notes automatically clear from peers after a correct placement. Mistake highlighting is optional; toggle with **Mistakes: On/Off**. Errors are still counted when a wrong number is entered.
- Game state persists in browser localStorage; the timer resumes when reopening the page.

## Interface

The layout adapts from a two-column desktop view to a compact tablet/phone layout. It groups number input, history, and input modes, uses a distinct amber handwriting target, and shows progress based on correctly completed editable squares (not simply filled squares). Dark mode follows your device's color scheme; reduced-motion preferences are respected.

## Stylus handwriting

Turn on **Handwriting** and write a large digit inside an editable square with a pen. After a short pause, the game enters the recognized digit immediately; there is no confirmation strip. Use Undo or the number pad to correct an incorrect prediction. The trained, quantized digit classifier runs entirely offline in the browser using the included `digit-model.js`; nothing is uploaded. It was trained on scikit-learn's 8×8 handwritten-digits dataset (0–9) and outputs only 1–9 for Sudoku. Training-set evaluation is not a guarantee of accuracy on real tablet strokes. Touch and mouse still select cells normally.

The recognizer renders pen strokes to an 8×8 grayscale image before inference. Because the underlying training dataset is low-resolution, unusual stroke styles and multi-stroke digits can still be misread. 

## Development

No dependencies or build step. Run `node --test tests/*.test.cjs` (Node.js 18+). A GitHub Actions workflow runs tests on pushes and pull requests.

## Limitations

Puzzle generation is synchronous and may pause the UI briefly for complex puzzles. The clue target is best-effort, and the logic label intentionally does not separate Hard from Evil by human solving techniques. A complete logical difficulty grader and background worker can be introduced later.
