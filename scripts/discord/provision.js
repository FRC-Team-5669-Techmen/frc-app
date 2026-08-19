#!/usr/bin/env node
/**
 * FRC 5669 Techmen - Discord server provisioning
 * ------------------------------------------------------------------
 * Takes the guild from empty to fully configured in one run.
 *
 * SERVER_SPEC.md is the source of truth. This script PARSES that markdown
 * at runtime - the role table, every channel permission matrix, the safety
 * section and the onboarding questions - so editing the spec changes the
 * plan. Nothing structural is hardcoded here.
 *
 * What IS hardcoded is vocabulary translation only:
 *   colour words       -> hex        (COLOR_WORDS)
 *   permission phrases -> bitfields  (PERMISSION_PHRASES)
 *   V / S / -          -> overwrites (cellOverwrite)
 * Each of those fails loudly on an unknown token, so a spec edit that
 * introduces a new word errors instead of being silently dropped.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local scripts/discord/provision.js
 *   node --env-file-if-exists=.env.local scripts/discord/provision.js --apply
 *   node scripts/discord/provision.js --offline    # plan vs empty guild, no API
 *
 * See README.md in this directory.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST } from '@discordjs/rest';
import {
  PermissionFlagsBits,
  Routes,
  ChannelType,
  GuildVerificationLevel,
  GuildExplicitContentFilter,
  GuildFeature,
  GuildOnboardingMode,
  GuildOnboardingPromptType,
  AutoModerationRuleTriggerType,
  AutoModerationRuleEventType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  OverwriteType,
} from 'discord-api-types/v10';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(HERE, 'SERVER_SPEC.md');

/* ==================================================================
 * 0. CLI
 * ================================================================== */

const argv = process.argv.slice(2);
const FLAGS = {
  apply: argv.includes('--apply'),
  offline: argv.includes('--offline'),
  verbose: argv.includes('--verbose') || argv.includes('-v'),
  help: argv.includes('--help') || argv.includes('-h'),
  // Offline idempotency harness: dump the state a run would leave behind,
  // then feed it back in. A second run over it must report zero changes.
  dumpState: (argv.find((a) => a.startsWith('--dump-state=')) ?? '').split('=')[1] || null,
  loadState: (argv.find((a) => a.startsWith('--state=')) ?? '').split('=')[1] || null,
};

const HELP = `
provision.js - build the FRC 5669 Techmen Discord server from SERVER_SPEC.md

  (no flags)   dry run against the live guild. Prints the plan, writes nothing.
  --apply      actually create/patch the guild. Required to write.
  --offline    plan against a simulated empty guild. No token, no API calls.
  --verbose    print per-item detail for skipped items too.
  --help       this text.

  --dump-state=FILE  with --offline, write the guild state this run would
                     leave behind.
  --state=FILE       with --offline, start from that state instead of an
                     empty guild. Used to prove idempotency without a guild:
                     a run over a dumped state must report zero changes.

Environment (process.env, or .env.local loaded via node --env-file):
  DISCORD_BOT_TOKEN   bot token; the bot needs Administrator in the guild
  DISCORD_GUILD_ID    the target guild id
`;

/* ==================================================================
 * 1. Vocabulary maps - the only hardcoded knowledge
 * ================================================================== */

// Discord's own default role colour swatches. The spec supplies the word,
// this supplies the hex. Change a value here to restyle.
const COLOR_WORDS = {
  gold: 0xf1c40f,
  red: 0xe74c3c,
  blue: 0x3498db,
  orange: 0xe67e22,
  gray: 0x95a5a6,
  grey: 0x95a5a6,
  green: 0x2ecc71,
  purple: 0x9b59b6,
  teal: 0x1abc9c,
  default: 0x000000, // 0 = no colour, inherits
};

const P = PermissionFlagsBits;

// Phrases exactly as they appear in the spec's "Key permissions" column.
// null contributes no guild-level bits.
const PERMISSION_PHRASES = {
  administrator: P.Administrator,
  'manage messages': P.ManageMessages,
  'moderate members (timeout)': P.ModerateMembers,
  'moderate members': P.ModerateMembers,
  kick: P.KickMembers,
  'kick members': P.KickMembers,
  'manage nicknames': P.ManageNicknames,
  'create invite': P.CreateInstantInvite,
  'manage threads': P.ManageThreads,
  // Discord has no separate pin permission - pinning IS Manage Messages.
  'pin messages': P.ManageMessages,
  // Access-only roles. All reach comes from channel overwrites by design:
  // "Access is decided entirely by Student, Parent, Alumni, and Mentor."
  'none, access tag only': null,
  'none, tag only': null,
  none: null,
  'base access': null,
  'limited access': null,
  'logistics only': null,
  'scoped per bot': null,
};

// The spec reserves these to the top role. Parsed roles are asserted
// against the bitfield so a spec edit cannot quietly widen someone.
const RESERVED_PHRASES = [
  'Administrator', 'Manage Server', 'Manage Roles',
  'Manage Channels', 'Ban Members', 'Manage Webhooks',
];
const RESERVED_BITS =
  P.Administrator | P.ManageGuild | P.ManageRoles |
  P.ManageChannels | P.BanMembers | P.ManageWebhooks;

/**
 * One matrix cell -> {allow, deny} for one role on one channel.
 *   S = can view and send    V = can view and read    - = cannot see it exists
 *
 * Text S carries the participation bits a channel is useless without
 * (attach, embed, react, threads). Text V explicitly denies every send path
 * and deliberately leaves AddReactions inherited - reacting to an
 * announcement is normal. See "Ambiguities" in README.md.
 * Voice V allows view but denies Connect, which is how Meeting Room ends up
 * visible-but-unjoinable.
 */
function cellOverwrite(cell, isVoice) {
  if (isVoice) {
    switch (cell) {
      case 'S':
        return { allow: P.ViewChannel | P.Connect | P.Speak | P.UseVAD | P.Stream, deny: 0n };
      case 'V':
        return { allow: P.ViewChannel, deny: P.Connect };
      case '-':
        return { allow: 0n, deny: P.ViewChannel };
      default:
        throw new Error(`Unknown matrix cell "${cell}"`);
    }
  }
  switch (cell) {
    case 'S':
      return {
        allow:
          P.ViewChannel | P.ReadMessageHistory | P.SendMessages |
          P.SendMessagesInThreads | P.CreatePublicThreads | P.AddReactions |
          P.AttachFiles | P.EmbedLinks | P.UseExternalEmojis | P.UseApplicationCommands,
        deny: 0n,
      };
    case 'V':
      return {
        allow: P.ViewChannel | P.ReadMessageHistory,
        deny:
          P.SendMessages | P.SendMessagesInThreads |
          P.CreatePublicThreads | P.CreatePrivateThreads,
      };
    case '-':
      return { allow: 0n, deny: P.ViewChannel };
    default:
      throw new Error(`Unknown matrix cell "${cell}"`);
  }
}

// Restrictiveness order. Used to choose a category baseline and to break
// ties toward the safer (fail-closed) side.
const CELL_RANK = { '-': 0, V: 1, S: 2 };

const VERIFICATION_WORDS = {
  none: GuildVerificationLevel.None,
  low: GuildVerificationLevel.Low,
  medium: GuildVerificationLevel.Medium,
  high: GuildVerificationLevel.High,
  'very high': GuildVerificationLevel.VeryHigh,
  highest: GuildVerificationLevel.VeryHigh,
};

// Community enablement is rejected below these thresholds, which is why
// phase 1 runs before phase 3.
const COMMUNITY_MIN_VERIFICATION = GuildVerificationLevel.Low;
const COMMUNITY_REQUIRED_FILTER = GuildExplicitContentFilter.AllMembers;

// Named permission bits, for readable diff output.
const PERM_NAMES = Object.entries(P).map(([k, v]) => [k, v]);
function describeBits(bits) {
  if (bits === 0n) return 'none';
  const out = [];
  for (const [name, bit] of PERM_NAMES) if ((bits & bit) === bit) out.push(name);
  return out.join(', ') || `0x${bits.toString(16)}`;
}

/* ==================================================================
 * 2. Spec parser
 * ================================================================== */

