import os
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury

load_dotenv(Path(__file__).parent.parent / ".env")

# Second wallet (already staked on NO) increases its stake.
PRIVATE_KEY = os.environ["WALLET2_PRIVATE_KEY"]
CONTRACT = "0xc97F342aC85d5d03985660B6786bf72959fD1c25"

account = Account.from_key(PRIVATE_KEY)
client = create_client(chain=testnet_bradbury, account=account)

pool_id = 1
value = 50000000000000000   # 0.05 GEN added to the existing NO stake

tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="increase_stake",
    args=[pool_id],
    value=value,
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
