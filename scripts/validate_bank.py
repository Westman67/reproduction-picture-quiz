#!/usr/bin/env python3
"""Validate a medical picture-quiz manifest and question bank."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ACTIVE_STATUS = "USABLE"
BLOCKED_STATUSES = {"NEEDS_REVIEW", "REFERENCE_ONLY", "DUPLICATE", "AGGREGATE_DUPLICATE", "BROKEN", "EXCLUDED"}


def records(payload: Any, common_keys: tuple[str, ...]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in common_keys:
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError(f"expected a list or one of keys {common_keys}")


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(manifest_path: Path, bank_path: Path) -> list[str]:
    errors: list[str] = []
    sources = records(load(manifest_path), ("sources", "records", "items"))
    bank_payload = load(bank_path)
    questions = records(bank_payload, ("questions", "items"))
    schema_version = 1
    if isinstance(bank_payload, dict):
        raw_version = bank_payload.get("schema_version", 1)
        try:
            schema_version = int(raw_version)
        except (TypeError, ValueError):
            errors.append(f"invalid schema_version: {raw_version!r}")

    source_by_id: dict[str, dict[str, Any]] = {}
    for index, source in enumerate(sources):
        source_id = source.get("source_id")
        if not source_id:
            errors.append(f"manifest[{index}] has no source_id")
            continue
        if source_id in source_by_id:
            errors.append(f"duplicate source_id: {source_id}")
        source_by_id[source_id] = source

    seen_questions: set[str] = set()
    for index, question in enumerate(questions):
        label = question.get("question_id") or f"question[{index}]"
        if label in seen_questions:
            errors.append(f"duplicate question_id: {label}")
        seen_questions.add(label)

        source_id = question.get("source_id")
        source = source_by_id.get(source_id)
        if source is None:
            errors.append(f"{label}: unknown source_id {source_id!r}")
        else:
            status = source.get("status")
            if status in BLOCKED_STATUSES or status != ACTIVE_STATUS:
                errors.append(f"{label}: source {source_id} is not USABLE (status={status!r})")

        options = question.get("options")
        if not isinstance(options, list) or len(options) != 4:
            errors.append(f"{label}: options must contain exactly four entries")
        elif len({str(option).strip().casefold() for option in options}) != 4:
            errors.append(f"{label}: options must be unique")

        correct_index = question.get("correct_index")
        if not isinstance(correct_index, int) or not 0 <= correct_index < 4:
            errors.append(f"{label}: correct_index must be an integer from 0 through 3")

        if schema_version >= 2:
            rationales = question.get("choice_rationales")
            if not isinstance(rationales, list) or len(rationales) != 4:
                errors.append(f"{label}: choice_rationales must contain exactly four entries")
            elif any(not isinstance(rationale, str) or not rationale.strip() for rationale in rationales):
                errors.append(f"{label}: every choice_rationale must be a non-empty string")

        for field in ("variant_id", "question_type", "tested_concept", "stem", "explanation", "visual_clues"):
            if not question.get(field):
                errors.append(f"{label}: missing {field}")

    return errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("question_bank", type=Path)
    args = parser.parse_args()

    errors = validate(args.manifest, args.question_bank)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)
    print("OK: manifest and question bank passed validation")


if __name__ == "__main__":
    main()
