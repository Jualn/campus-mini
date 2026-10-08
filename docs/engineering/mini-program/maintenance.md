# Installation and document maintenance

## Ownership

The installed root AGENTS.md and this engineering directory are the maintained project baseline. The mini-program-engineering-final directory is the finalized distribution snapshot, not a second live authority. Change the installed documents for future project work; refresh the distribution deliberately when a new reusable package is needed. Do not resolve project facts by reading the old snapshot.

[AGENTS entry](../../../AGENTS.md) routes to the [Profile](project-profile.md), then the [module index](README.md). Policies belong to modules; facts/decisions belong to Profile; enforcement responsibilities belong to the [matrix](enforcement-matrix.md). No business source tree, npm installation, global skill installation, or new architecture layer is required to install these documents.

## Check

From the repository root, run:

```text
node docs/engineering/mini-program/scripts/check-docs.mjs
node docs/engineering/mini-program/scripts/check-docs.mjs --require-active
```

The ordinary check permits a TEMPLATE Profile and reports unresolved fact count. The second command fails unless Profile status is ACTIVE. It is intended for readiness verification after the required facts have been established, not as a release permission. No CI integration is claimed by this installation; an authorized future workflow can invoke the same standalone command.

The checker validates required files, index coverage, local inline Markdown links/heading anchors, duplicate Profile IDs, allowed fact states, evidence references and dates, and ACTIVE critical rows. It follows linked repository Markdown from the engineering/AGENTS/root README entries, including project notes and local component/resource documentation. Use inline Markdown links for owned paths; code-formatted example paths are not declarations. Remote links and evidence content are not automatically verified. The check never reads business source, executes Profile commands or validates the application.

## Profile activation

Keep table columns ID / Status / Value / Evidence. Keep stable row IDs. VERIFIED/TARGET rows require a non-placeholder value, a linked source/decision and a YYYY-MM-DD evidence date. UNKNOWN rows use an em dash and a concrete missing-evidence explanation. TARGET records an accepted future decision, not a recommendation copied from a module.

Verify critical runtime/source-root/base-library/contracts/validation/release facts against their designated authorities, then change the Profile status to ACTIVE and run the strict check. Optional facts can remain UNKNOWN until relevant; an unused capability can be VERIFIED as absent with evidence. Never invent versions, paths, commands, endpoint contracts or implemented CI gates to make the checker pass.

## Review outcome

The 2026-09-13 consolidation applied the five findings from the supplied review: facts-only Profile with explicit states; mechanical document integrity; declarative communication defaults with bounded native imperative/relations use; explicit typings/DevTools/CI tool version fields; authority by fact type. It also aligned the platform module's authority section, removed project-specific streaming assumptions, and clarified proportional validation and remote preview authorization. Existing 11-module structure and native runtime boundaries are retained.

## Agent discovery

Project guidance is installed at the repository root. Codex discovers guidance when starting a run; use a new project task/session to load the entry reliably. A same-directory AGENTS.override.md takes precedence over AGENTS.md. Do not create an override merely to repeat these rules. See [official AGENTS documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
