import os
import json
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury

load_dotenv(Path(__file__).parent.parent / ".env")

# request_resolution must be called by a whitelisted member. Admin is whitelisted.
KEYSTORE_PATH = Path(__file__).parent.parent / ".admin-keystore.json"
PASSWORD = os.environ["ADMIN_KEYSTORE_PASSWORD"]
CONTRACT = "0xB59455b38F9D3f39ccccF7d48e949aaa1b7eCCd2"

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

# Not payable. Triggers the LLM resolution over the pool sources.
tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="request_resolution",
    args=[1],
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
