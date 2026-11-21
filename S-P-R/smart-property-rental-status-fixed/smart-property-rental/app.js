// EstateFlow frontend - Vanilla JavaScript + Ethers.js v6
// 1) Deploy RentalDepositManager.sol from Remix.
// 2) Paste the deployed address below.
// 3) Open the site through Live Server (http://localhost), not file://.

const CONTRACT_ADDRESS = "0x0489121AfeB9DD3aF2D6DD1904D2E45b7B2CDAd9";

// Sepolia test network
const SEPOLIA_CHAIN_ID = "0xaa36a7";
const SEPOLIA_CHAIN_ID_DECIMAL = 11155111;

const ABI = [
  "function owner() view returns (address)",
  "function arbiter() view returns (address)",
  "function propertyCount() view returns (uint256)",
  "function getProperty(uint256) view returns (uint256,string,string,address,uint256,uint256,bool)",
  "function agreementCount() view returns (uint256)",
  "function getAgreement(uint256) view returns (uint256,uint256,address,address,uint64,uint64,uint256,uint256,uint8,bool)",
  "function registerProperty(string,string,uint256,uint256)",
  "function createAgreement(uint256,address,uint64,uint64)",
  "function confirmAgreement(uint256)",
  "function depositSecurity(uint256) payable",
  "function recordRentalPayment(uint256) payable",
  "function refundDeposit(uint256)",
  "function raiseDispute(uint256,string)",
  "function resolveDispute(uint256,bool)"
];

let provider = null;
let signer = null;
let contract = null;
let account = null;
let arbiterAddress = null;

const $ = (id) => document.getElementById(id);
const statusNames = ["Pending", "Active", "Completed", "Disputed"];
const short = (address) =>
  address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "—";
const eth = (value) => `${ethers.formatEther(value)} ETH`;
const dateText = (value) =>
  new Date(Number(value) * 1000).toLocaleDateString();

function toast(message, isError = false) {
  const element = $("toast");
  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.className = `toast show${isError ? " error" : ""}`;

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.className = "toast";
  }, 5000);
}

function setConnectionStatus(status, detail, connected = false) {
  const statusElement = $("network-status");
  const detailElement = $("network-label");
  const dot = document.querySelector(".network-dot");
  const chainPillDot = document.querySelector(".chain-pill i");

  if (statusElement) statusElement.textContent = status;
  if (detailElement) detailElement.textContent = detail;
  if (dot) dot.style.background = connected ? "#20b486" : "#f0ad4e";
  if (chainPillDot) chainPillDot.style.background = connected ? "#20b486" : "#b7c0cc";
}

function requireWallet() {
  if (!signer || !account) {
    throw new Error("Please connect MetaMask first.");
  }
}

function requireContract() {
  requireWallet();

  if (!contract) {
    throw new Error(
      "Wallet connected, but the Smart Contract is not connected. Check CONTRACT_ADDRESS and the selected network."
    );
  }
}

async function switchToSepolia() {
  const currentChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (currentChainId.toLowerCase() === SEPOLIA_CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }]
    });
  } catch (error) {
    // MetaMask error 4902 means Sepolia has not been added to this wallet yet.
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: SEPOLIA_CHAIN_ID,
        chainName: "Sepolia Test Network",
        nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
        blockExplorerUrls: ["https://sepolia.etherscan.io"]
      }]
    });
  }

  const switchedChainId = await window.ethereum.request({ method: "eth_chainId" });
  if (switchedChainId.toLowerCase() !== SEPOLIA_CHAIN_ID) {
    throw new Error("Please switch MetaMask to Sepolia and try again.");
  }
}

async function connectWallet() {
  // Connect MetaMask, then explicitly switch to Sepolia before creating the provider.
  if (!window.ethereum) {
    toast("MetaMask not found. Please install or unlock the MetaMask extension.", true);
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts"
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No wallet account was selected.");
    }

    await switchToSepolia();

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    // Show wallet connection immediately; contract status is checked separately below.
    if ($("connect-btn")) $("connect-btn").textContent = short(account);
    setConnectionStatus("Wallet connected", `Sepolia • ${short(account)}`, true);

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    if ($("chain-name")) {
      $("chain-name").textContent =
        chainId === SEPOLIA_CHAIN_ID_DECIMAL ? "Sepolia Testnet" : `Wrong Network (${chainId})`;
    }

    toast(`MetaMask connected: ${short(account)}`);

    // Connect the contract separately. Wallet remains connected if this part fails.
    await connectContract();
  } catch (error) {
    console.error("Wallet connection error:", error);
    if (!account) setConnectionStatus("Not connected", "Waiting for MetaMask", false);
    toast(getErrorMessage(error), true);
  }
}

