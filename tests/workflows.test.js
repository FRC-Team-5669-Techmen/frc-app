// THE WORKFLOW FILES, CHECKED FOR THE THINGS A YAML PARSER CANNOT SEE.
//
// WRITTEN BECAUSE PARSING WAS NOT ENOUGH AND THE FAILURE WAS NEARLY SILENT.
// `deploy.yml` was validated with PyYAML, committed, and pushed. GitHub then
// produced a run named `.github/workflows/deploy.yml` -- the FILE'S PATH, not
// its `name:` -- triggered by `push`, on a workflow that declares only
// `workflow_dispatch`, completed as `failure`, with no job and no log to read.
// That is what an INVALID workflow file looks like from the outside, and none
// of those signals says "invalid" in words.
//
// The cause: a shell comment inside a `run:` block containing an EMPTY
// expression interpolation, written to illustrate the injection risk it was
// warning about. GitHub evaluates expressions inside `run:` regardless of the
// `#` in front of them, and an empty one does not parse, so the whole file was
// rejected. The identical sentence in `integrate.yml` was a YAML comment rather
// than shell text, so it never reached the expression parser and that file was
// fine -- which is exactly the kind of distinction a person re-reading their own
// diff does not make.
//
// WHAT THIS CAN AND CANNOT SEE: it is not GitHub's validator and must not
// pretend to be. It checks the shapes that have actually bitten, plus the
// invariants this repo's workflows are required to hold. A workflow that passes
// here can still be rejected by GitHub for something nobody has hit yet.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

const DIR = fileURLToPath(new URL('../.github/workflows/', import.meta.url))
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
const read = (f) => readFileSync(join(DIR, f), 'utf8')
const doc = (f) => parse(read(f))

/** Every `${{ ... }}` in every step's `run:` block, with its step for the message. */
function runInterpolations(workflow) {
  const out = []
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      const src = step.run
      if (typeof src !== 'string') continue
      for (const m of src.matchAll(/\$\{\{(.*?)\}\}/gs)) {
        out.push({ jobId, step: step.name ?? step.uses ?? '(unnamed)', expr: m[1] })
      }
    }
  }
  return out
}

describe('the workflow files parse and are shaped as GitHub expects', () => {
  test('there are workflows to check', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(3)
    expect(FILES).toEqual(expect.arrayContaining(['ci.yml', 'integrate.yml', 'deploy.yml']))
  })

  test.each(FILES)('%s parses, and declares a name, a trigger and a job', (f) => {
    const d = doc(f)
    expect(d, `${f} did not parse`).toBeTruthy()
    expect(typeof d.name, `${f} has no name:, so GitHub would list it by path`).toBe('string')
    // `on:` is YAML 1.1's boolean `true` under some parsers. The `yaml` package
    // used here is 1.2 and keeps it a string, but accept either rather than
    // depending on which spec version a future dependency bump follows.
    const on = d.on ?? d[true]
    expect(on, `${f} declares no trigger`).toBeTruthy()
    expect(Object.keys(d.jobs ?? {}).length, `${f} declares no job`).toBeGreaterThan(0)
  })

  test.each(FILES)('%s has no EMPTY expression interpolation in any run: block', (f) => {
    const empty = runInterpolations(doc(f)).filter((x) => x.expr.trim() === '')
    expect(
      empty,
      `an empty \${{ }} in a run: block makes the whole file invalid to GitHub, even inside a shell comment. In ${f}: ${empty.map((x) => x.step).join(', ')}`,
    ).toEqual([])
  })

  test.each(FILES)('%s interpolates only recognisable contexts in run: blocks', (f) => {
    // Not GitHub's grammar -- a floor. Every expression this repo writes starts
    // with one of these contexts, so anything else is a typo or a stray brace
    // rather than a considered use, and is worth a human look.
    const KNOWN = /^(github|env|vars|secrets|inputs|steps|job|jobs|runner|needs|matrix|strategy)\b/
    const odd = runInterpolations(doc(f)).filter((x) => !KNOWN.test(x.expr.trim()))
    expect(odd.map((x) => `${x.step}: \${{${x.expr}}}`), `unrecognised expression context in ${f}`).toEqual([])
  })
})

