import os
import json
from pathlib import Path
from dotenv import load_dotenv
from eth_account import Account
from eth_utils import keccak
from genlayer_py import create_client
from genlayer_py.chains import testnet_bradbury

load_dotenv(Path(__file__).parent.parent / ".env")

KEYSTORE_PATH = Path(__file__).parent.parent / ".admin-keystore.json"
PASSWORD = os.environ["ADMIN_KEYSTORE_PASSWORD"]

# The live deployment on Bradbury. The upgrade swaps this contract's code in
# place, so the address and all existing state are preserved.
CONTRACT = "0x2F83ECA1974432BEc3192f6a1cC0e015dD4bC118"

# A factual record of what this build changes, surfaced via
# get_pending_upgrade_info.description while the proposal is pending.
DESCRIPTION = "force_refund accepts resolving state, version 2"

with open(KEYSTORE_PATH) as f:
    keystore = json.load(f)
private_key = Account.decrypt(keystore, PASSWORD)
account = Account.from_key(private_key)

client = create_client(chain=testnet_bradbury, account=account)

# Read the committed source verbatim, including the runner header on line 1.
# GenLayer stores the contract source as its on-chain code, so these exact
# bytes are what propose_code_upgrade records and apply_code_upgrade installs.
CONTRACT_SOURCE = Path(__file__).parent.parent / "contracts" / "tontine.py"
code_bytes = CONTRACT_SOURCE.read_bytes()

# Print the digest so it can be matched against
# get_pending_upgrade_info.code_hash after the proposal lands. The contract
# computes the same keccak256 over these bytes.
code_hash = keccak(code_bytes)
print(f"Source: {CONTRACT_SOURCE}")
print(f"Size: {len(code_bytes)} bytes")
print(f"keccak256: 0x{code_hash.hex()}")

tx_hash = client.write_contract(
    address=CONTRACT,
    function_name="propose_code_upgrade",
    args=[code_bytes, DESCRIPTION],
    value=0,
)
print(f"TX hash: {tx_hash}")
print(f"Explorer: https://explorer-bradbury.genlayer.com/tx/{tx_hash}")
