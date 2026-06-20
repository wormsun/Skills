#!/usr/bin/env python3
r"""
Download official CNINFO annual and first-quarter reports.

Example:
  python cninfo_download_reports.py \
    --stock 000858,gssz0000858 \
    --name wuliangye \
    --annual-start 2015 \
    --annual-end 2025 \
    --q1-year 2026 \
    --allow-english-q1 \
    --out-dir D:\Study\AIGC\aitalk.cloud\tmp\wuliangye\reports
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


QUERY_URL = "https://www.cninfo.com.cn/new/hisAnnouncement/query"
STATIC_BASE = "https://static.cninfo.com.cn/"


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    ),
    "Referer": "https://www.cninfo.com.cn/new/index",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
}


def clean_title(title: str) -> str:
    title = re.sub(r"<[^>]+>", "", title or "")
    return re.sub(r"\s+", "", title)


def form_encode(data: dict[str, Any]) -> bytes:
    from urllib.parse import urlencode

    return urlencode(data).encode("utf-8")


class DownloadError(RuntimeError):
    pass


def request_with_retries(req: Request, *, timeout: float, retries: int, retry_sleep: float) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt >= retries:
                break
            time.sleep(retry_sleep * (attempt + 1))
    raise DownloadError(f"request failed after {retries + 1} attempts: {last_error}") from last_error


def post_json(url: str, data: dict[str, Any], *, timeout: float, retries: int, retry_sleep: float) -> dict[str, Any]:
    req = Request(url, data=form_encode(data), headers=HEADERS, method="POST")
    raw = request_with_retries(req, timeout=timeout, retries=retries, retry_sleep=retry_sleep)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        preview = raw[:200].decode("utf-8", errors="replace")
        raise DownloadError(f"CNINFO returned non-JSON response: {preview}") from exc


def query_announcements(
    *,
    stock: str,
    searchkey: str,
    column: str,
    plate: str,
    page_size: int = 50,
    timeout: float = 30,
    retries: int = 2,
    retry_sleep: float = 1.0,
) -> list[dict[str, Any]]:
    payload = {
        "stock": stock,
        "tabName": "fulltext",
        "pageSize": str(page_size),
        "pageNum": "1",
        "column": column,
        "plate": plate,
        "searchkey": searchkey,
        "seDate": "",
        "isHLtitle": "true",
    }
    result = post_json(QUERY_URL, payload, timeout=timeout, retries=retries, retry_sleep=retry_sleep)
    return result.get("announcements") or []


def announcement_time(item: dict[str, Any]) -> int:
    value = item.get("announcementTime") or 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def is_annual_report(item: dict[str, Any], year: int) -> bool:
    title = clean_title(item.get("announcementTitle", ""))
    if f"{year}年年度报告" not in title:
        return False
    excluded = [
        "摘要",
        "英文",
        "取消",
        "已取消",
        "补充",
        "股东会",
        "议案",
        "ESG",
        "社会责任",
        "环境",
    ]
    return not any(word in title for word in excluded)


def is_q1_report(item: dict[str, Any], year: int, *, allow_english: bool) -> bool:
    title = clean_title(item.get("announcementTitle", ""))
    if f"{year}年第一季度报告" not in title:
        return False
    excluded = [
        "延期披露",
        "无法按期",
        "公告",
        "摘要",
        "取消",
        "已取消",
        "股东会",
        "议案",
    ]
    if not allow_english:
        excluded.append("英文")
    return not any(word in title for word in excluded)


def choose_best(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda item: (
            "更新后" in clean_title(item.get("announcementTitle", "")),
            announcement_time(item),
        ),
        reverse=True,
    )[0]


def make_pdf_url(item: dict[str, Any]) -> str:
    adjunct = item.get("adjunctUrl")
    if not adjunct:
        raise ValueError(f"Missing adjunctUrl for {item!r}")
    return urljoin(STATIC_BASE, adjunct)


def download(url: str, path: Path, *, timeout: float, retries: int, retry_sleep: float, min_bytes: int) -> int:
    req = Request(url, headers={"User-Agent": HEADERS["User-Agent"], "Referer": HEADERS["Referer"]})
    data = request_with_retries(req, timeout=timeout, retries=retries, retry_sleep=retry_sleep)
    if len(data) < min_bytes:
        raise DownloadError(f"downloaded file too small: {len(data)} bytes")
    if not data.startswith(b"%PDF"):
        raise DownloadError("downloaded file does not look like a PDF")
    path.write_bytes(data)
    return len(data)


def safe_name(value: str) -> str:
    value = clean_title(value)
    value = re.sub(r'[\\/:*?"<>|]+', "_", value)
    return value[:120] or "report"


def build_tasks(args: argparse.Namespace) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    if args.annual_start and args.annual_end:
        for year in range(args.annual_start, args.annual_end + 1):
            tasks.append({"kind": "annual", "year": year, "searchkey": f"{year}年年度报告"})
    for year in args.q1_year or []:
        tasks.append({"kind": "q1", "year": year, "searchkey": f"{year}年第一季度报告"})
    return tasks


def resolve_report(args: argparse.Namespace, task: dict[str, Any]) -> dict[str, Any] | None:
    items = query_announcements(
        stock=args.stock,
        searchkey=task["searchkey"],
        column=args.column,
        plate=args.plate,
        page_size=args.page_size,
        timeout=args.timeout,
        retries=args.retries,
        retry_sleep=args.retry_sleep,
    )
    if task["kind"] == "annual":
        candidates = [item for item in items if is_annual_report(item, task["year"])]
    elif task["kind"] == "q1":
        candidates = [item for item in items if is_q1_report(item, task["year"], allow_english=args.allow_english_q1)]
        if not candidates and not args.allow_english_q1:
            candidates = [item for item in items if is_q1_report(item, task["year"], allow_english=True)]
    else:
        raise ValueError(f"Unknown task kind: {task['kind']}")
    return choose_best(candidates)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download annual and Q1 reports from CNINFO.")
    parser.add_argument("--stock", required=True, help="CNINFO stock parameter, e.g. 000858,gssz0000858")
    parser.add_argument("--name", default="company", help="Filename prefix, e.g. wuliangye")
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--column", default="szse")
    parser.add_argument("--plate", default="sz")
    parser.add_argument("--annual-start", type=int)
    parser.add_argument("--annual-end", type=int)
    parser.add_argument("--q1-year", type=int, action="append")
    parser.add_argument("--allow-english-q1", action="store_true")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--timeout", type=float, default=30, help="HTTP timeout in seconds.")
    parser.add_argument("--download-timeout", type=float, default=90, help="PDF download timeout in seconds.")
    parser.add_argument("--retries", type=int, default=2, help="Retries after transient request failures.")
    parser.add_argument("--retry-sleep", type=float, default=1.0, help="Base delay between retries.")
    parser.add_argument("--min-pdf-bytes", type=int, default=1024, help="Reject PDFs smaller than this many bytes.")
    parser.add_argument("--sleep", type=float, default=0.5, help="Delay between requests.")
    parser.add_argument("--dry-run", action="store_true", help="Query and print manifest without downloading PDFs.")
    args = parser.parse_args()

    if bool(args.annual_start) != bool(args.annual_end):
        parser.error("--annual-start and --annual-end must be provided together")
    if args.annual_start and args.annual_end and args.annual_start > args.annual_end:
        parser.error("--annual-start must be less than or equal to --annual-end")
    if args.retries < 0:
        parser.error("--retries must be >= 0")
    if not build_tasks(args):
        parser.error("provide at least one report target: --annual-start/--annual-end or --q1-year")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    failures: list[str] = []

    for task in build_tasks(args):
        try:
            item = resolve_report(args, task)
        except DownloadError as exc:
            failures.append(f"{task['kind']} {task['year']}: query failed: {exc}")
            continue
        if not item:
            failures.append(f"{task['kind']} {task['year']}: no matching report")
            continue

        title = clean_title(item.get("announcementTitle", ""))
        try:
            pdf_url = make_pdf_url(item)
        except ValueError as exc:
            failures.append(f"{task['kind']} {task['year']}: {exc}")
            continue
        filename = f"{args.name}_{task['year']}_{task['kind']}_{safe_name(title)}.pdf"
        path = args.out_dir / filename
        record = {
            "kind": task["kind"],
            "year": task["year"],
            "title": title,
            "announcement_time": announcement_time(item),
            "url": pdf_url,
            "path": str(path),
        }

        if args.dry_run:
            record["downloaded"] = False
        else:
            try:
                size = download(
                    pdf_url,
                    path,
                    timeout=args.download_timeout,
                    retries=args.retries,
                    retry_sleep=args.retry_sleep,
                    min_bytes=args.min_pdf_bytes,
                )
                record["downloaded"] = True
                record["bytes"] = size
                print(f"downloaded {task['year']} {task['kind']}: {title} ({size} bytes)")
            except DownloadError as exc:
                record["downloaded"] = False
                record["error"] = str(exc)
                failures.append(f"{task['kind']} {task['year']}: download failed: {exc}")

        manifest.append(record)
        time.sleep(args.sleep)

    manifest_path = args.out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.dry_run:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"manifest: {manifest_path}")

    if failures:
        print("failures:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
