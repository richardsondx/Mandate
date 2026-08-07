# Mandate capability reference

Capability Spec 0.1.0 · Updated 2026-08-07

Mandate capabilities are organized by what an operator asks an agent to accomplish. Run `mandate capabilities --json` or use `list_capabilities` to inspect what is executable for the current economic account.

## Accept a payment

`checkout` · Earn money · Mutation

Let your agent create a checkout using a connected Receive provider.

**Try saying**
- “Create a way for someone to pay me $20.”
- “Give this customer a link to pay $50.”
- “Set up payment for my $30 service.”

**Use when:** Money should come from another party into this economic account through a hosted checkout.

**Do not use when:** The account is paying a merchant; use pay instead.

**Requires:** Receive provider

**Effect:** Creates an external customer payment session.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Invoice a customer

`invoice` · Earn money · Mutation

Let your agent issue an itemized request for payment through a connected Receive provider.

**Try saying**
- “Send a $500 invoice to this customer.”
- “Invoice Atlas Labs $1,200 for the August engagement.”
- “Create an invoice for this completed project.”

**Use when:** A named customer should receive a formal invoice and payment terms.

**Do not use when:** A simple immediate payment link is enough; use checkout instead.

**Requires:** Receive provider

**Effect:** Creates and finalizes an external invoice.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Receive a direct transfer

`receive` · Earn money · Mutation

Give another party a stablecoin address or account endpoint so they can transfer value directly.

**Try saying**
- “Give me a USDC address so this partner can pay us.”
- “Create a receive endpoint on Base.”
- “How can someone transfer USDC directly to this account?”

**Use when:** Another party needs an address or account endpoint to transfer value directly.

**Do not use when:** The payer needs a hosted checkout or invoice.

**Requires:** Hold provider

**Effect:** Creates or returns an external receive endpoint.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Check available money

`balance` · Understand finances · Read only

Understand how much value is held at each provider without treating separate rails as interchangeable.

**Try saying**
- “How much money do you currently have available?”
- “Show me what is available, reserved, pending, and settled.”
- “Where is our operating money held?”

**Use when:** The user wants current provider positions or spending availability.

**Do not use when:** The user wants historical activity; use transactions instead.

**Requires:** Hold provider

**Effect:** Read only.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## See economic activity

`transactions` · Understand finances · Read only

Review incoming, outgoing, pending, and settled economic activity across connected rails.

**Try saying**
- “What happened in this account today?”
- “Show me the latest settled transactions.”
- “Find the payment from Atlas Labs.”

**Use when:** The user wants historical or recent account activity.

**Do not use when:** The user only wants current positions; use balance instead.

**Requires:** No provider route

**Effect:** Read only.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Pay a merchant

`pay` · Use earned capital · Mutation

Create a temporary single-use or merchant-locked card session backed by an available account position.

**Try saying**
- “Use $10 of what you earned to pay for this service.”
- “Create a merchant-locked card for a $49 GitHub bill.”
- “Pay this software invoice with a single-use card.”

**Use when:** Money should go from this economic account to a merchant.

**Do not use when:** Another party is paying this account; use checkout, invoice, or receive.

**Requires:** Spend provider

**Effect:** Creates ephemeral payment credentials and reserves funds.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Transfer existing capital

`transfer` · Use earned capital · Mutation

Send existing capital through a connected treasury provider to an explicit address or destination.

**Try saying**
- “Transfer 25 USDC to this Base address.”
- “Send operating funds to this approved destination.”
- “Move 100 USDC out of treasury.”

**Use when:** Existing capital should move to an explicit external destination.

**Do not use when:** The destination is a merchant checkout needing a controlled card session; use pay.

**Requires:** Hold provider

**Effect:** Submits an external asset transfer.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

## Refund a customer

`refund` · Manage customers · Mutation

Return all or part of a settled customer payment through the original Receive provider.

**Try saying**
- “Refund the customer’s last payment.”
- “Refund $25 from the Atlas Labs transaction.”
- “Return this settled checkout payment.”

**Use when:** A settled incoming customer payment should be reversed.

**Do not use when:** The account is sending a new transfer unrelated to a customer payment.

**Requires:** Receive provider

**Effect:** Submits an external refund against a settled transaction.

Introduced in Mandate 0.1.0 · Updated 2026-08-07

