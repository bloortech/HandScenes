# Atta ant farm

A virtual glass ant farm of leafcutter ants (*Atta sexdens*) at real scale (1 px = 1 mm) and real time.
A queen lands, digs her nest, raises her first workers in the dark, and the colony grows into an
underground city of fungus-garden chambers.

    python serve.py      # from the handscenes root, then open http://localhost:8000/lab/antfarm/
    npm test             # 150 sim days headless, checks the founding story, soil conservation, save/load

Plain HTML + JS, no build. `sim.js` is the whole simulation (no DOM), `main.js` draws it.
The colony saves itself to localStorage every 15 s.

Two modes: **one colony**, or **two colonies at war** (Red vs Gold) competing for the same food plants.
Plants are finite and regrow, so the food nearby decides how big a colony gets.

URL options: `?mode=war` starts a fresh war farm; `?day=200` fast-forwards a fresh farm to day 200;
`?zoom=9` starts zoomed in on the queen. Keys: `t` true ant size, `h` hide panels, `f` whole farm.

What's real and what's estimated: see [SCIENCE.md](SCIENCE.md).
