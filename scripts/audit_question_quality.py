#!/usr/bin/env python3
"""Inventory feedback and flag wording for manual review of active quiz banks."""
import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

SECTIONS = ("physiology", "pathology", "clinical-cases")
STOP = set("the and this that with for has have which when what there without from than shown shows inside rather field other tissue image".split())

def tokens(text):
    return {part.removesuffix("s") for part in re.findall(r"\w+", text.casefold())
            if len(part) > 2 and part not in STOP}

def normalized(text):
    return " ".join(text.casefold().split())

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    parser.add_argument("--flags", type=Path, help="CSV of candidates to inspect alongside the visual")
    args = parser.parse_args()
    flags = []
    for section in SECTIONS:
        questions = json.loads((args.data / section / "question-bank.json").read_bytes())["questions"]
        rows = defaultdict(Counter)
        for q in questions:
            label = q["question_id"]
            lecture = q["collection"]
            options, rationales, keyed = q["options"], q["choice_rationales"], q["correct_index"]
            skill = q.get("study_skill", "unassigned")
            rows[lecture]["total"] += 1
            rows[lecture][skill] += 1
            if normalized(q["explanation"]) == normalized(rationales[keyed]):
                flags.append((section, lecture, label, "duplicate teaching explanation", ""))
            if skill == "management" and re.search(r"\b(which diagnosis|which finding|which observation|which interpretation)\b", q["stem"], re.I):
                flags.append((section, lecture, label, "review management tag", q["stem"]))
            if skill != "management" and re.search(r"\b(which next step|which treatment|which therapy|which intervention)\b", q["stem"], re.I):
                flags.append((section, lecture, label, "review action asked", q["stem"]))
            for index, (option, reason) in enumerate(zip(options, rationales, strict=True)):
                vocabulary = tokens(option)
                if index != keyed and len(vocabulary) > 1 and not vocabulary.intersection(tokens(reason)):
                    flags.append((section, lecture, label, "distractor wording to inspect", option))
        skills = Counter(q.get("study_skill", "unassigned") for q in questions)
        print(f"{section}: {len(questions)} questions, {dict(sorted(skills.items()))}")
        print("  " + ", ".join(f"{lecture} {row['total']}" for lecture, row in rows.items()))
    print("Review leads (token mismatches may reflect synonyms):", dict(Counter(row[3] for row in flags)))
    if args.flags:
        with args.flags.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(("section", "lecture", "question_id", "check", "text"))
            writer.writerows(flags)

if __name__ == "__main__":
    main()
