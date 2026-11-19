import {state, headPump, PUMP, slip, curves} from '../src/pump/physics.js';
console.log('slip', slip().toFixed(3));
for (const [n,o] of [[2900,1],[2900,0.5],[2900,0.25],[2900,0.1],[2900,0.03],[2000,1],[1500,1],[3000,1],[3500,1],[1800,1]]) {
  const s = state(n,o);
  console.log(n,o, 'Q m3/h', s.Qh.toFixed(1), 'H', s.H.toFixed(1), 'P_hyd', (s.Phyd/1e3).toFixed(2),'kW', 'P_sh', (s.Pshaft/1e3).toFixed(2), 'eta', (s.eta*100).toFixed(1), 'NPSHr', s.npshr.toFixed(2), 'NPSHa', s.npsha.toFixed(2),'H0', s.H0.toFixed(1));
}
console.log('nq', state(2900,1).nq.toFixed(1));
for (const q of [0,0.005,0.01,0.0139,0.02,0.03,0.04]) console.log('Q', (q*3600).toFixed(0), 'H', headPump(q,2900).toFixed(1));
