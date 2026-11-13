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


IMAGE_FIELDS = ("image", "zoom_image", "original_image")


def find_app_root(path: Path) -> Path | None:
    for parent in path.resolve().parents:
        if (parent / "assets").is_dir():
            return parent
    return None


def check_image_file(app_root: Path | None, label: str, field: str, value: Any, errors: list[str]) -> None:
    if not isinstance(value, str) or not value:
        errors.append(f"{label}: missing {field}")
        return
    if app_root is None:
        return
    target = app_root / value
    if not target.is_file():
        errors.append(f"{label}: {field} file not found: {value}")
        return
    with target.open("rb") as handle:
        header = handle.read(12)
    if value.endswith(".png"):
        valid = header[:4] == b"\x89PNG"
    elif value.endswith(".webp"):
        valid = header[:4] == b"RIFF" and header[8:12] == b"WEBP"
    else:
        valid = False
    if not valid:
        errors.append(f"{label}: {field} is not a valid PNG or WEBP file: {value}")


def validate_table(question: dict[str, Any], label: str, errors: list[str]) -> None:
    table = question.get("context_table")
    if not isinstance(table, dict) or table.get("placement") != "primary":
        errors.append(f"{label}: requires a primary context table")
        return
    columns = table.get("columns")
    rows = table.get("rows")
    if not columns or not isinstance(columns, list) or not rows or not isinstance(rows, list):
        errors.append(f"{label}: requires table columns and rows")
        return
    if any(not isinstance(row, list) or len(row) != len(columns) for row in rows):
        errors.append(f"{label}: table row width differs from its column count")
    hidden_cells = table.get("hidden_cells", [])
    if not isinstance(hidden_cells, list):
        errors.append(f"{label}: masked table cells must be a list")
        hidden_cells = []
    for cell in hidden_cells:
        if (not isinstance(cell, list) or len(cell) != 2
                or any(type(index) is not int for index in cell)
                or not (0 <= cell[0] < len(rows) and 0 < cell[1] < len(columns))):
            errors.append(f"{label}: invalid masked table cell {cell!r}")
    citations = question.get("citations")
    if not isinstance(citations, list) or table.get("source") not in citations:
        errors.append(f"{label}: table source missing from question citations")
    if question.get("source_origin") != "lecture-table" or not question.get("source_group_id"):
        errors.append(f"{label}: missing lecture table origin or source group")
    if any(question.get(field) for field in (
        "source_id", "asset_id", "variant_id", "image", "zoom_image", "original_image"
    )):
        errors.append(f"{label}: table question has image lineage")


def validate(manifest_path: Path, bank_path: Path) -> list[str]:
    errors: list[str] = []
    app_root = find_app_root(bank_path)
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

        is_table = question.get("visual_kind") == "table"
        if is_table:
            validate_table(question, label, errors)
        else:
            source_id = question.get("source_id")
            source = source_by_id.get(source_id)
            if source is None:
                errors.append(f"{label}: unknown source_id {source_id!r}")
            else:
                status = source.get("status")
                if status != ACTIVE_STATUS:
                    errors.append(f"{label}: source {source_id} is not USABLE (status={status!r})")
                variants = source.get("variants")
                if variants is not None and question.get("variant_id") not in {
                    variant.get("variant_id") for variant in variants if isinstance(variant, dict)
                }:
                    errors.append(f"{label}: variant_id {question.get('variant_id')!r} not found in source {source_id}")
            if not question.get("citations"):
                errors.append(f"{label}: image question has no citations")
            for field in IMAGE_FIELDS:
                check_image_file(app_root, label, field, question.get(field), errors)

        option_count = 5 if question.get("format_version") == "clinical-visual-v1" else 4
        options = question.get("options")
        if not isinstance(options, list) or len(options) != option_count:
            errors.append(f"{label}: options must contain exactly {option_count} entries")
        elif any(not isinstance(option, str) or not option.strip() for option in options):
            errors.append(f"{label}: every option must be a non-empty string")
        elif len({str(option).strip().casefold() for option in options}) != option_count:
            errors.append(f"{label}: options must be unique")

        correct_index = question.get("correct_index")
        if not isinstance(correct_index, int) or not 0 <= correct_index < option_count:
            errors.append(f"{label}: correct_index must be an integer from 0 through {option_count - 1}")

        if schema_version >= 2:
            rationales = question.get("choice_rationales")
            if not isinstance(rationales, list) or len(rationales) != option_count:
                errors.append(f"{label}: choice_rationales must contain exactly {option_count} entries")
            elif any(not isinstance(rationale, str) or not rationale.strip() for rationale in rationales):
                errors.append(f"{label}: every choice_rationale must be a non-empty string")
            elif not question.get("case_id") and isinstance(correct_index, int) \
                    and 0 <= correct_index < option_count \
                    and rationales[correct_index] != question.get("explanation"):
                errors.append(f"{label}: choice_rationales[correct_index] must equal explanation")

        required = ("question_type", "tested_concept", "stem", "explanation", "visual_clues")
        if not is_table:
            required += ("variant_id",)
        for field in required:
            if not question.get(field):
                errors.append(f"{label}: missing {field}")

    if isinstance(bank_payload, dict):
        validate_cases_and_retired(bank_payload, seen_questions, errors)
    return errors


def validate_cases_and_retired(payload: dict[str, Any], active_ids: set[str], errors: list[str]) -> None:
    case_ids: set[str] = set()
    for index, case in enumerate(payload.get("cases") or []):
        case_id = case.get("case_id")
        label = f"case {case_id or index}"
        if not case_id:
            errors.append(f"{label}: missing case_id")
        elif case_id in case_ids:
            errors.append(f"{label}: duplicate case_id")
        case_ids.add(case_id)
        question_ids = case.get("question_ids")
        if not isinstance(question_ids, list) or len(question_ids) < 2:
            errors.append(f"{label}: question_ids must list at least 2 questions")
        else:
            for question_id in question_ids:
                if question_id not in active_ids:
                    errors.append(f"{label}: unknown question id {question_id}")
        previous = case.get("previous_question_counts", [])
        if not isinstance(previous, list) or any(type(count) is not int or count < 1 for count in previous):
            errors.append(f"{label}: previous_question_counts must be a list of positive integers")
    for retired in payload.get("retired_questions") or []:
        if retired.get("question_id") in active_ids:
            errors.append(f"retired question {retired.get('question_id')} overlaps an active question")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, nargs="?")
    parser.add_argument("question_bank", type=Path, nargs="?")
    parser.add_argument("--all", action="store_true",
                        help="validate the legacy root bank and every data/<bank>/ folder")
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    args = parser.parse_args()

    if args.all:
        pairs = [(args.data / "source-manifest.json", args.data / "question-bank.json")]
        pairs += [(folder / "source-manifest.json", folder / "question-bank.json")
                  for folder in sorted(args.data.iterdir())
                  if (folder / "question-bank.json").is_file()]
    elif args.manifest and args.question_bank:
        pairs = [(args.manifest, args.question_bank)]
    else:
        parser.error("give a manifest and question bank, or use --all")

    failed = False
    for manifest, bank in pairs:
        errors = validate(manifest, bank)
        label = bank.parent.name if bank.parent.name != args.data.name else "legacy root"
        if errors:
            failed = True
            for error in errors[:50]:
                print(f"ERROR [{label}]: {error}")
            if len(errors) > 50:
                print(f"ERROR [{label}]: ... {len(errors) - 50} more")
        else:
            print(f"OK [{label}]: manifest and question bank passed validation")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
