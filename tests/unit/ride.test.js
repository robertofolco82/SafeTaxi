import {describe, it, expect} from 'vitest';
import {shouldPingRide, rideIdForReport, RIDE_RULES} from '../../src/lib/ride.js';

describe('corsa verificata', () => {
  const p = {lat:41.9, lng:12.5}, far = {lat:41.91, lng:12.5};

  it('invia la prima posizione e poi al massimo ogni 6 secondi', () => {
    expect(shouldPingRide(null, p, 0, false)).toBe(true);
    expect(shouldPingRide({...p, ts:0}, far, 5000, false)).toBe(false);
    expect(shouldPingRide({...p, ts:0}, far, 6000, false)).toBe(true);
    expect(shouldPingRide({...p, ts:0}, p, 10000, false)).toBe(false);
    expect(shouldPingRide({...p, ts:0}, p, 15000, false)).toBe(true);
  });

  it('collega la corsa solo se valida, non usata ed entro 24 ore', () => {
    const r = {rideId:'r1', verified:true, endedAt:0};
    expect(rideIdForReport(r, 1000)).toBe('r1');
    expect(rideIdForReport({...r, verified:false}, 1000)).toBeNull();
    expect(rideIdForReport({...r, claimed:true}, 1000)).toBeNull();
    expect(rideIdForReport(r, RIDE_RULES.claimHours * 3600e3)).toBeNull();
    expect(rideIdForReport(null, 0)).toBeNull();
  });
});
