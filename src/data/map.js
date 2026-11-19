(() => {
  'use strict';

  /**
   * The battlefield, one character per tile:
   * `S` enemy spawn, `E` village gate, `#` path, `.` buildable grass,
   * `T` tree and `R` rock (blocked scenery).
   * The path must be a single unbranched line from S to E.
   */
  const MAP_ROWS = [
    '..T.........R...',
    'S####......T....',
    '....#...######..',
    '.R..#...#....#..',
    '....#...#..T.#..',
    '....#####....#..',
    'T............#.R',
    '......R......#..',
    '..T..........##E',
    '.......T........',
  ];

  Object.assign(Hold, { MAP_ROWS });
})();
