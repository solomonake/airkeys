// ── AirKeys song library ────────────────────────────────────────────
// Every song is encoded as [beat, note, lengthInBeats] melody events
// plus an accompaniment line the game plays for you (the "left hand").
// Classical & romantic pieces are public-domain arrangements; the pop
// tracks are AirKeys originals.

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function N(name) {
  // 'C#4' / 'Eb5' / 'A2' → midi
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  let v = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return v + (parseInt(m[3], 10) + 1) * 12;
}

// helper: expand "pattern × reps" arpeggio bars (Bach / Moonlight style)
function arp(start, names, perNote, reps) {
  const out = [];
  let b = start;
  for (let r = 0; r < reps; r++) {
    for (const n of names) { out.push([b, n, perNote]); b += perNote; }
  }
  return out;
}
// Bach prelude figure: n1 n2 n3 n4 n5 n3 n4 n5 (×2 per bar)
function bachBar(startBeat, names) {
  const seq = [names[0], names[1], names[2], names[3], names[4], names[2], names[3], names[4]];
  return [...arp(startBeat, seq, 0.25, 1), ...arp(startBeat + 2, seq, 0.25, 1)];
}

export const SONGS = [
  // ════ STARTER ════════════════════════════════════════════════════
  {
    id: 'twinkle', title: 'First Steps', artist: 'Twinkle Twinkle · Trad.',
    genre: 'Starter', bpm: 84, difficulty: 1, lanes: 4,
    notes: (() => {
      const line = ['C4','C4','G4','G4','A4','A4','G4', 'F4','F4','E4','E4','D4','D4','C4'];
      const mid  = ['G4','G4','F4','F4','E4','E4','D4'];
      const out = []; let b = 0;
      const put = (arr) => { for (let i = 0; i < arr.length; i++) { const len = (i + 1) % 7 === 0 ? 2 : 1; out.push([b, arr[i], len]); b += len; } };
      put(line); put(mid); put(mid); put(line);
      return out;
    })(),
    bass: [[0,'C3',2],[2,'C3',2],[4,'F3',2],[6,'C3',2],[8,'F3',2],[10,'C3',2],[12,'G2',2],[14,'C3',2],
           [16,'C3',2],[18,'G2',2],[20,'C3',2],[22,'G2',2],[24,'C3',2],[26,'G2',2],[28,'C3',2],[30,'G2',2],
           [32,'C3',2],[34,'C3',2],[36,'F3',2],[38,'C3',2],[40,'F3',2],[42,'C3',2],[44,'G2',2],[46,'C2',2]],
  },
  {
    id: 'odetojoy', title: 'Ode to Joy', artist: 'Beethoven',
    genre: 'Starter', bpm: 112, difficulty: 1, lanes: 4,
    notes: (() => {
      const P = (s) => { // phrase builder: E E F G G F E D C C D E + ending
        const head = ['E4','E4','F4','G4','G4','F4','E4','D4','C4','C4','D4','E4'];
        return head.map((n, i) => [s + i, n, 1]);
      };
      const out = [
        ...P(0),  [12,'E4',1.5],[13.5,'D4',0.5],[14,'D4',2],
        ...P(16), [28,'D4',1.5],[29.5,'C4',0.5],[30,'C4',2],
        // bridge: D D E C D E-F E C D E-F E D C D G3
        [32,'D4',1],[33,'D4',1],[34,'E4',1],[35,'C4',1],[36,'D4',1],[37,'E4',0.5],[37.5,'F4',0.5],
        [38,'E4',1],[39,'C4',1],[40,'D4',1],[41,'E4',0.5],[41.5,'F4',0.5],[42,'E4',1],[43,'D4',1],
        [44,'C4',1],[45,'D4',1],[46,'G3',2],
        ...P(48), [60,'D4',1.5],[61.5,'C4',0.5],[62,'C4',2],
      ];
      return out;
    })(),
    bass: (() => {
      const out = [];
      const bars = ['C3','G2','C3','G2', 'C3','G2','C3','G2', 'G2','C3','G2','G2', 'C3','G2','G2','C2'];
      bars.forEach((n, i) => out.push([i * 4, n, 4]));
      return out;
    })(),
  },
  {
    id: 'birthday', title: 'Happy Birthday', artist: 'Traditional',
    genre: 'Starter', bpm: 124, difficulty: 1, lanes: 4,
    notes: [
      [0,'C4',0.75],[0.75,'C4',0.25],[1,'D4',1],[2,'C4',1],[3,'F4',1],[4,'E4',2],
      [6,'C4',0.75],[6.75,'C4',0.25],[7,'D4',1],[8,'C4',1],[9,'G4',1],[10,'F4',2],
      [12,'C4',0.75],[12.75,'C4',0.25],[13,'C5',1],[14,'A4',1],[15,'F4',1],[16,'E4',1],[17,'D4',2],
      [19,'Bb4',0.75],[19.75,'Bb4',0.25],[20,'A4',1],[21,'F4',1],[22,'G4',1],[23,'F4',2],
    ],
    bass: [[0,'F2',3],[3,'F2',3],[6,'C3',3],[9,'C3',3],[12,'F2',3],[15,'Bb2',2],[17,'C3',2],[19,'Bb2',2],[21,'C3',1],[22,'C3',1],[23,'F2',2]],
  },

  // ════ CLASSICAL ══════════════════════════════════════════════════
  {
    id: 'furelise', title: 'Für Elise', artist: 'Beethoven',
    genre: 'Classical', bpm: 132, difficulty: 3, lanes: 5, beatIsEighth: true,
    notes: (() => {
      const A = (s) => [
        [s+0,'E5',1],[s+1,'Eb5',1],[s+2,'E5',1],[s+3,'Eb5',1],[s+4,'E5',1],[s+5,'B4',1],[s+6,'D5',1],[s+7,'C5',1],
        [s+8,'A4',1],[s+9,'C4',1],[s+10,'E4',1],[s+11,'A4',1],
        [s+12,'B4',1],[s+13,'E4',1],[s+14,'G#4',1],[s+15,'B4',1],
        [s+16,'C5',1],[s+17,'E4',1],
      ];
      const out = [
        ...A(0),
        [18,'E5',1],[19,'Eb5',1],[20,'E5',1],[21,'Eb5',1],[22,'E5',1],[23,'B4',1],[24,'D5',1],[25,'C5',1],
        [26,'A4',1],[27,'C4',1],[28,'E4',1],[29,'A4',1],
        [30,'B4',1],[31,'E4',1],[32,'C5',1],[33,'B4',1],[34,'A4',2],
        // B section
        [36,'B4',1],[37,'C5',1],[38,'D5',1],[39,'E5',2],
        [41,'G4',1],[42,'F5',1],[43,'E5',1],[44,'D5',2],
        [46,'F4',1],[47,'E5',1],[48,'D5',1],[49,'C5',2],
        [51,'E4',1],[52,'D5',1],[53,'C5',1],[54,'B4',2],
        // theme returns
        ...A(57).map(([b,n,l]) => [b, n, l]),
        [75,'E5',1],[76,'Eb5',1],[77,'E5',1],[78,'Eb5',1],[79,'E5',1],[80,'B4',1],[81,'D5',1],[82,'C5',1],
        [83,'A4',1],[84,'C4',1],[85,'E4',1],[86,'A4',1],
        [87,'B4',1],[88,'E4',1],[89,'C5',1],[90,'B4',1],[91,'A4',3],
      ];
      return out;
    })(),
    bass: [[8,'A2',2],[12,'E2',2],[16,'A2',2],[26,'A2',2],[30,'E2',2],[34,'A2',2],
           [36,'C3',3],[41,'G2',3],[46,'A2',3],[51,'E2',3],
           [65,'A2',2],[69,'E2',2],[73,'A2',2],[83,'A2',2],[87,'E2',2],[91,'A2',3]],
  },
  {
    id: 'turkish', title: 'Turkish March', artist: 'Mozart',
    genre: 'Classical', bpm: 126, difficulty: 4, lanes: 6,
    notes: (() => {
      const pass = (s, oct) => { // oct: 0 normal run, 1 = famous high run pass
        const o = [];
        o.push([s+0,'B4',0.25],[s+0.25,'A4',0.25],[s+0.5,'G#4',0.25],[s+0.75,'A4',0.25],[s+1,'C5',0.75]);
        o.push([s+2,'D5',0.25],[s+2.25,'C5',0.25],[s+2.5,'B4',0.25],[s+2.75,'C5',0.25],[s+3,'E5',0.75]);
        if (oct) {
          o.push([s+4,'B5',0.25],[s+4.25,'A5',0.25],[s+4.5,'G#5',0.25],[s+4.75,'A5',0.25]);
          o.push([s+5,'B5',0.25],[s+5.25,'A5',0.25],[s+5.5,'G#5',0.25],[s+5.75,'A5',0.25]);
          o.push([s+6,'C6',1.5]);
        } else {
          o.push([s+4,'F5',0.25],[s+4.25,'E5',0.25],[s+4.5,'Eb5',0.25],[s+4.75,'E5',0.25]);
          o.push([s+5,'B5',0.25],[s+5.25,'A5',0.25],[s+5.5,'G#5',0.25],[s+5.75,'A5',0.25]);
          o.push([s+6,'C6',1.5]);
        }
        return o;
      };
      const out = [...pass(0,0), ...pass(8,1), ...pass(16,0),
        // closing cadence
        [24,'A5',0.5],[24.5,'C6',0.5],[25,'B5',0.5],[25.5,'A5',0.5],[26,'G#5',0.5],[26.5,'B5',0.5],[27,'A5',1.5]];
      return out;
    })(),
    bass: (() => {
      const out = [];
      for (let bar = 0; bar < 7; bar++) {
        out.push([bar*4,'A2',1],[bar*4+1,'E3',1],[bar*4+2,'A2',1],[bar*4+3,'E3',1]);
      }
      return out;
    })(),
  },
  {
    id: 'canon', title: 'Canon in D', artist: 'Pachelbel',
    genre: 'Classical', bpm: 58, difficulty: 2, lanes: 5,
    notes: (() => {
      const out = [];
      // part 1 — the stately half-note entry
      const p1 = ['F#5','E5','D5','C#5','B4','A4','B4','C#5'];
      p1.forEach((n, i) => out.push([i*2, n, 2]));
      // part 2 — quarter-note counterline (2 per chord)
      const p2 = ['F#5','G5', 'A5','E5', 'F#5','D5', 'C#5','A4', 'B4','G4', 'A4','F#4', 'G4','B4', 'C#5','E5'];
      p2.forEach((n, i) => out.push([16 + i, n, 1]));
      // part 3 — flowing eighths over each chord
      const p3 = [
        ['F#5','A5','F#5','D5'], ['E5','A5','E5','C#5'], ['D5','F#5','D5','B4'], ['C#5','A4','F#4','A4'],
        ['B4','D5','B4','G4'],   ['A4','D5','A4','F#4'], ['B4','D5','G5','D5'],  ['C#5','E5','A5','G5'],
      ];
      p3.forEach((grp, ci) => grp.forEach((n, i) => out.push([32 + ci*2 + i*0.5, n, 0.5])));
      // finale
      [['F#5',2],['D5',1],['E5',1],['D5',4]].reduce((b, [n, l]) => (out.push([b, n, l]), b + l), 48);
      return out;
    })(),
    bass: (() => {
      const ground = ['D3','A2','B2','F#2','G2','D2','G2','A2'];
      const out = [];
      for (let rep = 0; rep < 3; rep++) ground.forEach((n, i) => out.push([rep*16 + i*2, n, 2]));
      out.push([48,'D3',2],[50,'A2',2],[52,'D3',4]);
      return out;
    })(),
  },
  {
    id: 'prelude', title: 'Prelude in C', artist: 'J.S. Bach',
    genre: 'Grand', bpm: 72, difficulty: 4, lanes: 6,
    notes: (() => {
      const bars = [
        ['C4','E4','G4','C5','E5'], ['C4','D4','A4','D5','F5'], ['B3','D4','G4','D5','F5'],
        ['C4','E4','G4','C5','E5'], ['C4','E4','A4','E5','A5'], ['C4','D4','F#4','A4','D5'],
        ['B3','D4','G4','D5','G5'], ['B3','C4','E4','G4','C5'], ['A3','C4','E4','G4','C5'],
        ['D3','A3','D4','F#4','C5'], ['G3','B3','D4','G4','B4'],
      ];
      const out = [];
      bars.forEach((b, i) => out.push(...bachBar(i*4, b)));
      // cadence
      out.push(...bachBar(44, ['C3','C4','E4','G4','C5']));
      out.push([48,'C4',4]);
      return out;
    })(),
    bass: (() => {
      const roots = ['C3','C3','G2','C3','A2','D3','G2','C3','A2','D3','G3','C3'];
      return roots.map((n, i) => [i*4, n, 4]);
    })(),
    accompanimentQuiet: true,
  },

  // ════ ROMANCE ════════════════════════════════════════════════════
  {
    id: 'nocturne', title: 'Nocturne Op.9 No.2', artist: 'Chopin (arr.)',
    genre: 'Romance', bpm: 116, difficulty: 3, lanes: 5, beatIsEighth: true,
    notes: [
      [0,'Bb4',2],
      [2,'G5',3],[5,'F5',1],[6,'G5',1],[7,'F5',1],[8,'Eb5',3],[11,'Bb4',3],
      [14,'C5',1],[15,'Bb4',1],[16,'C5',1],[17,'Eb5',1],[18,'Bb4',4],
      [23,'Bb4',1],
      [24,'G5',2],[26,'A5',1],[27,'G5',1],[28,'F5',3],[31,'Bb5',2],[33,'G5',1],
      [34,'F5',1],[35,'Eb5',2],[37,'D5',1],[38,'Eb5',1],[39,'C5',1],[40,'Bb4',4],
      [46,'Bb4',1],[47,'D5',1],
      [48,'G5',3],[51,'F5',1],[52,'G5',1],[53,'F5',1],[54,'Eb5',3],[57,'Bb4',3],
      [60,'C5',1],[61,'Eb5',1],[62,'C5',1],[63,'D5',1],[64,'Bb4',5],
      [70,'F5',2],[72,'G5',2],[74,'F5',1],[75,'Eb5',1],[76,'F5',4],
      [80,'G5',2],[82,'Bb5',2],[84,'G5',1],[85,'F5',1],[86,'Eb5',4],
      [90,'D5',1],[91,'Eb5',1],[92,'C5',2],[94,'Bb4',6],
    ],
    bass: (() => {
      const out = [];
      const pat = ['Eb2','Bb2','Eb3','Bb2'];
      for (let i = 0; i < 16; i++) out.push([i*6, pat[i % 4], 3], [i*6+3, ['G2','F2','Ab2','Bb2'][i % 4], 3]);
      return out;
    })(),
  },
  {
    id: 'greensleeves', title: 'Greensleeves', artist: 'Traditional',
    genre: 'Romance', bpm: 150, difficulty: 2, lanes: 5, beatIsEighth: true,
    notes: (() => {
      const verseTail = (s) => [
        [s,'D5',2],[s+2,'B4',1],[s+3,'G4',1.5],[s+4.5,'A4',0.5],[s+5,'B4',1],
        [s+6,'C5',2],[s+8,'A4',1],[s+9,'A4',1.5],[s+10.5,'G#4',0.5],[s+11,'A4',1],
        [s+12,'B4',2],[s+14,'G#4',1],[s+15,'E4',3],
      ];
      const verseTail2 = (s) => [
        [s,'D5',2],[s+2,'B4',1],[s+3,'G4',1.5],[s+4.5,'A4',0.5],[s+5,'B4',1],
        [s+6,'C5',1.5],[s+7.5,'B4',0.5],[s+8,'A4',1],[s+9,'G#4',1.5],[s+10.5,'F#4',0.5],[s+11,'G#4',1],
        [s+12,'A4',4],
      ];
      return [
        [0,'A4',1],
        [1,'C5',2],[3,'D5',1],[4,'E5',1.5],[5.5,'F5',0.5],[6,'E5',1],
        ...verseTail(7),
        [25,'A4',1],
        [26,'C5',2],[28,'D5',1],[29,'E5',1.5],[30.5,'F5',0.5],[31,'E5',1],
        ...verseTail2(32),
        // chorus
        [49,'G5',3],[52,'G5',1.5],[53.5,'F#5',0.5],[54,'E5',1],
        ...verseTail(55),
        [73,'G5',3],[76,'G5',1.5],[77.5,'F#5',0.5],[78,'E5',1],
        ...verseTail2(79),
      ];
    })(),
    bass: (() => {
      const bars = ['A2','A2','G2','G2','A2','A2','E2','E2', 'A2','A2','G2','G2','A2','E2','A2','A2',
                    'C3','C3','G2','G2','A2','A2','E2','E2', 'C3','C3','G2','G2','A2','E2','A2','A2'];
      return bars.map((n, i) => [1 + i*3, n, 3]);
    })(),
  },
  {
    id: 'gymnopedie', title: 'Gymnopédie No.1', artist: 'Erik Satie',
    genre: 'Romance', bpm: 76, difficulty: 2, lanes: 5,
    notes: (() => {
      const phrase = (s, endNote, endLen) => [
        [s,'F#5',3],[s+3,'A5',1],[s+4,'G5',1],[s+5,'F#5',1],
        [s+6,'C#5',1],[s+7,'B4',1],[s+8,'C#5',1],[s+9,'D5',1],
        [s+10, endNote, endLen],
      ];
      return [
        ...phrase(6, 'A4', 6),
        ...phrase(24, 'C#5', 6),
        // answer line
        [42,'A4',1],[43,'B4',1],[44,'C#5',1],[45,'D5',1],[46,'E5',1],[47,'C#5',1],
        [48,'D5',1],[49,'C#5',1],[50,'B4',1],[51,'C#5',6],
        ...phrase(60, 'A4', 6),
      ];
    })(),
    bass: (() => {
      const out = [];
      for (let i = 0; i < 24; i++) out.push([i*3, i % 2 === 0 ? 'G2' : 'D2', 3]);
      return out;
    })(),
  },

  // ════ GRAND PIANO ════════════════════════════════════════════════
  {
    id: 'moonlight', title: 'Moonlight Sonata', artist: 'Beethoven',
    genre: 'Grand', bpm: 150, difficulty: 3, lanes: 5, beatIsEighth: true,
    notes: (() => {
      const out = [];
      const bar = (s, t1, t2) => { // two triplet shapes per bar (2+2)
        out.push(...arp(s, t1, 1, 2), ...arp(s + 6, t2, 1, 2));
      };
      // intro 4 bars
      bar(0,  ['G#3','C#4','E4'], ['G#3','C#4','E4']);
      bar(12, ['G#3','C#4','E4'], ['G#3','C#4','E4']);
      bar(24, ['A3','C#4','E4'],  ['A3','C#4','E4']);
      bar(36, ['A3','D4','F#4'],  ['G#3','C4','F#4']);
      // melody enters over the triplets
      bar(48, ['G#3','C#4','E4'], ['G#3','C#4','E4']);
      out.push([48,'G#4',2.5],[50.5,'G#4',0.5],[51,'G#4',9]);
      bar(60, ['G#3','C#4','E4'], ['G#3','C#4','E4']);
      out.push([60,'A4',3],[63,'G#4',3],[66,'F#4',2.5],[68.5,'F#4',0.5],[69,'F#4',3]);
      bar(72, ['A3','C#4','E4'],  ['A3','C#4','E4']);
      out.push([72,'G#4',6],[78,'E4',6]);
      bar(84, ['G#3','C4','E4'],  ['G#3','C4','D#4']);
      out.push([84,'C5',2.5],[86.5,'B4',0.5],[87,'B4',9]);
      return out;
    })(),
    bass: [[0,'C#2',12],[12,'B1',12],[24,'A1',12],[36,'F#1',6],[42,'G#1',6],
           [48,'C#2',12],[60,'C#2',12],[72,'A1',12],[84,'G#1',12]],
    accompanimentQuiet: true,
  },

  // ════ POP (AirKeys originals) ════════════════════════════════════
  {
    id: 'neonskyline', title: 'Neon Skyline', artist: 'AirKeys Original',
    genre: 'Pop', bpm: 118, difficulty: 3, lanes: 5,
    notes: (() => {
      const hookA = (s) => [
        [s,'E5',0.5],[s+0.5,'G5',0.5],[s+1,'A5',1.5],[s+2.5,'G5',0.5],[s+3,'E5',0.5],[s+3.5,'D5',0.5],
        [s+4,'C5',0.5],[s+4.5,'D5',0.5],[s+5,'E5',1],[s+6,'D5',0.5],[s+6.5,'C5',0.5],[s+7,'A4',1],
      ];
      const hookB = (s) => [
        [s,'E5',0.5],[s+0.5,'G5',0.5],[s+1,'A5',1.5],[s+2.5,'G5',0.5],[s+3,'E5',0.5],[s+3.5,'D5',0.5],
        [s+4,'C5',0.5],[s+4.5,'D5',0.5],[s+5,'E5',0.5],[s+5.5,'G5',0.5],[s+6,'A5',1],[s+7,'G5',1],
      ];
      const verse = (s) => [
        [s,'E4',0.5],[s+0.5,'G4',0.5],[s+1,'A4',1],[s+2.5,'A4',0.5],[s+3,'G4',0.5],[s+3.5,'E4',0.5],
        [s+4,'G4',1],[s+5.5,'E4',0.5],[s+6,'D4',1],[s+7,'C4',1],
        [s+8,'E4',0.5],[s+8.5,'G4',0.5],[s+9,'A4',1],[s+10.5,'C5',0.5],[s+11,'B4',0.5],[s+11.5,'A4',0.5],
        [s+12,'G4',1.5],[s+13.5,'A4',0.5],[s+14,'G4',0.5],[s+14.5,'E4',0.5],[s+15,'D4',1],
      ];
      return [...hookA(0), ...hookB(8), ...verse(16), ...verse(32), ...hookA(48), ...hookB(56),
        [64,'C5',0.5],[64.5,'D5',0.5],[65,'E5',1],[66,'G5',1],[67,'A5',2],[69,'G5',1],[70,'E5',1],[71,'D5',0.5],[71.5,'C5',0.5],[72,'C5',3]];
    })(),
    bass: (() => {
      const prog = ['C3','G2','A2','F2'];
      const out = [];
      for (let bar = 0; bar < 18; bar++) {
        const r = prog[bar % 4];
        out.push([bar*4, r, 2], [bar*4 + 2, r, 1], [bar*4 + 3, r, 1]);
      }
      out.push([72,'C3',3]);
      return out;
    })(),
  },
  {
    id: 'fallingforyou', title: 'Falling For You', artist: 'AirKeys Original',
    genre: 'Pop', bpm: 86, difficulty: 2, lanes: 4,
    notes: (() => {
      const A = (s) => [
        [s,'B4',1],[s+1,'D5',1],[s+2,'E5',1.5],[s+3.5,'D5',0.5],
        [s+4,'B4',1],[s+5,'A4',1],[s+6,'G4',2],
        [s+8,'G4',0.5],[s+8.5,'A4',0.5],[s+9,'B4',1],[s+10,'A4',0.5],[s+10.5,'G4',0.5],[s+11,'E4',1],
        [s+12,'D4',0.5],[s+12.5,'E4',0.5],[s+13,'G4',1.5],[s+14.5,'A4',0.5],[s+15,'G4',1],
      ];
      const B = (s) => [
        [s,'D5',1],[s+1,'E5',1],[s+2,'G5',1.5],[s+3.5,'E5',0.5],
        [s+4,'D5',1],[s+5,'B4',1],[s+6,'A4',2],
        [s+8,'B4',0.5],[s+8.5,'D5',0.5],[s+9,'E5',1],[s+10,'D5',0.5],[s+10.5,'B4',0.5],[s+11,'A4',1],
        [s+12,'G4',1],[s+13,'A4',1],[s+14,'G4',2],
      ];
      return [...A(0), ...A(16), ...B(32), ...A(48), [64,'G4',4]];
    })(),
    bass: (() => {
      const prog = ['E2','C3','G2','D3'];
      const out = [];
      for (let bar = 0; bar < 17; bar++) out.push([bar*4, prog[bar % 4], 4]);
      return out;
    })(),
  },
  {
    id: 'midnightrun', title: 'Midnight Run', artist: 'AirKeys Original',
    genre: 'Pop', bpm: 132, difficulty: 5, lanes: 6,
    notes: (() => {
      const bar = (s, ns) => ns.map((n, i) => [s + i*0.5, n, 0.5]);
      const AM = ['A4','C5','E5','C5','A4','C5','E5','G5'];
      const F  = ['F4','A4','C5','A4','F4','A4','C5','D5'];
      const C  = ['G4','C5','E5','C5','G4','C5','E5','C5'];
      const G  = ['G4','B4','D5','B4','G4','B4','D5','F5'];
      const AMh = ['A5','C6','E5','C5','A4','C5','E5','G5'];
      const out = [];
      const order = [AM, F, C, G, AM, F, C, G, AMh, F, C, G, AM, F, C, G];
      order.forEach((p, i) => out.push(...bar(i*4, p)));
      out.push([64,'A4',0.5],[64.5,'C5',0.5],[65,'E5',0.5],[65.5,'A5',0.5],[66,'A5',2]);
      return out;
    })(),
    bass: (() => {
      const prog = ['A2','F2','C3','G2'];
      const out = [];
      for (let bar = 0; bar < 16; bar++) {
        const r = prog[bar % 4];
        out.push([bar*4, r, 1],[bar*4+1, r, 1],[bar*4+2, r, 1],[bar*4+3, r, 1]);
      }
      out.push([64,'A2',2]);
      return out;
    })(),
  },
];

