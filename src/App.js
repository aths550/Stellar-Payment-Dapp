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

// Stellar Testnet Horizon server
const server = new Horizon.Server('https://horizon-testnet.stellar.org');

// Stellar Expert explorer base URL (testnet)
const EXPLORER_TX_URL = 'https://stellar.expert/explorer/testnet/tx';

// Stellar Horizon result codes → readable messages
const HORIZON_ERRORS = {
  // Operation-level codes
  op_underfunded:   'Insufficient XLM balance (after minimum account reserve).',
  op_no_destination:'Destination account does not exist. It must be funded via Friendbot first.',
  op_low_reserve:   'Destination account cannot meet the minimum XLM reserve.',
  op_not_authorized:'This operation is not authorized.',
  op_no_trust:      'Destination account has no trustline for this asset.',
  op_line_full:     "Destination account's balance limit would be exceeded.",
  op_bad_auth:      'Source account has bad authorization for this operation.',
  // Transaction-level codes
  tx_bad_seq:       'Sequence number mismatch. Please retry.',
  tx_insufficient_fee: 'Transaction fee is too low.',
  tx_no_account:    'Source account does not exist on the network.',
  tx_bad_auth:      'Insufficient signatures for the transaction.',
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
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  // ─── Connect Wallet ────────────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      // 1. Check if the Freighter extension is installed
      const { isConnected: installed, error: connErr } = await checkFreighterInstalled();
      if (connErr || !installed) {
        setStatus({
          message: 'Freighter wallet not installed. Please install the Freighter browser extension.',
          type: 'error',
        });
        return;
      }

      // 2. Request access — opens the Freighter popup the first time
      const { address, error: accessErr } = await requestAccess();
      if (accessErr) {
        setStatus({ message: `Access denied: ${accessErr.message}`, type: 'error' });
        return;
      }

      // 3. Store public key and fetch balance
      setWalletAddress(address);
      setIsConnected(true);
      setStatus({ message: 'Wallet connected successfully!', type: 'success' });
      await fetchBalance(address);
    } catch (error) {
      setStatus({ message: `Connection failed: ${error.message}`, type: 'error' });
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
      if (error?.response?.status === 404) {
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

  // ─── Send Transaction ──────────────────────────────────────────────────────
  //
  // Full pipeline:
  //   validate → load source account → balance check → build tx → sign → submit
  //
  const sendTransaction = async () => {
    setTxHash('');

    // ── Step 1: Input validation ──────────────────────────────────────────────
    if (!isConnected) {
      setStatus({ message: 'Please connect your wallet first.', type: 'error' });
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
        setIsSending(false);
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
        throw new Error(`Signing cancelled or failed: ${signErr.message}`);
      }

      // ── Step 6: Submit to Horizon ───────────────────────────────────────────
      setStatus({ message: 'Submitting to Horizon...', type: 'info' });
      const txResult = await server.submitTransaction(
        TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
      );

      // ── Step 7: Success ─────────────────────────────────────────────────────
      setTxHash(txResult.hash);
      setStatus({ message: 'Transaction successful!', type: 'success' });
      setReceiver('');
      setAmount('');
      await fetchBalance(walletAddress);
    } catch (error) {
      // Parse Horizon result codes into readable messages
      const resultCodes = error?.response?.data?.extras?.result_codes;
      const opCode = resultCodes?.operations?.[0];
      const txCode = resultCodes?.transaction;
      const readable = HORIZON_ERRORS[opCode] || HORIZON_ERRORS[txCode];

      setStatus({
        message: `Transaction failed: ${readable || error.message || 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const truncate = (addr) => (addr ? `${addr.slice(0, 10)}...${addr.slice(-8)}` : '');

  const statusColor = { success: '#16a34a', error: '#dc2626', info: '#2563eb' };
  const statusBg   = { success: '#f0fdf4', error: '#fef2f2', info: '#eff6ff' };
  const statusBorder = { success: '#86efac', error: '#fca5a5', info: '#93c5fd' };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.container}>

        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.title}>Stellar Payment dApp</h1>
          <span style={styles.badge}>Testnet</span>
        </header>

        {/* Wallet Card */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Wallet</h2>

          <div style={styles.buttonRow}>
            <button
              style={{ ...styles.btn, ...styles.btnBlue, ...(isConnected && styles.btnDisabled) }}
              onClick={connectWallet}
              disabled={isConnected}
            >
              Connect Wallet
            </button>
            <button
              style={{ ...styles.btn, ...styles.btnRed, ...(!isConnected && styles.btnDisabled) }}
              onClick={disconnectWallet}
              disabled={!isConnected}
            >
              Disconnect Wallet
            </button>
          </div>

          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Address</span>
            <span style={{ ...styles.infoValue, color: isConnected ? '#111827' : '#9ca3af' }}>
              {isConnected ? truncate(walletAddress) : 'Not connected'}
            </span>
          </div>
          <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
            <span style={styles.infoLabel}>XLM Balance</span>
            <span style={styles.balanceRight}>
              {isLoadingBalance ? (
                <span style={styles.loadingDot}>Fetching...</span>
              ) : (
                <span style={styles.infoValue}>{balance || '—'}</span>
              )}
              {isConnected && (
                <button
                  style={styles.refreshBtn}
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
            <p style={styles.balanceErr}>{balanceError}</p>
          )}
        </div>

        {/* Send XLM Card */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Send XLM</h2>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Destination Address</label>
            <input
              style={styles.input}
              type="text"
              placeholder="G..."
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.fieldLabel}>Amount (XLM)</label>
            <input
              style={styles.input}
              type="number"
              placeholder="0.0000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.0000001"
              step="0.0000001"
            />
          </div>

          <button
            style={{
              ...styles.btn,
              ...styles.btnGreen,
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              ...((!isConnected || isSending) && styles.btnDisabled),
            }}
            onClick={sendTransaction}
            disabled={!isConnected || isSending}
          >
            {isSending ? 'Sending...' : 'Send XLM'}
          </button>
        </div>

        {/* Status Card */}
        {status.message && (
          <div
            style={{
              ...styles.card,
              background: statusBg[status.type] || '#fff',
              border: `1px solid ${statusBorder[status.type] || '#e5e7eb'}`,
            }}
          >
            <h2 style={styles.cardTitle}>Transaction Status</h2>
            <p
              style={{
                ...styles.statusText,
                color: statusColor[status.type] || '#374151',
              }}
            >
              {status.message}
            </p>
            {/* Clickable explorer link shown only on success */}
            {txHash && (
              <a
                href={`${EXPLORER_TX_URL}/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.explorerLink}
              >
                View on Stellar Expert ↗
              </a>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    fontFamily: "'Segoe UI', system-ui, -apple-system, Arial, sans-serif",
    padding: '40px 16px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: '500px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    background: '#dbeafe',
    color: '#1d4ed8',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '999px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  card: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '20px 22px',
    marginBottom: '16px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  },
  cardTitle: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '18px',
  },
  btn: {
    flex: 1,
    padding: '9px 14px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    lineHeight: '1.4',
  },
  btnBlue: {
    background: '#3b82f6',
    color: '#fff',
  },
  btnRed: {
    background: '#ef4444',
    color: '#fff',
  },
  btnGreen: {
    background: '#10b981',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f3f4f6',
  },
  infoLabel: {
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: '13px',
    color: '#111827',
    fontWeight: '500',
    textAlign: 'right',
    wordBreak: 'break-all',
    maxWidth: '280px',
  },
  balanceRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  loadingDot: {
    fontSize: '12px',
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '2px 7px',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#6b7280',
    lineHeight: '1.4',
  },
  balanceErr: {
    margin: '8px 0 0 0',
    fontSize: '12px',
    color: '#dc2626',
    lineHeight: '1.5',
  },
  field: {
    marginBottom: '14px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '13px',
    color: '#374151',
    fontWeight: '500',
    marginBottom: '6px',
  },
  input: {
    display: 'block',
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#111827',
    background: '#f9fafb',
    boxSizing: 'border-box',
    outline: 'none',
  },
  statusText: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  explorerLink: {
    display: 'inline-block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#2563eb',
    textDecoration: 'none',
    borderBottom: '1px solid #bfdbfe',
    paddingBottom: '1px',
  },
};

export default App;
