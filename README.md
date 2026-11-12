# Reproduction Picture Quiz

505 reviewed visual questions.

- Physiology covers R1 through R7 with 18 questions.
- Pathology contains 487 questions, including 19 3rd Party questions available under Source type.

Clinical Cases contains 20 cases with 47 linked visual questions. Open Clinical Cases from the top menu. Combined Practice lets you select any of the three sections for one session. It keeps each case together and saves its own session and progress. Clinical Cases uses a separate progress record from picture drills. Each case reveals explanations after completion.

The two picture banks include 274 histology questions. See [lecture counts and coverage](reports/pathology-pictures-20261111/summary.md).

Learn mode gives feedback after locking an answer. Exam mode defers feedback until completion. Back and Next preserve drafts and locked answers. Skipped questions are reported separately. Zoom resets for each question. The Keanne Button corrects an incorrect locked attempt without changing the original selection or adding an attempt.

Progress and marks stay in browser storage, separately for each bank. Export before changing browsers or site addresses. Existing localhost progress does not automatically appear on GitHub Pages. Export it locally and import the matching bank file on the website.

Run locally with `python3 scripts/serve.py --open`. No installation is required to study. Run `npm test` for automated checks and `npm run build` to create the static site in `dist`. GitHub Actions validates and deploys `dist` to GitHub Pages.

Source citations appear after answering and in the explicit Source review workspace. Client-side answer hiding is an interface feature, not cryptographic secrecy.

## Image attribution

The provided teaching images include excerpts attributed to course lectures, Boards and Beyond, First Aid, Pathoma, and third-party figures credited within those materials. This publication does not grant or imply ownership or a general redistribution license for those images. Individual question provenance records identify the supplied source document and page. The quiz uses the supplied images without generative modification of medical content.
