# Xeck documentation

Repository documentation is written in English. Product text may be localized through the application's translation catalogs. The Poyraz submodule maintains its own documentation separately.

## Index

| Location | Contents |
|---|---|
| [Frontend rules](rules/frontend.md) | Canonical design and frontend implementation rules. |
| [Architecture](architecture/README.md) | Architecture outlines and responsibility boundaries; individual pages identify unresolved or historical details. |
| [Decisions](decisions/README.md) | Architecture decision records and their status. |
| [Rules](rules/README.md) | Frontend rules and file ownership. |
| [Reports](reports/) | Dated audits, documentation inventory, and reorganization reports. |
| [Desktop updates](desktop-updates.md) | Update behavior, release publishing, and rollout verification. |
| `../poyraz/` | Separate Git submodule with its own development and documentation lifecycle. |

## Document categories

- **Architecture:** how the system works. Confirm uncertain details against the implementation.
- **Decisions:** why an approach was selected. Each record is Proposed, Accepted, or Superseded.
- **Rules:** requirements for future changes.
- **Reports:** dated observations rather than guarantees about the current implementation.

Historical reports may mention files that have since moved or are absent from the public checkout. They are not a substitute for current source and rules. Private local notes are not part of this documentation index.
