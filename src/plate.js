/**
 * THE APP'S PLATE GEOMETRY IS ON WHILE THIS IS 'tm-plate' (docs/SHAPES.md).
 *
 * It is the ONE place the class is spelled. src/main.jsx puts it on the app
 * root (<html>) when it is non-empty, and ./plate.css keys every rule on it,
 * so this line is the whole switch: set it to '' and every page renders
 * exactly as it did before the plate shipped, because nothing in plate.css
 * can match without the class and nothing outside plate.css changed what a
 * page looks like (measured: docs/SHAPES.md, "Off is today").
 *
 * The name cannot collide: the design system's classes are all `frc-`, and no
 * class in src/ starts `tm-` (grep `\btm-` over src/ to re-check).
 *
 * The plate tools under tools/e2e/plate/ read this same constant rather than
 * writing the class out, so a harness can never photograph a look the real
 * app does not wear.
 */
export const APP_PLATE = 'tm-plate'