async function connectContract() {
  if (!provider || !signer) {
    toast("Connect MetaMask first.", true);
    return false;
  }

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== SEPOLIA_CHAIN_ID_DECIMAL) {
    contract = null;
    toast("Wrong network. Please connect MetaMask to Sepolia (Chain ID 11155111).", true);
    return false;
  }

  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    contract = null;
    toast("MetaMask connected. Please enter a valid CONTRACT_ADDRESS in app.js.", true);
    return false;
  }

  try {
    const code = await provider.getCode(CONTRACT_ADDRESS);

    if (code === "0x") {
      contract = null;
      setConnectionStatus("Wallet connected", `Sepolia • ${short(account)} (Contract not found)`, true);
      toast(
        "MetaMask is connected, but no contract was found at this address on the selected network. Check the network and contract address.",
        true
      );
      return false;
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    // Test that this is the expected contract and that the ABI matches.
    const [propertyCount, agreementCount, arbiter] = await Promise.all([
      contract.propertyCount(),
      contract.agreementCount(),
      contract.arbiter()
    ]);

    arbiterAddress = arbiter;

    setConnectionStatus("Smart Contract connected", `Sepolia • ${short(account)}`, true);
    if ($("chain-name")) $("chain-name").textContent = "Sepolia Testnet";
    toast(
      `Smart Contract connected. ${propertyCount} properties, ${agreementCount} agreements.`
    );

    await loadAll();
    return true;
  } catch (error) {
    console.error("Contract connection error:", error);
    contract = null;
    setConnectionStatus("Wallet connected", `Sepolia • ${short(account)} (Contract error)`, true);
    toast(
      "MetaMask connected, but Smart Contract connection failed. Check that the address, network and ABI match the deployed contract. " +
        getErrorMessage(error),
      true
    );
    return false;
  }
}

function getErrorMessage(error) {
  if (error?.shortMessage) return error.shortMessage;
  if (error?.reason) return error.reason;
  if (error?.info?.error?.message) return error.info.error.message;
  if (error?.message) return error.message;
  return "An unexpected error occurred.";
}

async function txCall(transactionPromise, successMessage) {
  requireContract();

  const transaction = await transactionPromise;
  toast("Transaction sent. Waiting for blockchain confirmation...");

  await transaction.wait();

  toast(successMessage);
  await loadAll();
}

async function loadAll() {
  if (!contract) return;

  try {
    const [propertyCount, agreementCount, arbiter] = await Promise.all([
      contract.propertyCount(),
      contract.agreementCount(),
      contract.arbiter()
    ]);

    arbiterAddress = arbiter;

    const properties = [];
    const agreements = [];

    for (let i = 0; i < Number(propertyCount); i++) {
      properties.push(await contract.getProperty(i));
    }

    for (let i = 0; i < Number(agreementCount); i++) {
      agreements.push(await contract.getAgreement(i));
    }

    renderProperties(properties);
    renderAgreements(agreements);
    renderPayments(agreements);
    renderDisputes(agreements);

    if ($("stat-properties")) $("stat-properties").textContent = propertyCount.toString();
    if ($("stat-agreements")) $("stat-agreements").textContent = agreementCount.toString();
    if ($("stat-active")) {
      $("stat-active").textContent = agreements.filter((a) => Number(a[8]) === 1).length;
    }
    if ($("stat-disputes")) {
      $("stat-disputes").textContent = agreements.filter((a) => Number(a[8]) === 3).length;
    }
  } catch (error) {
    console.error("Load contract data error:", error);
    toast(
      "Could not read contract data. The deployed contract may have a different ABI, or the selected network may be incorrect. " +
        getErrorMessage(error),
      true
    );
  }
}

function empty(message) {
  return `<div class="empty-state">${message}</div>`;
}

function propertyCard(property, index) {
  return `
    <div class="data-card">
      <div class="data-symbol">⌂</div>
      <div class="data-main">
        <b>#${index} · ${escapeHtml(property[1])}</b>
        <small>${escapeHtml(property[2])} · Owner ${short(property[3])}</small>
      </div>
      <div class="data-meta">
        <b>${eth(property[4])}</b><small>Monthly rent</small>
      </div>
      <div class="data-meta">
        <b>${eth(property[5])}</b><small>Deposit</small>
      </div>
      <span class="status ${property[6] ? "active" : "completed"}">
        ${property[6] ? "Available" : "Unavailable"}
      </span>
    </div>`;
}

