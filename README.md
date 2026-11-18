# Reproduction Picture Quiz

624 visual questions across three sections.

- Physiology covers R1 through R7 with 59 questions.
- Pathology contains 369 questions, covering R8 through R32.

Clinical Cases contains 45 cases with 196 linked visual questions. Open Clinical Cases from the top menu. Combined Practice lets you select any of the three sections for one session. It keeps each case together and saves its own session and progress. Clinical Cases uses a separate progress record from picture drills. Each case reveals explanations after completion.

See the [November 15 question quality and Physiology update](reports/quality-and-physiology-20261115.md) for the R1 through R7 allocations and source references. Run `python3 scripts/audit_question_quality.py --flags review-leads.csv` to identify wording to inspect.

See the [third Step 1 relevance screen](reports/step1-third-screen.md) for what was retained, rewritten, or moved to reference only.

Filter practice by study skill and see correct and answered counts in session results and Your progress. Combined Practice keeps cases together and spaces out reused images. Selected questions show numbered image features with the explanation. See the [question review](reports/study-skills-review.csv) for changes and lecture citations.

See the [R30 through R32 expansion](reports/r30-r32-expansion.md) for the added cases and image review.

Learn mode gives feedback after locking an answer. Exam mode defers feedback until completion. Back and Next preserve drafts and locked answers. Skipped questions are reported separately. Zoom resets for each question. The Keanne Button corrects an incorrect locked attempt without changing the original selection or adding an attempt.

Progress and marks stay in browser storage, separately for each bank. Export before changing browsers or site addresses. Existing localhost progress does not automatically appear on GitHub Pages. Export it locally and import the matching bank file on the website.

Run `npm run build` with Node 22 and Python 3, then open the desktop quiz with `python3 scripts/serve.py --open`. The server exposes the generated `dist` folder. If you build from the separate desktop source archive with PNG originals, install the WebP command line tools (`brew install webp` on macOS). The GitHub checkout already contains the published WebP derivatives.

Run `npm test` for the question bank and engine checks. For the browser smoke test, run `npm ci`, `npx playwright install chromium`, then `npm run test:ui` after building. The test opens all four practice routes, answers a question, checks review and session history, and exercises image error recovery. GitHub Actions runs these checks before deploying `dist`.

The build puts a single content fingerprint on modules, styles, and data. Practice loads only the question bank and a small remediation file. Source manifests load when you open coverage or Source review, or when migrating older progress.

The public site distributes WebP images capped at 1 MiB per file. High resolution PNGs remain available in the desktop authoring archive. The `original_image` field identifies the teaching image shown after reveal, which is a compressed copy in a served build. To inventory local image files absent from all data JSON, run `python3 scripts/validate_bank.py --all --orphan-report orphan-images.csv`.

Source citations appear after answering and in the explicit Source review workspace. Client-side answer hiding is an interface feature, not cryptographic secrecy.


Some answer choices also carry supplementary 3rd party pictures (Pathoma, Boards and Beyond, First Aid). They are captioned "3rd party" and only supplement lecture pictures. See reports/third-party-pictures-20261116.md.

## Image attribution

The provided teaching images include excerpts attributed to course lectures, Boards and Beyond, First Aid, Pathoma, and third-party figures credited within those materials. This publication does not grant or imply ownership or a general redistribution license for those images. Individual question provenance records identify the supplied source document and page. The quiz uses the supplied images without generative modification of medical content.
