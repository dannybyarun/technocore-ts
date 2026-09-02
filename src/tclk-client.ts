/**
 * TclkClient - High-level client for managing tclk deals in technocore.chat rooms.
 *
 * This client wraps the tclk protocol to provide a simple API for:
 * - Creating and posting offers
 * - Accepting offers and managing secrets
 * - Posting lock/reveal/refund frames
 * - Tracking deal state
 */

import type { TechnocoreClient } from './client.js';
import {
  createOffer,
  acceptOffer,
  createHashLock,
  encodeFrameForPost,
  startContract,
  updateContract,
  type Frame,
  type ContractState,
  type CreateOfferParams,
  type OfferFrame,
} from './tclk.js';

export interface TclkDealManager {
  /** Contract state */
  state: ContractState;
  /** Original offer frame */
  offer: OfferFrame | Frame;
  /** Accept frame (if accepted) */
  accept?: Frame;
  /** Preimage (only if we're the payee) */
  preimage?: string;
  /** Hash (shared with both parties) */
  hash?: string;
  /** Room where deal is coordinated */
  room: string;
}

export class TclkClient {
  private client: TechnocoreClient;
  private deals: Map<string, TclkDealManager> = new Map();

  constructor(client: TechnocoreClient) {
    this.client = client;
  }

  /**
   * Create and post an offer to a room.
   */
  async createOffer(params: CreateOfferParams & { from: string }): Promise<{
    frame: Frame;
    encoded: string;
    contractId: string;
  }> {
    const frame = createOffer(params);
    const encoded = encodeFrameForPost(frame);
    const contractId = (frame as any).contractId || `deal-${Date.now()}`;

    // Post to room
    await this.client.say(params.room, params.from, encoded);

    // Track locally
    const state = startContract(frame);
    this.deals.set(contractId, {
      state,
      offer: frame,
      room: params.room,
    });

    return { frame, encoded, contractId };
  }

  /**
   * Accept an offer and post the accept frame.
   */
  async acceptOffer(params: {
    offer: OfferFrame | Frame;
    payeeDid: string;
    room: string;
  }): Promise<{
    frame: Frame;
    encoded: string;
    preimage: string;
    hash: string;
  }> {
    const { accept, preimage, hash } = acceptOffer({
      offer: params.offer as OfferFrame,
      payeeDid: params.payeeDid,
    });

    const encoded = encodeFrameForPost(accept);
    const contractId = (params.offer as any).contractId || `deal-${Date.now()}`;

    // Post to room
    await this.client.say(params.room, params.payeeDid, encoded);

    // Update local state
    const existing = this.deals.get(contractId);
    if (existing) {
      const { state } = updateContract(existing.state, accept);
      existing.state = state;
      existing.accept = accept;
      existing.preimage = preimage;
      existing.hash = hash;
    } else {
      // If we don't have the original offer tracked, create a new deal entry
      this.deals.set(contractId, {
        state: {} as ContractState,
        offer: params.offer,
        accept,
        preimage,
        hash,
        room: params.room,
      });
    }

    return { frame: accept, encoded, preimage, hash };
  }

  /**
   * Create and post a lock frame.
   */
  async postLock(params: {
    room: string;
    from: string;
    frame: Frame;
  }): Promise<string> {
    const encoded = encodeFrameForPost(params.frame);
    await this.client.say(params.room, params.from, encoded);
    return encoded;
  }

  /**
   * Create and post a reveal frame.
   */
  async postReveal(params: {
    room: string;
    from: string;
    frame: Frame;
  }): Promise<string> {
    const encoded = encodeFrameForPost(params.frame);
    await this.client.say(params.room, params.from, encoded);
    return encoded;
  }

  /**
   * Create and post a refund frame.
   */
  async postRefund(params: {
    room: string;
    from: string;
    frame: Frame;
  }): Promise<string> {
    const encoded = encodeFrameForPost(params.frame);
    await this.client.say(params.room, params.from, encoded);
    return encoded;
  }

  /**
   * Get a deal by contract ID.
   */
  getDeal(contractId: string): TclkDealManager | undefined {
    return this.deals.get(contractId);
  }

  /**
   * List all tracked deals.
   */
  listDeals(): Array<{ contractId: string } & TclkDealManager> {
    return Array.from(this.deals.entries()).map(([contractId, deal]) => ({
      contractId,
      ...deal,
    }));
  }

  /**
   * Generate a hash lock for a new deal.
   */
  generateHashLock(): { preimage: string; hash: string } {
    return createHashLock();
  }
}
