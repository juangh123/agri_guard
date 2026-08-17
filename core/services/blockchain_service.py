import logging
import json
from decimal import Decimal
from web3 import Web3
from web3.exceptions import TransactionNotFound, TimeExhausted
from django.conf import settings
from eth_account import Account
import os

logger = logging.getLogger(__name__)

class BlockchainConfigError(Exception):
    pass

class BlockchainTransactionError(Exception):
    pass

class BlockchainService:
    def __init__(self):
        """
        Initialize the connection to the Ethereum/Polygon RPC node.
        """
        rpc_url = (
            getattr(settings, 'WEB3_PROVIDER_URI', None)
            or os.getenv('WEB3_PROVIDER_URI')
            or os.getenv('WEB3_RPC_URL')
        )
        if not rpc_url:
            raise BlockchainConfigError("WEB3_PROVIDER_URI is not set.")
            
        self.w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not self.w3.is_connected():
            raise BlockchainConfigError("Failed to connect to the Web3 node.")
            
        self.contract_address = (
            getattr(settings, 'SMART_CONTRACT_ADDRESS', None)
            or os.getenv('SMART_CONTRACT_ADDRESS')
        )
        if not self.contract_address:
            raise BlockchainConfigError("SMART_CONTRACT_ADDRESS is not set.")
            
        # Optional: Load ABI. For a real app, this should be loaded from a compiled JSON artifact
        # Here we mock a basic ERC20-like trigger function for the MVP: function triggerPayout(uint256 claimId)
        self.abi = json.loads('[{"inputs":[{"internalType":"uint256","name":"claimId","type":"uint256"}],"name":"triggerPayout","outputs":[],"stateMutability":"nonpayable","type":"function"}]')
        
    def execute_payout(self, claim_id: int, policy_holder_address: str, amount_usd: Decimal) -> str:
        """
        Execute a payout on the blockchain.
        
        Args:
            claim_id: The internal ID of the claim.
            policy_holder_address: User's wallet address.
            amount_usd: Payout amount (unused in demo ABI, but kept for signature/logging).
            
        Returns:
            tx_hash (str): The transaction hash of the payout.
            
        Raises:
            BlockchainTransactionError on failure.
        """
        logger.info(f"Initiating blockchain payout for Claim ID: {claim_id} to Address: {policy_holder_address}")
        
        private_key = (
            getattr(settings, 'WEB3_PRIVATE_KEY', None)
            or os.getenv('WEB3_PRIVATE_KEY')
            or os.getenv('ORACLE_PRIVATE_KEY')
        )
        if not private_key:
            raise BlockchainConfigError("WEB3_PRIVATE_KEY is not set.")

        try:
            account = Account.from_key(private_key)
            contract = self.w3.eth.contract(address=self.contract_address, abi=self.abi)
            
            # Using EIP-1559 or legacy tx structure
            transaction = contract.functions.triggerPayout(claim_id).build_transaction({
                'from': account.address,
                'nonce': self.w3.eth.get_transaction_count(account.address),
                'gas': 2000000,
                'gasPrice': self.w3.eth.gas_price
            })

            signed_tx = self.w3.eth.account.sign_transaction(transaction, private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed_tx.rawTransaction)
            
            return self.w3.to_hex(tx_hash)
            
        except Exception as e:
            logger.error(f"Failed to execute payout for Claim ID {claim_id}: {str(e)}")
            raise BlockchainTransactionError(f"Blockchain payout failed: {str(e)}")
            
    def wait_for_tx_receipt(self, tx_hash: str, timeout: int = 120):
        """
        Wait for a transaction to be mined.
        
        Args:
            tx_hash: Transaction hash.
            timeout: Timeout in seconds.
            
        Returns:
            receipt dict
            
        Raises:
            TimeExhausted if mining times out.
        """
        logger.info(f"Waiting for receipt for tx {tx_hash}...")
        return self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=timeout)
