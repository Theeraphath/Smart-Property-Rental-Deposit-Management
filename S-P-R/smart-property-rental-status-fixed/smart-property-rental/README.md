# EstateFlow — Smart Property Rental & Deposit Management

Vanilla HTML, CSS and JavaScript frontend using Ethers.js v6 and MetaMask. A matching Solidity demo contract is included for deployment through Remix.

## Included
- `index.html` — dashboard and forms
- `style.css` — responsive styling
- `app.js` — MetaMask connection and contract calls
- `contracts/RentalDepositManager.sol` — matching demo contract

## Quick start

1. Open `contracts/RentalDepositManager.sol` and copy it into Remix.
2. In Remix, compile with Solidity `0.8.20` or newer.
3. In Deploy & Run Transactions, choose **Injected Provider - MetaMask**.
4. Switch MetaMask to **Sepolia test network** (or another EVM network you intend to use), then deploy the contract. Use test ETH only.
5. Copy the deployed contract address.
6. Open `app.js` and paste the address into `CONTRACT_ADDRESS`.
7. Serve this folder from `http://localhost` using VS Code Live Server (recommended), or another local static server. Do not open `index.html` directly as a `file://` URL.
8. Connect MetaMask using the same network where you deployed the contract.

## Demo workflow
1. Owner wallet registers a property.
2. Owner creates an agreement for a tenant address, with future start/end dates.
3. Tenant connects MetaMask and confirms the agreement.
4. Tenant deposits the exact security deposit in ETH.
5. Tenant can make rent payments (each payment transfers to owner).
6. Owner can end the agreement and refund the deposit.
7. Either party can raise a dispute. The contract deployer/arbiter resolves it and selects tenant refund or owner payout.

## Important limitations / security notes
- This is an educational prototype, not audited production software.
- The deployer is the arbiter in this sample. For a real service, use a trusted multisig or independent dispute-resolution process.
- The contract records payment counts and emits events; it does not implement monthly due dates, late fees, automatic recurring payments, identity verification, or document storage.
- The owner can refund and end an active agreement at any time in this demo. Production rules should include agreed termination conditions and evidence handling.
- Dispute reasons are public on-chain. Do not submit private or sensitive information.
- Transactions are irreversible after confirmation. Test on Sepolia with test ETH only.
- The included frontend ABI is matched to the included Solidity contract. If you already have your own Remix contract, its ABI and function signatures may differ and the frontend must be adapted.
