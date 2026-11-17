# Third party supplementary pictures (2026-11-16)

219 supplementary choice pictures (91 unique images) were added across 151 questions in the physiology, pathology and clinical-cases banks.

Rules applied
- Added only to answer choices that had 0 or 1 lecture picture, capped at 2 pictures per choice.
- Lecture pictures were never replaced or reordered, and a question's own image was skipped.
- Every added picture is captioned "3rd party" (Pathoma, Boards and Beyond and First Aid are named) and its source field points to the original file under 3rd Party.
- Includes First Aid tables and mnemonics where they explain a choice.

Tooling
- scripts/match_third_party.py and scripts/pick_third_party.py find candidates (report only).
- scripts/apply_third_party.py applies a reviewed picks file (`--apply`), converts images to WebP in assets/display, and writes the banks.
- Picks were reviewed by hand on contact sheets before applying.
