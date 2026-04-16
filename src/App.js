import React, { useState } from 'react';
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  StrKey,
} from '@stellar/stellar-sdk';
import {
  isConnected as checkFreighterInstalled,
  requestAccess,
  signTransaction as freighterSignTx,
} from '@stellar/freighter-api';
import { Link } from 'react-router-dom';
import './index.css';


// Stellar Testnet Horizon server
const server = new Horizon.Server('https://horizon-testnet.stellar.org');

// Stellar Expert explorer base URL (testnet)
const EXPLORER_TX_URL = 'https://stellar.expert/explorer/testnet/tx';

// Stellar Horizon result codes → readable messages
const HORIZON_ERRORS = {
  // Operation-level codes
  op_underfunded: 'Insufficient XLM balance (after minimum account reserve).',
  op_no_destination: 'Destination account does not exist. It must be funded via Friendbot first.',
  op_low_reserve: 'Destination account cannot meet the minimum XLM reserve.',
  op_not_authorized: 'This operation is not authorized.',
  op_no_trust: 'Destination account has no trustline for this asset.',
  op_line_full: "Destination account's balance limit would be exceeded.",
  op_bad_auth: 'Source account has bad authorization for this operation.',
  // Transaction-level codes
  tx_bad_seq: 'Sequence number mismatch. Please retry.',
  tx_insufficient_fee: 'Transaction fee is too low.',
  tx_insufficient_balance: 'Your account does not have enough XLM for amount + fee.',
  tx_no_account: 'Source account does not exist on the network.',
  tx_bad_auth: 'Insufficient signatures for the transaction.',
};

const isFreighterAvailable = () =>
  typeof window !== 'undefined' && typeof window.freighterApi !== 'undefined';

const getFriendlyTxErrorMessage = (error) => {
  const rawMessage = (error?.message || '').toLowerCase();
  const resultCodes = error?.response?.data?.extras?.result_codes;
  const opCode = resultCodes?.operations?.[0];
  const txCode = resultCodes?.transaction;
  const horizonReadable = HORIZON_ERRORS[opCode] || HORIZON_ERRORS[txCode];

  if (rawMessage.includes('cancel') || rawMessage.includes('reject')) {
    return 'Transaction was cancelled in Freighter.';
  }

  if (rawMessage.includes('freighter')) {
    return 'Freighter is unavailable. Please install/unlock Freighter and try again.';
  }

  if (!error?.response) {
    return 'Network error: Unable to reach the Stellar network. Please check your internet connection.';
  }

  return horizonReadable || error?.response?.data?.detail || error?.message || 'Unknown error.';
};

