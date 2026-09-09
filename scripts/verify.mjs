// Verify fixture networks against published facts (station counts per line, termini).
// node scripts/verify.mjs paris|london
import fs from 'node:fs';
const name = process.argv[2] ?? 'paris';
const net = JSON.parse(fs.readFileSync(`packages/core/fixtures/${name}.json`, 'utf8'));
// Official counts (operator sites / Wikipedia, 2025): stations per line and termini.
const FACTS = {
  paris: {
    '1': [25, 'La Défense', 'Château de Vincennes'], '2': [25, 'Porte Dauphine', 'Nation'], '3': [25, 'Pont de Levallois', 'Gallieni'],
    '3bis': [4, 'Gambetta', 'Porte des Lilas'], '4': [29, 'Porte de Clignancourt', 'Bagneux'], '5': [22, 'Bobigny', "Place d'Italie"],
    '6': [28, 'Charles de Gaulle', 'Nation'], '7': [38, 'La Courneuve', 'Villejuif'], '7bis': [8, 'Louis Blanc', 'Pré Saint-Gervais'],
    '8': [38, 'Balard', 'Pointe du Lac'], '9': [37, 'Pont de Sèvres', 'Mairie de Montreuil'], '10': [23, 'Boulogne', "Gare d'Austerlitz"],
    '11': [19, 'Châtelet', 'Rosny'], '12': [31, "Mairie d'Aubervilliers", "Mairie d'Issy"], '13': [32, 'Les Courtilles', 'Châtillon'],
    '14': [21, 'Saint-Denis', 'Orly'],
  },
  london: {
    'Bakerloo': [25, 'Harrow & Wealdstone', 'Elephant & Castle'], 'Central': [49, 'West Ruislip', 'Epping'], 'Circle': [36, 'Hammersmith', 'Edgware Road'],
    'District': [60, 'Ealing Broadway', 'Upminster'], 'Hammersmith & City': [29, 'Hammersmith', 'Barking'], 'Jubilee': [27, 'Stanmore', 'Stratford'],
    'Metropolitan': [34, 'Aldgate', 'Amersham'], 'Northern': [52, 'Edgware', 'Morden'], 'Piccadilly': [53, 'Cockfosters', 'Heathrow'],
    'Victoria': [16, 'Walthamstow', 'Brixton'], 'Waterloo & City': [2, 'Waterloo', 'Bank'],
  },
};
const facts = FACTS[name];
if (!facts) { console.log('no facts for', name); process.exit(0); }
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let ok = 0, total = 0;
console.log(`${net.displayName}\n`);
console.log('| Line | Stations (OSM) | Official | Termini found | Result |');
console.log('|---|---|---|---|---|');
for (const line of net.lines) {
  const f = facts[line.ref]; if (!f) continue;
  total++;
  const ids = new Set(line.sequences.flat());
  const stations = [...ids].map((id) => net.stations.find((s) => s.id === id));
  const termini = line.sequences.map((seq) => [seq[0], seq[seq.length - 1]]).flat().map((id) => net.stations.find((s) => s.id === id).name);
  const hasA = termini.some((t) => norm(t).includes(norm(f[1]))), hasB = termini.some((t) => norm(t).includes(norm(f[2])));
  const countOk = Math.abs(ids.size - f[0]) <= 1;
  const pass = countOk && hasA && hasB;
  if (pass) ok++;
  console.log(`| ${line.ref} | ${ids.size} | ${f[0]} | ${hasA ? '✓' : '✗'} ${f[1]} · ${hasB ? '✓' : '✗'} ${f[2]} | ${pass ? '✅' : ids.size === f[0] ? '⚠ termini' : `⚠ ${ids.size - f[0] > 0 ? '+' : ''}${ids.size - f[0]}`} |`);
  void stations;
}
console.log(`\n${ok}/${total} lines match official station counts (±1) and termini.`);
