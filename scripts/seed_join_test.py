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
CONTRACT = "0xc97F342aC85d5d03985660B6786bf72959fD1c25"

ADMIN = "0xF27E3A6d7Bf4BfC0A837020FD74E73055aF17D53"
WALLET2 = "0xFeE34b22628Fa0D5B8fA64Ba7c49835EcB18e752"

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

# Test pool for live join validation: 24h join window so it stays open while testing.
print("Creating join-test pool (24h join window)...")
tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="create_pool",
    args=[
        "Will Bitcoin close above 100000 USD this year according to public market data?",
        ["YES", "NO"],
        ["https://www.coindesk.com/price/bitcoin", "https://coinmarketcap.com/currencies/bitcoin/"],
        [CalldataAddress(ADMIN), CalldataAddress(WALLET2)],
        86400,
        90000,
        0,
        "Crypto",
        "Join Test Room",
    ],
    value=1100000000000000000,
)
print(f"TX: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
