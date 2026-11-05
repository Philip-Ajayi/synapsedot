#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
pub mod synapse_receiver {
    use ink::storage::Mapping;

    #[ink(storage)]
    pub struct SynapseReceiver {
        /// The authorized relayer address allowed to execute cross-calls.
        relayer: AccountId,
        /// Contract owner for administrative actions.
        owner: AccountId,
        /// Total minted token balance per Substrate AccountId.
        balances: Mapping<AccountId, Balance>,
        /// Tracks processed cross-runtime transaction nonces per EVM sender.
        processed_counts: Mapping<[u8; 20], u64>,
        /// Total synthetic POT minted on the WASM runtime.
        total_supply: Balance,
    }

    /// Emitted when a cross-runtime mint is successfully processed from EVM.
    #[ink(event)]
    pub struct MintedFromEVM {
        #[ink(topic)]
        origin_evm: [u8; 20],
        #[ink(topic)]
        recipient: AccountId,
        amount: Balance,
    }

    /// Emitted when the relayer identity is updated.
    #[ink(event)]
    pub struct RelayerUpdated {
        new_relayer: AccountId,
    }

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        Unauthorized,
        ZeroAmount,
        Overflow,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    impl SynapseReceiver {
        #[ink(constructor)]
        pub fn new(relayer: AccountId) -> Self {
            let caller = Self::env().caller();
            Self {
                relayer,
                owner: caller,
                balances: Mapping::default(),
                processed_counts: Mapping::default(),
                total_supply: 0,
            }
        }

        /// Cross-runtime target message invoked by the SynapseDOT Relayer.
        /// Selector fixed to 0x3a5b6c7d to match EVM Dispatcher & Transcoder definition.
        #[ink(message, selector = 0x3a5b6c7d)]
        pub fn mint_from_evm(
            &mut self,
            origin_evm: [u8; 20],
            recipient: AccountId,
            amount: Balance,
        ) -> Result<()> {
            let caller = self.env().caller();
            if caller != self.relayer && caller != self.owner {
                return Err(Error::Unauthorized);
            }
            if amount == 0 {
                return Err(Error::ZeroAmount);
            }

            let current_balance = self.balances.get(recipient).unwrap_or(0);
            let new_balance = current_balance.checked_add(amount).ok_or(Error::Overflow)?;
            self.balances.insert(recipient, &new_balance);

            let new_total = self.total_supply.checked_add(amount).ok_or(Error::Overflow)?;
            self.total_supply = new_total;

            let count = self.processed_counts.get(origin_evm).unwrap_or(0);
            self.processed_counts.insert(origin_evm, &(count + 1));

            self.env().emit_event(MintedFromEVM {
                origin_evm,
                recipient,
                amount,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn balance_of(&self, account: AccountId) -> Balance {
            self.balances.get(account).unwrap_or(0)
        }

        #[ink(message)]
        pub fn total_supply(&self) -> Balance {
            self.total_supply
        }

        #[ink(message)]
        pub fn processed_count(&self, origin_evm: [u8; 20]) -> u64 {
            self.processed_counts.get(origin_evm).unwrap_or(0)
        }

        #[ink(message)]
        pub fn set_relayer(&mut self, new_relayer: AccountId) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.relayer = new_relayer;
            self.env().emit_event(RelayerUpdated { new_relayer });
            Ok(())
        }
    }
}