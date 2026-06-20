# CNINFO Report Download Workflow

Use this workflow when a company analysis requires official A-share annual, interim, quarterly, or other exchange-disclosed reports from 巨潮资讯网 / CNINFO.

## What This Does

This is not a browser scraping workflow. It calls CNINFO's public announcement query endpoint, reads the structured announcement metadata, filters by report title, and downloads the official PDF from CNINFO's static file host.

Primary endpoint:

```text
POST https://www.cninfo.com.cn/new/hisAnnouncement/query
```

PDF host:

```text
https://static.cninfo.com.cn/{adjunctUrl}
```

## Required Inputs

- `stock`: CNINFO stock identifier, usually `stock_code,org_id`, for example `000858,gssz0000858`.
- `column` and `plate`: exchange filters. Shenzhen examples usually use `column=szse`, `plate=sz`.
- Year range and report type, such as 2015-2025 annual reports plus 2026 first-quarter report.

If the `org_id` is unknown, find it from an existing CNINFO announcement page, the page's network request, or a previous manifest. Do not guess it silently when precision matters.

## Query Pattern

For each report, send form data similar to:

```text
stock=000858,gssz0000858
tabName=fulltext
pageSize=50
pageNum=1
column=szse
plate=sz
searchkey=2025年年度报告
seDate=
isHLtitle=true
```

The JSON response contains `announcements`. Each announcement has fields such as:

- `announcementTitle`
- `announcementTime`
- `adjunctUrl`

The PDF URL is `https://static.cninfo.com.cn/` plus `adjunctUrl`.

## Filtering Rules

Annual reports:

- Include titles containing `{year}年年度报告`.
- Exclude titles containing words like `摘要`, `英文`, `取消`, `已取消`, `补充`, `股东会`, `议案`, `ESG`, `社会责任`, `环境`.
- Prefer `更新后` versions if multiple valid reports exist.

First-quarter reports:

- Include titles containing `{year}年第一季度报告`.
- Exclude titles containing words like `延期披露`, `无法按期`, `公告`, `摘要`, `取消`, `已取消`, `股东会`, `议案`.
- Exclude `英文` unless the Chinese report is unavailable and the user accepts English fallback.

Important pitfall: a search for `2026年第一季度报告` may return an announcement such as `关于延期披露2025年度报告及2026年第一季度报告的公告`. That is not the quarterly report. Always filter by exact title intent and inspect the saved manifest.

## Recommended Output

Save three things:

1. The downloaded PDF files.
2. A `manifest.json` with report type, year, title, announcement time, source URL, and local path.
3. Any conversion outputs, such as MarkItDown-generated Markdown files, in a separate `md/` directory.

## Reliability Options

The downloader includes conservative network controls:

- `--timeout`: timeout for announcement queries.
- `--download-timeout`: timeout for PDF downloads.
- `--retries`: retry count for transient HTTP/network failures.
- `--retry-sleep`: base delay between retries.
- `--min-pdf-bytes`: reject very small files that are likely error pages.
- `--dry-run`: query and write/print the manifest without downloading PDFs.

If a report fails, inspect `manifest.json`: successful records keep the source URL and path, failed download records include an `error` field. Retry only the missing years when possible instead of redownloading everything.

## Verification Checklist

- The title matches the requested report type and year.
- The file is a non-empty PDF.
- The manifest source URL points to `static.cninfo.com.cn`.
- For valuation work, the final report set includes all years needed for the selected method, usually at least ten annual reports for cyclical companies and recent quarterly or interim reports for current-year validation.