function renderProperties(items) {
  if ($("properties-list")) {
    $("properties-list").innerHTML = items.length
      ? `<div class="data-list">${items.map((p) => propertyCard(p, Number(p[0]))).join("")}</div>`
      : empty("No properties registered yet.");
  }

  if ($("overview-properties")) {
    $("overview-properties").innerHTML = items.length
      ? `<div class="data-list">${items.slice(-3).reverse().map((p) => propertyCard(p, Number(p[0]))).join("")}</div>`
      : empty("No properties registered yet.");
  }
}

function agreementCard(agreement, mode = "agreement") {
  const id = Number(agreement[0]);
  const propertyId = Number(agreement[1]);
  const owner = agreement[2];
  const tenant = agreement[3];
  const start = Number(agreement[4]);
  const end = Number(agreement[5]);
  const rent = agreement[6];
  const deposit = agreement[7];
  const status = Number(agreement[8]);
  const depositPaid = agreement[9];

  const isOwner = account?.toLowerCase() === owner.toLowerCase();
  const isTenant = account?.toLowerCase() === tenant.toLowerCase();
  const isArbiter =
    account &&
    arbiterAddress &&
    account.toLowerCase() === arbiterAddress.toLowerCase();

  let actions = "";

  if (mode === "agreement") {
    if (status === 0 && isTenant) {
      actions += `<button class="mini-btn primary" onclick="confirmAgreement(${id})">Confirm agreement</button>`;
    }
    if (status === 0 && isOwner) {
      actions += `<span class="field-hint">Waiting for tenant confirmation</span>`;
    }
    if (status === 1 && isTenant && !depositPaid) {
      actions += `<button class="mini-btn primary" onclick="depositSecurity(${id})">Deposit ${eth(deposit)}</button>`;
    }
    if (status === 1 && (isOwner || isTenant)) {
      actions += `<button class="mini-btn" onclick="raiseDispute(${id})">Raise dispute</button>`;
    }
  }

  if (mode === "payment") {
    if (status === 1 && isTenant && !depositPaid) {
      actions += `<button class="mini-btn primary" onclick="depositSecurity(${id})">Pay security deposit</button>`;
    }
    if (status === 1 && isTenant && depositPaid) {
      actions += `<button class="mini-btn primary" onclick="recordRent(${id})">Pay rent · ${eth(rent)}</button>`;
    }
    if (status === 1 && isOwner && depositPaid) {
      actions += `<button class="mini-btn" onclick="refundDeposit(${id})">End lease & refund</button>`;
    }
    if (status === 3) {
      actions += `<span class="field-hint">Funds locked while disputed</span>`;
    }
  }

  if (mode === "dispute" && status === 3) {
    actions += isArbiter
      ? `<button class="mini-btn primary" onclick="resolveDispute(${id},true)">Refund tenant</button>
         <button class="mini-btn" onclick="resolveDispute(${id},false)">Pay owner</button>`
      : `<span class="field-hint">Only the designated arbiter (${short(arbiterAddress)}) can resolve this case.</span>`;
  }

  return `
    <div class="data-card">
      <div class="data-symbol">▤</div>
      <div class="data-main">
        <b>Agreement #${id} · Property #${propertyId}</b>
        <small>Owner ${short(owner)} · Tenant ${short(tenant)}</small>
        <small>${dateText(start)} — ${dateText(end)}</small>
      </div>
      <div class="data-meta"><b>${eth(rent)}</b><small>Monthly rent</small></div>
      <div class="data-meta"><b>${eth(deposit)}</b><small>Deposit ${depositPaid ? "· paid" : "· unpaid"}</small></div>
      <span class="status ${statusClass(status)}">${statusNames[status] || "Unknown"}</span>
      ${actions ? `<div class="card-actions">${actions}</div>` : ""}
    </div>`;
}

function statusClass(status) {
  return ["pending", "active", "completed", "disputed"][status] || "";
}

function renderAgreements(items) {
  if (!$("agreements-list")) return;
  $("agreements-list").innerHTML = items.length
    ? `<div class="data-list">${items.map((a) => agreementCard(a)).join("")}</div>`
    : empty("No rental agreements created yet.");
}

function renderPayments(items) {
  if (!$("payments-list")) return;
  $("payments-list").innerHTML = items.length
    ? `<div class="data-list">${items.map((a) => agreementCard(a, "payment")).join("")}</div>`
    : empty("No agreements available for payments.");
}

