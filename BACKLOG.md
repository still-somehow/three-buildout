# Backlog

Items to revisit once the planned phases (1–7) are finished.

## Foot sliding → contact point tracking

**Problem (noted in Phase 4).** Rig animation blends between library poses (`poses` keys) while a separate `position` track moves the whole rig. Nothing ties the two together, so a planted foot drifts along the floor during walks. See `actor-a` in `scenes/demo.scene.json`, frames 0–48. It's acceptable for greybox, but it reads wrong in previs playback.

**Idea: contact point tracking.**

- **Declare contacts.** For example, `"contacts": [{ "part": "footL", "from": 0, "to": 10 }, …]` on a rig object, or derive them automatically from the pose library (a foot counts as planted when it's the lowest point and near y = 0).
- **Lock planted points.** While a contact is active, keep that part's world position fixed. Solve the leg with simple two-bone IK (hip → knee → ankle) so the foot stays put while the hips travel.
- **Root motion from contacts (alternative or complement).** Derive the rig's travel from the planted foot instead of a hand-keyed position track, so stride length always matches movement.
- **Hands too.** The same mechanism would pin hands to props, e.g. a hand on the kettle or a railing.
- **QA support.** Add a contact view to the contact sheet: plot the foot positions over the shot's frames so any drift shows up as a smear, plus a numeric "max slide (m)" per contact in the stats JSON.

**Where it would live.** It would be a pass in `src/rig/expand.ts`, after `poseAt` and before joints are emitted. That pass needs world-space evaluation of the joint chain (it can reuse `buildObject3D` from `src/scene/build.ts`). Tests should assert that a planted foot moves less than 1 cm across its contact window.
