import logging
import json
import os
from decimal import Decimal, ROUND_DOWN

from web3 import Web3
from web3.exceptions import TransactionNotFound, TimeExhausted
from django.conf import settings
from eth_account import Account

logger = logging.getLogger(__name__)

class BlockchainConfigError(Exception):
    pass

class BlockchainTransactionError(Exception):
    pass

class BlockchainService:
    # Standard ERC-20 transfer ABI. AgriGuard treats SMART_CONTRACT_ADDRESS as
    # the payout token address (USDC or another stablecoin), so live settlement
    # is an actual on-chain token transfer rather than a mocked contract call.
    ERC20_ABI = json.loads(
        '[{"constant":false,"inputs":[{"name":"to","type":"address"},'
        '{"name":"value","type":"uint256"}],"name":"transfer","outputs":['
        '{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"}]'
    )

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

        self.token_address = (
            getattr(settings, 'SMART_CONTRACT_ADDRESS', None)
            or os.getenv('SMART_CONTRACT_ADDRESS')
            or os.getenv('USDC_TOKEN_ADDRESS')
        )
        if not self.token_address or not self.w3.is_address(self.token_address):
            raise BlockchainConfigError("SMART_CONTRACT_ADDRESS is not a valid ERC-20 token address.")

        self.payout_decimals = int(os.getenv('WEB3_PAYOUT_DECIMALS', '6'))
        self.contract = self.w3.eth.contract(address=self.token_address, abi=self.ERC20_ABI)

        self.private_key = (
            getattr(settings, 'WEB3_PRIVATE_KEY', None)
            or os.getenv('WEB3_PRIVATE_KEY')
            or os.getenv('ORACLE_PRIVATE_KEY')
        )
        if not self.private_key:
            raise BlockchainConfigError("WEB3_PRIVATE_KEY is not set.")
        self.account = Account.from_key(self.private_key)

    def execute_payout(self, claim_id: int, policy_holder_address: str, amount_usd: Decimal) -> str:
        """
        Execute a payout on the blockchain.
        
        Args:
            claim_id: The internal ID of the claim.
            policy_holder_address: User's wallet address.
            amount_usd: Payout amount in USDC/USD.
            
        Returns:
            tx_hash (str): The transaction hash of the payout.
            
        Raises:
            BlockchainTransactionError on failure.
        """
        logger.info(f"Initiating blockchain payout for Claim ID: {claim_id} to Address: {policy_holder_address}")

        if not self.w3.is_address(policy_holder_address):
            raise BlockchainTransactionError("Invalid policy holder wallet address.")

        raw_amount = Decimal(str(amount_usd))
        if raw_amount <= 0:
            raise BlockchainTransactionError("Payout amount must be greater than zero.")

        token_units = int(
            (raw_amount * (Decimal(10) ** self.payout_decimals)).quantize(
                Decimal('1'), rounding=ROUND_DOWN
            )
        )

        try:
            transaction = self.contract.functions.transfer(
                self.w3.to_checksum_address(policy_holder_address),
                token_units,
            ).build_transaction({
                'from': self.account.address,
                'nonce': self.w3.eth.get_transaction_count(self.account.address),
                'gas': 2000000,
                'gasPrice': self.w3.eth.gas_price
            })

            signed_tx = self.w3.eth.account.sign_transaction(transaction, self.private_key)
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
