# PDF citation verification

All 18 published source records with PDF hash drift now bind their citations to the current course PDF editions. Ten of those records support scored questions.

- R8 and R21 retain the original extraction hashes. The cited pages in the current PDFs matched the rendered pages in the exact archival PDFs, accounting for page shifts.
- R20 retains the original extraction hash. The teaching figures on the cited pages were checked side by side against the quiz originals.

The [verification ledger](pdf-citation-verification.csv) records both hashes and the extraction and citation pages. The manifest stores the verified citation hash in `citation_document_sha256`. The historical extraction hash remains in `source_document_sha256` and the extraction index. For records with `pdf_citation_verification`, the match flag describes the verified citation edition. The validator checks that the current hash and cited page agree with that record.
