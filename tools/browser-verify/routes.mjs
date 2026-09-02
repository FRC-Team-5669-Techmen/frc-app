/**
 * Which routes `tools/browser-verify` drives, and what it measures on each.
 *
 * THE SPECS THEMSELVES LIVE UNDER `routes/`, ONE FILE PER ROUTE. This file
 * ASSEMBLES them at load time and is the pointer explaining why -- the same
 * split, for the same reason, as `docs/history/`: a single array that every
 * lane appends to at the same closing `];` is a shared write point two branches
 * touch on every unrelated pair of features.
 *
 * ONE FILE PER ROUTE, COLLISION-FREE BY CONSTRUCTION. A route's filename is
 * DERIVED from its own `path` (see `slugify`), never chosen or numbered -- a
 * session adding a route is by definition adding a distinct URL nothing else
 * answers on, so two lanes always produce two different filenames. A numbered
 * prefix would be the exact anti-pattern the history split rejected: two
 * parallel sessions both read 3 and both pick 4.
 *
 * ADDING A ROUTE: create `routes/<slug of your path>.mjs` exporting the spec as
 * its default export. See `routes/README.md` for the spec shape.
 *
 * WHAT IS DRIVABLE HERE AND WHAT IS NOT -- read this before adding a route.
 * This app has ONE route that renders without a Supabase session: `/_ds`, the
 * design-system specimen, which is dev-only and touches no auth and no
 * database. Everything else (`/dashboard`, `/jobs`, `/hours`, `/schedule`,
 * `/verify-hours`, ...) sits behind a real Google or OTP sign-in against a real
 * project, and there is no `/dev` route family and no fixture-mounting harness
 * in this repo to stand in for one. Past bundles reached those surfaces by
 * writing a throwaway harness that aliased `./supabase` to a stub, driving it,
 * and DELETING it afterwards -- which is why none of that verification can be
 * re-run today. Building the standing equivalent (a dev-only route family, or a
 * committed stub alias mode) is the work that would let this list grow; it is
 * named in `README.md` as the next step rather than half-started here.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export { WIDTHS } from './routes/_shared.mjs';

const ROUTES_DIR = new URL('./routes/', import.meta.url);

const slugify = (path) =>
  path
    .replace(/^\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function loadRoutes() {
  const files = readdirSync(fileURLToPath(ROUTES_DIR))
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();

  const entries = [];
  const seenPath = new Map();
  const seenSlug = new Map();
  for (const file of files) {
    const mod = await import(new URL(file, ROUTES_DIR));
    const spec = mod.default;
    if (!spec || typeof spec.path !== 'string') {
      throw new Error(`routes/${file} has no default export with a string \`path\``);
    }
    const slug = slugify(spec.path);
    /* The duplicate-path and slug-collision checks run BEFORE the
       filename-match check, and must: `slug` is a pure function of `spec.path`,
       so a file that passes the filename check is BY DEFINITION the unique file
       named `${slug}.mjs`, and no second file could also pass it for the same
       path. Checking duplicates afterwards would make both guards unreachable
       dead code. */
    if (seenPath.has(spec.path)) {
      throw new Error(`duplicate route path ${spec.path} in routes/${file} and routes/${seenPath.get(spec.path)}`);
    }
    seenPath.set(spec.path, file);
    if (seenSlug.has(slug)) {
      throw new Error(`slug collision "${slug}" between routes/${file} and routes/${seenSlug.get(slug)}`);
    }
    seenSlug.set(slug, file);
    const expected = file.slice(0, -'.mjs'.length);
    if (slug !== expected) {
      throw new Error(`routes/${file}: filename does not match its own path -- expected routes/${slug}.mjs for path ${spec.path}`);
    }
    entries.push({ file, order: mod.order, spec });
  }
  /* A file with a pinned `order` sorts first, by that number; everything else
     sorts after it, alphabetically by filename -- so a new route needs nobody
     to coordinate a position. */
  entries.sort((a, b) => {
    const ao = Number.isInteger(a.order) ? [0, a.order, ''] : [1, 0, a.file];
    const bo = Number.isInteger(b.order) ? [0, b.order, ''] : [1, 0, b.file];
    return ao[0] - bo[0] || ao[1] - bo[1] || String(ao[2]).localeCompare(String(bo[2]));
  });
  return entries.map((e) => e.spec);
}

export const ROUTES = await loadRoutes();

export function selectRoutes(filter) {
  if (!filter || filter.length === 0) return ROUTES;
  return ROUTES.filter((r) => filter.some((f) => r.path.includes(f) || (r.label ?? '').includes(f)));
}

/** The URL to visit for a spec (an aliased spec measures another state of one route). */
export const urlFor = (spec) => spec.aliasOf ?? spec.path;