// ── chart compiler ──────────────────────────────────────────────────
// Lanes follow the melody's pitch contour: low notes drift left, high
// notes right — your hands trace the shape of the music.
export function buildChart(song, laneCount) {
  const lanes = laneCount || song.lanes || 4;
  const spb = 60 / song.bpm;

  // parse + sort melody
  const evs = song.notes
    .map(([b, n, l]) => ({ t: b * spb, midi: typeof n === 'number' ? n : N(n), dur: Math.max(0.12, (l || 0.5) * spb) }))
    .sort((a, b) => a.t - b.t || a.midi - b.midi);

  // pitch → ideal lane by percentile rank
  const pitches = [...new Set(evs.map(e => e.midi))].sort((a, b) => a - b);
  const rank = new Map(pitches.map((p, i) => [p, pitches.length === 1 ? 0.5 : i / (pitches.length - 1)]));
  const ideal = (midi) => Math.min(lanes - 1, Math.floor(rank.get(midi) * lanes * 0.999));

  const minGap = Math.max(0.16, spb * 0.4);
  const lastUsed = new Array(lanes).fill(-Infinity);
  const lastPitch = new Array(lanes).fill(-1);
  const tiles = [];

  // group simultaneous notes into chords
  let i = 0;
  while (i < evs.length) {
    const group = [evs[i]];
    while (i + 1 < evs.length && evs[i + 1].t - evs[i].t < 0.025) group.push(evs[++i]);
    i++;
    group.sort((a, b) => a.midi - b.midi);
    const taken = new Set();
    for (const ev of group) {
      let lane = ideal(ev.midi);
      // prefer reusing the lane for a repeated pitch (feels like re-striking a key)
      const score = (L) => {
        if (L < 0 || L >= lanes || taken.has(L)) return -Infinity;
        let s = -Math.abs(L - ideal(ev.midi)) * 2;
        const free = ev.t - lastUsed[L] >= minGap;
        const repeat = lastPitch[L] === ev.midi;
        if (!free && !repeat) s -= 100;
        if (repeat) s += 3;
        return s;
      };
      let best = lane, bestS = score(lane);
      for (let d = 1; d < lanes; d++) {
        for (const L of [lane - d, lane + d]) {
          const s = score(L);
          if (s > bestS) { bestS = s; best = L; }
        }
      }
      lane = bestS === -Infinity ? lane : best;
      if (taken.has(lane)) continue; // drop unplaceable chord tone
      taken.add(lane);
      lastUsed[lane] = ev.t;
      lastPitch[lane] = ev.midi;
      tiles.push({ t: ev.t, dur: ev.dur, midi: ev.midi, lane, chord: group.length > 1 });
    }
  }

  const bass = (song.bass || [])
    .map(([b, n, l]) => ({ t: b * spb, midi: typeof n === 'number' ? n : N(n), dur: Math.max(0.2, (l || 1) * spb) }))
    .sort((a, b) => a.t - b.t);

  const last = Math.max(
    tiles.length ? tiles[tiles.length - 1].t + tiles[tiles.length - 1].dur : 0,
    bass.length ? bass[bass.length - 1].t + bass[bass.length - 1].dur : 0,
  );

  return { tiles, bass, lanes, length: last, spb, bpm: song.bpm };
}

export function songDuration(song) {
  const spb = 60 / song.bpm;
  let max = 0;
  for (const [b, , l] of song.notes) max = Math.max(max, (b + (l || 0.5)) * spb);
  return max;
}
