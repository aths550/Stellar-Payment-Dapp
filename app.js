let userPublicKey = "";
const server = new StellarSdk.Server("https://horizon-testnet.stellar.org");

// CONNECT WALLET
document.getElementById("connectBtn").onclick = async () => {
    try {
        if (!window.freighterApi) {
            alert("Freighter wallet not installed!");
            return;
        }

        userPublicKey = await window.freighterApi.getPublicKey();

        document.getElementById("walletAddress").innerText = userPublicKey;

        getBalance();

    } catch (error) {
        console.log(error);
        alert("Wallet connection failed");
    }
};

// DISCONNECT WALLET
document.getElementById("disconnectBtn").onclick = () => {
    userPublicKey = "";
    document.getElementById("walletAddress").innerText = "Not Connected";
    document.getElementById("balance").innerText = "0 XLM";
    document.getElementById("status").innerText = "Wallet Disconnected";
};

// FETCH BALANCE
async function getBalance() {
    try {
        const account = await server.loadAccount(userPublicKey);
        const balances = account.balances;

        balances.forEach(balance => {
            if (balance.asset_type === "native") {
                document.getElementById("balance").innerText =
                    balance.balance + " XLM";
            }
        });

    } catch (error) {
        console.log(error);
    }
}

// SEND XLM
document.getElementById("sendBtn").onclick = async () => {

    const receiver = document.getElementById("receiver").value;
    const amount = document.getElementById("amount").value;

    if (!receiver || !amount) {
        alert("Enter receiver and amount");
        return;
    }

    try {
        const sourceAccount = await server.loadAccount(userPublicKey);

        const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: StellarSdk.Networks.TESTNET
        })
        .addOperation(
            StellarSdk.Operation.payment({
                destination: receiver,
                asset: StellarSdk.Asset.native(),
                amount: amount
            })
        )
        .setTimeout(30)
        .build();

        // SIGN TRANSACTION USING FREIGHTER
        const signedTx = await window.freighterApi.signTransaction(
            transaction.toXDR(),
            StellarSdk.Networks.TESTNET
        );

        // SUBMIT TRANSACTION
        const txResult = await server.submitTransaction(
            StellarSdk.TransactionBuilder.fromXDR(
                signedTx,
                StellarSdk.Networks.TESTNET
            )
        );

        document.getElementById("status").innerText =
            "Transaction Successful! Hash: " + txResult.hash;

    } catch (error) {
        console.log(error);
        document.getElementById("status").innerText =
            "Transaction Failed!";
    }
};