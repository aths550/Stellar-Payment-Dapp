# Stellar Payment dApp (Stellar Testnet)

Submission-ready Stellar + React payment application with Freighter wallet integration, transaction feedback UI, and backend transaction logging.

## Project Overview

This dApp allows users to:

- connect/disconnect a Freighter wallet,
- fetch and display live XLM balance from Stellar Testnet,
- send XLM payments,
- view transaction processing status and hash,
- handle common errors with user-friendly messages.

The project also includes a lightweight backend (Express + SQLite) for storing transactions, managing payment requests, and serving admin dashboard analytics.

## Features

### Core White Belt Level 1 Features

- Connect Wallet (Freighter)
- Disconnect Wallet
- Show Wallet Address
- Show XLM Balance
- Send XLM on Stellar Testnet
- Show Transaction Status (loading/success/error)
- Show Transaction Hash
- Clear send form inputs after successful transaction
- Friendly error handling

### Error Handling Covered

- Freighter not installed
- Wallet not connected
- Invalid destination address
- Insufficient balance (reserve-aware check)
- Transaction/signing failure
- Network errors

### Additional Features Included

- Payment request/invoice flow (request XLM and pay from inbox)
- Admin login/register
- Dashboard with transaction charts and ledger table
- SQLite transaction persistence

## Tech Stack

- React + Vite
- Stellar SDK (`@stellar/stellar-sdk`)
- Freighter API (`@stellar/freighter-api`)
- Express.js backend
- SQLite (`sqlite3`)
- CSS (custom styling)

## Project Structure

```text
Stellar Payment Dapp/
├── src/
│   ├── App.js              # Main wallet + send flow + status/error UI
│   ├── main.jsx            # React router entry
│   ├── Login.jsx           # Admin auth UI
│   ├── Dashboard.jsx       # Admin analytics dashboard
│   └── index.css           # Frontend styles
├── server/
│   ├── index.js            # Express API routes
│   ├── db.js               # SQLite setup and schema creation
│   └── data/
│       └── transactions.sqlite
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Prerequisites

- Node.js and npm installed
- Freighter browser extension installed and unlocked
- Stellar Testnet account funded (Friendbot)
  - https://friendbot.stellar.org/

## Setup Instructions

1. Clone the repository:

   ```bash
   git clone https://github.com/aths550/Stellar-Payment-Dapp.git
   cd "Stellar Payment Dapp"
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

## Run the Project Locally

Start backend and frontend in separate terminals:

Terminal 1 (backend):

```bash
npm run server
```

Terminal 2 (frontend):

```bash
npm run dev
```

Alternative (single command):

```bash
npm run dev:all
```

Frontend default URL:

- http://localhost:5173

Backend default URL:

- http://localhost:3001

## Usage Guide

1. Open the app in your browser.
2. Click **Connect Wallet** and approve connection in Freighter.
3. Confirm wallet address and XLM balance are displayed.
4. In **Send XLM**:
   - enter a valid destination (`G...`) address,
   - enter an amount,
   - click **Send XLM**.
5. Observe transaction feedback:
   - loading/progress status while processing,
   - success message + transaction hash on success,
   - error message on failure.
6. Use the transaction hash link to view details on Stellar Expert.

## Build / Submission Validation

Run production build:

```bash
npm run build
```

Optional local preview of build output:

```bash
npm run preview
```

## Important Notes

- The app is configured for **Stellar Testnet**.
- Source accounts must maintain Stellar minimum reserve; spendable balance is checked before submission.
- Backend JWT secret is hardcoded for local development; production deployments should use environment variables.

## Submission Summary

This project satisfies White Belt Level 1 requirements with:

- Wallet connection and disconnection
- Wallet address + XLM balance display
- Testnet XLM transfers
- Transaction status and hash feedback
- Robust transaction and network error handling