function readSpecLines() {
  try {
    return readFileSync(SPEC_PATH, 'utf8').split(/\r?\n/);
  } catch (err) {
    throw new Error(`Cannot read ${SPEC_PATH}: ${err.message}`);
  }
}

/** Lines under "## <n>. <title>", up to the next "## ". */
function section(lines, heading) {
  const re = new RegExp(`^##\\s+\\d+\\.\\s+${heading}`, 'i');
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) throw new Error(`Spec section not found: ${heading}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end);
}

function splitRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

/** Reads the first markdown table in `lines` at or after `from`. */
function readTable(lines, from = 0) {
  let i = from;
  while (i < lines.length && !/^\s*\|/.test(lines[i])) i++;
  if (i >= lines.length) return null;
  const header = splitRow(lines[i]);
  i++;
  if (i < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) i++;
  const rows = [];
  while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
  return { header, rows, end: i };
}

const stripMd = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();

function parseServerName(lines) {
  const sec = section(lines, 'Setup order');
  const m = /Name it\s+`([^`]+)`/i.exec(sec.join('\n'));
  return m ? m[1].trim() : null;
}

function parseRoles(lines) {
  const sec = section(lines, 'Roles');
  const table = readTable(sec);
  if (!table) throw new Error('Spec section 3: role table not found');

  const col = (name) => {
    const i = table.header.findIndex((h) => h.toLowerCase() === name);
    if (i === -1) throw new Error(`Role table has no "${name}" column`);
    return i;
  };
  const cName = col('role');
  const cColor = col('color');
  const cPerms = col('key permissions');

  const roles = table.rows
    .filter((r) => r[cName] && !/^-+$/.test(r[cName]))
    .map((r, idx) => {
      const name = stripMd(r[cName]);
      const colorWord = stripMd(r[cColor]).toLowerCase();
      if (!(colorWord in COLOR_WORDS)) {
        throw new Error(`Role "${name}": unknown colour "${colorWord}". Add it to COLOR_WORDS.`);
      }
      const permText = stripMd(r[cPerms]);

      let bits = 0n;
      const whole = permText.toLowerCase();
      if (whole in PERMISSION_PHRASES) {
        // Whole-cell phrases like "None, access tag only" contain a comma.
        bits = PERMISSION_PHRASES[whole] ?? 0n;
      } else {
        for (const piece of permText.split(',')) {
          const key = piece.trim().toLowerCase();
          if (!key) continue;
          if (!(key in PERMISSION_PHRASES)) {
            throw new Error(
              `Role "${name}": unknown permission phrase "${piece.trim()}". ` +
              'Add it to PERMISSION_PHRASES.',
            );
          }
          bits |= PERMISSION_PHRASES[key] ?? 0n;
        }
      }

      return {
        name,
        colorWord,
        color: COLOR_WORDS[colorWord],
        permissions: bits,
        permText,
        // Rank 1 is top of the spec's list. Discord positions run the other
        // way, so this is inverted when the payload is built.
        rank: idx + 1,
        // hoist/mentionable are filled in by classifyRoles() once the
        // channel matrix is parsed - the spec never states them directly.
        mentionable: false,
        hoist: false,
      };
    });

  for (const r of roles) {
    if (r.rank === 1) continue;
    if ((r.permissions & RESERVED_BITS) !== 0n) {
      throw new Error(
        `Role "${r.name}" parsed with a permission the spec reserves to the top ` +
        `role (${RESERVED_PHRASES.join(', ')}).`,
      );
    }
  }
  if (!roles.length) throw new Error('Spec section 3: no roles parsed');
  return roles;
}

/** "#bom-and-orders" -> "bom-and-orders";  "General VC" -> "general-vc" */
function normalizeChannelName(label) {
  return label
    .replace(/^#/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseChannelMatrix(lines, roleNames) {
  const sec = section(lines, 'Channels and permission matrix');
  const categories = [];

  for (let i = 0; i < sec.length; i++) {
    const m = /^###\s+(.+?)\s*$/.exec(sec[i]);
    if (!m) continue;
    const catName = stripMd(m[1]);

    let end = sec.length;
    for (let j = i + 1; j < sec.length; j++) {
      if (/^###\s/.test(sec[j])) { end = j; break; }
    }
    const body = sec.slice(i + 1, end);
    const table = readTable(body);
    const prose = body
      .filter((l) => l.trim() && !/^\s*\|/.test(l) && !/^\s*-{3,}\s*$/.test(l))
      .join(' ')
      .trim();

    if (!table) {
      // ARCHIVE: no table, prose states the rule for every role.
      if (/read-only for every role/i.test(prose)) {
        const roleCols = roleNames.filter((n) => ROLE_IS_AUDIENCE.has(n));
        categories.push({ name: catName, roleCols, channels: [], note: prose, proseCell: 'V' });
      }
      continue;
    }

    const roleCols = table.header.slice(1).map(stripMd);
    for (const rn of roleCols) {
      if (!roleNames.includes(rn)) {
        throw new Error(`Category "${catName}": matrix column "${rn}" is not a role in section 3.`);
      }
    }

    const channels = [];
    for (const row of table.rows) {
      const label = stripMd(row[0]);
      if (!label) continue;
      // The spec's own notation decides the type: "#name" is text, anything
      // else (General VC, Meeting Room) is voice.
      const isVoice = !label.startsWith('#');
      const perms = {};
      roleCols.forEach((rn, k) => {
        const cell = stripMd(row[k + 1]).toUpperCase();
        if (!(cell in CELL_RANK)) {
          throw new Error(`Channel "${label}" / role "${rn}": unreadable cell "${row[k + 1]}".`);
        }
        perms[rn] = cell;
      });
      channels.push({ label, name: normalizeChannelName(label), isVoice, perms });
    }
    categories.push({ name: catName, roleCols, channels, note: prose || null });
  }

  if (!categories.length) throw new Error('Spec section 4: no categories parsed');
  return categories;
}

// The four audiences the matrix columns are drawn from. Used only to give
// the table-less ARCHIVE category a role set.
const ROLE_IS_AUDIENCE = new Set(['Student', 'Parent', 'Alumni', 'Mentor']);

/**
 * Section 3's mention rule:
 *   "Mention `@everyone` outside #announcements. Turn this off for
 *    `@everyone` at the server level and grant it only to Mentor in that
 *    one channel."
 */
function parseMentionRule(lines) {
  const text = section(lines, 'Roles').join(' ');
  const chan = /Mention\s+`?@everyone`?\s+outside\s+#([a-z0-9-]+)/i.exec(text);
  const role = /grant it only to\s+\*{0,2}([A-Za-z][A-Za-z /]*?)\*{0,2}\s+in that one channel/i.exec(text);
  if (!chan || !role) return null;
  return { channel: chan[1], role: role[1].trim() };
}

/** Guild-level @everyone denies, derived from sections 2 and 3. */
function parseEveryoneDenies(lines, mentionRule) {
  const all = lines.join('\n');
  const denies = [];
  if (/`@everyone`[^\n]*View Channels\s+\*{0,2}OFF/i.test(all)) {
    denies.push({ bit: P.ViewChannel, why: 'section 2 step 4: @everyone View Channels OFF' });
  }
  if (mentionRule) {
    denies.push({
      bit: P.MentionEveryone,
      why: `section 3: Mention @everyone off at server level, granted to ${mentionRule.role} in #${mentionRule.channel} only`,
    });
  }
  if (!denies.length) throw new Error('Spec: no @everyone guild-level denies found');
  return denies;
}

function parseSafety(lines) {
  const sec = section(lines, 'Safety configuration');
  const text = sec.join('\n');

  const vm = /verification level:\s*([a-z ]+?)\s*[.*]/i.exec(text);
  if (!vm) throw new Error('Spec section 5: verification level not found');
  const vWord = vm[1].trim().toLowerCase();
  if (!(vWord in VERIFICATION_WORDS)) throw new Error(`Unknown verification level "${vWord}"`);

  if (!/explicit media content filter:\s*scan messages from all members/i.test(text)) {
    throw new Error(
      'Spec section 5: explicit media content filter line changed. Community ' +
      'enablement requires "scan messages from all members".',
    );
  }

  const startIdx = sec.findIndex((l) => /automod rules to enable/i.test(l));
  if (startIdx === -1) throw new Error('Spec section 5: AutoMod bullet list not found');
  const bullets = [];
  for (let i = startIdx + 1; i < sec.length; i++) {
    const l = sec[i];
    if (!l.trim()) continue;
    if (/^\s{2,}-\s/.test(l)) { bullets.push(l.trim().replace(/^-\s*/, '')); continue; }
    break; // dedent or prose ends the sub-list
  }
  if (!bullets.length) throw new Error('Spec section 5: no AutoMod sub-bullets parsed');

  return {
    verificationWord: vWord,
    verificationLevel: VERIFICATION_WORDS[vWord],
    explicitContentFilter: COMMUNITY_REQUIRED_FILTER,
    rules: bullets.map(parseAutoModBullet),
    inviteMentorOnly: /create invite permission granted to mentor only/i.test(text),
    requires2fa: /require 2fa for moderation actions:\s*\*{0,2}on/i.test(text),
    dmSpam: /dm spam filter:\s*\*{0,2}on/i.test(text),
    noNsfw: /no nsfw channels, ever/i.test(text),
  };
}

function parseAutoModBullet(bullet) {
  const clean = bullet.replace(/\*\*/g, '').trim();
  const head = clean.split(/\.\s*Action/i)[0];
  const actionText = /action:\s*([^.]*)/i.exec(clean)?.[1] ?? '';
  const blockMessage = /block message/i.test(actionText);
  const alertChannel = /alert\s+#([a-z0-9-]+)/i.exec(actionText)?.[1] ?? null;

  let trigger;
  let metadata;
  let name;

  if (/commonly flagged words/i.test(head)) {
    trigger = AutoModerationRuleTriggerType.KeywordPreset;
    metadata = {
      presets: [
        AutoModerationRuleKeywordPresetType.Profanity,
        AutoModerationRuleKeywordPresetType.SexualContent,
        AutoModerationRuleKeywordPresetType.Slurs,
      ],
      allow_list: [],
    };
    name = 'Block commonly flagged words';
  } else if (/mention spam/i.test(head)) {
    const t = /threshold\s+(\d+)/i.exec(head);
    if (!t) throw new Error(`AutoMod mention-spam bullet has no threshold: "${head}"`);
    trigger = AutoModerationRuleTriggerType.MentionSpam;
    metadata = { mention_total_limit: Number(t[1]), mention_raid_protection_enabled: false };
    name = 'Block mention spam';
  } else if (/spam content/i.test(head)) {
    trigger = AutoModerationRuleTriggerType.Spam;
    metadata = {};
    name = 'Block spam content';
  } else if (/custom keyword/i.test(head)) {
    const kws = [...clean.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    if (!kws.length) throw new Error(`Custom keyword bullet has no backticked keywords: "${head}"`);
    trigger = AutoModerationRuleTriggerType.Keyword;
    metadata = {
      // Wildcards so a match survives being embedded in a longer URL.
      keyword_filter: kws.map((k) => `*${k}*`),
      regex_patterns: [],
      allow_list: [],
    };
    name = 'Block invite links';
  } else {
    throw new Error(`AutoMod bullet not recognised: "${head}". Extend parseAutoModBullet().`);
  }

  return { name, trigger, metadata, blockMessage, alertChannel, source: clean };
}

function parseOnboarding(lines) {
  const sec = section(lines, 'Onboarding');
  const prompts = [];
  for (let i = 0; i < sec.length; i++) {
    const m = /^\*\*Question\s+\d+\s*-\s*"(.+?)"\*\*\s*\((.+?)\)/.exec(sec[i].trim());
    if (!m) continue;
    const [, title, modifiers] = m;
    const options = [];
    for (let j = i + 1; j < sec.length; j++) {
      if (/^\*\*Question\s/.test(sec[j].trim())) break;
      const om = /^-\s+(.*)$/.exec(sec[j].trim());
      if (om) options.push(parseOnboardingOption(om[1].trim()));
    }
    if (!options.length) throw new Error(`Onboarding question "${title}" has no options`);
    prompts.push({
      title,
      singleSelect: /single[- ]select/i.test(modifiers),
      required: !/optional/i.test(modifiers),
      options,
    });
  }
  if (!prompts.length) throw new Error('Spec section 7: no onboarding questions parsed');

  const forbidden = /do not add a self-select question for ([^.]+)\./i.exec(sec.join(' '));
  return {
    prompts,
    forbidden: forbidden
      ? forbidden[1].split(/,|\bor\b/).map((s) => s.trim()).filter(Boolean)
      : [],
  };
}

function parseOnboardingOption(text) {
  // "Mechanical - fabrication, assembly, mechanisms"
  const dash = text.indexOf(' - ');
  if (dash !== -1) {
    return { title: text.slice(0, dash).trim(), description: text.slice(dash + 3).trim() };
  }
  // "I want to try everything. Assigns no role. Mentors follow up."
  // No separator: first sentence is the title (Discord caps it at 50), the
  // rest becomes the description.
  const dot = text.indexOf('. ');
  if (dot !== -1) {
    return { title: text.slice(0, dot + 1).trim(), description: text.slice(dot + 2).trim() };
  }
  return { title: text.trim(), description: '' };
}

/**
 * The spec never states hoist or mentionable, so both are derived from what
 * it DOES state:
 *   hoist       - the role decides access (it is a column in the section 4
 *                 matrix) or it carries guild permissions. Those are the
 *                 roles worth separating in the member list.
 *   mentionable - everything else, i.e. the tag roles, which exist for
 *                 exactly this: "so a mentor can ping @Programming without
 *                 pinging sixty people" (section 3).
 * Both are listed in README.md as spec-silent judgement calls.
 */
function classifyRoles(roles, categories) {
  const matrixRoles = new Set(categories.flatMap((c) => c.roleCols));
  for (const r of roles) {
    const decidesAccess = matrixRoles.has(r.name) || r.permissions !== 0n;
    r.hoist = decidesAccess;
    r.mentionable = !decidesAccess;
  }
  return roles;
}

function parseSpec() {
  const lines = readSpecLines();
  const roles = parseRoles(lines);
  const roleNames = roles.map((r) => r.name);
  const mentionRule = parseMentionRule(lines);
  const categories = parseChannelMatrix(lines, roleNames);
  classifyRoles(roles, categories);
  return {
    serverName: parseServerName(lines),
    roles,
    roleNames,
    categories,
    mentionRule,
    everyoneDenies: parseEveryoneDenies(lines, mentionRule),
    safety: parseSafety(lines),
    onboarding: parseOnboarding(lines),
  };
}

/* ==================================================================
 * 3. Derived plan shape
 * ================================================================== */

/**
 * Category baseline per role: the modal cell across the category's
 * channels, tie-broken toward the more restrictive value. Channels whose
 * final desired bits equal the baseline get no overwrite at all and stay
 * synced to the category; only the differences are written.
 */
function categoryBaseline(cat) {
  const baseline = {};
  for (const role of cat.roleCols) {
    if (cat.proseCell) { baseline[role] = cat.proseCell; continue; }
    const counts = { '-': 0, V: 0, S: 0 };
    for (const ch of cat.channels) counts[ch.perms[role]]++;
    let best = '-';
    for (const cell of ['-', 'V', 'S']) {
      if (counts[cell] > counts[best]) best = cell; // strict > keeps the tie restrictive
    }
    baseline[role] = best;
  }
  return baseline;
}

/**
 * Extra bits a specific channel grants a specific role beyond its cell.
 * Today that is only the section 3 mention rule.
 */
function channelExtras(spec, channelName, roleName) {
  const r = spec.mentionRule;
  if (r && r.channel === channelName && r.role === roleName) {
    return { allow: P.MentionEveryone, deny: 0n, why: 'section 3 mention rule' };
  }
  return null;
}

function sameOw(a, b) {
  return a.allow === b.allow && a.deny === b.deny;
}

function buildDesired(spec) {
  const cats = [];
  for (const cat of spec.categories) {
    const baseline = categoryBaseline(cat);

    // Category overwrites: baseline cell for each role, computed against a
    // text channel (categories carry both text and voice bits; Discord
    // stores whatever we send and children inherit the relevant ones).
    const catOw = {};
    for (const role of cat.roleCols) {
      const anyVoice = cat.channels.length > 0 && cat.channels.every((c) => c.isVoice);
      const ow = cellOverwrite(baseline[role], anyVoice);
      catOw[role] = { allow: ow.allow, deny: ow.deny };
    }

    const channels = cat.channels.map((ch) => {
      const own = {};
      for (const role of cat.roleCols) {
        const base = cellOverwrite(ch.perms[role], ch.isVoice);
        const extra = channelExtras(spec, ch.name, role);
        const desired = {
          allow: base.allow | (extra?.allow ?? 0n),
          deny: base.deny & ~(extra?.allow ?? 0n),
        };
        // Emit only where the channel differs from what it would inherit.
        if (!sameOw(desired, catOw[role])) {
          own[role] = { ...desired, cell: ch.perms[role], extra: extra?.why ?? null };
        }
      }
      return { ...ch, overwrites: own, synced: Object.keys(own).length === 0 };
    });

    cats.push({ ...cat, baseline, catOverwrites: catOw, channels });
  }
  return cats;
}

/* ==================================================================
 * 4. REST layer - 429 handling keyed to retry_after
 * ================================================================== */

let rest = null;
let rateLimitHits = 0;

function makeRest(token) {
  const client = new REST({ version: '10', retries: 5 }).setToken(token);
  // @discordjs/rest already parks on the bucket's retry_after rather than a
  // fixed delay. Surface it so a long run is legible.
  client.on('rateLimited', (info) => {
    rateLimitHits++;
    warn(
      `rate limited: waiting ${Math.ceil(info.timeToReset)}ms ` +
      `(${info.global ? 'global' : 'bucket'} ${info.route})`,
    );
  });
  return client;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Outer guard for 429s the REST client re-throws (global/Cloudflare limits
 * and exhausted retries). Waits the retry_after the API returned, never a
 * fixed delay.
 */
async function call(fn, label) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status ?? err?.code;
      const retryAfterMs =
        typeof err?.retryAfter === 'number'
          ? err.retryAfter // @discordjs/rest RateLimitError: ms
          : typeof err?.rawError?.retry_after === 'number'
            ? err.rawError.retry_after * 1000 // raw API body: seconds
            : null;
      if (status === 429 && retryAfterMs != null && attempt < 8) {
        rateLimitHits++;
        warn(`429 on ${label}: honouring retry_after ${Math.ceil(retryAfterMs)}ms`);
        await sleep(retryAfterMs + 250);
        continue;
      }
      err.message = `${label}: ${err.message}`;
      throw err;
    }
  }
}

/* ==================================================================
 * 5. Reporting
 * ================================================================== */

const RESULT = {
  phases: [],
  created: [], // everything actually written, for the failure report
  unmanaged: [],
  notes: [],
};

let currentPhase = null;

function phase(n, title) {
  currentPhase = { n, title, create: 0, update: 0, skip: 0, lines: [], unmanaged: [] };
  RESULT.phases.push(currentPhase);
  out('');
  out(`${'='.repeat(72)}`);
  out(`PHASE ${n}  ${title}`);
  out(`${'='.repeat(72)}`);
  return currentPhase;
}

function act(kind, label, detail) {
  currentPhase[kind]++;
  const tag = { create: 'CREATE', update: 'UPDATE', skip: 'SKIP  ' }[kind];
  if (kind === 'skip' && !FLAGS.verbose) return;
  out(`  ${tag}  ${label}${detail ? `\n           ${detail.replace(/\n/g, '\n           ')}` : ''}`);
}

function unmanaged(label) {
  currentPhase.unmanaged.push(label);
  RESULT.unmanaged.push(label);
  out(`  UNMANAGED  ${label}`);
}

const out = (s = '') => console.log(s);
const warn = (s) => console.log(`  !  ${s}`);
function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exitCode = 1;
}

/* ==================================================================
 * 6. Guild state
 * ================================================================== */

// A plausible new-guild @everyone permission set, so --offline shows the
// deny as an update rather than a no-op.
const OFFLINE_EVERYONE_PERMS =
  P.CreateInstantInvite | P.AddReactions | P.Stream | P.ViewChannel | P.SendMessages |
  P.SendTTSMessages | P.EmbedLinks | P.AttachFiles | P.ReadMessageHistory |
  P.MentionEveryone | P.UseExternalEmojis | P.Connect | P.Speak | P.UseVAD |
  P.ChangeNickname | P.UseApplicationCommands | P.SendMessagesInThreads |
  P.CreatePublicThreads | P.CreatePrivateThreads | P.UseExternalStickers;

async function loadGuild(guildId) {
  if (FLAGS.offline) {
    if (FLAGS.loadState) {
      return JSON.parse(readFileSync(FLAGS.loadState, 'utf8'));
    }
    return {
      guild: {
        id: guildId,
        name: '(simulated empty guild)',
        features: [],
        verification_level: GuildVerificationLevel.None,
        explicit_content_filter: GuildExplicitContentFilter.Disabled,
        rules_channel_id: null,
        public_updates_channel_id: null,
      },
      roles: [{ id: guildId, name: '@everyone', permissions: OFFLINE_EVERYONE_PERMS.toString() }],
      channels: [],
      automod: [],
      onboarding: { prompts: [], default_channel_ids: [], enabled: false, mode: 0 },
    };
  }
  const guild = await call(() => rest.get(Routes.guild(guildId)), 'GET /guilds/:id');
  const roles = await call(() => rest.get(Routes.guildRoles(guildId)), 'GET /guilds/:id/roles');
  const channels = await call(() => rest.get(Routes.guildChannels(guildId)), 'GET /guilds/:id/channels');
  let automod = [];
  try {
    automod = await call(
      () => rest.get(Routes.guildAutoModerationRules(guildId)),
      'GET /guilds/:id/auto-moderation/rules',
    );
  } catch (err) {
    warn(`could not read AutoMod rules (${err.message}); treating as empty`);
  }
  let onboarding = { prompts: [], default_channel_ids: [], enabled: false, mode: 0 };
  try {
    onboarding = await call(
      () => rest.get(`/guilds/${guildId}/onboarding`),
      'GET /guilds/:id/onboarding',
    );
  } catch {
    // 404 until Community is on.
  }
  return { guild, roles, channels, automod, onboarding };
}

/* ==================================================================
 * 7. Phases
 * ================================================================== */

// Live id book. In dry run these hold placeholders so later phases can
// still render a complete plan.
const ids = { roles: new Map(), categories: new Map(), channels: new Map() };
const placeholder = (kind, name) => `<new ${kind}: ${name}>`;
const isPlaceholder = (v) => typeof v === 'string' && v.startsWith('<new ');

async function phase1GuildSettings(spec, state, guildId) {
  phase(1, 'Guild settings (pre-Community floor)');
  const g = state.guild;
  const patch = {};
  const why = [];

  const wantVerification = Math.max(spec.safety.verificationLevel, COMMUNITY_MIN_VERIFICATION);
  if (g.verification_level !== wantVerification) {
    patch.verification_level = wantVerification;
    why.push(
      `verification_level ${g.verification_level} -> ${wantVerification} ` +
      `(spec: ${spec.safety.verificationWord}; Community floor ${COMMUNITY_MIN_VERIFICATION})`,
    );
  }
  if (g.explicit_content_filter !== spec.safety.explicitContentFilter) {
    patch.explicit_content_filter = spec.safety.explicitContentFilter;
    why.push(
      `explicit_content_filter ${g.explicit_content_filter} -> ` +
      `${spec.safety.explicitContentFilter} (scan messages from all members; ` +
      'Community requires this exact value)',
    );
  }
  if (spec.serverName && g.name !== spec.serverName) {
    patch.name = spec.serverName;
    why.push(`name "${g.name}" -> "${spec.serverName}" (spec section 2 step 1)`);
  }

  if (!Object.keys(patch).length) {
    act('skip', 'guild settings already match spec');
    return;
  }
  act('update', 'PATCH /guilds/:id', why.join('\n'));
  if (FLAGS.apply) {
    await call(() => rest.patch(Routes.guild(guildId), { body: patch }), 'PATCH /guilds/:id');
    RESULT.created.push('guild settings patched');
  }
  // Applied to local state either way, so phase 3 reports the Community
  // preconditions as they will stand when it runs, not as they were.
  Object.assign(g, patch);
}

/** Derived, not hardcoded: rules channel = first text channel of the first
 *  category; mod log = the channel AutoMod alerts are pointed at. */
function communityChannels(spec) {
  const first = spec.categories.find((c) => c.channels.some((ch) => !ch.isVoice));
  const rules = first?.channels.find((ch) => !ch.isVoice);
  const alertName = spec.safety.rules.map((r) => r.alertChannel).find(Boolean);
  let modLog = null;
  let modLogCat = null;
  for (const cat of spec.categories) {
    const hit = cat.channels.find((ch) => ch.name === alertName);
    if (hit) { modLog = hit; modLogCat = cat; break; }
  }
  if (!rules) throw new Error('Could not derive a rules channel from section 4');
  if (!modLog) {
    throw new Error(
      `AutoMod alerts target #${alertName} but section 4 has no such channel.`,
    );
  }
  return { rules, rulesCat: first, modLog, modLogCat };
}

async function ensureChannel(guildId, ch, parentId, overwrites, state) {
  const existing = state.channels.find(
    (c) => c.name === ch.name &&
      (c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice ||
       c.type === ChannelType.GuildAnnouncement),
  );
  const wantType = ch.isVoice ? ChannelType.GuildVoice : ChannelType.GuildText;
  const body = { name: ch.name, type: wantType };
  if (parentId && !isPlaceholder(parentId)) body.parent_id = parentId;
  if (overwrites) body.permission_overwrites = overwrites;

  const display = ch.isVoice ? `${ch.name}  (voice)` : `#${ch.name}`;

  if (!existing) {
    act('create', display, describeChannelPlan(ch, parentId, overwrites));
    if (FLAGS.apply) {
      const created = await call(
        () => rest.post(Routes.guildChannels(guildId), { body }),
        `POST channel #${ch.name}`,
      );
      state.channels.push(created);
      ids.channels.set(ch.name, created.id);
      RESULT.created.push(`channel #${ch.name} (${created.id})`);
      return created;
    }
    // Dry run: record the planned channel so a later phase sees it as
    // existing. Without this the two Community prerequisite channels are
    // counted twice - once in phase 2, again in phase 7.
    const planned = {
      id: placeholder('channel', ch.name),
      name: ch.name,
      type: wantType,
      parent_id: parentId ?? null,
      permission_overwrites: overwrites ?? [],
    };
    state.channels.push(planned);
    ids.channels.set(ch.name, planned.id);
    return planned;
  }

  ids.channels.set(ch.name, existing.id);
  const diffs = channelDiff(existing, { parentId, overwrites, wantType });
  if (!diffs.length) {
    act('skip', display, 'matches spec');
    return existing;
  }
  act('update', display, diffs.join('\n'));
  if (FLAGS.apply) {
    const patch = {};
    if (parentId && !isPlaceholder(parentId) && existing.parent_id !== parentId) {
      patch.parent_id = parentId;
    }
    if (overwrites) patch.permission_overwrites = overwrites;
    await call(
      () => rest.patch(Routes.channel(existing.id), { body: patch }),
      `PATCH channel #${ch.name}`,
    );
    RESULT.created.push(`channel #${ch.name} patched`);
  }
  if (parentId) existing.parent_id = parentId;
  if (overwrites) existing.permission_overwrites = overwrites;
  return existing;
}

function owKey(o) {
  return `${o.id}:${BigInt(o.allow ?? 0)}:${BigInt(o.deny ?? 0)}`;
}

function channelDiff(existing, want) {
  const diffs = [];
  if (want.wantType != null && existing.type !== want.wantType &&
      !(existing.type === ChannelType.GuildAnnouncement && want.wantType === ChannelType.GuildText)) {
    diffs.push(`type ${existing.type} -> ${want.wantType} (cannot be patched; recreate by hand)`);
  }
  // Placeholder ids are compared too, so a dry run still reports the
  // re-parent of the phase-2 channels. The PATCH body filters them out.
  if (want.parentId && existing.parent_id !== want.parentId) {
    diffs.push(`parent ${existing.parent_id ?? 'none'} -> ${want.parentId}`);
  }
  if (want.overwrites) {
    const have = new Set((existing.permission_overwrites ?? []).map(owKey));
    const need = new Set(want.overwrites.map(owKey));
    const add = want.overwrites.filter((o) => !have.has(owKey(o)));
    const rm = (existing.permission_overwrites ?? []).filter((o) => !need.has(owKey(o)));
    if (add.length || rm.length) {
      diffs.push(`overwrites: +${add.length} changed, -${rm.length} stale`);
    }
  }
  return diffs;
}

function describeChannelPlan(ch, parentId, overwrites) {
  const bits = [`type ${ch.isVoice ? 'voice' : 'text'}`];
  if (parentId) bits.push(`parent ${parentId}`);
  if (overwrites) bits.push(`${overwrites.length} overwrite(s)`);
  else bits.push('synced to category');
  return bits.join(', ');
}

async function phase2PrereqChannels(spec, state, guildId, comm) {
  phase(2, 'Community prerequisite channels');
  out(`  rules_channel        -> #${comm.rules.name}   (first text channel of "${comm.rulesCat.name}")`);
  out(`  public_updates       -> #${comm.modLog.name}   (AutoMod alert target)`);
  out('');
  for (const ch of [comm.rules, comm.modLog]) {
    // No parent and no overwrites yet - roles do not exist. Phase 7
    // re-parents them and applies the matrix.
    await ensureChannel(guildId, ch, null, null, state);
  }
}

async function phase3Community(spec, state, guildId, comm) {
  phase(3, 'Community enablement');
  const g = state.guild;
  const has = (g.features ?? []).includes(GuildFeature.Community);
  const rulesId = ids.channels.get(comm.rules.name);
  const updatesId = ids.channels.get(comm.modLog.name);

  const why = [];
  const patch = {};
  if (!has) {
    patch.features = [...(g.features ?? []), GuildFeature.Community];
    why.push('features += COMMUNITY');
  }
  if (g.rules_channel_id !== rulesId) {
    patch.rules_channel_id = rulesId;
    why.push(`rules_channel_id -> ${rulesId} (#${comm.rules.name})`);
  }
  if (g.public_updates_channel_id !== updatesId) {
    patch.public_updates_channel_id = updatesId;
    why.push(`public_updates_channel_id -> ${updatesId} (#${comm.modLog.name})`);
  }

  out(`  precondition  verification_level = ${g.verification_level} ` +
      `(min ${COMMUNITY_MIN_VERIFICATION})   explicit_content_filter = ` +
      `${g.explicit_content_filter} (must be ${COMMUNITY_REQUIRED_FILTER})`);
  out('');

  if (!why.length) {
    act('skip', 'Community already enabled and pointed at the right channels');
    return;
  }
  act('update', 'PATCH /guilds/:id', why.join('\n'));
  if (FLAGS.apply) {
    if (isPlaceholder(rulesId) || isPlaceholder(updatesId)) {
      throw new Error('Community enablement reached without real channel ids');
    }
    await call(() => rest.patch(Routes.guild(guildId), { body: patch }), 'PATCH /guilds/:id (community)');
    RESULT.created.push('Community enabled');
  }
  Object.assign(g, patch);
}

async function phase4Roles(spec, state, guildId) {
  phase(4, 'Roles');
  const byName = new Map(
    state.roles.filter((r) => r.id !== guildId).map((r) => [r.name, r]),
  );
  // Snapshot before any creates: a role that does not exist yet cannot
  // already be in the right position, so the ordering check must not read
  // freshly planned roles as evidence that the order is fine.
  const preExisting = new Set(byName.keys());

  for (const role of spec.roles) {
    const existing = byName.get(role.name);
    const wantColor = role.color;
    const wantPerms = role.permissions.toString();

    if (!existing) {
      act(
        'create',
        `@${role.name}`,
        `color #${wantColor.toString(16).padStart(6, '0')}  hoist=${role.hoist}  ` +
        `mentionable=${role.mentionable}\npermissions ${wantPerms} (${describeBits(role.permissions)})`,
      );
      if (FLAGS.apply) {
        const created = await call(
          () => rest.post(Routes.guildRoles(guildId), {
            body: {
              name: role.name,
              color: wantColor,
              hoist: role.hoist,
              mentionable: role.mentionable,
              permissions: wantPerms,
            },
          }),
          `POST role @${role.name}`,
        );
        state.roles.push(created);
        ids.roles.set(role.name, created.id);
        RESULT.created.push(`role @${role.name} (${created.id})`);
      } else {
        const planned = {
          id: placeholder('role', role.name),
          name: role.name,
          color: wantColor,
          hoist: role.hoist,
          mentionable: role.mentionable,
          permissions: wantPerms,
          position: 0,
        };
        state.roles.push(planned);
        ids.roles.set(role.name, planned.id);
      }
      continue;
    }

    ids.roles.set(role.name, existing.id);
    const diffs = [];
    if (String(existing.permissions) !== wantPerms) {
      diffs.push(`permissions ${existing.permissions} -> ${wantPerms} (${describeBits(role.permissions)})`);
    }
    if ((existing.color ?? 0) !== wantColor) {
      diffs.push(`color #${(existing.color ?? 0).toString(16)} -> #${wantColor.toString(16)}`);
    }
    if (Boolean(existing.hoist) !== role.hoist) diffs.push(`hoist ${existing.hoist} -> ${role.hoist}`);
    if (Boolean(existing.mentionable) !== role.mentionable) {
      diffs.push(`mentionable ${existing.mentionable} -> ${role.mentionable}`);
    }

    if (!diffs.length) { act('skip', `@${role.name}`, 'matches spec'); continue; }
    act('update', `@${role.name}`, diffs.join('\n'));
    if (FLAGS.apply) {
      await call(
        () => rest.patch(Routes.guildRole(guildId, existing.id), {
          body: {
            color: wantColor,
            hoist: role.hoist,
            mentionable: role.mentionable,
            permissions: wantPerms,
          },
        }),
        `PATCH role @${role.name}`,
      );
      RESULT.created.push(`role @${role.name} patched`);
    }
    Object.assign(existing, {
      color: wantColor, hoist: role.hoist,
      mentionable: role.mentionable, permissions: wantPerms,
    });
  }

  // Positions. Spec rank 1 is the top of the list; Discord's highest number
  // is the top, so invert. Compared as RELATIVE order because the bot's own
  // managed role occupies a slot we neither control nor should fight over.
  const n = spec.roles.length;
  const wantOrder = spec.roles.map((r) => r.name);
  const liveOrder = spec.roles
    .map((r) => state.roles.find((x) => x.name === r.name))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name);
  const allPreExisted = spec.roles.every((r) => preExisting.has(r.name));
  const orderMatches =
    allPreExisted &&
    liveOrder.length === wantOrder.length &&
    liveOrder.every((name, i) => name === wantOrder[i]);

  if (orderMatches) {
    act('skip', 'role positions', 'relative order already matches spec');
  } else {
    act(
      'update',
      'PATCH /guilds/:id/roles (positions)',
      spec.roles.map((r) => `  ${String(n - r.rank + 1).padStart(2)}  @${r.name}`).join('\n'),
    );
    if (FLAGS.apply) {
      const body = spec.roles
        .map((r) => ({ id: ids.roles.get(r.name), position: n - r.rank + 1 }))
        .filter((x) => !isPlaceholder(x.id));
      await call(
        () => rest.patch(Routes.guildRoles(guildId), { body }),
        'PATCH role positions',
      );
      RESULT.created.push('role positions set');
    }
    for (const r of spec.roles) {
      const live = state.roles.find((x) => x.name === r.name);
      if (live) live.position = n - r.rank + 1;
    }
  }

  for (const r of state.roles) {
    if (r.id === guildId) continue;
    if (spec.roles.some((s) => s.name === r.name)) continue;
    unmanaged(`role @${r.name}${r.managed ? ' (managed by an integration)' : ''}`);
  }
}

async function phase5Everyone(spec, state, guildId) {
  phase(5, '@everyone guild-level permissions');
  const everyone = state.roles.find((r) => r.id === guildId);
  if (!everyone) {
    act('skip', '@everyone', 'role not visible (offline stub missing)');
    return;
  }
  let perms = BigInt(everyone.permissions);
  const cleared = [];
  for (const d of spec.everyoneDenies) {
    if ((perms & d.bit) !== 0n) {
      perms &= ~d.bit;
      cleared.push(`deny ${describeBits(d.bit)} - ${d.why}`);
    }
  }
  if (!cleared.length) {
    act('skip', '@everyone', 'already denied at guild level');
    return;
  }
  act('update', '@everyone', `${cleared.join('\n')}\npermissions -> ${perms}`);
  if (FLAGS.apply) {
    await call(
      () => rest.patch(Routes.guildRole(guildId, guildId), { body: { permissions: perms.toString() } }),
      'PATCH @everyone',
    );
    RESULT.created.push('@everyone permissions tightened');
  }
  everyone.permissions = perms.toString();
}

function overwritePayload(map) {
  return Object.entries(map)
    .map(([roleName, ow]) => {
      const id = ids.roles.get(roleName);
      return {
        id,
        type: OverwriteType.Role,
        allow: (ow.allow ?? 0n).toString(),
        deny: (ow.deny ?? 0n).toString(),
        _role: roleName,
      };
    })
    .filter((o) => o.id != null);
}

async function phase6Categories(desired, state, guildId) {
  phase(6, 'Categories (permissions set here)');
  for (const cat of desired) {
    const existing = state.channels.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === cat.name,
    );
    const owFull = overwritePayload(cat.catOverwrites);
    const ow = owFull.map(({ _role, ...rest }) => rest);
    const summary = owFull
      .map((o) => `  ${o._role.padEnd(14)} ${cat.baseline[o._role]}  allow=${describeBits(BigInt(o.allow))}`)
      .join('\n');

    if (!existing) {
      act('create', `[${cat.name}]`, summary || 'no role columns');
      if (FLAGS.apply) {
        const created = await call(
          () => rest.post(Routes.guildChannels(guildId), {
            body: { name: cat.name, type: ChannelType.GuildCategory, permission_overwrites: ow },
          }),
          `POST category ${cat.name}`,
        );
        state.channels.push(created);
        ids.categories.set(cat.name, created.id);
        RESULT.created.push(`category ${cat.name} (${created.id})`);
      } else {
        const planned = {
          id: placeholder('category', cat.name),
          name: cat.name,
          type: ChannelType.GuildCategory,
          parent_id: null,
          permission_overwrites: ow,
        };
        state.channels.push(planned);
        ids.categories.set(cat.name, planned.id);
      }
      continue;
    }

    ids.categories.set(cat.name, existing.id);
    const diffs = channelDiff(existing, { overwrites: ow });
    if (!diffs.length) { act('skip', `[${cat.name}]`, 'matches spec'); continue; }
    act('update', `[${cat.name}]`, `${diffs.join('\n')}\n${summary}`);
    if (FLAGS.apply) {
      await call(
        () => rest.patch(Routes.channel(existing.id), { body: { permission_overwrites: ow } }),
        `PATCH category ${cat.name}`,
      );
      RESULT.created.push(`category ${cat.name} patched`);
    }
    existing.permission_overwrites = ow;
  }

  for (const c of state.channels) {
    if (c.type !== ChannelType.GuildCategory) continue;
    if (desired.some((d) => d.name === c.name)) continue;
    unmanaged(`category ${c.name}`);
  }
}

