---
name: three-year-valuation
description: Analyze companies, investment cases, valuation ranges, and stock-selection decisions using a three-year valuation framework. Use when the user asks to evaluate a stock or business by estimating year-three net profit, assigning a reasonable PE multiple, requiring margin of safety, checking ability circle, moat, financial statement quality, cyclical earnings, official annual/quarterly reports, or A-share CNINFO disclosures. Not for short-term trading, technical analysis, real-time quotes, market timing, or personalized buy/sell instructions.
---

# 三年估值

使用本 skill 应用三年估值框架进行教育性分析，不构成个性化投资建议。

## 核心流程

1. 明确任务和分析深度：
   - 快速筛选：只检查能力圈、三项基础检验、重大财务红旗和粗略估值。
   - 公司报告：完整分析业务质量、财务排除、情景估值、风险，以及“什么会改变我的判断”。
   - 年报审查：在估值前完整执行财务红旗清单和交叉验证。
2. 收集输入信息：业务描述、最新年报/中报、财务报表、管理层讨论、分部数据、竞争对手、估值数据，以及用户假设。
   - 如需获取 A 股官方公告报告，使用 `references/cninfo-reports.md` 和 `scripts/cninfo_download_reports.py` 从巨潮资讯网获取。
3. 在进行实质性分析前，先阅读 `references/framework.md`。
4. 如果用户要求财务报表审查、年报分析或深度公司研究，同时使用 `references/financial-statement-red-flags.md`。
5. 如果用户要求生成公司分析报告，同时使用 `references/company-analysis-template.md`。
6. 如果需要进行数值估值，使用 `scripts/valuation.py`，或透明地复现相同公式。
7. 说明假设、不确定性、缺失数据，以及该公司是否超出可判断的能力圈。
8. 避免给出明确的个性化买入/卖出指令。将输出表述为教育性分析、情景区间和决策检查清单。

## 适用边界

- 适合：A 股/港股/美股等有公开财报和可理解业务的公司基本面分析；其中 A 股报告下载可优先使用巨潮资讯工具。
- 谨慎：金融企业、亏损企业、强周期企业、早期高成长企业，需要使用特殊处理并降低结论确定性。
- 不适合：短线交易、技术指标择时、实时行情查询、消息面快评、概念炒作、个性化买卖建议。
- 数据不足时：先列出缺失数据和下一步取数清单；不得为了完成估值而补造收入、利润、市值或现金流数据。

## 决策纪律

按以下顺序应用框架：

1. 能力圈：如果无法解释商业模式、客户选择理由、竞争壁垒和未来持续性，则标记为“无法判断”。
2. 三项基础检验：验证利润是否真实、利润是否可持续，以及维持盈利是否不需要过度新增资本。
3. 业务质量：优先考虑商业模式简单、竞争优势持久、利润质量高、历史 ROE 高、低杠杆，并且仍有长期再投资空间的企业。
4. 财务排除：先用财务报表排除可疑公司，而不是用财务数据强行支持买入逻辑。
5. 估值：估算第三年净利润，赋予有依据的合理 PE 倍数，并要求足够大的安全边际。
6. 仓位管理：根据确定性和理解深度决定仓位，而不是根据近期股价波动或摊低成本的冲动决定。
7. 卖出复盘：主要在投资逻辑破裂、出现极端高估，或有流动性需求时考虑卖出。

## 检查点

- 如果用户没有指定公司或证券，先询问缺失的分析标的。
- 如果任一基础检验未通过，估值前停止，并说明为什么应排除或暂缓判断。
- 如果财务报表存在重大且无法解释的红旗，估值前停止，或仅将估值标记为演示性估算。
- 如果必要数据缺失，将受影响的检查项标记为“未知”。不要编造财务数据。
- 对金融企业、亏损企业和周期性企业，使用 `references/framework.md` 和 `references/cyclical-stocks.md` 中的特殊处理方法。

## 资源

- `references/framework.md`：提炼后的投资理念、三年估值方法、选股规则、财务报表排除规则，以及组合/卖出纪律。
- `references/company-analysis-template.md`：单家公司分析报告结构。
- `references/financial-statement-red-flags.md`：详细的资产负债表、利润表、现金流量表、附注和管理层讨论红旗清单。
- `references/worked-example.md`：一份可复用的示例分析，演示如何从输入信息走到结论、估值表和待补数据清单。
- `scripts/valuation.py`：三年估值情景计算器。
- `references/cyclical-stocks.md`：周期性企业专用分支，覆盖正常化盈利、穿越周期数据和周期风险控制。
- `references/cninfo-reports.md`：从巨潮资讯网查找和下载 A 股年报、中报、季报的官方流程。
- `scripts/cninfo_download_reports.py`：可复用的巨潮资讯报告下载器，用于保存 PDF 和来源清单。

## 常见用法

- “快速看看 XX 值不值得深入研究”：使用快速筛选，只输出基础检验、主要红旗、粗略估值和待补数据。
- “用三年估值法分析 XX”：使用公司报告流程，读取模板，做三情景估值。
- “帮我读 XX 的年报并排雷”：优先读取财务红旗清单和年报，先判断是否应排除，再决定是否估值。
- “下载 XX 近十年年报”：使用 CNINFO 工作流；若接口失败，说明失败阶段、已保存文件和可重试命令。

## 输出要求

- 区分事实、假设、推断和判断。
- 优先使用区间和情景分析，而不是单一点估值。
- 在讨论公司吸引力之前，先说明它为什么可能被排除。
- 清楚展示估值计算过程。
- 包含一个简洁的“什么会改变我的判断”部分。
- 当输出可能影响交易决策时，提醒用户结果不构成投资建议。