describe('POSITIVE CONTROLS: the scanner catches what it claims to', () => {
  // The real files are correct, so a green run above says nothing on its own
  // about whether this scanner works. These drive it over synthetic workflows
  // carrying exactly the defects it exists to find.
  const withRun = (run) => ({ name: 'X', on: { push: null }, jobs: { j: { steps: [{ name: 'S', run }] } } })

  test('an empty interpolation in a shell comment IS found', () => {
    const w = withRun('set -e\n# a comment mentioning ${{ }} in passing\necho hi\n')
    const empty = runInterpolations(w).filter((x) => x.expr.trim() === '')
    expect(empty).toHaveLength(1)
    expect(empty[0].step).toBe('S')
  })

  test('the exact text that broke deploy.yml IS found', () => {
    const w = withRun('# dispatch input is text a person types and `${{ }}` pastes it into\n# the shell before bash sees a quote.\n')
    expect(runInterpolations(w).filter((x) => x.expr.trim() === '')).toHaveLength(1)
  })

  test('a legitimate interpolation is NOT flagged', () => {
    const w = withRun('echo "${{ github.sha }}"\n')
    expect(runInterpolations(w).filter((x) => x.expr.trim() === '')).toEqual([])
    expect(runInterpolations(w)).toHaveLength(1)
  })

  test('a shell parameter expansion is not mistaken for one', () => {
    // `${VAR:-default}` and `${SHA:0:7}` are shell, not GitHub, and the scanner
    // must not see them -- otherwise every summary step in this repo trips it.
    const w = withRun('echo "${MERGED:-no}" "${SOURCE_SHA:0:7}"\n')
    expect(runInterpolations(w)).toEqual([])
  })

  test('an unrecognised context IS flagged', () => {
    const KNOWN = /^(github|env|vars|secrets|inputs|steps|job|jobs|runner|needs|matrix|strategy)\b/
    const w = withRun('echo "${{ nonsense.value }}"\n')
    expect(runInterpolations(w).filter((x) => !KNOWN.test(x.expr.trim()))).toHaveLength(1)
  })
})

describe('the invariants these particular workflows have to hold', () => {
  test('integrate.yml can never write to the deploy branch', () => {
    const src = read('integrate.yml')
    // Both halves: the target is `integration`, and the refusal that fails the
    // job if a future edit ever repoints it is still present.
    expect(src).toMatch(/TARGET=integration/)
    expect(src).toMatch(/refusing to run: this workflow may never write to the deploy branch/)
    expect(src).not.toMatch(/git push origin main/)
  })

  test('integrate.yml keys on a CI workflow file that exists', () => {
    const m = /CI_WORKFLOW_FILE:\s*(\S+)/.exec(read('integrate.yml'))
    expect(m, 'integrate.yml names no CI_WORKFLOW_FILE').toBeTruthy()
    expect(FILES, `integrate.yml keys on ${m[1]}, which is not in .github/workflows/`).toContain(m[1])
    // And that file must be the one whose `name:` the workflow_run trigger waits on.
    const d = doc('integrate.yml')
    const on = d.on ?? d[true]
    expect(on.workflow_run.workflows).toContain(doc(m[1]).name)
  })

  test('integrate.yml only acts on a push-triggered CI run from this repo', () => {
    const cond = doc('integrate.yml').jobs.integrate.if
    expect(cond).toMatch(/workflow_run\.event == 'push'/)
    expect(cond).toMatch(/conclusion == 'success'/)
    expect(cond).toMatch(/head_repository\.full_name == github\.repository/)
  })

  test('deploy.yml is dispatch-only and requires a typed confirmation', () => {
    const d = doc('deploy.yml')
    const on = d.on ?? d[true]
    expect(Object.keys(on)).toEqual(['workflow_dispatch'])
    expect(on.workflow_dispatch.inputs.confirm.required).toBe(true)
    expect(read('deploy.yml')).toMatch(/!= "DEPLOY"/)
  })

  test('no workflow force-pushes anything', () => {
    for (const f of FILES) {
      expect(read(f), `${f} force-pushes`).not.toMatch(/push[^\n]*--force(?!-with-lease="refs)/)
    }
  })

  test('POSITIVE CONTROL: that force-push pattern does match a real force-push', () => {
    const bad = 'git push origin --force main'
    expect(/push[^\n]*--force(?!-with-lease="refs)/.test(bad)).toBe(true)
    // and does NOT match integrate.yml's lease-pinned branch DELETE, which is
    // the one legitimate use of the flag in this repo.
    const ok = 'git push origin --force-with-lease="refs/heads/$b:$s" ":refs/heads/$b"'
    expect(/push[^\n]*--force(?!-with-lease="refs)/.test(ok)).toBe(false)
  })

  test('ci.yml runs the five gates, and every one is a real npm script', () => {
    const steps = doc('ci.yml').jobs.test.steps.map((s) => s.run).filter(Boolean).join('\n')
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    for (const script of ['build', 'test', 'ds:audit', 'discord:calendar:test', 'history:verify']) {
      expect(steps, `ci.yml does not run npm run ${script}`).toContain(script === 'test' ? 'npm test' : `npm run ${script}`)
      expect(pkg.scripts, `package.json has no "${script}" script`).toHaveProperty(script)
    }
  })

  test('ci.yml fails the job when any continue-on-error step failed', () => {
    const steps = doc('ci.yml').jobs.test.steps
    const gated = steps.filter((s) => s.id && s['continue-on-error'] === true)
    const final = steps.at(-1)
    expect(gated.length).toBeGreaterThanOrEqual(5)
    for (const s of gated) {
      expect(final.run, `the final step never inspects steps.${s.id}.outcome`).toContain(`steps.${s.id}.outcome`)
    }
  })
})
