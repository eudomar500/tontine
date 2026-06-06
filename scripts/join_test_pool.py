import os
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury

load_dotenv(Path(__file__).parent.parent / ".env")

# Second whitelisted wallet joins; its key is a raw private key, not a keystore.
PRIVATE_KEY = os.environ["WALLET2_PRIVATE_KEY"]
CONTRACT = "0xF3Fa92460839e06D3763e8f2C0896fA8b83EC88D"

account = Account.from_key(PRIVATE_KEY)
client = create_client(chain=testnet_bradbury, account=account)

pool_id = 1
outcome_index = 1            # NO (the creator backed YES)
value = 100000000000000000   # 0.1 GEN stake (full value, no creation fee on join)

tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="join_pool",
    args=[pool_id, outcome_index],
    value=value,
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
