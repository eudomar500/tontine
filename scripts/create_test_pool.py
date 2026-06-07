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
CONTRACT = "0x8d760a7e33df7A9a3b4F3120a8e66A6Cad4cC7B5"

# Decrypt the keystore in memory; the private key never lands on disk in plaintext.
with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

terms = (
    "Test pool on Bradbury testnet. Will Bitcoin's all-time high price "
    "recorded on public market data sources exceed 120000 USD? "
    "For frontend READ module validation."
)
outcome_labels = ["YES", "NO"]
resolution_sources = [
    "https://www.coingecko.com/en/coins/bitcoin",
    "https://www.statmuse.com/money/ask/bitcoin-price-all-time-high",
]
whitelist = [
    CalldataAddress("0xF27E3A6d7Bf4BfC0A837020FD74E73055aF17D53"),
    CalldataAddress("0xFeE34b22628Fa0D5B8fA64Ba7c49835EcB18e752"),
]
join_deadline_offset = 7200          # 2h
resolution_deadline_offset = 10800   # 3h
creator_outcome_index = 0            # YES

value = 1100000000000000000  # 1.1 GEN (1 GEN creation fee + 0.1 GEN creator stake)

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
    ],
    value=value,
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")

receipt = client.wait_for_transaction_receipt(transaction_hash=tx_hash, status=TransactionStatus.ACCEPTED, retries=200, interval=5000)
print("Receipt status:", receipt.get("status_name", receipt))
