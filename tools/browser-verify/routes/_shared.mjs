/**
 * Values shared by more than one route file.
 *
 * A leading underscore marks this as infrastructure rather than a route spec:
 * the loader in `../routes.mjs` skips any `_`-prefixed file when it reads this
 * directory.
 */

/**
 * The two widths every route is driven at.
 *
 * 375 is the phone the check-in fast path is actually used on, standing in the
 * shop. 1440 is the laptop a mentor reads a board on and the wall display.
 * Measuring one and reasoning about the other is how a surface ships broken at
 * the width nobody opened.
 */
export const WIDTHS = [375, 1440];

/**
 * The console errors this app produces BY DESIGN in the harness's environment,
 * named individually rather than swept up by a blanket pattern.
 *
 * `.env.dsspec` points VITE_SUPABASE_URL at 127.0.0.1:54329, a port nothing
 * listens on, so the Supabase client's first call fails. That is documented in
 * `.env.dsspec` itself as the expected single console line. It is loopback, so
 * the harness's external-request block does not catch it and it arrives as a
 * real failed request.
 */
export const IGNORED_CONSOLE = [
  /net::ERR_CONNECTION_REFUSED/,
  /Failed to load resource: net::ERR_CONNECTION_REFUSED/,
  /127\.0\.0\.1:54329/,
];
