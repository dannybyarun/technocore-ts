/**
 * tclk (Technocore Lock Protocol) integration for flop-technocore.
 *
 * This module wraps @flop-labs/tclk to provide a high-level interface for
 * creating and managing HTLC/PTLC deals between agents in technocore.chat rooms.
 *
 * @see https://github.com/flop-labs/tclk
 * @see https://technocore.chat/llms.txt
 */

import {
  makeOffer,
  makeAccept,
  generateHashLock,
  openContract,
  applyFrame,
  encodeFrame,
  type TclkFrame,
  type OfferFrame,
  type ContractState,
} from '@flop-labs/tclk';

// Re-export tclk types for convenience
export type { TclkFrame as Frame, ContractState } from '@flop-labs/tclk';

export interface TclkDeal {
  /** Unique contract identifier */
  contractId: string;
  /** Payer DID */
  payerDid: string;
  /** Payee DID */
  payeeDid: string;
  /** Room where the deal is coordinated */
  room: string;
  /** Amount in smallest unit */
  amount: string;
  /** Asset identifier (e.g. "FLOP", "BTC", "ETH") */
  asset: string;
  /** Settlement rails to use */
  rails: string[];
  /** Lock type: "hash" or "point" */
  lockType: 'hash' | 'point';
  /** Current state */
  state: string;
  /** Deal description (what work is being exchanged) */
  description?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Claim deadline (payee must claim before this) */
  claimByMs: number;
  /** Refund available after this time */
  refundAfterMs: number;
  /** Preimage for hash lock (only known to payee) */
  preimage?: string;
  /** Hash of the preimage (shared with payer) */
  hash?: string;
}

export interface CreateOfferParams {
  /** Payer's DID */
  payerDid: string;
  /** Room for coordination */
  room: string;
  /** Amount to pay */
  amount: string;
  /** Asset to pay with */
  asset: string;
  /** Settlement rails */
  rails: string[];
  /** Lock type */
  lock?: 'hash' | 'point';
  /** secp256k1 payment key (required for point locks) */
  paymentKey?: string;
  /** Description of the work */
  description?: string;
  /** Time until offer expires (ms from now) */
  expiresMs?: number;
  /** Time until payee must claim (ms from now) */
  claimByMs?: number;
  /** Time after which payer can refund (ms from now) */
  refundAfterMs?: number;
}

export interface AcceptOfferParams {
  /** The original offer */
  offer: OfferFrame;
  /** Payee's DID */
  payeeDid: string;
}

// Re-export OfferFrame for convenience
export type { OfferFrame };

/**
 * Generate a new hash lock (preimage + hash).
 */
export function createHashLock(): { preimage: string; hash: string } {
  const { preimage, hash } = generateHashLock();
  return { preimage, hash };
}

/**
 * Create a tclk offer frame.
 */
export function createOffer(params: CreateOfferParams): OfferFrame {
  const now = Date.now();
  return makeOffer({
    from: params.payerDid,
    role: 'payer',
    lock: params.lock || 'hash',
    paymentKey: params.paymentKey,
    amount: params.amount,
    asset: params.asset,
    rails: params.rails,
    claimByMs: now + (params.claimByMs || 3_600_000),
    refundAfterMs: now + (params.refundAfterMs || 7_200_000),
    expiresMs: now + (params.expiresMs || 600_000),
  });
}

/**
 * Accept an offer and generate a hash lock.
 */
export function acceptOffer(params: AcceptOfferParams): {
  accept: TclkFrame;
  preimage: string;
  hash: string;
} {
  const { preimage, hash } = generateHashLock();
  const accept = makeAccept(params.offer, {
    from: params.payeeDid,
    statement: hash,
  });
  return { accept, preimage, hash };
}

/**
 * Encode a frame for posting to a room.
 */
export function encodeFrameForPost(frame: TclkFrame): string {
  return encodeFrame(frame);
}

/**
 * Create a contract state from an offer.
 */
export function startContract(offer: OfferFrame): ContractState {
  return openContract(offer);
}

/**
 * Apply a frame to a contract state.
 */
export function updateContract(
  state: ContractState,
  frame: TclkFrame
): { state: ContractState; ok: boolean; reason?: string } {
  return applyFrame(state, frame, Date.now());
}

/**
 * Check if a contract is in a terminal state.
 */
export function isTerminal(state: ContractState): boolean {
  const s = (state as any).status || (state as any).phase;
  return s === 'claimed' || s === 'refunded' || s === 'cancelled';
}

/**
 * Get a human-readable status for a contract state.
 */
export function getContractStatus(state: ContractState): string {
  const s = (state as any).status || (state as any).phase || 'unknown';
  return s;
}
