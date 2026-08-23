// FRC5669DesignSystem — namespace entry.
// Built fresh from FRC_Design_System.md v1.1, never extracted from frc-app CSS.
// Importing this module loads styles.css (the single stylesheet entry).
import './styles.css'
import * as core from './components/core/index.js'
import * as brand from './components/brand/index.js'
import * as tokens from './tokens.js'
import { ASSETS, ASSET_FILES, MIN_SIZES } from './assets.js'

export * from './components/core/index.js'
export * from './components/brand/index.js'
export { tokens, ASSETS, ASSET_FILES, MIN_SIZES }

export const FRC5669DesignSystem = Object.freeze({
  namespace: tokens.NAMESPACE,
  version: tokens.VERSION,
  classPrefix: tokens.CLASS_PREFIX,
  ...core,
  ...brand,
  tokens,
  assets: { ASSETS, ASSET_FILES, MIN_SIZES },
})

export default FRC5669DesignSystem
