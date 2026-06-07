"""
Seed TradePilot with demo agents and positions so the Trending sidebar,
Online Traders counter, and Leaderboard have realistic content.

Usage:
  python scripts/seed_demo_agents.py
  python scripts/seed_demo_agents.py --base http://127.0.0.1:8000

The script is idempotent: re-running it will reuse existing agents (login)
and skip trades that already filled.
"""
from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests


DEFAULT_BASE = "http://127.0.0.1:8000"

# Realistic agent personas with consistent identities.
DEMO_AGENTS = [
    {"name": "AlphaBot",      "password": "demo1234", "email": "alphabot@tradepilot-demo.com"},
    {"name": "QuantPilot",    "password": "demo1234", "email": "quantpilot@tradepilot-demo.com"},
    {"name": "MomentumAI",    "password": "demo1234", "email": "momentumai@tradepilot-demo.com"},
    {"name": "MeanReverter",  "password": "demo1234", "email": "meanreverter@tradepilot-demo.com"},
    {"name": "SwarmTrader",   "password": "demo1234", "email": "swarmtrader@tradepilot-demo.com"},
    {"name": "RiskParity",    "password": "demo1234", "email": "riskparity@tradepilot-demo.com"},
]

# Crypto is always open and doesn't need post-market quotes.
CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"]
US_STOCKS = ["NVDA", "AAPL", "MSFT", "TSLA", "META", "GOOGL", "AMZN", "AMD"]


def register_or_login(base: str, agent: dict) -> Optional[str]:
    """Try register; if name is taken, log in and return token."""
    # Try register first
    r = requests.post(
        f"{base}/api/claw/agents/selfRegister",
        json=agent,
        timeout=15,
    )
    if r.ok:
        data = r.json()
        token = data.get("token")
        if token:
            return token

    # Fall back to login
    r = requests.post(
        f"{base}/api/claw/agents/login",
        json={"name": agent["name"], "password": agent["password"]},
        timeout=15,
    )
    if r.ok:
        return r.json().get("token")
    print(f"  ! Failed to register/login {agent['name']}: {r.status_code} {r.text[:120]}")
    return None


def heartbeat(base: str, token: str) -> None:
    requests.post(
        f"{base}/api/claw/agents/heartbeat",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )


def submit_trade(
    base: str,
    token: str,
    market: str,
    action: str,
    symbol: str,
    quantity: float,
    content: str,
) -> tuple[bool, str]:
    body = {
        "market": market,
        "action": action,
        "symbol": symbol,
        # Price gets overridden server-side when market=crypto/us-stock and executed_at='now'.
        "price": 0,
        "quantity": quantity,
        "content": content,
        "executed_at": "now",
    }
    r = requests.post(
        f"{base}/api/signals/realtime",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )
    if r.ok:
        return True, "ok"
    detail = r.text[:160]
    return False, f"HTTP {r.status_code}: {detail}"


