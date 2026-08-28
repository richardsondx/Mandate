# Capability spec versioning

`capabilities/manifest.json` is the single source of truth for the Mandate capability
spec. Every capability, provider, prompt example, and semantic guidance line in the
Guide, the CLI, the MCP server, and the provider SDK is generated from it.

The spec carries a `spec_version` (`MAJOR.MINOR.PATCH`) and a `releases` log. The
Guide surfaces this as **Spec 0.1.0**. The rule below is enforced by
`scripts/generate-capabilities.mjs` (run via `pnpm check:capabilities`, and in CI
through `pnpm check`).

## The rule

**Any change to the capability spec must bump `spec_version` and add a matching
`releases` entry.** Editing `manifest.json` without advancing the version fails
`pnpm check:capabilities`.

What counts as "the spec": the `capabilities` and `providers` arrays — ids, titles,
summaries, descriptions, examples, `use_when` / `do_not_use_when`, flows, tools,
required provider categories, and provider capability mappings. The generator
fingerprints exactly those arrays and compares against the last committed version,
so a content change that leaves `spec_version` untouched is detected.

What does **not** require a bump: editing only `releases`, `updated_at`, or
`spec_version` itself.

## Semantic versioning for the spec

| Change | Bump | Examples |
| --- | --- | --- |
| Add a capability, provider, or provider capability mapping | **MINOR** | new `swap` capability; a new provider exposing `checkout` |
| Add a prompt example, refine `use_when`/`do_not_use_when`, clarify a description | **PATCH** | new example prompt; clearer guidance |
| Remove or rename a capability id, change a capability's money direction or side effect, break an existing prompt's meaning | **MAJOR** | rename `fund_spend` → `allocate`; flip a capability from mutation to read-only |

Rules of thumb:

- Capabilities are additive in practice, so MINOR is the common bump. MAJOR is rare
  and reserved for breaking changes an existing agent prompt would resolve differently.
- The latest entry in `releases[].version` **must equal** `spec_version`. The
  generator rejects a bump that isn't recorded.
- Each release entry needs `version`, `date` (`YYYY-MM-DD`), and a non-empty
  `items` list describing what changed.
- Update `updated_at` to the change date.
- After editing the manifest, run `pnpm generate:capabilities` to regenerate the
  codegen + `docs/CAPABILITIES.md`, then `pnpm check` before committing.

## Worked example

Adding the `Allocate` family with a `swap` primitive is a new capability, so MINOR:

```json
{
  "spec_version": "0.2.0",
  "updated_at": "2026-08-08",
  "releases": [
    {
      "version": "0.2.0",
      "date": "2026-08-08",
      "items": [
        "Allocate capability family with swap primitive",
        "Autonomy prompt gallery in the Guide"
      ]
    },
    {
      "version": "0.1.0",
      "date": "2026-08-07",
      "items": ["Prompt-first capability guidance", "Account-aware capability discovery", "Semantic distinctions for receive, checkout, pay, and transfer"]
    }
  ]
}
```
