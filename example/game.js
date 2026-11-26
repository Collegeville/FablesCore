// ExampleFables: the smallest complete game on FablesCore, and a living test of the contract.
// It supplies four things: settings, a puzzle bank, a renderer, and a checker. FablesCore does
// the rest (page shell, daily pick, weekly ramp, unlimited mode, feedback, sharing, streaks).

Fables.start({
  game: {
    id: 'examplefables',
    name: 'ExampleFables',
    tagline: 'Which number breaks the pattern?',
    icon: 'icons/icon.svg',
    color: '#5b3fb0',
    colorDark: '#b9a6f2',
    year: 2026,
    maxAttempts: 3,
    url: 'https://collegeville.github.io/FablesCore/example/',
    feedbackUrl: 'https://github.com/Collegeville/FablesCore/issues/new?title=Puzzle%20{id}%20({serial})',
    conceptLabels: {
      add: 'Adding the same amount',
      multiply: 'Multiplying',
      squares: 'Square numbers',
      fib: 'Adding the two before',
      alternate: 'Two patterns taking turns',
    },
    help: `
      <h2>How to play</h2>
      <p>Each puzzle shows eight numbers that follow one rule, except that one number was changed.
      Tap the number that breaks the pattern. You have three tries.</p>
      <p>ExampleFables is the sample game for FablesCore, the shared framework behind the Fables games.</p>`,
    about: `
      <h2>Why these puzzles</h2>
      <p>ExampleFables shows how a Fables game is built. Each puzzle is a row of numbers with one that breaks the pattern.</p>
      <h2>What you'll learn</h2>
      <ol>
        <li><strong>Patterns:</strong> adding, multiplying, squares and alternation.</li>
        <li><strong>Checking:</strong> testing a guess against every number, not just the first few.</li>
      </ol>`,
  },

  bank: window.EXAMPLE_BANK,

  // Draw the puzzle. `play` says what has happened so far and offers submit(answer).
  render(puzzle, el, play) {
    const list = document.createElement('ol');
    list.className = 'ex-sequence';
    list.setAttribute('aria-label', 'The sequence');
    puzzle.sequence.forEach((n, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fables-choice';
      button.textContent = n;
      const tried = play.answers.includes(i);
      const reveal = play.done && i === puzzle.answer;
      if (tried) button.classList.add('tried');
      if (reveal) button.classList.add('is-answer');
      button.disabled = play.done || tried;
      button.setAttribute('aria-label', `${n}, number ${i + 1} of ${puzzle.sequence.length}${tried && !reveal ? ', already tried' : ''}${reveal ? ', the number that breaks the pattern' : ''}`);
      button.addEventListener('click', () => play.submit(i));
      item.append(button);
      list.append(item);
    });
    el.append(list);
    if (!play.done) {
      const hint = document.createElement('p');
      hint.className = 'ex-hint';
      hint.textContent = 'Tap the number that does not fit.';
      el.append(hint);
    }
  },

  // Check an answer. `near` (one place away) shows as a yellow square in the shared grid; the
  // share never reveals which number was wrong.
  check(puzzle, answer) {
    if (answer === puzzle.answer) return { correct: true, mark: 'hit' };
    return { correct: false, mark: Math.abs(answer - puzzle.answer) === 1 ? 'near' : 'miss' };
  },
});
