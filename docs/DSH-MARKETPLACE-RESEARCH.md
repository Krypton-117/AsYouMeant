# DSH plugin distribution research

Checked on 2026-09-07 against primary DeepSeek sources. The official repository's `master` tree resolved to `d347e703908d0406b7a7ef80e3a0e594d86b2215` during this check. This is a research snapshot, not a claim that AYM supports that upstream revision.

## What the official sources establish

- The official README directs plugin authors to add the GitHub topic `dsh-plugin` to their repository for discoverability. A topic is a discovery mechanism, not admission to a reviewed marketplace, official endorsement, or a package installation registry. [Official README](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/README.md)
- DSH describes itself as a developer preview with compatibility-breaking changes. Its documented npm entry is `npx @deepseek-ai/dsh web`; official documentation is hosted at the linked GitHub Pages site. [Official README](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/README.md), [documentation](https://deepseek-harness.github.io/deepseek-harness/)
- Cordis plugin configuration accepts a relative module path or an npm package name. Plugins can export `apply(ctx)`; the exported `name` is optional display metadata. This source does not impose a `dsh-plugin-` npm package prefix, so renaming `asyoumeant-dsh` is not justified by this evidence. [Official first-plugin tutorial](https://github.com/deepseek-ai/deepseek-harness/blob/d347e703908d0406b7a7ef80e3a0e594d86b2215/docs/cordis-tutorial/01-first-plugin.md)

## Marketplace boundary

No official marketplace index, submission form, manifest schema, or review requirements were established in this bounded investigation. The inspected surfaces were the official README, first-plugin tutorial, and the official repository's documentation and website file inventories. This is not proof that no other marketplace exists. Do not invent a `marketplace.json`, claim AYM is officially listed, or describe the GitHub topic as approval.

The practical adaptation supported by the evidence is a discoverable repository and a self-contained DSH package. The GitHub topic is remote repository metadata; this research did not change it or submit anything externally.

## AYM package requirements and verification

The existing [DSH package](../native/dsh/package.json) uses `dsh.bundle.patch` pointing to `cordis.patch.yml`, with an explicit experimental host constraint of `0.1.1-rc.2`. Preserve that host constraint until a different version is tested. The generic upstream Cordis tutorial does not independently verify the version-specific Profile Bundle installer contract.

For a distributable package, include the built entry, profile patch, five Skills, README, license and third-party notices. Repository, homepage and issue metadata should point back to AYM. Validate the actual npm tarball and its extracted package, because a repository-relative installation alone does not establish that published contents are complete. AYM's MPL-2.0 licensing remains unchanged by this distribution work.

Record local `0.1.1-rc.2` CLI installation checks separately from current upstream documentation. A local package or tarball check is not evidence of npm publication, official listing, or authenticated model execution. Real model execution requires a configured DSH provider and credentials; upstream-master compatibility needs its own host test.

## Follow-up verification on 2026-09-07

The official recursive tree API subsequently returned `truncated: false`. The inspected Web packages further distinguish discovery from the installed-plugin UI:

- [Plugin inventory](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-plugin-inventory/README.md) documents a read-only Host inventory, fetched through `pluginInventory.list()`, rather than a public package catalog.
- [Plugin settings](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings-plugins/README.md) requires a served settings namespace and a browser contribution for a configuration card. AYM does not ship that optional browser surface. No claim of a visible AYM configuration card is made.
- [Profile bundles](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/README.md) documents `dsh.bundle.patch` and `dsh plugin --profile <name> add <package>`, matching AYM's distribution format.
- GitHub repository search for `repo:Krypton-117/AsYouMeant topic:dsh-plugin` returned the AYM repository (`total_count: 1`). This verifies GitHub indexing, not an independent store listing.
- Initially, local `npm whoami --registry=https://registry.npmjs.org` returned `ENEEDAUTH`. No credentials were requested or printed.
- After the maintainer logged in, the first publication was refused with E403 requiring two-factor authentication. The maintainer subsequently completed publication. Public registry metadata and download now verify 0.3.1, with a SHA-256 identical to the GitHub asset. Real isolated registry installation, file comparison, composition and removal passed in both web and headless on 0.1.1-rc.2. See [current distribution status](DSH-DISTRIBUTION.md).

These follow-up sources were read from upstream `master`; they explain current UI semantics, not compatibility of AYM with an untested upstream version. The actual local tarball installation/composition/removal probe again passed on `0.1.1-rc.2`.

## Initial retrieval limitations

GitHub raw-file and API reads succeeded using the system curl client with best-effort certificate revocation checking because its revocation service was unavailable. Initially, the full recursive repository tree timed out; smaller documentation, website and bundle trees were inspected instead. The later successful tree read is recorded above. The conclusions deliberately avoid an exhaustive absence claim.