async function phase7Channels(desired, state, guildId) {
  phase(7, 'Channels (synced except where spec differs)');
  for (const cat of desired) {
    const parentId = ids.categories.get(cat.name);
    if (!cat.channels.length) {
      out(`  [${cat.name}]  no channels in spec${cat.note ? ` - ${cat.note}` : ''}`);
      continue;
    }
    out(`  [${cat.name}]`);
    for (const ch of cat.channels) {
      const owFull = overwritePayload(ch.overwrites);
      const ow = owFull.map(({ _role, ...rest }) => rest);
      await ensureChannel(guildId, ch, parentId, ch.synced ? null : ow, state);
      if (ch.synced) continue;
      out('           differs from category:');
      for (const o of owFull) {
        const src = ch.overwrites[o._role];
        out(
          `             ${o._role.padEnd(14)} ${src.cell}` +
          `  (category baseline ${cat.baseline[o._role]})` +
          (src.extra ? `  + ${src.extra}` : ''),
        );
      }
    }
  }

  const specNames = new Set(desired.flatMap((c) => c.channels.map((ch) => ch.name)));
  for (const c of state.channels) {
    if (c.type === ChannelType.GuildCategory) continue;
    if (specNames.has(c.name)) continue;
    unmanaged(`channel #${c.name}`);
  }
}

