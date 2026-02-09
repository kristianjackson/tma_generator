import test from "node:test";
import assert from "node:assert/strict";
import { isNarrativeDraftOutput } from "../app/lib/draft-shape.ts";

test("draft-shape: rejects outline style output", () => {
  const outline = `
Here is a numbered outline for the episode.

**Section 1: Setup**
- Introduce the technician.
- Introduce the data center.

**Section 2: Escalation**
1. Strange events begin.
2. The technician notices missing time.

**Section 3: Ending**
- Reveal the hidden horror.
`.repeat(4);

  assert.equal(isNarrativeDraftOutput(outline), false);
});

test("draft-shape: rejects screenplay style output", () => {
  const screenplay = `
[A dim corridor hums with server fans.]
TECHNICIAN: Something is wrong in rack twelve.
[The lights flicker.]
SUPERVISOR: We already checked it.
TECHNICIAN: You didn't check the mirrors.
[A distant alarm repeats.]
SUPERVISOR: Stop this.
`.repeat(8);

  assert.equal(isNarrativeDraftOutput(screenplay), false);
});

test("draft-shape: accepts narrative prose", () => {
  const prose = `
I did not notice the first omission until the third night shift, when the inventory screen insisted I had signed out a tool I had never touched. The serial was mine, the signature resembled mine, and the timestamp sat inside a ten-minute seam in my memory.

At two in the morning the aisles breathed warm air and white light. Each cabinet wore the same polished expression: locked doors, proper labels, clean cable runs, no room for superstition. I walked those aisles anyway, repeating names under my breath, because it felt important to hear my own voice.

On Thursday, the mirrors in the break room stopped returning me in full. First a shoulder. Then the edge of my jaw. At dawn, my reflection lagged half a second behind my movement, as if waiting for permission to catch up.

No one else cared. The day crew laughed and blamed fatigue. My manager asked whether I had been sleeping, whether I wanted unpaid leave, whether I understood how expensive panic could become if written into a ticket.

I started leaving notes inside the cabinets where only I would look: battery bay, cold aisle six, upper latch of row B. The next night each note came back with one line added in a handwriting almost mine: \"We keep what we need. Continue normal operations.\"

By Sunday I knew the center was not stealing data. It was selecting parts of people. Habits first, then voice, then memory. I found my final note folded beneath a fan grate, addressed to me in my own careful print. It thanked me for my service and informed me that continuity had been achieved.
`;

  assert.equal(isNarrativeDraftOutput(prose), true);
});

