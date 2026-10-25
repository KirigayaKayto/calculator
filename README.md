# Calculator

A calculator for university calculus and physics, for Android and PC. Everything is written **the way a textbook writes it**: stacked fractions, roots with a bar, exponents up high. Answers are exact when they can be (5/6, 2√3, √2/2, x·sin x + cos x). The ⇄ button switches to the decimal. It is a PWA: install it from the browser, and it works offline. No ads, no tracking.

## What it does

- **Calculator.** Textbook input with key pages:
  - **123:** Casio-style, with ×10ˣ and Ans.
  - **f(x):** trig and sin⁻¹, logs, roots, |x|, n!, nCr, nPr, mod, ⌊x⌋.
  - **Calc:** d/dx, d²/dx², d/dx at a point, ∫, ∫ₐᵇ, lim, Σ, Π, Taylor series, factor, expand, equations.
  - **Phys:** 20 CODATA 2022 constants, ±, vectors, matrices, i and r∠θ.
  - **Units.**
  - **abc:** letters (⇧ for capitals), and from there Greek letters, subscripts (v₀) and primes (f′).
- **Symbolic answers.**
  - Derivatives, integrals, limits, series, and solving equations; "Solve for" asks which letter to solve for.
  - The symbolic engine (Compute Engine) loads in the background the first time it is needed.
- **Number formats.** Auto, Fix n, Sci n, Eng n, Sig n, and **Lab**: significant figures by the lab rules, worked out from the numbers you typed.
- **Measurements.** (2.0 ± 0.1)·(3.0 ± 0.2) = 6.0 ± 0.5: uncertainties are propagated and rounded by convention.
- **Units.** 9.81 m/s² · 2 s, 5 km → m, mₑc² → MeV.
- **Tools:**
  - **Units:** a converter with 24 quantities, from length to radiation dose and data rate.
  - **Constants:** a searchable table.
  - **Base:** a programmer's calculator.
    - HEX, DEC, OCT and BIN side by side, in 8–64-bit words, signed or unsigned.
    - AND, OR, XOR, NOT, NAND, NOR, shifts, rotations (ROL, ROR typed) and mod.
    - Bits you flip with a tap, and the character for a code.
  - **Stats:**
    - mean, median, standard deviations, standard error and quartiles;
    - a least-squares line with the errors of the slope and the intercept.
  - **Integers:**
    - prime test, factorization, divisors, φ, GCD and LCM;
    - aᵇ mod m and inverses mod m.
- **Graph**, a Desmos-like worksheet:
  - y = f(x), f(x) = … and f′(x), x = g(y);
  - implicit curves and inequalities;
  - points, parametric and polar curves;
  - sliders;
  - ∫ₐᵇ with its value and shaded area, and d/dx plotted symbolically;
  - tap a curve to see its roots, extrema and intersections.
- **Your own keys.** Settings → *Customize keys*: rearrange the pages, and make keys with your own formulas.

On a PC you can type: `/` makes a fraction, `^` a power; `sqrt`, `sin`, `pi` and `int` work too. Arrow keys move inside fractions and roots. Enter gives the answer, Esc clears.

To paste a number from another app, long-press the formula (or right-click, or Ctrl+V), or tap *Paste* while it is empty. Numbers are understood however they are written: 1 234,56 · 1,234.56 · $1,299.99 · 1.5×10⁻³ · "Total: 2 500,75 ₽".

## Commands

```
npm install       # once (the npm cache is on drive D:, see .npmrc)
npm run dev       # development: http://localhost:5173
npm test          # tests of the engine, the graph and the key layout
npm run check     # type check
npm run build     # build into dist/
npm run preview   # look at the build: http://localhost:4173
```

## Structure

- `src/engine/`: the numeric engine (mathjs, 64 significant digits).
  - `latex.ts` reads the textbook-style field (LaTeX) as an expression.
  - `format.ts` and `texout.ts` write answers.
  - `exact.ts` finds fractions.
  - `lab.ts` handles significant figures and uncertainties.
  - `constants.ts` holds the CODATA constants.
  - `programmer.ts`, `stats.ts` and `integers.ts` are the engines of the Base, Stats and Integers tools.
- `src/cas/`: the symbolic engine in a web worker.
- `src/graph/`: the graph worksheet.
  - `model.ts` works out what each line means.
  - `numeric.ts` holds fast float evaluation, numeric derivatives and Gauss–Kronrod integrals.
  - `sample.ts` does sampling and points of interest.
- `src/ui/`: the screens (Svelte 5). `keys.ts` describes every key and the default pages.

## Installing

- **PC:** open the app in Edge or Chrome and choose *Install* in the address bar.
- **Android:** open it in Chrome, then ⋮ → *Install app*.

The app must be served over HTTPS for this, for example from GitHub Pages. The workflow in `.github/workflows/pages.yml` publishes every push to `main`.