function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState({ message: '', type: '' }); // type: 'success' | 'error' | 'info'
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [showTxHash, setShowTxHash] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestReceiver, setRequestReceiver] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requestMemo, setRequestMemo] = useState('');
  const [isSubmitRequestLoading, setIsSubmitRequestLoading] = useState(false);

  // ─── Connect Wallet ────────────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      setShowTxHash(false);

      // 1. Check if the Freighter extension is installed
      if (!isFreighterAvailable()) {
        setStatus({
          message: 'Freighter wallet not installed. Please install the Freighter browser extension.',
          type: 'error',
        });
        return;
      }
      const { error: connErr } = await checkFreighterInstalled();
      if (connErr) {
        setStatus({
          message: 'Unable to connect to Freighter. Please unlock the extension and try again.',
          type: 'error',
        });
        return;
      }

      // 2. Request access — opens the Freighter popup the first time
      const { address, error: accessErr } = await requestAccess();
      if (accessErr) {
        setStatus({
          message: accessErr.message || 'Wallet not connected. Approve access in Freighter and try again.',
          type: 'error',
        });
        return;
      }

      // 3. Store public key and fetch balance
      setWalletAddress(address);
      setIsConnected(true);
      setStatus({ message: 'Wallet connected successfully!', type: 'success' });
      await fetchBalance(address);
      await fetchPendingRequests(address);
    } catch (error) {
      const message = !error?.response
        ? 'Network error: Unable to connect wallet right now. Please try again.'
        : `Connection failed: ${error.message}`;
      setStatus({ message, type: 'error' });
    }
  };

  // ─── Disconnect Wallet ─────────────────────────────────────────────────────
  const disconnectWallet = () => {
    setWalletAddress('');
    setBalance('');
    setBalanceError('');
    setIsConnected(false);
    setReceiver('');
    setAmount('');
    setPendingRequests([]);
    setTxHash('');
    setShowTxHash(false);
    setStatus({ message: 'Wallet disconnected.', type: 'info' });
  };

  // ─── Fetch XLM Balance ─────────────────────────────────────────────────────
  //
  // Loads account details from Horizon, extracts the native (XLM) balance entry,
  // and updates state. Called on connect and after each successful transaction.
  //
  const fetchBalance = async (address) => {
    setIsLoadingBalance(true);
    setBalanceError('');

    try {
      // Fetch full account record from Horizon testnet
      const account = await server.loadAccount(address);

      // account.balances is an array of all asset balances.
      // The native XLM entry always has asset_type === 'native'.
      const xlmEntry = account.balances.find((b) => b.asset_type === 'native');

      // Stellar stores balances as strings with 7 decimal places (stroops / 1e7).
      // We display 7dp to match the SDK's native precision.
      const raw = xlmEntry ? parseFloat(xlmEntry.balance) : 0;
      setBalance(`${raw.toFixed(7)} XLM`);
    } catch (error) {
      if (!error?.response) {
        setBalance('0 XLM');
        setBalanceError('Network error: Unable to reach the Stellar network. Please check your connection.');
      } else if (error?.response?.status === 404) {
        // Account exists on-chain but has not been funded yet.
        // On testnet, use Friendbot: https://friendbot.stellar.org/?addr=<address>
        setBalance('0 XLM');
        setBalanceError('Account not funded. Use Friendbot to activate it on testnet.');
      } else {
        // Generic network / SDK error
        setBalance('');
        setBalanceError(`Failed to fetch balance: ${error.message}`);
      }
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // ─── Fetch Pending Requests ──────────────────────────────────────────────
  const fetchPendingRequests = async (address) => {
    if (!address) return;
    try {
      const response = await fetch(`http://localhost:3001/api/requests/${address}`);
      const payload = await response.json();
      if (payload.success) {
        setPendingRequests(payload.data);
      }
    } catch (error) {
      console.warn('Failed to fetch pending requests', error);
    }
  };

  // ─── Submit Payment Request ────────────────────────────────────────────────
  const submitRequest = async () => {
    setShowTxHash(false);
    if (!isConnected) {
      setStatus({ message: 'Please connect your wallet first.', type: 'error' });
      return;
    }

    const target = requestReceiver.trim();
    if (!target) {
      setStatus({ message: 'Target address is required.', type: 'error' });
      return;
    }
    if (!StrKey.isValidEd25519PublicKey(target)) {
      setStatus({ message: 'Invalid target address.', type: 'error' });
      return;
    }
    if (target === walletAddress) {
      setStatus({ message: 'Cannot request XLM from yourself.', type: 'error' });
      return;
    }

    const amt = parseFloat(requestAmount);
    if (!requestAmount || isNaN(amt) || amt <= 0) {
      setStatus({ message: 'Amount must be positive.', type: 'error' });
      return;
    }

    setIsSubmitRequestLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester: walletAddress,
          target: target,
          amount: amt,
          memo: requestMemo
        })
      });
      const payload = await response.json();
      if (payload.success) {
        setStatus({ message: 'Payment request sent successfully!', type: 'success' });
        setRequestReceiver('');
        setRequestAmount('');
        setRequestMemo('');
      } else {
        throw new Error(payload.error || 'Failed to send request');
      }
    } catch (error) {
      setStatus({ message: `Request failed: ${error.message}`, type: 'error' });
    } finally {
      setIsSubmitRequestLoading(false);
    }
  };

  // ─── Handle Pay Request ───────────────────────────────────────────────────
  const handlePayRequest = async (reqId, requester, amountToPay) => {
    // Fill the send form and trigger send
    setReceiver(requester);
    setAmount(amountToPay.toString());

    // We'll need a way for sendTransaction to know it's fulfilling a request
    // or just mark it as paid manually after successful send.
    // For simplicity, we'll mark as paid in the sendTransaction success block if we have an activeRequestId
    setActiveRequestId(reqId);
  };

  const [activeRequestId, setActiveRequestId] = useState(null);

  // ─── Send Transaction ──────────────────────────────────────────────────────
  //
  // Full pipeline:
  //   validate → load source account → balance check → build tx → sign → submit
  //
  const sendTransaction = async () => {
    setTxHash('');
    setShowTxHash(false);

    if (!isFreighterAvailable()) {
      setStatus({
        message: 'Freighter wallet not installed. Please install Freighter to sign transactions.',
        type: 'error',
      });
      return;
    }

    // ── Step 1: Input validation ──────────────────────────────────────────────
    if (!isConnected || !walletAddress) {
      setStatus({ message: 'Wallet not connected. Please connect your wallet first.', type: 'error' });
      return;
    }

    const dest = receiver.trim();
    if (!dest) {
      setStatus({ message: 'Destination address is required.', type: 'error' });
      return;
    }
    // StrKey validates the checksum and encoding of the G... address
    if (!StrKey.isValidEd25519PublicKey(dest)) {
      setStatus({
        message: 'Invalid destination address. Must be a valid Stellar G... public key.',
        type: 'error',
      });
      return;
    }
    if (dest === walletAddress) {
      setStatus({ message: 'Cannot send XLM to your own address.', type: 'error' });
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setStatus({ message: 'Amount must be a positive number.', type: 'error' });
      return;
    }
    // Stellar amounts: max 7 decimal places (1 stroop = 0.0000001 XLM)
    const amountStr = amountNum.toFixed(7);

    setIsSending(true);
    setStatus({ message: 'Processing transaction...', type: 'info' });

    try {
      // ── Step 2: Load source account (sequence number) ───────────────────────
      setStatus({ message: 'Loading account...', type: 'info' });
      const sourceAccount = await server.loadAccount(walletAddress);

      // ── Step 3: Check spendable balance ────────────────────────────────────
      // Stellar requires every account to maintain a minimum reserve.
      // Base reserve = 1 XLM + 0.5 XLM per subentry (trustlines, offers, etc.).
      // We compute a conservative spendable amount to give the user a clear error
      // before the transaction reaches the network.
      const xlmEntry = sourceAccount.balances.find((b) => b.asset_type === 'native');
      const totalBalance = parseFloat(xlmEntry?.balance ?? '0');
      const subentryCount = sourceAccount.subentry_count ?? 0;
      const minReserve = (2 + subentryCount) * 0.5; // base reserve formula
      const spendable = totalBalance - minReserve;

      if (amountNum > spendable) {
        setStatus({
          message:
            `Insufficient balance. Spendable: ${spendable.toFixed(7)} XLM ` +
            `(${totalBalance.toFixed(7)} total − ${minReserve.toFixed(1)} XLM reserve).`,
          type: 'error',
        });
        return;
      }

      // ── Step 4: Build transaction ───────────────────────────────────────────
      setStatus({ message: 'Building transaction...', type: 'info' });
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: dest,
            asset: Asset.native(),
            amount: amountStr,
          })
        )
        .setTimeout(30)
        .build();

      // ── Step 5: Sign with Freighter ─────────────────────────────────────────
      setStatus({ message: 'Waiting for Freighter signature...', type: 'info' });
      const { signedTxXdr, error: signErr } = await freighterSignTx(
        transaction.toXDR(),
        { networkPassphrase: Networks.TESTNET }
      );
      if (signErr) {
        throw new Error(signErr.message || 'Signing cancelled or failed.');
      }

      // ── Step 6: Submit to Horizon ───────────────────────────────────────────
      setStatus({ message: 'Submitting to Horizon...', type: 'info' });
      const txResult = await server.submitTransaction(
        TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
      );

      // ── Step 7: Success ─────────────────────────────────────────────────────
      setTxHash(txResult.hash);
      setShowTxHash(true);
      setStatus({ message: 'Transaction successful!', type: 'success' });

      // Dispatch to Backend
      try {
        await fetch('http://localhost:3001/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tx_hash: txResult.hash,
            sender: walletAddress,
            receiver: dest,
            amount: amountNum
          })
        });
      } catch (e) {
        console.warn('Backend sync failed', e);
      }

      setReceiver('');
      setAmount('');

      // Mark request as paid if applicable
      if (activeRequestId) {
        try {
          await fetch(`http://localhost:3001/api/requests/${activeRequestId}/pay`, {
            method: 'PUT'
          });
          setActiveRequestId(null);
          await fetchPendingRequests(walletAddress);
        } catch (e) {
          console.warn('Failed to mark request as paid', e);
        }
      }

      await fetchBalance(walletAddress);
    } catch (error) {
      const readable = getFriendlyTxErrorMessage(error);

      setStatus({
        message: `Transaction failed: ${readable}`,
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const truncate = (addr) => (addr ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : '');

  const getStatusClass = (type) => {
    if (type === 'success') return 'status-success';
    if (type === 'error') return 'status-error';
    if (type === 'info') return 'status-info';
    return '';
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-page">
      {/* 3D Background Decoration */}
      <div className="bg-3d-container">
        <div className="shape-3d sphere-1"></div>
        <div className="shape-3d sphere-2"></div>
      </div>

      <div className="container">

        {/* Header */}
        <header className="header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className="title">Stellar Payment dApp</h1>
            <span className="badge">Testnet</span>
          </div>
          <Link to="/dashboard" className="btn btn-blue" style={{ width: 'auto', textDecoration: 'none', padding: '8px 12px', fontSize: '12px' }}>
            Admin Dashboard
          </Link>
        </header>

        {/* Wallet Card */}
        <div className="glass-card">
          <h2 className="card-title">Wallet</h2>

          <div className="button-row">
            <button
              className={`btn btn-blue ${isConnected ? 'btn-disabled' : ''}`}
              onClick={connectWallet}
              disabled={isConnected}
            >
              Connect Wallet
            </button>
            <button
              className={`btn btn-red ${!isConnected ? 'btn-disabled' : ''}`}
              onClick={disconnectWallet}
              disabled={!isConnected}
            >
              Disconnect Wallet
            </button>
          </div>

          <div className="info-row">
            <span className="info-label">Address</span>
            <span className={`info-value ${!isConnected ? 'disconnected' : ''}`}>
              {isConnected ? truncate(walletAddress) : 'Not connected'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">XLM Balance</span>
            <span className="balance-right">
              {isLoadingBalance ? (
                <span className="loading-dot">Fetching...</span>
              ) : (
                <span className="info-value">{balance || '—'}</span>
              )}
              {isConnected && (
                <button
                  className="refresh-btn"
                  onClick={() => fetchBalance(walletAddress)}
                  disabled={isLoadingBalance}
                  title="Refresh balance"
                >
                  ⟳
                </button>
              )}
            </span>
          </div>
          {balanceError && (
            <p className="balance-err">{balanceError}</p>
          )}
        </div>

        {/* Pending Requests Inbox */}
        {isConnected && pendingRequests.length > 0 && (
          <div className="glass-card inbox-card" style={{ animationDelay: '0s' }}>
            <h2 className="card-title">Pending Invoices</h2>
            <div className="inbox-list">
              {pendingRequests.map((req) => (
                <div key={req.id} className="request-item">
                  <div className="request-header">
                    <div className="request-meta">
                      <span className="info-label" style={{ fontSize: '10px' }}>From: {truncate(req.requester)}</span>
                      <span className="request-amount">{req.amount} XLM</span>
                    </div>
                    <span className="info-label" style={{ fontSize: '10px' }}>{new Date(req.timestamp).toLocaleDateString()}</span>
                  </div>
                  {req.memo && <div className="request-memo">"{req.memo}"</div>}
                  <div className="request-actions">
                    <button
                      className="btn btn-green btn-small"
                      onClick={() => handlePayRequest(req.id, req.requester, req.amount)}
                      disabled={isSending}
                    >
                      Pay Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Send XLM Card */}
        <div className="glass-card">
          <h2 className="card-title">Send XLM</h2>

          <div className="field">
            <label className="field-label">Destination Address</label>
            <input
              className="input"
              type="text"
              placeholder="G..."
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="field">
            <label className="field-label">Amount (XLM)</label>
            <input
              className="input"
              type="number"
              placeholder="0.0000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.0000001"
              step="0.0000001"
              disabled={isSending}
            />
          </div>

          <button
            className={`btn btn-green ${(!isConnected || isSending) ? 'btn-disabled' : ''}`}
            onClick={sendTransaction}
            disabled={!isConnected || isSending}
          >
            {isSending ? (
              <>
                <svg className="spinner" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending...
              </>
            ) : (
              'Send XLM'
            )}
          </button>
        </div>

        {/* Request XLM Card */}
        <div className="glass-card" style={{ animationDelay: '0.1s' }}>
          <h2 className="card-title">Request XLM</h2>
          <p className="status-text" style={{ fontSize: '12px', opacity: 0.7, marginBottom: '16px' }}>
            Ask a friend to pay you. They will see this in their inbox.
          </p>

          <div className="field">
            <label className="field-label">Friend's Address</label>
            <input
              className="input"
              type="text"
              placeholder="G..."
              value={requestReceiver}
              onChange={(e) => setRequestReceiver(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">Amount (XLM)</label>
            <input
              className="input"
              type="number"
              placeholder="0.0000000"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              min="0.0000001"
              step="0.0000001"
            />
          </div>

          <div className="field">
            <label className="field-label">Memo (Note)</label>
            <input
              className="input"
              type="text"
              placeholder="For dinner, etc."
              value={requestMemo}
              onChange={(e) => setRequestMemo(e.target.value)}
              maxLength="28"
            />
          </div>

          <button
            className={`btn btn-blue ${(!isConnected || isSubmitRequestLoading) ? 'btn-disabled' : ''}`}
            onClick={submitRequest}
            disabled={!isConnected || isSubmitRequestLoading}
          >
            {isSubmitRequestLoading ? 'Sending Request...' : 'Send Payment Request'}
          </button>
        </div>

        {/* Status Card */}
        {status.message && (
          <div className={`glass-card status-card ${getStatusClass(status.type)}`}>
            <h2 className="card-title">
              {isSending && (
                <svg className="spinner spinner-small" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSending ? 'Processing...' : 'Status'}
            </h2>
            <div className="status-content">
              <p className="status-text">{status.message}</p>
            </div>
            {txHash && showTxHash && status.type === 'success' && (
              <div className="hash-container">
                <span className="hash-label">Transaction Hash:</span>
                <span className="hash-value">{txHash}</span>
                <a
                  href={`${EXPLORER_TX_URL}/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="explorer-link"
                >
                  View on Stellar Expert ↗
                </a>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
