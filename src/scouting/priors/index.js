// Every shipped season prior, by TBA event key, for code that cannot lazy-load
// (the connector on Vercel). The board page lazy-loads one file with
// import.meta.glob instead. tests/pick-rank.test.js holds the two lists equal.
import cabl2026 from './2026cabl.js'

export const PRIORS = Object.freeze({ '2026cabl': cabl2026 })
