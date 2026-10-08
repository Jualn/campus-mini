# 09 — Build, CI/CD & Release Engineering

## Delivery model

```text
Source revision
→ locked dependency install
→ static validation/tests
→ Mini Program build/compile
→ package/quality validation
→ preview
→ upload
→ platform review/release process
→ production
```

Compile, preview, upload, and production release are distinct operations.

## Traceable source

A release artifact should be traceable to Git/source revision, dependency lock state, project configuration, toolchain/environment, and version/build identity. Production must not depend on undocumented local edits.

## Dependencies/toolchain

Use one canonical package manager and lockfile. CI installs from the lockfile; do not casually regenerate another package-manager lockfile during unrelated work.

The Project Profile defines Node, package manager, TypeScript, ESLint, `miniprogram-ci`, and other material tool versions. Avoid unspecified “latest” in release-critical paths.

Separate runtime dependencies from build/test/tooling dependencies so tool packages do not enter Mini Program runtime output accidentally.

## Project configuration

`project.config.json` is build input. Shared source root, compile type, base library, compiler/plugins, package settings, and other build facts belong in shared configuration.

`project.private.config.json` is a local override layer; release correctness must not depend on one developer's private settings.

Local bypasses for domain checks/hot reload/etc. must not silently define production behavior.

## TypeScript vs platform compilation

Run explicit TypeScript validation and Mini Program platform compilation. One does not replace the other.

## npm build

If Mini Program npm dependencies are used, define a reproducible build step. CI must not rely on one developer previously clicking “构建 npm”. Generated npm output must have one clear policy: committed artifact or build artifact, not manually maintained both ways.

## PR validation

A target PR gate:

```text
locked install
→ typecheck / lint / format / unit tests (parallel where practical)
→ component/integration tests
→ Mini Program compile validation
→ Contract drift check
→ package/performance checks
```

Run cheap deterministic checks before expensive runtime automation.

Shared infrastructure changes require broader validation than isolated utilities.

## Environment configuration

Environment is an explicit build input. Do not select prod/test by developer username, directory, commented source, or manual URL edits. Client-shipped configuration is observable and is not secret management.

Production-sensitive targets should be explicit and harder to select accidentally than ordinary local/test builds.

## Version identity

Every uploaded artifact should be traceable through product/upload version, Git/source revision, build/CI identity, and environment. Product version and build number may be distinct.

## Preview

Preview is privileged runtime-validation infrastructure, not production release. Prefer static/tests/compile before consuming preview infrastructure. Automated preview may require upload credentials; do not expose those credentials merely for checks that can run without them.

## Upload

Upload is a privileged external side effect. It requires validated source, known environment/version, authorized identity, and protected credential. Ordinary PRs should not upload by default.

## Credentials and runners

Keep validation authority separate from deployment authority:

```text
PR validation → no upload key
release/upload job → protected credential
production release → authorized release context
```

Do not expose release secrets to untrusted contribution code. Protected upload jobs should run only from approved refs/environments. If platform upload access uses IP/network restrictions, design CI runners accordingly rather than disabling controls casually.

## Release gate

Production release should be stronger than merge: all merge checks + package/artifact validation + critical runtime validation + environment/version verification + required device/manual checks.

Production should be deliberate. Automation may prepare/build/validate/upload candidates while final activation remains an explicit authorized action unless the project intentionally adopts a secured continuous-deployment model.

## Client/backend release skew

Mini Program and backend deployments are not atomic. Prefer backward-compatible Contract migrations:

```text
backend supports old + new
→ release new Mini Program
→ remove old compatibility later when safe
```

Do not design changes that require both sides to switch at the same instant without a real coordination mechanism.

## Feature flags

Feature flags may decouple deploy from activation but add state/testing/cleanup complexity. Use them when they solve a real rollout need. Client flags never replace backend authorization.

## Artifacts

Build artifacts/reports should carry commit/build/environment/version identity. Avoid ambiguous manual names. Generated release output is normally CI artifact, not source, unless the repository intentionally versions it.

Treat source maps as operational artifacts with controlled retention/access; do not publish indiscriminately.

## Failure handling

Validation/build failure stops promotion. Do not ignore critical exit codes.

Upload failure is not a Git rollback. Source state and deployment state are separate.

Define an emergency production recovery model using available mechanisms such as backend compatibility, feature disablement, emergency release, or platform rollback where supported.

## CI observability

Release pipelines should visibly report source revision, version, environment, validation result, package metrics, and preview/upload result without leaking secrets.

## Agent authority

Agents may normally install dependencies and run typecheck/lint/format/tests/build/compile/package analysis. Build/CI configuration changes are repository-wide and require care.

Do not implicitly preview/upload/release because a feature is finished. Upload/release requires explicit intent or the authorized workflow. Do not weaken the pipeline or expand secret exposure merely to make CI pass.

## Project Profile requirements

Record source root/AppID identity/base library/package manager/Node/install/build/typecheck/lint/format/tests/compile/package budgets/versioning/environment/preview/upload/release/device checks and credential **locations/mechanisms**, never secret values.

## Core invariant

```text
reviewed source
→ reproducible dependencies
→ deterministic validation
→ known Mini Program configuration
→ traceable candidate artifact
→ privileged upload boundary
→ explicit production release
```
