/**
 * SEPTA Regional Rail as drawn on SEPTA's official Regional Rail / SEPTA Metro maps (septa.org), station order per line.
 * OpenStreetMap's route relations for these lines are incomplete (some have no stop members at all), so the official
 * station lists are the source of truth; OSM only supplies coordinates. Names follow the official map (2024–2025 naming:
 * "Penn Medicine", "Wawa", "Jefferson", "Delaware Valley University").
 */
import type { OfficialOverlay } from './index.js';
import { SEPTA_COORDS } from './septa-coords.js';

const CC = ['Temple University', 'Jefferson', 'Suburban', '30th Street']; // Center City trunk, north → west
const CC_R = [...CC].reverse();
const RR = '#4c748c'; // SEPTA Regional Rail line colour on the current map

export const SEPTA_REGIONAL_RAIL: OfficialOverlay = {
  match: { network: /SEPTA/i },
  coords: SEPTA_COORDS,
  // As on the SEPTA Metro map: City Hall / 15th Street / Suburban Station is one interchange; so is Jefferson / 11th Street.
  interchanges: [['Suburban', '15th Street@L', 'City Hall@B'], ['Jefferson', '11th Street@L'], ['30th Street', '30th Street@L']],
  replaceModes: ['train'],
  lines: [
    { ref: 'AIR', name: 'Airport Line', color: RR, mode: 'train', stations: [...CC, 'Penn Medicine', 'Eastwick', 'Airport Terminal A', 'Airport Terminal B', 'Airport Terminals C & D', 'Airport Terminals E & F'] },
    { ref: 'CHE', name: 'Chestnut Hill East Line', color: RR, mode: 'train', stations: ['Chestnut Hill East', 'Gravers', 'Wyndmoor', 'Mount Airy', 'Sedgwick', 'Stenton', 'Washington Lane', 'Germantown', 'Wister', 'Wayne Junction', ...CC] },
    { ref: 'CHW', name: 'Chestnut Hill West Line', color: RR, mode: 'train', stations: ['Chestnut Hill West', 'St. Martins', 'Highland', 'Allen Lane', 'Carpenter', 'Upsal', 'Tulpehocken', 'Chelten Avenue', 'Queen Lane', 'North Philadelphia', ...CC_R] },
    { ref: 'CYN', name: 'Cynwyd Line', color: RR, mode: 'train', stations: ['Cynwyd', 'Bala', 'Wynnefield Avenue', '30th Street', 'Suburban', 'Jefferson'] },
    { ref: 'FOX', name: 'Fox Chase Line', color: RR, mode: 'train', stations: ['Fox Chase', 'Ryers', 'Cheltenham', 'Lawndale', 'Olney', 'Wayne Junction', ...CC] },
    { ref: 'LAN', name: 'Lansdale/Doylestown Line', color: RR, mode: 'train', stations: ['Doylestown', 'Delaware Valley University', 'New Britain', 'Chalfont', 'Link Belt', 'Colmar', 'Fortuna', 'Lansdale', 'Pennbrook', 'North Wales', 'Gwynedd Valley', 'Penllyn', 'Ambler', 'Fort Washington', 'Oreland', 'North Hills', 'Glenside', 'Jenkintown-Wyncote', 'Elkins Park', 'Melrose Park', 'Fern Rock Transportation Center', 'Wayne Junction', ...CC] },
    { ref: 'MED', name: 'Media/Wawa Line', color: RR, mode: 'train', stations: ['Wawa', 'Elwyn', 'Media', 'Moylan-Rose Valley', 'Wallingford', 'Swarthmore', 'Morton', 'Secane', 'Primos', 'Clifton-Aldan', 'Gladstone', 'Lansdowne', 'Fernwood-Yeadon', 'Angora', '49th Street', 'Penn Medicine', ...CC_R] },
    { ref: 'NOR', name: 'Manayunk/Norristown Line', color: RR, mode: 'train', stations: ['Elm Street', 'Norristown Transportation Center', 'Main Street', 'Conshohocken', 'Spring Mill', 'Miquon', 'Ivy Ridge', 'Manayunk', 'Wissahickon', 'East Falls', 'Allegheny', 'North Broad', ...CC] },
    { ref: 'PAO', name: 'Paoli/Thorndale Line', color: RR, mode: 'train', stations: ['Thorndale', 'Downingtown', 'Whitford', 'Exton', 'Malvern', 'Paoli', 'Daylesford', 'Berwyn', 'Devon', 'Strafford', 'Wayne', 'St. Davids', 'Radnor', 'Villanova', 'Rosemont', 'Bryn Mawr', 'Haverford', 'Ardmore', 'Wynnewood', 'Narberth', 'Merion', 'Overbrook', ...CC_R] },
    { ref: 'TRE', name: 'Trenton Line', color: RR, mode: 'train', stations: ['Trenton', 'Levittown', 'Bristol', 'Croydon', 'Eddington', 'Cornwells Heights', 'Torresdale', 'Holmesburg Junction', 'Tacony', 'Bridesburg', 'North Philadelphia', ...CC_R] },
    { ref: 'WAR', name: 'Warminster Line', color: RR, mode: 'train', stations: ['Warminster', 'Hatboro', 'Willow Grove', 'Crestmont', 'Roslyn', 'Ardsley', 'Glenside', 'Jenkintown-Wyncote', 'Elkins Park', 'Melrose Park', 'Fern Rock Transportation Center', 'Wayne Junction', ...CC] },
    { ref: 'WTR', name: 'West Trenton Line', color: RR, mode: 'train', stations: ['West Trenton', 'Yardley', 'Woodbourne', 'Langhorne', 'Neshaminy Falls', 'Trevose', 'Somerton', 'Forest Hills', 'Philmont', 'Bethayres', 'Meadowbrook', 'Rydal', 'Noble', 'Jenkintown-Wyncote', 'Elkins Park', 'Melrose Park', 'Fern Rock Transportation Center', 'Wayne Junction', ...CC] },
    { ref: 'WIL', name: 'Wilmington/Newark Line', color: RR, mode: 'train', stations: ['Newark', 'Churchmans Crossing', 'Wilmington', 'Claymont', 'Marcus Hook', 'Highland Avenue', 'Chester Transportation Center', 'Eddystone', 'Crum Lynne', 'Ridley Park', 'Prospect Park', 'Norwood', 'Glenolden', 'Folcroft', 'Sharon Hill', 'Curtis Park', 'Darby', 'Penn Medicine', ...CC_R] },
  ],
  /** Names as they appear in OSM / older maps → official name. */
  aliases: {
    'Jefferson Station': 'Jefferson', 'Suburban Station': 'Suburban', '30th Street Station': '30th Street', 'University City': 'Penn Medicine',
    'Fern Rock': 'Fern Rock Transportation Center', 'Norristown TC': 'Norristown Transportation Center', 'Chester TC': 'Chester Transportation Center',
    'Elwyn': 'Elwyn', 'Delaware Valley College': 'Delaware Valley University', 'Airport Terminals C&D': 'Airport Terminals C & D', 'Airport Terminals E&F': 'Airport Terminals E & F',
    'Airport Terminal C-D': 'Airport Terminals C & D', 'Saint Davids': 'St. Davids', 'St Davids': 'St. Davids', 'Saint Martins': 'St. Martins', "St. Martin's": 'St. Martins', 'St Martins': 'St. Martins', 'Airport Terminal E-F': 'Airport Terminals E & F', 'Newark, DE': 'Newark', 'Newark (Delaware)': 'Newark',
  },
};
