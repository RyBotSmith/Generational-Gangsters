// ─────────────────────────────────────────────
//  bankService.js  —  All bank game logic.
//  Rule: NO Discord imports. NO embed creation.
//  Returns plain Result Objects only.
// ─────────────────────────────────────────────

const { ACTION_TYPES, UPGRADES } = require('../data/constants');
const playerRepository = require('../repositories/playerRepository');
const logRepository    = require('../repositories/logRepository');

// ── Helpers ───────────────────────────────────

function getBankLimit(player) {
  const level = player.upgrades?.bank_vault ?? 0;
  return Math.floor(100000 * Math.pow(2, level));
}

// ── Public API ────────────────────────────────

/**
 * Deposit cash into the bank, capped at vault limit.
 * Excess stays as cash.
 */
async function deposit(serverId, discordId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, message: 'Enter a valid amount.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot use the bank while in jail.', data: { jailed: true }, updates: {}, log: null };
  }

  const cash      = player.cash ?? 0;
  const bank      = player.bank ?? 0;
  const limit     = getBankLimit(player);
  const space     = Math.max(0, limit - bank);

  if (cash <= 0) {
    return { success: false, message: 'You have no cash to deposit.', data: {}, updates: {}, log: null };
  }

  // Cap at available space and available cash
  const toDeposit = Math.min(amount, cash, space);

  if (toDeposit <= 0) {
    return {
      success: false,
      message: `Your bank is full. Limit: **$${limit.toLocaleString('en-US')}**. Upgrade your Bank Vault to increase it.`,
      data: { bankFull: true, limit },
      updates: {},
      log: null,
    };
  }

  const updates = {
    cash: cash - toDeposit,
    bank: bank + toDeposit,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'bank_deposit',
    location:   player.state,
    payload:    { amount: toDeposit, newBank: bank + toDeposit },
  }).catch(() => {});

  const cappedMsg = toDeposit < amount
    ? ` (capped at vault limit — **$${(amount - toDeposit).toLocaleString('en-US')}** stays as cash)`
    : '';

  return {
    success: true,
    message: `Deposited **$${toDeposit.toLocaleString('en-US')}** into your bank.${cappedMsg}`,
    data: { deposited: toDeposit, newBank: bank + toDeposit, newCash: cash - toDeposit, limit },
    updates,
    log: null,
  };
}

/**
 * Withdraw cash from the bank.
 */
async function withdraw(serverId, discordId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, message: 'Enter a valid amount.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot use the bank while in jail.', data: { jailed: true }, updates: {}, log: null };
  }

  const bank = player.bank ?? 0;

  if (bank <= 0) {
    return { success: false, message: 'Your bank is empty.', data: {}, updates: {}, log: null };
  }

  const toWithdraw = Math.min(amount, bank);

  const updates = {
    cash: (player.cash ?? 0) + toWithdraw,
    bank: bank - toWithdraw,
  };

  await playerRepository.updatePlayer(serverId, discordId, updates);

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'bank_withdraw',
    location:   player.state,
    payload:    { amount: toWithdraw, newBank: bank - toWithdraw },
  }).catch(() => {});

  return {
    success: true,
    message: `Withdrew **$${toWithdraw.toLocaleString('en-US')}** from your bank.`,
    data: { withdrawn: toWithdraw, newBank: bank - toWithdraw, newCash: (player.cash ?? 0) + toWithdraw },
    updates,
    log: null,
  };
}

/**
 * Transfer cash to another player. 5% fee taken from sender.
 * Target must be alive.
 */
async function transfer(serverId, discordId, targetId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, message: 'Enter a valid amount.', data: {}, updates: {}, log: null };
  }

  if (discordId === targetId) {
    return { success: false, message: 'You cannot transfer to yourself.', data: {}, updates: {}, log: null };
  }

  const player = await playerRepository.getPlayer(serverId, discordId);
  if (!player) return { success: false, message: 'Player not found.', data: {}, updates: {}, log: null };

  if (player.jailedUntil && Date.now() < player.jailedUntil) {
    return { success: false, message: 'You cannot transfer while in jail.', data: { jailed: true }, updates: {}, log: null };
  }

  const target = await playerRepository.getPlayer(serverId, targetId);
  if (!target) return { success: false, message: 'Target player not found.', data: {}, updates: {}, log: null };

  if (!target.alive) {
    return { success: false, message: `**${target.username}** is in hospital. Transfers to dead players are not allowed.`, data: {}, updates: {}, log: null };
  }

  const fee        = Math.ceil(amount * 0.05);
  const totalCost  = amount + fee;
  const cash       = player.cash ?? 0;

  if (cash < totalCost) {
    return {
      success: false,
      message: `You need **$${totalCost.toLocaleString('en-US')}** (incl. 5% fee of **$${fee.toLocaleString('en-US')}**). You have **$${cash.toLocaleString('en-US')}**.`,
      data: { insufficientFunds: true, required: totalCost, fee },
      updates: {},
      log: null,
    };
  }

  // Cap at target's bank limit
  const targetBank  = target.bank ?? 0;
  const targetLimit = getBankLimit(target);
  const targetSpace = Math.max(0, targetLimit - targetBank);
  const toReceive   = Math.min(amount, targetSpace);
  const overflow    = amount - toReceive;

  await playerRepository.updatePlayer(serverId, discordId, {
    cash: cash - totalCost,
  });

  await playerRepository.updatePlayer(serverId, targetId, {
    cash: (target.cash ?? 0) + overflow,
    bank: targetBank + toReceive,
  });

  logRepository.write(serverId, {
    discordId,
    actionType: ACTION_TYPES.ECONOMY,
    actionName: 'bank_transfer',
    location:   player.state,
    payload:    { targetId, targetName: target.username, amount, fee, toReceive },
  }).catch(() => {});

  const overflowMsg = overflow > 0
    ? ` ($${overflow.toLocaleString('en-US')} went to their cash — bank was nearly full)`
    : '';

  return {
    success: true,
    message: `Transferred **$${amount.toLocaleString('en-US')}** to **${target.username}** (fee: **$${fee.toLocaleString('en-US')}**).${overflowMsg}`,
    data: { amount, fee, toReceive, overflow, targetName: target.username },
    updates: {},
    log: null,
  };
}

module.exports = { deposit, withdraw, transfer, getBankLimit };