function renderDisputes(items) {
  if (!$("disputes-list")) return;
  const disputed = items.filter((a) => Number(a[8]) === 3);
  $("disputes-list").innerHTML = disputed.length
    ? `<div class="data-list">${disputed.map((a) => agreementCard(a, "dispute")).join("")}</div>`
    : empty("There are no open disputes.");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

// Form actions
async function registerProperty(event) {
  event.preventDefault();
  try {
    requireContract();

    const name = $("property-name").value.trim();
    const location = $("property-location").value.trim();
    const rent = ethers.parseEther($("property-rent").value);
    const deposit = ethers.parseEther($("property-deposit").value);

    await txCall(
      contract.registerProperty(name, location, rent, deposit),
      "Property registered successfully."
    );

    event.target.reset();
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function createAgreement(event) {
  event.preventDefault();

  try {
    requireContract();

    const propertyId = BigInt($("agreement-property").value);
    const tenant = $("agreement-tenant").value.trim();

    if (!ethers.isAddress(tenant)) {
      throw new Error("Please enter a valid tenant wallet address.");
    }

    const startDate = Math.floor(
      new Date(`${$("agreement-start").value}T00:00:00`).getTime() / 1000
    );
    const endDate = Math.floor(
      new Date(`${$("agreement-end").value}T23:59:59`).getTime() / 1000
    );

    if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate <= startDate) {
      throw new Error("End date must be after start date.");
    }

    await txCall(
      contract.createAgreement(propertyId, tenant, startDate, endDate),
      "Rental agreement created successfully."
    );

    event.target.reset();
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function confirmAgreement(id) {
  try {
    requireContract();
    await txCall(contract.confirmAgreement(id), "Agreement confirmed.");
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function depositSecurity(id) {
  try {
    requireContract();
    const agreement = await contract.getAgreement(id);
    const exactDeposit = agreement[7];

    await txCall(
      contract.depositSecurity(id, { value: exactDeposit }),
      `Security deposit of ${eth(exactDeposit)} submitted.`
    );
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function recordRent(id) {
  try {
    requireContract();
    const agreement = await contract.getAgreement(id);
    const exactRent = agreement[6];

    await txCall(
      contract.recordRentalPayment(id, { value: exactRent }),
      `Rental payment of ${eth(exactRent)} submitted.`
    );
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function refundDeposit(id) {
  if (!confirm("End this agreement and refund the deposit to the tenant?")) return;

  try {
    requireContract();
    await txCall(contract.refundDeposit(id), "Deposit refunded and agreement completed.");
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function raiseDispute(id) {
  const reason = prompt("Describe the rental dispute:");
  if (!reason || !reason.trim()) return;

  try {
    requireContract();
    await txCall(contract.raiseDispute(id, reason.trim()), "Dispute submitted for review.");
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

async function resolveDispute(id, refundTenant) {
  const message = refundTenant
    ? "Refund the deposit to the tenant?"
    : "Release the deposit to the property owner?";

  if (!confirm(message)) return;

  try {
    requireContract();
    await txCall(
      contract.resolveDispute(id, refundTenant),
      "Dispute resolved successfully."
    );
  } catch (error) {
    toast(getErrorMessage(error), true);
  }
}

// Navigation
function showView(name) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });

  const target = $(`view-${name}`);
  if (target) target.classList.add("active");

  const titles = {
    overview: "Overview",
    properties: "Properties",
    agreements: "Rental agreements",
    deposits: "Deposits & payments",
    disputes: "Rental disputes"
  };

  const title = titles[name] || "Overview";
  if ($("page-title")) $("page-title").textContent = title;
  if ($("crumb")) $("crumb").textContent = title.toUpperCase();
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });

  if ($("connect-btn")) {
    $("connect-btn").addEventListener("click", connectWallet);
  }

  if ($("property-form")) {
    $("property-form").addEventListener("submit", registerProperty);
  }

  if ($("agreement-form")) {
    $("agreement-form").addEventListener("submit", createAgreement);
  }

  ["properties", "agreements", "payments", "disputes"].forEach((name) => {
    const button = $(`refresh-${name}`);
    if (button) button.addEventListener("click", loadAll);
  });

  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
});

// Functions called from inline action buttons in agreement cards.
window.confirmAgreement = confirmAgreement;
window.depositSecurity = depositSecurity;
window.recordRent = recordRent;
window.refundDeposit = refundDeposit;
window.raiseDispute = raiseDispute;
window.resolveDispute = resolveDispute;
