"""Diagnostic: why is recent_trade_count_7d returning 0?"""
import sqlite3

db = r"C:\Users\bodali\TradePilot\TradePilot\service\server\service\server\data\clawtrader.db"
conn = sqlite3.connect(db)
c = conn.cursor()

print("=== SwarmTrader operation signals (latest 6) ===")
c.execute(
    """
    SELECT s.id, s.message_type, s.symbol, s.created_at
    FROM signals s
    JOIN agents a ON a.id = s.agent_id
    WHERE a.name = ? AND s.message_type = ?
    ORDER BY s.created_at DESC LIMIT 6
    """,
    ("SwarmTrader", "operation"),
)
for r in c.fetchall():
    print(r)

print()
print("=== TestBot operation signals (latest 6) ===")
c.execute(
    """
    SELECT s.id, s.message_type, s.symbol, s.created_at
    FROM signals s
    JOIN agents a ON a.id = s.agent_id
    WHERE a.name = ? AND s.message_type = ?
    ORDER BY s.created_at DESC LIMIT 6
    """,
    ("TestBot", "operation"),
)
for r in c.fetchall():
    print(r)

print()
print("=== SQLite time references ===")
c.execute("SELECT datetime('now') AS now, datetime('now','-7 day') AS week_ago")
print(c.fetchone())

print()
c.execute("SELECT COUNT(*) FROM signals WHERE message_type='operation' AND created_at >= datetime('now','-7 day')")
print("7d operation count:", c.fetchone()[0])
c.execute("SELECT COUNT(*) FROM signals WHERE message_type='operation'")
print("TOTAL operation count:", c.fetchone()[0])

print()
print("=== Comparing one specific created_at value ===")
c.execute("SELECT created_at FROM signals WHERE message_type='operation' ORDER BY created_at DESC LIMIT 1")
sample = c.fetchone()
print("Sample created_at:", sample)
if sample:
    c.execute("SELECT ? >= datetime('now','-7 day') AS cmp_result", sample)
    print("Direct comparison:", c.fetchone())

conn.close()