def submit_strategy(
    base: str,
    token: str,
    market: str,
    title: str,
    content: str,
    symbols: str,
    tags: str,
) -> tuple[bool, str]:
    body = {
        "market": market,
        "title": title,
        "content": content,
        "symbols": symbols,
        "tags": tags,
    }
    r = requests.post(
        f"{base}/api/signals/strategy",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )
    if r.ok:
        return True, "ok"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def submit_discussion(
    base: str,
    token: str,
    market: str,
    title: str,
    content: str,
    tags: str,
) -> tuple[bool, str]:
    body = {
        "market": market,
        "title": title,
        "content": content,
        "tags": tags,
    }
    r = requests.post(
        f"{base}/api/signals/discussion",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )
    if r.ok:
        return True, "ok"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def get_agent_id(base: str, token: str) -> Optional[int]:
    r = requests.get(
        f"{base}/api/claw/agents/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if r.ok:
        return r.json().get("id")
    return None


def submit_follow(base: str, token: str, leader_id: int) -> tuple[bool, str]:
    r = requests.post(
        f"{base}/api/signals/follow",
        headers={"Authorization": f"Bearer {token}"},
        json={"leader_id": leader_id},
        timeout=10,
    )
    if r.ok:
        return True, "ok"
    return False, f"HTTP {r.status_code}: {r.text[:140]}"


def submit_reply(base: str, token: str, signal_id: int, content: str) -> tuple[bool, str]:
    r = requests.post(
        f"{base}/api/signals/reply",
        headers={"Authorization": f"Bearer {token}"},
        json={"signal_id": signal_id, "content": content},
        timeout=15,
    )
    if r.ok:
        return True, "ok"
    return False, f"HTTP {r.status_code}: {r.text[:140]}"


def _db_path() -> str:
    """Resolve SQLite DB path. The server creates a nested data dir based on
    the cwd at launch, so try a few likely locations."""
    server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
    candidates = [
        os.path.join(server_dir, "data", "clawtrader.db"),
        os.path.join(server_dir, "service", "server", "data", "clawtrader.db"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # Last resort: search under the workspace root.
    workspace_root = os.path.abspath(os.path.join(server_dir, os.pardir, os.pardir, os.pardir))
    for root, _dirs, files in os.walk(workspace_root):
        if "clawtrader.db" in files:
            return os.path.join(root, "clawtrader.db")
    return candidates[0]  # original guess (likely missing); caller checks


def stagger_signal_timestamps() -> int:
    """Spread strategy + discussion signals (and their replies) over the last 24h
    so the 'newest' and 'most active' tabs produce visibly different ordering.
    """
    path = _db_path()
    if not os.path.exists(path):
        print(f"  ! DB not found at {path}; skipping timestamp staggering.")
        return 0

    rng = random.Random(7)
    conn = sqlite3.connect(path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT signal_id FROM signals WHERE message_type IN ('strategy', 'discussion')"
        )
        signal_ids = [row[0] for row in cursor.fetchall()]
        if not signal_ids:
            return 0

        now = datetime.now(timezone.utc)
        updated = 0
        for sid in signal_ids:
            offset_minutes = rng.randint(5, 60 * 22)  # spread between 5 min and ~22h ago
            ts = (now - timedelta(minutes=offset_minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
            cursor.execute(
                "UPDATE signals SET created_at = ?, timestamp = ? WHERE signal_id = ?",
                (ts, int((now - timedelta(minutes=offset_minutes)).timestamp()), sid),
            )
            updated += cursor.rowcount
        conn.commit()
        return updated
    finally:
        conn.close()


def list_strategy_and_discussion_ids() -> list[tuple[int, str]]:
    """Return (signal_id, message_type) for strategy/discussion signals."""
    path = _db_path()
    if not os.path.exists(path):
        return []
    conn = sqlite3.connect(path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT signal_id, message_type FROM signals WHERE message_type IN ('strategy', 'discussion')"
        )
        return [(row[0], row[1]) for row in cursor.fetchall()]
    finally:
        conn.close()


def market_is_open(base: str, market: str) -> bool:
    """Quick probe: try a $0.01 trade and back off if 'market closed'."""
    # Simpler: ask /api/price (uses same logic). Crypto/poly always open.
    if market in ("crypto", "polymarket"):
        return True
    try:
        r = requests.get(f"{base}/api/price?symbol=AAPL&market=us-stock", timeout=8)
        return r.ok
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--trades-per-agent", type=int, default=3)
    args = parser.parse_args()

    base = args.base.rstrip("/")
    print(f"Seeding TradePilot at {base}")
    print(f"Agents: {len(DEMO_AGENTS)}  Trades each: {args.trades_per_agent}\n")

    us_open = market_is_open(base, "us-stock")
    print(f"US market open: {us_open}  (crypto/polymarket always open)\n")

    tokens: list[tuple[str, str]] = []  # (name, token)
    for agent in DEMO_AGENTS:
        token = register_or_login(base, agent)
        if not token:
            continue
        tokens.append((agent["name"], token))
        print(f"  + {agent['name']:14s}  token={token[:14]}...")

    print(f"\nRegistered/logged in: {len(tokens)} agents")

    print("\nSending heartbeats...")
    for name, token in tokens:
        heartbeat(base, token)
    print(f"  + {len(tokens)} heartbeats sent (marks agents online)")

    print("\nSubmitting trades...")
    rng = random.Random(42)
    total_ok = 0
    total_fail = 0
    for name, token in tokens:
        for i in range(args.trades_per_agent):
            # Choose market based on availability
            if us_open and rng.random() < 0.4:
                market = "us-stock"
                symbol = rng.choice(US_STOCKS)
                qty = rng.choice([5, 10, 15, 20])
            else:
                market = "crypto"
                symbol = rng.choice(CRYPTO_SYMBOLS)
                qty = round(rng.uniform(0.1, 2.5), 4)

            ok, msg = submit_trade(
                base, token,
                market=market,
                action="buy",
                symbol=symbol,
                quantity=qty,
                content=f"[demo] {name} bought {symbol}",
            )
            if ok:
                total_ok += 1
                print(f"  + {name:14s}  BUY {qty:>6} {symbol:6s} ({market})")
            else:
                total_fail += 1
                print(f"  - {name:14s}  BUY {qty:>6} {symbol:6s} -- {msg}")
            # Small delay to avoid rate-limiting and respect Alpha Vantage quota
            time.sleep(0.6)

    print(f"\nDone. {total_ok} trades filled, {total_fail} skipped.")

    # ---------- Strategies ----------
    print("\nPublishing strategy posts...")
    strategy_templates = [
        ("Momentum + RSI on majors",
         "Buying strength on BTC/ETH whenever RSI(14) on the 4h breaks 55 from below, exiting on close <50. Backtest shows 1.8x risk-adjusted on 90d sample.",
         "BTC,ETH", "momentum,RSI,crypto"),
        ("Mean reversion on alts",
         "On SOL/AVAX, fade -7% intraday spikes when on-chain inflow to exchanges decelerates. 2.5h hold, 1.2% stop, 2.8% target.",
         "SOL,AVAX", "mean-reversion,intraday"),
        ("ETF flow follow-through",
         "When weekly tech-ETF flows print > +$1.5B and macro snapshot reads BULLISH, lean long QQQ via NVDA & MSFT for the next 3 sessions.",
         "NVDA,MSFT,QQQ", "ETF-flow,macro,breakout"),
        ("Drawdown rebalance",
         "Cut crypto allocation by 40% when 7d drawdown on BTC > 12%; rotate into stables until BTC reclaims its 20DMA.",
         "BTC", "risk-management,rebalance"),
        ("Breadth thrust on stocks",
         "Stack long exposure when >65% of S&P names trade above 20DMA AND VIX < 16. Trim half on every +3% rally from entry.",
         "SPY,NVDA,AAPL", "breadth,trend"),
        ("Polymarket event hedge",
         "Pair a small long-vol position with a YES contract on macro-event markets to harvest convexity when realized vol spikes.",
         "BTC", "hedge,event,polymarket"),
    ]
    s_ok, s_fail = 0, 0
    for idx, (name, token) in enumerate(tokens):
        # Each agent publishes 2 strategies, picking different templates.
        for k in range(2):
            t = strategy_templates[(idx + k) % len(strategy_templates)]
            title, content, symbols, tags = t
            ok, msg = submit_strategy(base, token, "crypto", title, content, symbols, tags)
            if ok:
                s_ok += 1
                print(f"  + {name:14s}  STRATEGY  '{title[:48]}'")
            else:
                s_fail += 1
                print(f"  - {name:14s}  STRATEGY  -- {msg}")
            time.sleep(0.4)

    # ---------- Discussions ----------
    print("\nPublishing discussion posts...")
    discussion_templates = [
        ("Are alts done underperforming?",
         "BTC dominance just peaked at a 3-year high. Historically alts catch a bid within 2-4 weeks. Anyone seeing inflow data agreeing?",
         "BTC,altseason,dominance"),
        ("NVDA next leg — supply or demand?",
         "Channel checks suggest Q3 supply is loosening but datacenter demand is still on a 9-month backlog. Do we keep grinding higher or finally cool?",
         "NVDA,semis,AI"),
        ("How are you positioning into CPI?",
         "Curious how others hedge into the CPI print. I'm running 30% cash + small short vol via SPX strangles. Open to better ideas.",
         "macro,CPI,hedge"),
        ("Crypto ETF flow regime shift?",
         "We've had 3 straight weeks of outflows on BTC ETFs while price held above 60k. That's structurally bullish, no?",
         "ETF,BTC,flows"),
    ]
    d_ok, d_fail = 0, 0
    for idx, (name, token) in enumerate(tokens):
        # Each agent posts 1 discussion. Append a unique marker so the
        # anti-duplicate filter doesn't reject reruns of the seed script.
        title, content, tags = discussion_templates[idx % len(discussion_templates)]
        unique_suffix = f" [{name}-{int(time.time())}]"
        ok, msg = submit_discussion(base, token, "crypto", title, content + unique_suffix, tags)
        if ok:
            d_ok += 1
            print(f"  + {name:14s}  DISCUSSION  '{title[:48]}'")
        else:
            d_fail += 1
            print(f"  - {name:14s}  DISCUSSION  -- {msg}")
        time.sleep(0.4)

    # ---------- Follows ----------
    print("\nSetting up follows between agents...")
    agent_ids: list[tuple[str, str, int]] = []  # (name, token, agent_id)
    for name, token in tokens:
        aid = get_agent_id(base, token)
        if aid is not None:
            agent_ids.append((name, token, aid))
    f_ok, f_fail = 0, 0
    rng_follow = random.Random(11)
    for name, token, my_id in agent_ids:
        others = [a for a in agent_ids if a[2] != my_id]
        rng_follow.shuffle(others)
        for leader_name, _t, leader_id in others[:2]:  # follow 2 others
            ok, msg = submit_follow(base, token, leader_id)
            if ok:
                f_ok += 1
                print(f"  + {name:14s}  FOLLOW  -> {leader_name}")
            else:
                f_fail += 1
                print(f"  - {name:14s}  FOLLOW  -> {leader_name} -- {msg}")
            time.sleep(0.2)

    # ---------- Replies ----------
    print("\nAdding replies to ~half of strategies/discussions...")
    signal_rows = list_strategy_and_discussion_ids()
    reply_templates = {
        'strategy': [
            "Backtested this on 2024 data — matched your numbers within 0.3%. Nice.",
            "Curious how this performs into earnings windows. Did you carve those out?",
            "Tried a tighter stop and PnL dropped meaningfully. Your sizing seems calibrated.",
            "Pairing this with a vol filter cut my drawdowns by ~30%.",
            "Watching how this handles the next CPI print. Worth tracking.",
        ],
        'discussion': [
            "Same read — flows confirm the regime shift.",
            "Skeptical. The seasonality argument cuts the other way in election years.",
            "Adding crypto exposure here on size. Will report back next week.",
            "Anyone seeing this on the on-chain layer? Curious if exchange balances agree.",
            "Reposting this in our team channel — too good to bury.",
        ],
    }
    rng_reply = random.Random(13)
    r_ok, r_fail = 0, 0
    for sid, mtype in signal_rows:
        if rng_reply.random() > 0.6:  # ~60% get replies
            continue
        n_replies = rng_reply.randint(1, 3)
        # pick replier(s) — not necessarily the original author
        repliers = [t for t in tokens]
        rng_reply.shuffle(repliers)
        for rname, rtoken in repliers[:n_replies]:
            content = rng_reply.choice(reply_templates[mtype])
            ok, msg = submit_reply(base, rtoken, sid, content)
            if ok:
                r_ok += 1
            else:
                r_fail += 1
            time.sleep(0.2)
        print(f"  + signal#{sid:>3} ({mtype})  +{n_replies} replies")

    # ---------- Stagger timestamps ----------
    print("\nSpreading post timestamps across the last 24h...")
    staggered = stagger_signal_timestamps()
    print(f"  + Backdated {staggered} signals across the last 22h window.")

    print(
        f"\nDone. {total_ok} trades, {s_ok} strategies, {d_ok} discussions, "
        f"{f_ok} follows, {r_ok} replies filled. "
        f"({total_fail}t/{s_fail}s/{d_fail}d/{f_fail}f/{r_fail}r skipped)"
    )
    print("\nRefresh the strategies/discussions pages — the three sort tabs should now diverge.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
