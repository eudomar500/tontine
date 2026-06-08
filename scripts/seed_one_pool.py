import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury
from genlayer_py.types import CalldataAddress

load_dotenv(Path(__file__).parent.parent / ".env")

KEYSTORE_PATH = Path(__file__).parent.parent / ".admin-keystore.json"
PASSWORD = os.environ["ADMIN_KEYSTORE_PASSWORD"]
CONTRACT = "0x4cA9bd0d2130773dfA5C9d571d987E4929A23498"

ADMIN = "0xF27E3A6d7Bf4BfC0A837020FD74E73055aF17D53"
WALLET2 = "0xFeE34b22628Fa0D5B8fA64Ba7c49835EcB18e752"

CATALOG = {
    "Crypto": ("Will Ethereum close above 4000 USD this month according to public market data?", ["https://www.coindesk.com/price/ethereum", "https://coinmarketcap.com/currencies/ethereum/"]),
    "Sports": ("Will the home team win the next league match according to official results?", ["https://www.espn.com/soccer/", "https://www.bbc.com/sport/football"]),
    "Politics": ("Will the central bank raise interest rates at the next scheduled meeting?", ["https://www.reuters.com/markets/", "https://www.bloomberg.com/markets"]),
    "Weather": ("Will the maximum temperature exceed 30 degrees Celsius in the capital tomorrow?", ["https://weather.com/", "https://www.accuweather.com/"]),
}

if len(sys.argv) < 2 or sys.argv[1] not in CATALOG:
    print("Usage: python3 scripts/seed_one_pool.py <Crypto|Sports|Politics|Weather>")
    sys.exit(1)

category = sys.argv[1]
terms, sources = CATALOG[category]

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

print(f"Creating [{category}] pool...")
tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="create_pool",
    args=[terms, ["YES", "NO"], sources, [CalldataAddress(ADMIN), CalldataAddress(WALLET2)], 3600, 7260, 0, category],
    value=1100000000000000000,
)
print(f"TX: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
