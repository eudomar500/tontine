import os
import json
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury

load_dotenv(Path(__file__).parent.parent / ".env")

# Admin backed YES (the winning outcome) and claims the pari-mutuel payout.
KEYSTORE_PATH = Path(__file__).parent.parent / ".admin-keystore.json"
PASSWORD = os.environ["ADMIN_KEYSTORE_PASSWORD"]
CONTRACT = "0x4cA9bd0d2130773dfA5C9d571d987E4929A23498"

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="claim_winnings",
    args=[1],
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