function automodActions(rule, modLogId) {
  const actions = [];
  // No custom_message: the spec does not supply one and this script does not
  // invent member-facing copy.
  if (rule.blockMessage) actions.push({ type: AutoModerationActionType.BlockMessage, metadata: {} });
  if (rule.alertChannel && modLogId) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel_id: modLogId },
    });
  }
  return actions;
}

// Discord permits only ONE rule per guild for these trigger types. An
// existing rule under a different name therefore blocks creation rather
// than being patched, because matching is by name.
const SINGLETON_TRIGGERS = new Set([
  AutoModerationRuleTriggerType.Spam,
  AutoModerationRuleTriggerType.KeywordPreset,
  AutoModerationRuleTriggerType.MentionSpam,
]);

async function phase8AutoMod(spec, state, guildId, comm) {
  phase(8, 'AutoMod');
  const modLogId = ids.channels.get(comm.modLog.name);

  for (const rule of spec.safety.rules) {
    if (!SINGLETON_TRIGGERS.has(rule.trigger)) continue;
    if (state.automod.some((r) => r.name === rule.name)) continue;
    const clash = state.automod.find((r) => r.trigger_type === rule.trigger);
    if (!clash) continue;
    warn(
      `"${clash.name}" already occupies the only ` +
      `${AutoModerationRuleTriggerType[rule.trigger]} slot Discord allows. ` +
      `Creating "${rule.name}" WILL fail with 400. Rename the existing rule to ` +
      `"${rule.name}" so this run patches it, or delete it by hand first ` +
      '(this script never deletes).',
    );
  }
  for (const rule of spec.safety.rules) {
    const existing = state.automod.find((r) => r.name === rule.name);
    const actions = automodActions(rule, modLogId);
    const body = {
      name: rule.name,
      event_type: AutoModerationRuleEventType.MessageSend,
      trigger_type: rule.trigger,
      actions,
      enabled: true,
      exempt_roles: [],
      exempt_channels: [],
    };
    if (Object.keys(rule.metadata).length) body.trigger_metadata = rule.metadata;

    const detail =
      `trigger ${AutoModerationRuleTriggerType[rule.trigger]}` +
      (rule.metadata.keyword_filter ? `  keywords ${JSON.stringify(rule.metadata.keyword_filter)}` : '') +
      (rule.metadata.mention_total_limit ? `  limit ${rule.metadata.mention_total_limit}` : '') +
      (rule.metadata.presets ? `  presets ${JSON.stringify(rule.metadata.presets)}` : '') +
      `\nactions: ${actions.map((a) => AutoModerationActionType[a.type]).join(' + ')}` +
      (rule.alertChannel ? ` -> #${rule.alertChannel} (${modLogId})` : '') +
      `\nspec: ${rule.source}`;

    if (!existing) {
      act('create', rule.name, detail);
      if (FLAGS.apply) {
        const created = await call(
          () => rest.post(Routes.guildAutoModerationRules(guildId), { body }),
          `POST automod ${rule.name}`,
        );
        state.automod.push(created);
        RESULT.created.push(`automod rule "${rule.name}" (${created.id})`);
      } else {
        state.automod.push({ id: placeholder('automod', rule.name), ...body });
      }
      continue;
    }

    const diffs = [];
    if (existing.trigger_type !== rule.trigger) diffs.push('trigger_type differs');
    if (!existing.enabled) diffs.push('enabled false -> true');
    if (JSON.stringify(normalizeAutomodActions(existing.actions)) !==
        JSON.stringify(normalizeAutomodActions(actions))) diffs.push('actions differ');
    if (body.trigger_metadata &&
        JSON.stringify(normalizeMeta(existing.trigger_metadata)) !==
        JSON.stringify(normalizeMeta(body.trigger_metadata))) diffs.push('trigger_metadata differs');

    if (!diffs.length) { act('skip', rule.name, 'matches spec'); continue; }
    act('update', rule.name, `${diffs.join(', ')}\n${detail}`);
    if (FLAGS.apply) {
      const { trigger_type, ...patch } = body;
      await call(
        () => rest.patch(Routes.guildAutoModerationRule(guildId, existing.id), { body: patch }),
        `PATCH automod ${rule.name}`,
      );
      RESULT.created.push(`automod rule "${rule.name}" patched`);
    }
    Object.assign(existing, body);
  }

  for (const r of state.automod) {
    if (spec.safety.rules.some((s) => s.name === r.name)) continue;
    unmanaged(`automod rule "${r.name}"`);
  }
}

