# Provider activation checklist

## Coinbase CDP Server Wallet

- Create a CDP project at `portal.cdp.coinbase.com/projects/api-keys` and generate API key credentials (API key ID and API key secret).
- Configure an API-key-controlled smart account and provider policy.
- Verify Base Sepolia USDC receive, balance, and transfer.
- Before mainnet, review transfer policy, gas sponsorship, recovery, and finality.

## Stripe revenue

- Use a restricted test key for Checkout, Invoicing, Refunds, Balance, and Events.
- Verify event polling, duplicate delivery, partial refund, fee, and settlement fixtures.
- Live mode additionally requires account activation, business verification, payout configuration, and an operator review of refund behavior.

## Lithic cards

- Use a sandbox key and verify single-use and merchant-locked card lifecycles.
- Confirm amount controls, authorization, settlement, decline, expiry, and refund.
- Live mode remains disabled until Lithic approves the card program and funding arrangement and confirms production PAN/CVV access and PCI requirements.

## Release truthfulness

Sandbox completion proves orchestration and interface parity, not automatic
liquidity movement between Stripe, Coinbase, and Lithic. Do not label an account
as live closed-loop until a contracted production funding rail and a real
low-value purchase/refund have passed reconciliation.
