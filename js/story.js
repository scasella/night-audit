// Everything the tape says. Original writing for Night Audit, Tape 01.

export const TITLE = 'NIGHT AUDIT';
export const SUBTITLE = 'TAPE 01 · THE SUNDOWN MOTOR INN';

export const NOTES = {
  note1: {
    title: 'Night audit log', style: 'ledger',
    body: `SUNDOWN MOTOR INN — NIGHT AUDIT

11/12   2:51 AM   Rm 9 rang the desk. Nobody on the line. TV noise?
11/13   3:07 AM   Rm 9 rang again. Rm 9 is VACANT. Has been since Aug.
11/14   3:10 AM   Hall bulb outside 9 burnt out. Replaced it. Out again by 3:20.
11/15   3:07 AM   Whole east hall dark. Mr. Pruitt says leave it.
11/17   3:07 AM   It rang and rang. I didn't pick up.

          — Theo`,
  },
  note2: {
    title: 'Taped inside the breaker panel', style: 'hand',
    body: `DO NOT PUT THESE BACK.

Pulled all three 11/16. One is in my desk. One is in the laundry.
The third one it took. I watched it carry it into 9.

It goes where the light is. With the power on it can see the whole building.

If you hear it, lamp OFF. Get inside something and stay put.

          — R. Pruitt, Mgr.`,
  },
  note3: {
    title: 'Note on the nightstand, Room 4', style: 'hand',
    body: `To the front desk —

The man in the hall asked if he could borrow my lamp. I said no.
He has been standing outside my door since one.
He doesn't knock. I can see his feet under the door, and the hall light
goes around them like they aren't there.

I'm taking my car. Here is the key Mr. Pruitt dropped by the ice machine.
Tell him I'm sorry about the lamp.

          — Room 4`,
  },
  note4: {
    title: 'Linen count, laundry', style: 'hand',
    body: `LINEN COUNT — 11/15

Room 9 sheets: 0 of 6.

Found them in dryer 2. Scorched all the way through,
in the shape of a man lying down.

Put the fuse in with them like Mr. P said.
Did not look at the sheets again.

          — Marisol`,
  },
  note5: {
    title: 'Polaroid, office desk', style: 'photo',
    body: `[ A flash photo of Room 9. Every lamp in the motel, unplugged,
  stands in a ring on the carpet. Something tall stands in the middle
  with a lampshade over its head. The flash didn't reach its face. ]

Written on the back:

  Aug 9 '88. First night. It wanted the lamps.
  We gave it the lamps.          — R.P.`,
  },
  note6: {
    title: 'Registration card, Room 9', style: 'card',
    body: `SUNDOWN MOTOR INN · GUEST REGISTRATION

NAME ............................................
VEHICLE  none        PARTY OF  1
CHECK-IN  08 / 09 / 88        CHECK-OUT  — — —

SPECIAL REQUESTS
lights off lights off lights off lights off lights off lights off
lights off lights off lights off lights off lights off lights off
lights off lights off lights off lights off lights off lights o`,
  },
};

export const NOTE_ORDER = ['note1', 'note2', 'note3', 'note4', 'note5', 'note6'];

export const OBJECTIVES = [
  'Reset the breaker. Maintenance room, through STAFF ONLY at the end of the hall.',
  'Find the 3 missing fuses',
  'Put the fuses back in the breaker panel.',
  'GET OUT. The front doors.',
];
export const FUSE_HINT = 'Office desk · Laundry dryer · Room 9';

export const LINES = {
  intro: ['Okay. Is it recording? …It’s recording.', 'November 18th, 3:12 a.m. Power’s been out since two.', 'Mr. Pruitt wants everything on tape. For the insurance.', 'Breaker’s in maintenance. STAFF ONLY door, end of the hall.'],
  corridor: ['Hall lights are dead. All of them.'],
  nineOpens: ['…Hello?', 'Nine’s supposed to be locked.'],
  ninePeek: ['There’s someone in there.'],
  breakerFirst: ['The fuses are gone. All three.'],
  hunt: ['Footsteps. Somebody’s coming down the service hall.', 'Lamp off. Get in something. Now.'],
  hideTip: ['Don’t breathe.'],
  officeLocked: ['Office is locked. Pruitt has the key.'],
  key: ['Office key. Okay.'],
  dryer: ['There’s a fuse in here. Wrapped in a burnt sheet.'],
  drawer: ['Second drawer. A fuse.'],
  room9: ['Oh God. Every lamp in the building.'],
  fuseR: ['Got it. Go, go.'],
  allFuses: ['That’s three. Back to the breaker.'],
  insert: ['Okay. Here goes.'],
  power: ['Lights. The front doors should open now.'],
  burst: ['No. No no no. RUN.'],
  vending: ['Out of order. Of course.'],
  frontNoPower: ['Electric doors. No power, no doors.'],
  battery: ['Spare battery.'],
  r7: ['Somebody left in a hurry.'],
  lampDead: ['Battery’s dead. I can barely see.'],
  bell: ['…Ding.'],
  out: ['I’m out. I’m out. I’m—'],
  saw: ['It saw me.'],
};

export const ENDING = {
  title: 'END OF TAPE 01',
  body: `Recovered from the night desk of the Sundown Motor Inn, Route 9, November 1989.
Theo Marsh, night auditor, was not located.
The building was condemned the following spring. Every lamp in it was missing.

Tape 02 has not been found.`,
};

export const HOWTO = [
  ['Move', 'Drag the left side of the screen (stick appears under your thumb). Push it all the way to run, which is loud.'],
  ['Look', 'Drag anywhere else. Tap the picture to use what’s in the centre.'],
  ['LAMP', 'Lets you see. It also lets IT see you, from much farther away.'],
  ['Low light', 'With the lamp off the camera boosts its gain. Grainy, but you can move.'],
  ['Hide', 'Wardrobes, lockers and closets. If it didn’t see you get in, it won’t find you.'],
  ['Tracking', 'The picture tears when it is close. Trust the tape.'],
  ['Folding', 'Fold or unfold your Duo any time. The tape pauses, then picks up where you were.'],
];