function normalizeAutomodActions(actions = []) {
  return [...actions]
    .map((a) => ({ type: a.type, channel_id: a.metadata?.channel_id ?? null }))
    .sort((a, b) => a.type - b.type);
}
function normalizeMeta(meta = {}) {
  const o = {};
  for (const k of Object.keys(meta).sort()) {
    const v = meta[k];
    if (Array.isArray(v)) o[k] = [...v].sort();
    else o[k] = v;
  }
  return o;
}

async function phase9Onboarding(spec, desired, state, guildId) {
  phase(9, 'Onboarding');

  // Default channels = the first category's channels. Everything else is
  // gated behind a hand-assigned access role, so nothing else can be a
  // sensible default.
  const firstCat = desired.find((c) => c.channels.length);
  const defaultChannelIds = firstCat.channels.map((ch) => ids.channels.get(ch.name)).filter(Boolean);

  const existingByTitle = new Map((state.onboarding.prompts ?? []).map((p) => [p.title, p]));
  let synthId = 0;

  const prompts = spec.onboarding.prompts.map((p) => {
    const prior = existingByTitle.get(p.title);
    const options = p.options.map((o) => {
      const roleId = ids.roles.get(o.title) ?? null;
      const priorOpt = (prior?.options ?? []).find((x) => x.title === o.title);
      if (o.title.length > 50) {
        throw new Error(`Onboarding option title over 50 chars: "${o.title}"`);
      }
      return {
        id: priorOpt?.id ?? String(synthId++),
        title: o.title,
        description: o.description.slice(0, 100) || undefined,
        role_ids: roleId ? [roleId] : [],
        channel_ids: [],
        _roleName: roleId ? o.title : null,
      };
    });
    return {
      id: prior?.id ?? String(synthId++),
      title: p.title,
      type: GuildOnboardingPromptType.MultipleChoice,
      single_select: p.singleSelect,
      required: p.required,
      in_onboarding: true,
      options,
    };
  });

  // The spec forbids self-select access roles; assert none slipped in.
  for (const p of prompts) {
    for (const o of p.options) {
      if (o._roleName && spec.onboarding.forbidden.includes(o._roleName)) {
        throw new Error(
          `Onboarding option "${o.title}" maps to a role the spec forbids self-select for.`,
        );
      }
    }
  }

  for (const p of prompts) {
    out(`  "${p.title}"  single_select=${p.single_select} required=${p.required}`);
    for (const o of p.options) {
      out(`      - ${o.title.padEnd(30)} -> ${o._roleName ? `@${o._roleName} (${o.role_ids[0]})` : 'no role'}`);
    }
  }
  out(`  default_channel_ids: ${firstCat.channels.map((c) => `#${c.name}`).join(', ')}`);
  out('');

  const body = {
    prompts: prompts.map((p) => ({
      ...p,
      options: p.options.map(({ _roleName, ...rest }) => rest),
    })),
    default_channel_ids: defaultChannelIds,
    enabled: true,
    mode: GuildOnboardingMode.OnboardingAdvanced,
  };

  const current = state.onboarding;
  const same =
    current.enabled === true &&
    current.mode === GuildOnboardingMode.OnboardingAdvanced &&
    JSON.stringify((current.default_channel_ids ?? []).slice().sort()) ===
      JSON.stringify(defaultChannelIds.slice().sort()) &&
    JSON.stringify(onboardingShape(current.prompts ?? [])) === JSON.stringify(onboardingShape(body.prompts));

  if (same) {
    act('skip', 'onboarding', 'prompts, roles and default channels already match');
    return;
  }
  act('update', 'PUT /guilds/:id/onboarding', `${prompts.length} prompt(s), mode ONBOARDING_ADVANCED, enabled`);
  if (FLAGS.apply) {
    await call(
      () => rest.put(`/guilds/${guildId}/onboarding`, { body }),
      'PUT /guilds/:id/onboarding',
    );
    RESULT.created.push('onboarding configured');
  }
  Object.assign(state.onboarding, body);
}

function onboardingShape(prompts) {
  return prompts.map((p) => ({
    title: p.title,
    single_select: p.single_select,
    required: p.required,
    in_onboarding: p.in_onboarding,
    options: p.options.map((o) => ({ title: o.title, role_ids: [...(o.role_ids ?? [])].sort() })),
  }));
}

/* ==================================================================
 * 8. Closing summary
 * ================================================================== */

function printSummary(spec, comm) {
  out('');
  out('='.repeat(72));
  out('PLAN SUMMARY');
  out('='.repeat(72));
  const w = 58;
  out(`  ${'PHASE'.padEnd(w)} ${'CREATE'.padStart(6)} ${'UPDATE'.padStart(6)} ${'SKIP'.padStart(5)}`);
  out(`  ${'-'.repeat(w)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(5)}`);
  let c = 0; let u = 0; let s = 0;
  for (const p of RESULT.phases) {
    out(`  ${`${p.n}. ${p.title}`.slice(0, w).padEnd(w)} ${String(p.create).padStart(6)} ${String(p.update).padStart(6)} ${String(p.skip).padStart(5)}`);
    c += p.create; u += p.update; s += p.skip;
  }
  out(`  ${'-'.repeat(w)} ${'-'.repeat(6)} ${'-'.repeat(6)} ${'-'.repeat(5)}`);
  out(`  ${'TOTAL'.padEnd(w)} ${String(c).padStart(6)} ${String(u).padStart(6)} ${String(s).padStart(5)}`);
  out('');
  if (rateLimitHits) out(`  rate limits honoured: ${rateLimitHits}`);

  if (RESULT.unmanaged.length) {
    out('');
    out('UNMANAGED (present in the guild, absent from the spec - never deleted)');
    for (const x of RESULT.unmanaged) out(`  - ${x}`);
  } else {
    out('  unmanaged: none');
  }

  out('');
  out('='.repeat(72));
  out('MUST BE DONE BY HAND - the API cannot set these');
  out('='.repeat(72));
  const manual = [
    'Server icon. PATCH /guilds/:id accepts an icon, but the team logo file is ' +
      'not in this repo. Upload it in Server Settings > Overview.',
    'Require 2FA for moderation actions (spec 5). PATCH /guilds/:id/mfa is ' +
      'restricted to the guild OWNER\'s own account - a bot token is rejected. ' +
      'Mr. Pina must toggle it in Server Settings > Safety Setup.',
    'DM spam filter (spec 5). Safety Setup only, no API surface.',
    'Rules screening text (spec 6). Membership screening has no supported bot ' +
      'endpoint; paste the 8 rules in Server Settings > Community > Rules Screening.',
    'Pinned posts (spec 8). This script deliberately posts no messages - it ' +
      'never writes into a channel members can read. Paste and pin by hand.',
    'Invite links and the five invite waves (spec 9). Each needs a 7-day expiry ' +
      'and a finite max-use count set at creation; run them in order.',
    'Role assignment to actual people, including confirming two adults hold ' +
      'Mentor before any student joins (spec 2 steps 9-10).',
    'Retiring the old server (spec 10) - it is a different guild.',
    'Verify the bot\'s own managed role sits ABOVE @Head Mentor in the role ' +
      'list, or the position PATCH in phase 4 silently clamps.',
  ];
  for (const m of manual) out(`  - ${m}`);

  out('');
  out('WATCH - most likely failure points on a first --apply');
  out('  - Phase 9. Discord validates onboarding against a minimum number of ' +
      'default channels @everyone can see and post in. Spec 2 step 4 denies ' +
      '@everyone View Channels guild-wide, so that check can fail. If phase 9 ' +
      '400s, this is why; configure the two questions by hand in Server ' +
      'Settings > Community > Onboarding, or relax the @everyone denial on ' +
      '#welcome and #verify (see the ambiguity note in README.md).');
  out('  - Phase 9. The "Not sure yet?" option maps to no role and no channel ' +
      'by design (spec 7: "Assigns no role"). Discord may reject an option ' +
      'with neither. If it does, drop that question - it carries no access.');
  out('  - Phase 4. The bot cannot grant a permission it does not itself hold, ' +
      'so @Head Mentor (Administrator) requires an Administrator bot.');
  out('');
}

/* ==================================================================
 * 9. main
 * ================================================================== */

async function main() {
  if (FLAGS.help) { out(HELP); return; }

  out('');
  out('FRC 5669 Techmen - Discord provisioning');
  out(`spec: ${SPEC_PATH}`);
  out(`mode: ${FLAGS.offline ? 'OFFLINE PLAN (no API calls)' : FLAGS.apply ? 'APPLY (will write to the guild)' : 'DRY RUN (read-only)'}`);

  let spec;
  let desired;
  let comm;
  try {
    spec = parseSpec();
    desired = buildDesired(spec);
    comm = communityChannels(spec);
  } catch (err) {
    // A spec problem is a config error, not a crash. No stack trace.
    out('');
    fail(`SERVER_SPEC.md could not be read as a plan.\n\n  ${err.message}`);
    return;
  }

  out(`parsed: ${spec.roles.length} roles, ${desired.length} categories, ` +
      `${desired.reduce((n, c) => n + c.channels.length, 0)} channels, ` +
      `${spec.safety.rules.length} automod rules, ` +
      `${spec.onboarding.prompts.length} onboarding prompts`);

  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!FLAGS.offline) {
    const missing = [];
    if (!token) missing.push('DISCORD_BOT_TOKEN');
    if (!guildId) missing.push('DISCORD_GUILD_ID');
    if (missing.length) {
      out('');
      fail(
        `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.\n\n` +
        'Set them in the environment, or put them in .env.local and run:\n' +
        '  node --env-file-if-exists=.env.local scripts/discord/provision.js\n\n' +
        'No values are being guessed and nothing was contacted.\n' +
        'To review the plan without credentials, run with --offline.',
      );
      return;
    }
    rest = makeRest(token);
  }

  const gid = guildId ?? '000000000000000000';
  const state = await loadGuild(gid);

  try {
    await phase1GuildSettings(spec, state, gid);
    await phase2PrereqChannels(spec, state, gid, comm);
    await phase3Community(spec, state, gid, comm);
    await phase4Roles(spec, state, gid);
    await phase5Everyone(spec, state, gid);
    await phase6Categories(desired, state, gid);
    await phase7Channels(desired, state, gid);
    await phase8AutoMod(spec, state, gid, comm);
    await phase9Onboarding(spec, desired, state, gid);
  } catch (err) {
    out('');
    out('='.repeat(72));
    out('FAILED MID-RUN - stopping, no rollback attempted');
    out('='.repeat(72));
    out(`  ${err.message}`);
    if (err.rawError) out(`  API said: ${JSON.stringify(err.rawError)}`);
    out('');
    out('Already written this run:');
    if (RESULT.created.length) for (const c of RESULT.created) out(`  - ${c}`);
    else out('  (nothing)');
    out('');
    out('Re-run after fixing the cause. The script is idempotent - it will ' +
        'skip what already exists and resume.');
    process.exitCode = 1;
    return;
  }

  if (FLAGS.dumpState) {
    writeFileSync(FLAGS.dumpState, JSON.stringify(state, null, 2));
    out(`  state after this plan written to ${FLAGS.dumpState}`);
  }

  printSummary(spec, comm);

  if (!FLAGS.apply) {
    out('DRY RUN - nothing was written. Re-run with --apply to build the guild.');
    out('');
  } else {
    out('APPLY COMPLETE. Re-run without --apply; a second run must report zero ' +
        'creates and zero updates.');
    out('');
  }
}

main().catch((err) => {
  console.error('');
  console.error(`FATAL: ${err.stack ?? err.message}`);
  process.exitCode = 1;
});
