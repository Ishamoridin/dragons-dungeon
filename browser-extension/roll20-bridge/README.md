# Roll20 Bridge

Browsers do not let an ordinary Dragon's Dungeon page control unrelated Roll20 tabs. This optional Chrome/Edge extension provides that permission. The combat tiles always attempt to copy `/roll 1d20+modifier`; direct submission also requires this bridge.

## Install

1. Open `chrome://extensions` or `edge://extensions` in the same browser profile as Dragon's Dungeon and Roll20.
2. Enable Developer mode, choose **Load unpacked**, and select this `roll20-bridge` directory.
3. Reload Dragon's Dungeon and each open Roll20 editor tab.

The bridge accepts requests from `http://localhost:5173` and `http://127.0.0.1:5173` only. It submits a roll to every reachable `https://app.roll20.net/editor*` tab. Clicking once with multiple games open sends the roll to each game. It does not open tabs, sign in, store credentials, or replace unfinished chat drafts. Roll20 UI changes may require updating its chat selectors.

Copy results and delivery feedback appear in the combat tile's tooltip and accessible status. Without the extension, or if Roll20 is unavailable, paste the copied command into Roll20 chat. Right-clicking a combat tile still copies the Roll20 macro instead of sending a roll.