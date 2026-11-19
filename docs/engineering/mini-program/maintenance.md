# Installation and document maintenance

## Ownership

The installed repository root AGENTS.md and this engineering directory are the maintained project baseline. A downloaded archive or copied distribution snapshot is an installation artifact, not a second live authority. Edit the installed documents; publish a new snapshot only when needed. Do not resolve current project facts from an old archive.

[AGENTS entry](../../../AGENTS.md) routes through the [module index](README.md) to relevant [Profile](project-profile.md) facts and modules. Policies belong to modules; facts/decisions belong to Profile; enforcement responsibilities belong to the [matrix](enforcement-matrix.md). No business source tree, npm installation, global skill installation, or new architecture layer is required to install these documents.

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

## Durable documents and temporary artifacts

Maintain **one owning authority per fact**; do not keep a mirror that must be manually synchronized after every change:

| Change | Authoritative owner | Durable document trigger |
|---|---|---|
| Local Page layout/style/implementation | Page/Component WXML, WXSS and source | None by default; accepted product flow/decision only if it changed |
| Shared Component capabilities | Component source, public properties/events/slots/methods and maintained examples/tests | Only changed public semantics, constraints or intentionally documented usages |
| Global UI tokens/theme | Current design-token/theme implementation and project UI policy | When a cross-Page design rule or verified project foundation changes |
| Protocol/DTO/error semantics | Contracts authoritative source/generator | Contract change and consumer handoff; do not mirror schemas in project docs |
| Executable project config/tool commands | Source config/scripts/lockfile | Update related Profile facts after verification, not feature-by-feature |
| Reusable engineering policy | Owning Engineering module | Only when general rules change |

**Task-scoped artifacts** such as exploratory notes, intermediate analysis, discarded design sketches, screenshots, debug output and test reports stay in task-specific scratch/artifact storage, outside authoritative source/docs where practical. Promote only deliberately accepted, durable decisions or retained deliverables. Clean up files created and owned by the task when appropriate; never delete user files, existing source or shared infrastructure as generic housekeeping. Generated code/build outputs follow the existing source/generator and commit policy, not a manually maintained duplicate.

Permanent Page design files are not mandatory for routine edits. Record enduring user goals, exceptional interaction/state decisions and rationale only where future work needs them; do not duplicate every pixel of live WXML/WXSS. If implementation and accepted design disagree, verify whether code is defective or a decision changed before updating either. Do not write a new audit, summary, history or version file after every task. Git records history; a released baseline can be identified by a tag/commit or existing project version convention rather than per-module version numbers.

## Agent discovery

Project guidance is installed at the repository root. Codex discovers guidance when starting a run; use a new project task/session to load the entry reliably. A same-directory AGENTS.override.md takes precedence over AGENTS.md. Do not create an override merely to repeat these rules. See [official AGENTS documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
