from __future__ import annotations

import argparse
import json


def compute(
    year3_profit: float,
    pe: float,
    leverage_discount: float = 1.0,
    safety_margin: float = 0.5,
    current_profit: float | None = None,
    sell_pe_cap: float = 50.0,
) -> dict[str, float | None]:
    year3_value = year3_profit * pe
    buy_zone = year3_value * safety_margin
    adjusted_buy_zone = buy_zone * leverage_discount
    extreme_overvaluation_reference = year3_value * 1.5
    current_profit_sell_cap = None if current_profit is None else current_profit * sell_pe_cap
    one_year_sell_reference = (
        extreme_overvaluation_reference
        if current_profit_sell_cap is None
        else min(extreme_overvaluation_reference, current_profit_sell_cap)
    )
    return {
        "year3_profit": year3_profit,
        "pe": pe,
        "year3_reasonable_value": year3_value,
        "buy_zone_value": buy_zone,
        "adjusted_buy_zone_value": adjusted_buy_zone,
        "extreme_overvaluation_reference": extreme_overvaluation_reference,
        "current_profit_sell_cap": current_profit_sell_cap,
        "one_year_sell_reference": one_year_sell_reference,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Three-year valuation scenario calculator")
    parser.add_argument("--year3-profit", type=float, required=True, help="Estimated year-three net profit")
    parser.add_argument("--pe", type=float, required=True, help="Reasonable PE multiple")
    parser.add_argument("--leverage-discount", type=float, default=1.0, help="Use 0.7 for high-leverage cases")
    parser.add_argument("--safety-margin", type=float, default=0.5, help="Default buy-zone is 50 percent of year-three value")
    parser.add_argument("--current-profit", type=float, help="Optional current-year or latest normal net profit for a near-term sell reference")
    parser.add_argument("--sell-pe-cap", type=float, default=50.0, help="PE cap applied to current profit for the near-term sell reference")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args()

    result = compute(
        args.year3_profit,
        args.pe,
        args.leverage_discount,
        args.safety_margin,
        args.current_profit,
        args.sell_pe_cap,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    print(f"Year-3 net profit: {result['year3_profit']:,.2f}")
    print(f"Reasonable PE: {result['pe']:,.2f}")
    print(f"Year-3 reasonable value: {result['year3_reasonable_value']:,.2f}")
    print(f"Buy-zone value: {result['buy_zone_value']:,.2f}")
    print(f"Adjusted buy-zone value: {result['adjusted_buy_zone_value']:,.2f}")
    print(f"Extreme overvaluation reference: {result['extreme_overvaluation_reference']:,.2f}")
    if result["current_profit_sell_cap"] is not None:
        print(f"Current-profit sell cap: {result['current_profit_sell_cap']:,.2f}")
    print(f"One-year sell reference: {result['one_year_sell_reference']:,.2f}")


if __name__ == "__main__":
    main()
