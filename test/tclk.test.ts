import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createHashLock,
  createOffer,
  acceptOffer,
  encodeFrameForPost,
  startContract,
  updateContract,
  isTerminal,
  getContractStatus,
} from '../src/tclk.js';
import { TclkClient } from '../src/tclk-client.js';
import { TechnocoreClient } from '../src/client.js';

// Valid Ed25519 DID:key values (z6Mk prefix + 44 base58 chars)
const PAYER_DID = 'did:key:z6MkWyvem4UgHYrdTgsPN42U4R8rr5rJzaMxKnT7oV75Ms1t';
const PAYEE_DID = 'did:key:z6MkFPyziuZDnSovCE4wKQJxWw2y46Df8V71H3dY3nYwn7VF';

describe('tclk', () => {
  describe('createHashLock', () => {
    it('generates a preimage and hash', () => {
      const { preimage, hash } = createHashLock();
      assert(preimage, 'preimage should be defined');
      assert(hash, 'hash should be defined');
      assert.notStrictEqual(preimage, hash, 'preimage and hash should differ');
      assert.strictEqual(typeof preimage, 'string');
      assert.strictEqual(typeof hash, 'string');
    });

    it('generates unique locks each time', () => {
      const lock1 = createHashLock();
      const lock2 = createHashLock();
      assert.notStrictEqual(lock1.preimage, lock2.preimage);
      assert.notStrictEqual(lock1.hash, lock2.hash);
    });
  });

  describe('createOffer', () => {
    it('creates a valid offer frame', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      assert(offer, 'offer should be defined');
      assert.strictEqual((offer as any).from, PAYER_DID);
      assert.strictEqual((offer as any).role, 'payer');
      assert.strictEqual((offer as any).lock, 'hash');
      assert.strictEqual((offer as any).amount, '1000000');
      assert.strictEqual((offer as any).asset, 'FLOP');
    });

    it('creates offer with custom lock type', () => {
      // secp256k1 generator point G — valid curve point for testing
      const paymentKey = '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '500',
        asset: 'BTC',
        rails: ['lightning'],
        lock: 'point',
        paymentKey,
      });

      assert.strictEqual((offer as any).lock, 'point');
      assert.strictEqual((offer as any).paymentKey, paymentKey);
    });
  });

  describe('acceptOffer', () => {
    it('accepts an offer and generates secret', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      const { accept, preimage, hash } = acceptOffer({
        offer,
        payeeDid: PAYEE_DID,
      });

      assert(accept, 'accept should be defined');
      assert(preimage, 'preimage should be defined');
      assert(hash, 'hash should be defined');
      assert.strictEqual((accept as any).from, PAYEE_DID);
      assert.strictEqual((accept as any).statement, hash);
    });
  });

  describe('encodeFrameForPost', () => {
    it('encodes a frame to string', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      const encoded = encodeFrameForPost(offer);
      assert.strictEqual(typeof encoded, 'string');
      assert(encoded.length > 0, 'encoded should have content');
    });
  });

  describe('startContract', () => {
    it('creates a contract from an offer', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      const state = startContract(offer);
      assert(state, 'state should be defined');
    });
  });

  describe('updateContract', () => {
    it('applies accept frame to contract', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      const { accept } = acceptOffer({
        offer,
        payeeDid: PAYEE_DID,
      });

      const state = startContract(offer);
      const result = updateContract(state, accept);

      assert.strictEqual(result.ok, true);
      assert(result.state, 'state should be defined');
    });
  });

  describe('getContractStatus', () => {
    it('returns status string', () => {
      const offer = createOffer({
        payerDid: PAYER_DID,
        room: 'deal-room',
        amount: '1000000',
        asset: 'FLOP',
        rails: ['paper-rail'],
      });

      const state = startContract(offer);
      const status = getContractStatus(state);
      assert.strictEqual(typeof status, 'string');
    });
  });

  describe('TclkClient', () => {
    it('can be instantiated with a TechnocoreClient', () => {
      const tc = new TechnocoreClient('https://technocore.chat');
      const tclk = new TclkClient(tc);
      assert(tclk, 'tclk should be defined');
    });

    it('generates hash lock', () => {
      const tc = new TechnocoreClient('https://technocore.chat');
      const tclk = new TclkClient(tc);
      const lock = tclk.generateHashLock();
      assert(lock.preimage, 'preimage should be defined');
      assert(lock.hash, 'hash should be defined');
    });

    it('lists empty deals initially', () => {
      const tc = new TechnocoreClient('https://technocore.chat');
      const tclk = new TclkClient(tc);
      const deals = tclk.listDeals();
      assert.deepStrictEqual(deals, []);
    });
  });
});
