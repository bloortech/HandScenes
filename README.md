# Atta ant farm

A virtual glass ant farm of leafcutter ants (*Atta sexdens*) at real scale (1 px = 1 mm) and real time.
A queen lands, digs her nest, raises her first workers in the dark, and the colony grows into an
underground city of fungus-garden chambers.

    npm start            # serves on http://localhost:7790
    npm test             # 150 sim days headless, checks the founding story, soil conservation, save/load

Plain HTML + JS, no build. `sim.js` is the whole simulation (no DOM), `main.js` draws it.
The colony saves itself to localStorage every 15 s.

URL options: `?day=200` starts a fresh colony fast-forwarded to day 200; `?zoom=9` starts zoomed in on the queen.

What's real and what's estimated: see [SCIENCE.md](SCIENCE.md).
