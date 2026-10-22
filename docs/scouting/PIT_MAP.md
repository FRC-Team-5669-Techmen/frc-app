# Pit map acceptance contract

Prepared October 21, 2026 before the map implementation. This is a Techmen navigation workflow, not an observed TideScout interface.

Source: [Nexus API v1.8.0](https://frc.nexus/api/v1/docs), `GET /event/{eventKey}/map`, and [Nexus pit-map guide](https://guides.frc.nexus/guides/pit-map). Documented geometry includes map size, address-keyed pits with optional team strings, areas, labels, arrows and walls. Each shape has position/size and optional angle. The published example establishes centered rectangles: a wall at x=10 with width=20 starts at x=0; the wall at x=420 with width=840 spans the whole 840-unit map. Rotation is applied about the supplied center. Exact parity of fonts/arrow artwork is unknown; the renderer is Techmen's.

| Action/state | Storage and permissions | Independent acceptance expectation |
| --- | --- | --- |
| Eligible scout downloads an event map | Read-only authenticated Edge adapter; existing eligibility RPC and event visibility; fixed Nexus endpoint with server-only key | Parent/revoked/anonymous callers cause no upstream request; students can read without manager rights; roster import remains manager-only |
| Search by team or pit address | Device view state only | A1 at (70,1020), size (100,100), has top-left (20,970); selecting 100 highlights A1, never an invented address |
| Navigate map | Bounded zoom, scroll, rotation; equivalent text directory | Areas, walls, labels and arrows retain source geometry; buttons work by keyboard; 375px view does not widen page |
| Offline/reload | IndexedDB member/event draft holds normalized geometry, provider key and fetched time; event export already includes drafts | Prepared map survives reload offline; a different account/event has no map; no first-load offline claim |
| Provider/schema/config/storage failure | Keep prior map and original time; explicit failure, never replace with an empty success | Missing map, malformed geometry, failed fetch and failed durable cache produce visible errors and leave prior data intact |
| Location contradiction | Show source map alongside the existing firsthand report; no automatic pit-report edit | A firsthand A12 report versus source A1 is flagged for checking; no silent reassignment |
| Freshness | Retrieval time remains visible; 24-hour warning is Techmen policy | Old/future/invalid timestamps warn; refreshing another key cannot relabel the old map |

Limits: geometry is a simplified venue guide, not a scale plan, accessible-route guarantee or live position. Source team assignments and scout corrections remain distinct. External staging/provider responses and actual phone usability require later field checks. Synthetic fixtures are derived from the published example and clearly labeled.

Provider-key correction: Nexus also documents `demo1234` and arbitrary offseason event keys. The map path accepts a single 2–64 character ASCII letter/digit/underscore/hyphen segment, excluding URLs, paths, query strings and fragments. This is a bounded Techmen subset of the provider's unspecified arbitrary-key space. The manager-only TBA roster path keeps its season-style validation. Unit and browser controls must demonstrate that a demo map works while the same key is refused for a TBA roster import.
