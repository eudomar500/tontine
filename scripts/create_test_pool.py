import os
import json
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury
from genlayer_py.types import TransactionStatus, CalldataAddress

load_dotenv(Path(__file__).parent.parent / ".env")

KEYSTORE_PATH = Path(__file__).parent.parent / ".admin-keystore.json"
PASSWORD = os.environ["ADMIN_KEYSTORE_PASSWORD"]
CONTRACT = "0x4cA9bd0d2130773dfA5C9d571d987E4929A23498"

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

terms = (
    "Is the current price of Bitcoin above 50000 USD according to public "
    "market data sources?"
)
outcome_labels = ["YES", "NO"]
resolution_sources = [
    "https://www.coindesk.com/price/bitcoin",
    "https://coinmarketcap.com/currencies/bitcoin/",
]
whitelist = [
    CalldataAddress("0xF27E3A6d7Bf4BfC0A837020FD74E73055aF17D53"),
    CalldataAddress("0xFeE34b22628Fa0D5B8fA64Ba7c49835EcB18e752"),
]
join_deadline_offset = 3600          # 1h, contract minimum
resolution_deadline_offset = 7260    # just over the 2h minimum gap, small safety margin
creator_outcome_index = 0            # YES

value = 1100000000000000000  # 1.1 GEN (1 creation fee + 0.1 stake)

tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="create_pool",
    args=[
        terms,
        outcome_labels,
        resolution_sources,
        whitelist,
        join_deadline_offset,
        resolution_deadline_offset,
        creator_outcome_index,
        "Crypto",
    ],
    value=value,
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
